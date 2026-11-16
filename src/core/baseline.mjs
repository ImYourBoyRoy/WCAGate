// ./src/core/baseline.mjs
/**
 * Baseline ratchet for legacy sites and apps.
 *
 * A baseline records the unresolved and failing findings a project knowingly carries today. A run with
 * `--baseline <file>` still reports every finding, but only NEW ones (not in the baseline) block the gate, so a
 * team can adopt the gate immediately and drive the known list to zero. Findings fixed since the baseline are listed
 * so the baseline can be shrunk (`--write-baseline`).
 *
 * Fail-closed rules: executionError and governance findings are never baselined, and a baseline file that is
 * unreadable or malformed is a hard error (exit 2), never "no baseline".
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stableHash } from './hash.mjs';
import { toJsonSafe } from './json.mjs';
import { TOOLKIT_NAME, TOOLKIT_VERSION } from './constants.mjs';

export const BASELINE_SCHEMA_VERSION = 1;
const BASELINEABLE_OUTCOMES = new Set(['failed', 'cantTell', 'untested']);

/**
 * Location-stable key. Deliberately ignores `state` (URL with a random preview port) and `line`
 * (shifts on every edit), so a baseline survives ordinary development.
 */
export function baselineKey(finding) {
  return stableHash({
    ruleId: finding.ruleId,
    adapter: finding.target?.adapter ?? '',
    routeOrScene: stripMatrixLabel(finding.target?.routeOrScene ?? ''),
    selectorOrNode: finding.target?.selectorOrNode ?? '',
    file: finding.target?.file ?? '',
    title: finding.ruleId.startsWith('axe/') ? '' : finding.title
  }).slice(0, 24);
}

function stripMatrixLabel(name) {
  return name.replace(/\s\[[^\]]*\]$/, '');
}

function isBaselineable(finding) {
  return BASELINEABLE_OUTCOMES.has(finding.outcome)
    && !finding.suppressed
    && !finding.outOfScope
    && !finding.ruleId.startsWith('wcagate/governance/')
    && !finding.ruleId.startsWith('wcagate/system/');
}

/**
 * Compares this run with the previous one (the latest.json about to be overwritten) so a fix-and-rerun loop only has
 * to read what changed. Marks findings absent from the previous run `isNew`. Returns null when there is nothing
 * comparable (no previous run, or a different project).
 */
export function compareWithPrevious(findings, previousRun, projectName) {
  if (!previousRun || !Array.isArray(previousRun.findings)) return null;
  if (previousRun.project?.name && projectName && previousRun.project.name !== projectName) return null;
  const before = new Set();
  for (const finding of previousRun.findings) {
    if (finding?.target && finding.ruleId && isBaselineable(finding)) before.add(baselineKey(finding));
  }
  const now = new Set();
  let added = 0;
  for (const finding of findings) {
    if (!isBaselineable(finding)) continue;
    const key = baselineKey(finding);
    now.add(key);
    if (!before.has(key)) {
      finding.isNew = true;
      added += 1;
    }
  }
  let fixed = 0;
  for (const key of before) if (!now.has(key)) fixed += 1;
  return { previousRunId: previousRun.id, new: [...now].filter((key) => !before.has(key)).length, fixed, unchanged: [...now].filter((key) => before.has(key)).length, newFindings: added };
}

export async function readPreviousRun(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && Array.isArray(parsed.findings) ? parsed : null;
  } catch {
    return null;
  }
}

export function createBaseline(run, now = new Date()) {
  const entries = new Map();
  for (const finding of run.findings) {
    if (!isBaselineable(finding)) continue;
    const key = baselineKey(finding);
    if (entries.has(key)) continue;
    entries.set(key, {
      key,
      ruleId: finding.ruleId,
      outcome: finding.outcome,
      severity: finding.severity,
      location: finding.target?.file
        ? `${finding.target.file}${finding.target.line ? `:${finding.target.line}` : ''}`
        : [finding.target?.routeOrScene, finding.target?.selectorOrNode].filter(Boolean).join(' ')
    });
  }
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    toolkit: { name: TOOLKIT_NAME, version: TOOLKIT_VERSION },
    project: run.project.name,
    profile: run.profile,
    entries: [...entries.values()].sort((a, b) => a.key.localeCompare(b.key))
  };
}

export function parseBaseline(value, source = 'baseline') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${source} must be a JSON object`);
  if (value.schemaVersion !== BASELINE_SCHEMA_VERSION) throw new TypeError(`${source}.schemaVersion must equal ${BASELINE_SCHEMA_VERSION}`);
  if (!Array.isArray(value.entries)) throw new TypeError(`${source}.entries must be an array`);
  for (const [index, entry] of value.entries.entries()) {
    if (!entry || typeof entry.key !== 'string' || typeof entry.ruleId !== 'string') {
      throw new TypeError(`${source}.entries[${index}] requires key and ruleId`);
    }
  }
  return value;
}

export async function readBaseline(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read baseline ${file}: ${error.message}`);
  }
  try {
    return parseBaseline(JSON.parse(text), file);
  } catch (error) {
    throw new Error(`Invalid baseline ${file}: ${error.message}`);
  }
}

export async function writeBaseline(file, baseline) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(toJsonSafe(baseline, 'baseline'), null, 2)}\n`);
  await fs.rename(tmp, file);
}

/**
 * Marks known findings `baselined` (they stay visible but stop blocking) and returns a comparison summary.
 * Mutates findings in place; call before gate evaluation.
 */
export function applyBaseline(findings, baseline, file) {
  const known = new Set(baseline.entries.map((entry) => entry.key));
  const seen = new Set();
  let knownCount = 0;
  const added = [];
  for (const finding of findings) {
    if (!isBaselineable(finding)) continue;
    const key = baselineKey(finding);
    seen.add(key);
    if (known.has(key)) {
      finding.baselined = true;
      knownCount += 1;
    } else {
      added.push({ ruleId: finding.ruleId, severity: finding.severity, outcome: finding.outcome, fingerprint: finding.fingerprint });
    }
  }
  const fixed = baseline.entries.filter((entry) => !seen.has(entry.key));
  return {
    file,
    createdAt: baseline.createdAt,
    known: knownCount,
    new: added.length,
    fixed: fixed.length,
    newFindings: added.slice(0, 50),
    fixedEntries: fixed.slice(0, 50).map(({ key, ruleId, location }) => ({ key, ruleId, location }))
  };
}
