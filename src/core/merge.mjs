// ./src/core/merge.mjs
/**
 * Collapses the same defect found in several matrix variants (color scheme x viewport) into one finding.
 *
 * `--color-schemes light,dark --viewports mobile,desktop` runs each route four times. A white-on-gold button that
 * fails in all four used to be reported four times (a real site went from 42 distinct defects to 128 rows). The
 * merged finding keeps the first variant's evidence, lists every variant that showed it, and takes the highest
 * severity. Its fingerprint ignores the variant label, so a suppression or baseline entry covers all variants.
 */

import { stableHash } from './hash.mjs';

const VARIANT_SUFFIX = /\s\[([^\]]*)\]$/;

export function splitScenarioName(name) {
  const text = String(name ?? '');
  const match = VARIANT_SUFFIX.exec(text);
  return match ? { base: text.slice(0, match.index), variant: match[1] } : { base: text, variant: null };
}

const SEVERITY_ORDER = ['advisory', 'minor', 'moderate', 'serious', 'critical'];

export function mergeMatrixDuplicates(findings) {
  const groups = new Map();
  const output = [];
  for (const finding of findings) {
    const { base, variant } = splitScenarioName(finding.target?.routeOrScene);
    if (variant === null) {
      output.push(finding);
      continue;
    }
    const key = [finding.ruleId, finding.outcome, finding.target.adapter, base, finding.target.selectorOrNode ?? '', finding.target.file ?? ''].join('\u0000');
    const group = groups.get(key);
    if (!group) {
      const merged = {
        ...finding,
        target: { ...finding.target, routeOrScene: base },
        evidence: withVariants(finding.evidence, [variant]),
        tags: [...new Set([...(finding.tags ?? []), 'matrix-merged'])].sort()
      };
      merged.fingerprint = stableHash({
        ruleId: finding.ruleId,
        adapter: finding.target.adapter,
        routeOrScene: base,
        selectorOrNode: finding.target.selectorOrNode ?? '',
        file: finding.target.file ?? '',
        evidenceKey: evidenceKey(finding.evidence)
      }).slice(0, 24);
      groups.set(key, merged);
      output.push(merged);
      continue;
    }
    if (!group.evidence.variants.includes(variant)) {
      group.evidence.variants.push(variant);
      group.evidence.variantCount = group.evidence.variants.length;
    }
    if (SEVERITY_ORDER.indexOf(finding.severity) > SEVERITY_ORDER.indexOf(group.severity)) group.severity = finding.severity;
  }
  return output;
}

function withVariants(evidence, variants) {
  const base = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : { value: evidence ?? null };
  return { ...base, variants, variantCount: variants.length };
}

function evidenceKey(evidence) {
  if (!evidence || typeof evidence !== 'object') return evidence ?? null;
  return { id: evidence.id, code: evidence.code, message: evidence.message, html: evidence.html, value: evidence.value, failureSummary: evidence.failureSummary };
}
