// ./src/core/profile.mjs
/**
 * WCAG 2.2 target profiles (A / AA / AAA) and in-scope scoring.
 *
 * Profile selects axe tags and which findings the gate evaluates.
 * Completeness is evidence coverage, never a conformance percentage.
 */

export const DEFAULT_PROFILE = 'wcag22-aa';

export const WCAG_PROFILES = Object.freeze({
  'wcag22-a': Object.freeze({
    id: 'wcag22-a',
    document: 'WCAG-2.2',
    level: 'A',
    label: 'WCAG 2.2 A'
  }),
  'wcag22-aa': Object.freeze({
    id: 'wcag22-aa',
    document: 'WCAG-2.2',
    level: 'AA',
    label: 'WCAG 2.2 AA'
  }),
  'wcag22-aaa': Object.freeze({
    id: 'wcag22-aaa',
    document: 'WCAG-2.2',
    level: 'AAA',
    label: 'WCAG 2.2 AAA'
  })
});

export const KNOWN_PROFILES = Object.freeze(Object.keys(WCAG_PROFILES));

const LEVEL_RANK = Object.freeze({ A: 1, AA: 2, AAA: 3 });
const CONCLUSIVE = new Set(['passed', 'failed', 'inapplicable']);
const UNRESOLVED = new Set(['cantTell', 'untested']);

export function parseProfile(value) {
  const id = typeof value === 'string' ? value.trim() : DEFAULT_PROFILE;
  return WCAG_PROFILES[id] ?? null;
}

export function requireProfile(value) {
  return parseProfile(value) ?? WCAG_PROFILES[DEFAULT_PROFILE];
}

export function axeRunOnlyForProfile(profileId) {
  const profile = requireProfile(profileId);
  const tags = ['wcag2a', 'wcag21a', 'wcag22a'];
  if (profile.level === 'AA' || profile.level === 'AAA') {
    tags.push('wcag2aa', 'wcag21aa', 'wcag22aa');
  }
  if (profile.level === 'AAA') {
    tags.push('wcag2aaa', 'wcag21aaa', 'wcag22aaa');
  }
  return tags;
}

export function defaultProbesForProfile(profileId) {
  const profile = requireProfile(profileId);
  return {
    targetSizeEnhanced: { enabled: profile.level === 'AAA', minimum: 44 },
    focusIndicatorReview: { enabled: profile.level !== 'A', maxTabs: 80 }
  };
}

export function levelFromAxeTag(tag) {
  const value = String(tag || '');
  if (/^wcag\d*aaa$/i.test(value)) return 'AAA';
  if (/^wcag\d*aa$/i.test(value)) return 'AA';
  if (/^wcag\d*a$/i.test(value)) return 'A';
  return null;
}

export function normalizeWcagLevel(value) {
  const level = String(value || '').trim().toUpperCase();
  if (level === 'A' || level === 'AA' || level === 'AAA') return level;
  return null;
}

export function wcagLevelFromFinding(finding) {
  const levels = [];
  for (const standard of finding?.standards ?? []) {
    const level = normalizeWcagLevel(standard.level);
    if (level) levels.push(level);
  }
  for (const tag of finding?.tags ?? []) {
    const level = levelFromAxeTag(tag);
    if (level) levels.push(level);
  }
  if (levels.length === 0) return null;
  return levels.reduce((max, level) => (LEVEL_RANK[level] > LEVEL_RANK[max] ? level : max));
}

export function isFindingInScope(finding, profileId) {
  const profile = requireProfile(profileId);
  const level = wcagLevelFromFinding(finding);
  if (!level) return true;
  return LEVEL_RANK[level] <= LEVEL_RANK[profile.level];
}

export function annotateScope(findings, profileId) {
  return (findings ?? []).map((finding) => {
    const inScope = isFindingInScope(finding, profileId);
    if (inScope) {
      return { ...finding, outOfScope: false };
    }
    const tags = finding.tags?.includes('out-of-scope')
      ? finding.tags
      : [...(finding.tags ?? []), 'out-of-scope'];
    return { ...finding, outOfScope: true, tags };
  });
}

export function buildScorecard(findings, profileId) {
  const profile = requireProfile(profileId);
  const active = (findings ?? []).filter((finding) => !finding.suppressed);
  const inScope = active.filter((finding) => !finding.outOfScope);
  const outOfScope = active.filter((finding) => finding.outOfScope);
  const conclusive = inScope.filter((finding) => CONCLUSIVE.has(finding.outcome)).length;
  const unresolved = inScope.filter((finding) => UNRESOLVED.has(finding.outcome)).length;
  const blocking = inScope.filter((finding) => finding.outcome === 'failed').length;
  const denominator = conclusive + unresolved;
  return {
    profile: profile.id,
    label: profile.label,
    level: profile.level,
    inScope: inScope.length,
    outOfScope: outOfScope.length,
    conclusive,
    unresolved,
    blocking,
    completenessPercent: denominator === 0 ? null : Math.round((conclusive / denominator) * 100),
    disclaimer: 'Evidence completeness (not a conformance score)'
  };
}
