import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareWithPrevious } from '../src/core/baseline.mjs';
import { groupFindings } from '../src/core/grouping.mjs';
import { agentSummary, groupDetail, renderAgentReport } from '../src/reporters/agent.mjs';
import { renderConsoleReport } from '../src/reporters/console.mjs';
import { main } from '../src/cli.mjs';

function contrastFinding(route, selector, { fg = '#fdf8f0', bg = '#648874', ratio = 3.73, text = 'Allow' } = {}) {
  return {
    ruleId: 'axe/color-contrast', title: 'Elements must meet minimum color contrast ratio thresholds', description: 'x',
    outcome: 'failed', severity: 'serious', confidence: 'high', fingerprint: `fp-${route}-${selector}`, suppressed: false, outOfScope: false,
    target: { adapter: 'web', routeOrScene: route, selectorOrNode: selector },
    standards: [{ document: 'WCAG-2.2', requirement: '1.4.3', level: 'AA' }],
    evidence: { id: 'color-contrast', html: `<button>${text}</button>`, any: [{ id: 'color-contrast', data: { fgColor: fg, bgColor: bg, contrastRatio: ratio, expectedContrastRatio: '4.5:1' } }] },
    remediation: 'Raise contrast.', tags: ['axe-core']
  };
}

function runOf(findings, extra = {}) {
  return {
    id: 'run', project: { name: 'Site' }, profile: 'wcag22-aa', durationMs: 4200, summary: { total: 0 }, surfaceCount: 9, outputDirectory: '/x/wcag-audit',
    adapters: [{ metadata: { scenarios: [{ name: 'home [light]', contrast: { passed: 10 } }, { name: 'home [dark]', contrast: { passed: 5 } }, { name: 'about [light]' }, { name: 'about [dark]' }] } }],
    findings, gate: { passed: false, exitCode: 1, reason: 'blockingFindings' }, ...extra
  };
}

