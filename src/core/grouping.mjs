// ./src/core/grouping.mjs
/**
 * Root-cause grouping for agent-facing reports.
 *
 * A run over 10 routes x 4 variants can produce hundreds of findings that come from a handful of causes: one button
 * style that fails contrast everywhere it is used, one focus reset in a shared stylesheet. Models do not need each row;
 * they need the cause once, its fix once, and a bounded list of where it shows up.
 *
 * Group keys: contrast failures group by (text color, surface color, required ratio) because one style change fixes
 * every element sharing the pair; unresolved contrast groups by reason; everything else groups by rule + outcome (+ the
 * focus verdict). Each group keeps the full member list internally so `wcagate report --group <id>` can drill down.
 */

import { fromHex, suggestBackground, suggestForeground } from './contrast.mjs';
import { splitScenarioName } from './merge.mjs';

const SEVERITY_RANK = { critical: 5, serious: 4, moderate: 3, minor: 2, advisory: 1 };
const OUTCOME_RANK = { executionError: 5, failed: 4, cantTell: 3, untested: 2 };

export function isReportable(finding) {
  return !finding.suppressed && !finding.outOfScope && ['executionError', 'failed', 'cantTell', 'untested'].includes(finding.outcome);
}

function axeContrastData(finding) {
  const data = finding.evidence?.any?.[0]?.data ?? finding.evidence?.any?.[0]?.data;
  if (!data || !data.fgColor || !data.bgColor) return null;
  const need = Number.parseFloat(String(data.expectedContrastRatio ?? '4.5'));
  return { fg: data.fgColor, bg: data.bgColor, ratio: data.contrastRatio, need: Number.isFinite(need) ? need : 4.5 };
}

function contrastPair(finding) {
  const resolved = finding.evidence?.contrastResolution;
  if (resolved?.status === 'failed' && resolved.worst) {
    return { fg: resolved.worst.foreground, bg: resolved.worst.background, ratio: resolved.worst.ratio, need: resolved.need, resolved };
  }
  return axeContrastData(finding);
}

function groupKey(finding) {
  if (finding.ruleId.startsWith('axe/color-contrast')) {
    if (finding.outcome === 'failed') {
      const pair = contrastPair(finding);
      if (pair) return `contrast|failed|${pair.fg}|${pair.bg}|${pair.need}`;
    }
    return `contrast|${finding.outcome}|${finding.evidence?.contrastResolution?.reason?.split(':')[0] ?? finding.evidence?.any?.[0]?.data?.messageKey ?? ''}`;
  }
  if (finding.ruleId === 'wcagate/runtime/focus-indicator-review') {
    return `focus|${finding.outcome}|${finding.evidence?.verdict ?? finding.evidence?.reason ?? ''}`;
  }
  return `${finding.ruleId}|${finding.outcome}`;
}

function shortSelector(finding) {
  const target = finding.target ?? {};
  if (target.file) return `${target.file}${target.line ? `:${target.line}` : ''}`;
  const selector = target.selectorOrNode ?? target.routeOrScene ?? '(page)';
  if (selector.length <= 72) return selector;
  // The end of a selector names the element; the start is usually shared ancestry. Keep the tail.
  const parts = selector.split(' > ');
  let tail = parts[parts.length - 1];
  for (let index = parts.length - 2; index >= 0 && tail.length + parts[index].length + 3 <= 60; index -= 1) tail = `${parts[index]} > ${tail}`;
  return tail.length < selector.length ? `... > ${tail}`.slice(0, 80) : `${selector.slice(0, 69)}...`;
}

function elementText(finding) {
  const text = finding.evidence?.contrastResolution?.text ?? finding.evidence?.name ?? finding.evidence?.title;
  if (text) return String(text).replace(/\s+/g, ' ').trim().slice(0, 40);
  const html = finding.evidence?.html;
  if (typeof html === 'string') {
    const inner = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return inner ? inner.slice(0, 40) : '';
  }
  return '';
}

function fixFor(group, members) {
  const first = members[0];
  if (group.family === 'contrast' && group.outcome === 'failed') {
    const pair = contrastPair(first);
    if (pair) {
      const resolved = pair.resolved;
      let fg = resolved?.suggestedForeground;
      let bg = resolved?.suggestedBackground;
      try {
        fg = fg ?? suggestForeground(fromHex(pair.fg), fromHex(pair.bg), pair.need);
        bg = bg ?? suggestBackground(fromHex(pair.fg), fromHex(pair.bg), pair.need);
      } catch {
        // axe may report non-hex colors (rgba); leave the suggestion out rather than guess
      }
      const options = [];
      if (fg) options.push(`text ${pair.fg} -> ${fg.color} (${fg.ratio}:1)`);
      if (bg) options.push(`surface ${pair.bg} -> ${bg.color} (${bg.ratio}:1)`);
      return options.length > 0 ? `${options.join(' OR ')}; the pair is shared, so one token change fixes every listed element` : 'change the surface behind the text (opaque scrim or stronger tint)';
    }
  }
  if (group.family === 'contrast' && group.outcome === 'cantTell') {
    const reason = String(first.evidence?.contrastResolution?.reason ?? '').split(':')[0];
    const share = first.evidence?.contrastResolution?.measured?.failingShare;
    if (reason === 'mixed-background') return `the text straddles backgrounds that vary${share !== undefined ? ` (${Math.round(share * 100)}% of pixels fail)` : ''}; put it on one opaque panel or scrim so every pixel behind it passes, then it is measurable`;
    if (reason === 'gradient-clipped-or-transparent-text') return 'gradient-clipped text cannot be measured; give it a solid fallback color and verify manually';
    if (reason === 'iframe-or-shadow-target') return 'text inside an iframe or shadow DOM is not sampled; verify contrast there manually';
  }
  const remediation = (first.remediation ?? '').replace(/\s+/g, ' ').trim();
  return remediation.length > 260 ? `${remediation.slice(0, 257)}...` : remediation;
}

