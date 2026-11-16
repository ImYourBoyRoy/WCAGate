// ./src/reporters/agent.mjs
/**
 * Token-lean report for coding models (and terse enough for humans): one block per ROOT CAUSE, not per finding.
 *
 * Rules that keep it small without losing information a model needs:
 *   - a cause and its fix are printed once, however many routes/variants/elements show it
 *   - elements are capped and ranked by reach; the rest is a count plus the exact drill-down command
 *   - passes are counted, never listed; HTML snippets, fingerprints, URLs, and standards boilerplate stay in latest.json
 *   - what changed since the previous run is stated (NEW groups are marked), so a fix-and-rerun loop only re-reads the delta
 */

import { TOOLKIT_NAME, TOOLKIT_VERSION } from '../core/constants.mjs';
import { groupFindings } from '../core/grouping.mjs';

const DEFAULTS = { maxGroups: 12, maxElements: 5, maxRoutes: 4 };

const OUTCOME_LABEL = { executionError: 'ERROR', failed: 'FAIL', cantTell: 'REVIEW', untested: 'UNTESTED' };

function gateLine(run) {
  const gate = run.gate;
  const word = gate.passed ? 'PASS' : gate.reason === 'blockingFindings' ? 'FAIL' : gate.reason === 'unresolvedEvidence' ? 'UNRESOLVED' : 'ERROR';
  return `GATE ${word} exit ${gate.exitCode}${gate.passed ? '' : ` (${gate.reason})`}`;
}

function routeList(routes, total, maxRoutes) {
  if (routes.size === 0) return '';
  if (total > 1 && routes.size >= total) return 'all routes';
  const list = [...routes];
  return list.length > maxRoutes ? `${list.slice(0, maxRoutes).join(' ')} +${list.length - maxRoutes}` : list.join(' ');
}

export function buildAgentView(run, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  const grouped = groupFindings(run);
  const blocking = grouped.groups.filter((group) => !group.baselined && (group.outcome === 'failed' || group.outcome === 'executionError') && group.severity !== 'advisory');
  const unresolved = grouped.groups.filter((group) => !group.baselined && (group.outcome === 'cantTell' || group.outcome === 'untested'));
  const advisory = grouped.groups.filter((group) => !group.baselined && group.outcome === 'failed' && group.severity === 'advisory');
  const known = grouped.groups.filter((group) => group.baselined);
  return { limits, grouped, blocking, unresolved, advisory, known };
}

export function renderAgentReport(run, options = {}) {
  const { limits, grouped, blocking, unresolved, advisory, known } = buildAgentView(run, options);
  const lines = [];
  const seconds = Math.max(1, Math.round((run.durationMs ?? 0) / 1000));
  lines.push(`${TOOLKIT_NAME} ${TOOLKIT_VERSION} | ${run.project.name} | ${run.profile}`);
  const scale = grouped.routeCount > 0 ? ` | ${grouped.routeCount} route${grouped.routeCount === 1 ? '' : 's'}${grouped.variantCount > 1 ? ` x ${grouped.variantCount} variants` : ''}` : '';
  lines.push(`${gateLine(run)}${scale} | ${seconds}s`);

  const countOf = (groups) => `${groups.length} cause${groups.length === 1 ? '' : 's'}/${groups.reduce((sum, group) => sum + group.findingCount, 0)}`;
  const counts = [`blocking ${countOf(blocking)}`, `unresolved ${countOf(unresolved)}`];
  if (advisory.length > 0) counts.push(`advisory ${countOf(advisory)}`);
  if (known.length > 0) counts.push(`known(baseline) ${countOf(known)}`);
  if (grouped.measuredPasses > 0) counts.push(`${grouped.measuredPasses} contrast samples passed`);
  lines.push(counts.join(' | '));
  if (run.sinceLastRun) {
    const delta = run.sinceLastRun;
    lines.push(`since last run: ${delta.fixed} fixed, ${delta.new} new, ${delta.unchanged} unchanged`);
  }
  if (run.baseline) lines.push(`baseline ${run.baseline.file}: ${run.baseline.known} known, ${run.baseline.new} new, ${run.baseline.fixed} fixed`);

  const detailed = [...blocking, ...unresolved];
  const shown = detailed.slice(0, limits.maxGroups);
  for (const group of shown) lines.push(...renderGroup(group, grouped, limits));
  if (detailed.length > shown.length) {
    const rest = detailed.slice(shown.length);
    lines.push('', `+${rest.length} more cause(s), lower priority: ${rest.map((group) => `${group.id} ${group.ruleId}`).join(', ')}`);
  }
  for (const group of advisory) {
    lines.push('', `[${group.id}] ADVISORY ${group.ruleId} | ${group.findingCount} finding${group.findingCount === 1 ? '' : 's'}`, `  ${group.headline}${group.members[0].description ? `: ${truncate(group.members[0].description, 200)}` : ''}`);
  }
  if (detailed.length === 0 && advisory.length === 0) lines.push('', 'No blocking or unresolved findings.');

  lines.push('', `drill down: wcagate report --group <id> (full members) | all evidence: ${run.outputDirectory ? 'wcag-audit/latest.json' : 'latest.json'} | human view: wcagate serve -> results.html`);
  return `${lines.join('\n')}\n`;
}