test('contrast failures group by color pair so one fix covers every element and route', () => {
  const findings = [
    contrastFinding('home [dark]', '.cta'), contrastFinding('about [dark]', '.cta'), contrastFinding('home [dark]', '.tag', { text: 'New' }),
    contrastFinding('home [light]', '.other', { fg: '#d1d3ca', bg: '#4d6559', ratio: 4.19 })
  ];
  const { groups, routeCount, variantCount, measuredPasses } = groupFindings(runOf(findings));
  assert.equal(groups.length, 2);
  assert.equal(routeCount, 2);
  assert.equal(variantCount, 2);
  assert.equal(measuredPasses, 15);
  const shared = groups.find((group) => group.headline.includes('#648874'));
  assert.equal(shared.findingCount, 3);
  assert.equal(shared.elementCount, 2);
  assert.deepEqual(shared.variants, ['dark']);
  assert.match(shared.fix, /text #fdf8f0 -> #[0-9a-f]{6} \(4\.\d+:1\) OR surface #648874 -> #[0-9a-f]{6}/);
});

test('agent report states each cause and fix once, caps elements, and is a small fraction of the raw run', () => {
  const findings = [];
  for (let index = 0; index < 40; index += 1) findings.push(contrastFinding(index % 2 ? 'home [dark]' : 'about [dark]', `.card-${index}`));
  findings.push({ ...contrastFinding('home [light]', '.x'), outcome: 'cantTell', evidence: { id: 'color-contrast', contrastResolution: { status: 'unresolved', reason: 'mixed-background', measured: { failingShare: 0.18 } } } });
  const run = runOf(findings);
  const text = renderAgentReport(run);
  assert.match(text, /GATE FAIL exit 1 \(blockingFindings\) \| 2 routes x 2 variants/);
  assert.equal((text.match(/fix: text #fdf8f0/g) ?? []).length, 1, 'the shared fix is printed once');
  assert.match(text, /\+35 more element\(s\): wcagate report --group g1/);
  assert.match(text, /\[g2\] REVIEW .*contrast/);
  assert.match(text, /18% of pixels fail/);
  assert.ok(text.length < JSON.stringify(run).length / 8, `agent view ${text.length} vs raw ${JSON.stringify(run).length}`);
  assert.doesNotMatch(text, /<button>/, 'raw HTML stays in latest.json');
  assert.doesNotMatch(text, /fp-/, 'fingerprints stay in latest.json');
});

test('agent summary and drill-down expose the same ids as the text report', () => {
  const run = runOf([contrastFinding('home [dark]', '.cta'), contrastFinding('about [dark]', '.cta')]);
  const summary = agentSummary(run);
  assert.equal(summary.causes[0].id, 'g1');
  assert.equal(summary.causes[0].findings, 2);
  assert.equal(summary.causes[0].where[0].routes, 2);
  const detail = groupDetail(run, 'g1');
  assert.equal(detail.elements[0].at, '.cta');
  assert.deepEqual(detail.elements[0].routes.sort(), ['about', 'home']);
  assert.match(detail.sample.html, /<button>Allow<\/button>/);
  assert.throws(() => groupDetail(run, 'g9'), /No group "g9"/);
});

test('suppressed, out-of-scope, and baselined findings never become reported causes', () => {
  const findings = [
    { ...contrastFinding('home [dark]', '.a'), suppressed: true },
    { ...contrastFinding('home [dark]', '.b'), outOfScope: true },
    { ...contrastFinding('home [dark]', '.c'), baselined: true }
  ];
  const text = renderAgentReport(runOf(findings, { gate: { passed: true, exitCode: 0, reason: 'passed' } }));
  assert.match(text, /GATE PASS/);
  assert.match(text, /known\(baseline\) 1 cause/);
  assert.match(text, /No blocking or unresolved findings\./);
});

test('long selectors keep the informative tail and component instances are counted', () => {
  const long = (id) => `article[data-id="${id}"] > .card-wrapper-with-long-name > .card-body > .time-label`;
  const { groups } = groupFindings(runOf([contrastFinding('home [dark]', long('a')), contrastFinding('home [dark]', long('b')), contrastFinding('home [dark]', long('c'))]));
  assert.equal(groups[0].elementCount, 3);
  assert.equal(groups[0].elements.length, 1);
  assert.match(groups[0].elements[0].where, /^\.\.\. > .*\.time-label$/);
  assert.match(renderAgentReport(runOf([contrastFinding('home [dark]', long('a')), contrastFinding('home [dark]', long('b'))])), /time-label x2/);
});

test('previous-run comparison marks only genuinely new findings', () => {
  const old = runOf([contrastFinding('home [dark]', '.cta'), contrastFinding('home [dark]', '.gone')]);
  const now = [contrastFinding('home [dark]', '.cta'), contrastFinding('home [dark]', '.fresh')];
  const delta = compareWithPrevious(now, old, 'Site');
  assert.deepEqual({ new: delta.new, fixed: delta.fixed, unchanged: delta.unchanged }, { new: 1, fixed: 1, unchanged: 1 });
  assert.equal(now[0].isNew, undefined);
  assert.equal(now[1].isNew, true);
  assert.equal(compareWithPrevious(now, old, 'Other project'), null);
  assert.equal(compareWithPrevious(now, null, 'Site'), null);
  const text = renderAgentReport(runOf(now, { sinceLastRun: { new: 1, fixed: 1, unchanged: 1 } }));
  assert.match(text, /since last run: 1 fixed, 1 new, 1 unchanged/);
  assert.match(text, /\[g\d\] FAIL NEW/);
});

test('console is the agent view by default and the per-finding listing only with style verbose', () => {
  const run = runOf([contrastFinding('home [dark]', '.cta')]);
  assert.match(renderConsoleReport(run, {}), /drill down: wcagate report --group/);
  assert.match(renderConsoleReport(run, { style: 'verbose', color: false }), /Fingerprint:/);
});

test('CLI report prints the grouped view, JSON, and a group drill-down from latest.json', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-report-'));
  await fs.mkdir(path.join(dir, 'wcag-audit'));
  await fs.writeFile(path.join(dir, 'wcag-audit', 'latest.json'), JSON.stringify(runOf([contrastFinding('home [dark]', '.cta')])));
  const sink = () => ({ buffer: '', write(chunk) { this.buffer += chunk; return true; } });
  const call = async (args) => { const io = { stdout: sink(), stderr: sink() }; const code = await main(['report', '--cwd', dir, ...args], io); return { code, out: io.stdout.buffer, err: io.stderr.buffer }; };
  assert.match((await call([])).out, /\[g1\] FAIL serious axe\/color-contrast/);
  assert.equal(JSON.parse((await call(['--json'])).out).causes[0].id, 'g1');
  assert.equal(JSON.parse((await call(['--group', 'g1'])).out).elements[0].at, '.cta');
  const missing = await main(['report', '--cwd', dir, '--file', 'nope.json'], { stdout: sink(), stderr: sink() });
  assert.equal(missing, 2);
});