function headlineFor(group, members) {
  const first = members[0];
  if (group.family === 'contrast') {
    const pair = contrastPair(first);
    if (group.outcome === 'failed' && pair) return `${pair.ratio}:1 (needs ${pair.need}) text ${pair.fg} on ${pair.bg}`;
    const reason = first.evidence?.contrastResolution?.reason ?? first.evidence?.any?.[0]?.data?.messageKey;
    return `contrast not measurable${reason ? `: ${String(reason).split(':')[0]}` : ''}`;
  }
  if (first.ruleId === 'wcagate/runtime/focus-indicator-review') return first.title;
  return first.title;
}

/**
 * @param {object} run Accessibility run.
 * @returns {{ groups: object[], totals: object, routeCount: number, variantCount: number }}
 */
export function groupFindings(run) {
  const scenarios = (run.adapters ?? []).flatMap((adapter) => adapter.metadata?.scenarios ?? []);
  const baseRoutes = new Set();
  const variants = new Set();
  let measuredPasses = 0;
  for (const scenario of scenarios) {
    const { base, variant } = splitScenarioName(scenario.name);
    baseRoutes.add(base);
    if (variant) variants.add(variant);
    measuredPasses += scenario.contrast?.passed ?? 0;
  }

  const buckets = new Map();
  for (const finding of run.findings ?? []) {
    if (!isReportable(finding)) continue;
    const key = groupKey(finding);
    const bucket = buckets.get(key) ?? [];
    bucket.push(finding);
    buckets.set(key, bucket);
  }

  const groups = [];
  for (const [key, members] of buckets) {
    const first = members[0];
    const family = key.startsWith('contrast|') ? 'contrast' : key.startsWith('focus|') ? 'focus' : 'rule';
    const outcome = members.reduce((best, member) => (OUTCOME_RANK[member.outcome] > OUTCOME_RANK[best] ? member.outcome : best), first.outcome);
    const severity = members.reduce((best, member) => (SEVERITY_RANK[member.severity] > SEVERITY_RANK[best] ? member.severity : best), first.severity);

    const elements = new Map();
    for (const member of members) {
      const where = shortSelector(member);
      const entry = elements.get(where) ?? { where, routes: new Set(), variants: new Set(), instances: new Set(), text: '', occurrences: 0, baselined: true };
      entry.instances.add(member.target?.selectorOrNode ?? where);
      const { base, variant } = splitScenarioName(member.target?.routeOrScene);
      if (base) entry.routes.add(base);
      for (const label of member.evidence?.variants ?? (variant ? [variant] : [])) entry.variants.add(label);
      entry.text = entry.text || elementText(member);
      entry.occurrences += member.evidence?.variantCount ?? 1;
      entry.baselined = entry.baselined && Boolean(member.baselined);
      elements.set(where, entry);
    }

    const group = {
      key,
      family,
      ruleId: first.ruleId,
      outcome,
      severity,
      confidence: first.confidence,
      standards: [...new Set((first.standards ?? []).filter((standard) => standard.document === 'WCAG-2.2').map((standard) => `${standard.requirement}${standard.level ? ` ${standard.level}` : ''}`))],
      findingCount: members.length,
      occurrenceCount: members.reduce((sum, member) => sum + (member.evidence?.variantCount ?? 1), 0),
      // Different DOM instances of the same component (cards, list items) share a shortened selector; count them all.
      elementCount: [...elements.values()].reduce((sum, entry) => sum + entry.instances.size, 0),
      routes: [...new Set([...elements.values()].flatMap((entry) => [...entry.routes]))],
      variants: [...new Set([...elements.values()].flatMap((entry) => [...entry.variants]))],
      baselined: members.every((member) => member.baselined),
      elements: [...elements.values()].sort((a, b) => b.routes.size - a.routes.size || b.occurrences - a.occurrences || a.where.localeCompare(b.where)),
      members,
      headline: headlineFor({ family, outcome }, members),
      fix: fixFor({ family, outcome }, members),
      helpUrl: first.helpUrl
    };
    groups.push(group);
  }

  groups.sort((a, b) => {
    const tier = (group) => (group.outcome === 'executionError' ? 0 : group.outcome === 'failed' && group.severity !== 'advisory' ? 1 : group.outcome === 'failed' ? 4 : 2);
    return tier(a) - tier(b)
      || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      || b.occurrenceCount - a.occurrenceCount
      || a.key.localeCompare(b.key);
  });
  groups.forEach((group, index) => { group.id = `g${index + 1}`; });

  return {
    groups,
    routeCount: baseRoutes.size,
    variantCount: Math.max(1, variants.size),
    measuredPasses,
    totals: {
      findings: groups.reduce((sum, group) => sum + group.findingCount, 0),
      groups: groups.length
    }
  };
}
