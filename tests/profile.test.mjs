// ./tests/profile.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGate } from '../src/core/gate.mjs';
import { normalizeConfig } from '../src/core/config.mjs';
import {
  annotateScope,
  axeRunOnlyForProfile,
  buildScorecard,
  isFindingInScope
} from '../src/core/profile.mjs';

const gate = normalizeConfig({
  schemaVersion: 1,
  project: { name: 'Fixture' },
  adapters: [{ type: 'native-evidence', file: 'a11y.json' }]
}, { cwd: '/tmp' }).gate;

test('AA profile excludes AAA-only axe tags from runOnly and the gate', () => {
  const aaTags = axeRunOnlyForProfile('wcag22-aa');
  assert.ok(aaTags.includes('wcag22aa'));
  assert.ok(!aaTags.includes('wcag22aaa'));
  const aaaTags = axeRunOnlyForProfile('wcag22-aaa');
  assert.ok(aaaTags.includes('wcag22aaa'));

  const aaaFinding = {
    ruleId: 'axe/target-size',
    outcome: 'failed',
    severity: 'serious',
    suppressed: false,
    fingerprint: 'aaa',
    tags: ['wcag22aaa'],
    standards: [{ document: 'WCAG-2.2', requirement: '2.5.5', level: 'AAA', mapping: 'secondary' }]
  };
  assert.equal(isFindingInScope(aaaFinding, 'wcag22-aa'), false);
  assert.equal(isFindingInScope(aaaFinding, 'wcag22-aaa'), true);

  const annotated = annotateScope([aaaFinding], 'wcag22-aa');
  assert.equal(annotated[0].outOfScope, true);
  assert.equal(evaluateGate({
    surfaceCount: 1,
    findings: annotated
  }, gate).exitCode, 0);
});

test('scorecard reports evidence completeness, not a conformance percentage', () => {
  const findings = annotateScope([
    { outcome: 'failed', suppressed: false, standards: [{ document: 'WCAG-2.2', requirement: '1.1.1', level: 'A' }] },
    { outcome: 'cantTell', suppressed: false, standards: [{ document: 'WCAG-2.2', requirement: '1.4.3', level: 'AA' }] },
    { outcome: 'failed', suppressed: false, tags: ['wcag22aaa'] }
  ], 'wcag22-aa');
  const scorecard = buildScorecard(findings, 'wcag22-aa');
  assert.equal(scorecard.level, 'AA');
  assert.equal(scorecard.blocking, 1);
  assert.equal(scorecard.unresolved, 1);
  assert.equal(scorecard.outOfScope, 1);
  assert.equal(scorecard.completenessPercent, 50);
  assert.match(scorecard.disclaimer, /not a conformance score/);
});