function renderGroup(group, grouped, limits) {
  const lines = [''];
  const label = group.baselined ? 'KNOWN' : OUTCOME_LABEL[group.outcome] ?? group.outcome.toUpperCase();
  const standards = group.standards.length > 0 ? ` | WCAG ${group.standards.join(', ')}` : '';
  const newCount = group.members.filter((member) => member.isNew).length;
  const reach = [`${group.findingCount} finding${group.findingCount === 1 ? '' : 's'}`, `${group.elementCount} element${group.elementCount === 1 ? '' : 's'}`];
  if (grouped.routeCount > 1) reach.push(`${group.routes.length} route${group.routes.length === 1 ? '' : 's'}`);
  lines.push(`[${group.id}] ${label}${newCount > 0 ? ' NEW' : ''} ${group.severity} ${group.ruleId} | ${reach.join(', ')}${standards}`);
  if (grouped.variantCount > 1 && group.variants.length > 0 && group.variants.length < grouped.variantCount) {
    lines.push(`  only in: ${group.variants.join(' / ')}`);
  }
  lines.push(`  ${group.headline}`);
  if (group.ruleId.startsWith('wcagate/') && group.findingCount <= 3 && group.members[0].description) {
    lines.push(`  ${truncate(group.members[0].description, 220)}`);
  }
  if (group.fix) lines.push(`  fix: ${group.fix}`);
  const visible = group.elements.slice(0, limits.maxElements);
  for (const element of visible) {
    const parts = [`  - ${element.where}`];
    if (element.instances.size > 1) parts.push(`x${element.instances.size}`);
    if (element.text) parts.push(`"${element.text}"`);
    const routes = routeList(element.routes, grouped.routeCount, limits.maxRoutes);
    if (routes && !(element.routes.size === 1 && element.routes.has(element.where))) parts.push(`(${routes})`);
    lines.push(parts.join(' '));
  }
  if (group.elements.length > visible.length) lines.push(`  +${group.elements.length - visible.length} more element(s): wcagate report --group ${group.id}`);
  return lines;
}

function truncate(text, max) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

/** Same content as the text report, as compact JSON (MCP and `wcagate report --json`). */
export function agentSummary(run, options = {}) {
  const { limits, grouped, blocking, unresolved, advisory, known } = buildAgentView(run, options);
  const shape = (group) => ({
    id: group.id,
    outcome: group.outcome,
    severity: group.severity,
    rule: group.ruleId,
    new: group.members.some((member) => member.isNew) || undefined,
    findings: group.findingCount,
    elements: group.elementCount,
    routes: group.routes.length,
    wcag: group.standards,
    summary: group.headline,
    fix: group.fix || undefined,
    where: group.elements.slice(0, limits.maxElements).map((element) => ({
      at: element.where,
      text: element.text || undefined,
      routes: element.routes.size
    })),
    moreElements: Math.max(0, group.elements.length - limits.maxElements) || undefined
  });
  return {
    gate: { exit: run.gate.exitCode, reason: run.gate.reason, passed: run.gate.passed },
    scope: { routes: grouped.routeCount, variants: grouped.variantCount, profile: run.profile },
    sinceLastRun: run.sinceLastRun,
    baseline: run.baseline ? { known: run.baseline.known, new: run.baseline.new, fixed: run.baseline.fixed } : undefined,
    causes: [...blocking, ...unresolved].slice(0, limits.maxGroups).map(shape),
    omittedCauses: Math.max(0, blocking.length + unresolved.length - limits.maxGroups),
    advisory: advisory.map((group) => ({ id: group.id, rule: group.ruleId, summary: group.headline })),
    known: known.length > 0 ? known.length : undefined,
    contrastSamplesPassed: grouped.measuredPasses || undefined,
    drillDown: 'wcagate report --group <id>'
  };
}

/** Full member findings of one group, minimal fields, for drill-down. */
export function groupDetail(run, groupId) {
  const { groups } = groupFindings(run);
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) throw new Error(`No group "${groupId}". Valid ids: ${groups.map((candidate) => candidate.id).join(', ') || '(none)'}`);
  return {
    id: group.id,
    rule: group.ruleId,
    outcome: group.outcome,
    severity: group.severity,
    summary: group.headline,
    fix: group.fix,
    helpUrl: group.helpUrl,
    elements: group.elements.map((element) => ({
      at: element.where,
      text: element.text || undefined,
      routes: [...element.routes],
      variants: element.variants.size > 0 ? [...element.variants] : undefined
    })),
    sample: group.members[0] ? {
      html: typeof group.members[0].evidence?.html === 'string' ? group.members[0].evidence.html.slice(0, 240) : undefined,
      fingerprint: group.members[0].fingerprint
    } : undefined
  };
}
