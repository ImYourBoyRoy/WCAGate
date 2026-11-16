import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyBaseline, baselineKey, createBaseline, parseBaseline, readBaseline, writeBaseline } from '../src/core/baseline.mjs';
import { evaluateGate } from '../src/core/gate.mjs';
import { DEFAULT_GATE } from '../src/core/constants.mjs';
import { summarizeForAgent } from '../src/core/result.mjs';
import { applyRunOverrides, splitList } from '../src/core/run-overrides.mjs';
import { extractLocs, routesFromSitemap } from '../src/core/sitemap.mjs';
import { main } from '../src/cli.mjs';

function finding(overrides = {}) {
  return {
    ruleId: 'axe/color-contrast',
    title: 'Contrast',
    outcome: 'failed',
    severity: 'serious',
    fingerprint: 'f'.repeat(24),
    suppressed: false,
    target: { adapter: 'web', routeOrScene: 'home [dark, mobile]', selectorOrNode: '.hero a', state: 'http://127.0.0.1:4321/', line: 3 },
    ...overrides
  };
}

function run(findings) {
  return { project: { name: 'Fixture' }, profile: 'wcag22-aa', findings, surfaceCount: 3 };
}

test('baseline keys ignore preview ports, line numbers, and matrix labels', () => {
  const a = baselineKey(finding());
  const b = baselineKey(finding({ target: { adapter: 'web', routeOrScene: 'home [light]', selectorOrNode: '.hero a', state: 'http://127.0.0.1:9999/', line: 99 } }));
  assert.equal(a, b);
  assert.notEqual(a, baselineKey(finding({ target: { adapter: 'web', routeOrScene: 'about', selectorOrNode: '.hero a' } })));
});

test('baseline ratchet: known findings stop blocking, new ones still do, fixed ones are listed', () => {
  const known = finding();
  const removed = finding({ target: { adapter: 'web', routeOrScene: 'gone', selectorOrNode: '.x' } });
  const baseline = createBaseline(run([known, removed]));
  assert.equal(baseline.entries.length, 2);

  const fresh = finding({ target: { adapter: 'web', routeOrScene: 'contact', selectorOrNode: '.new' } });
  const current = run([finding(), fresh]);
  const summary = applyBaseline(current.findings, baseline, 'wcag-audit/baseline.json');
  assert.equal(summary.known, 1);
  assert.equal(summary.new, 1);
  assert.equal(summary.fixed, 1);
  assert.equal(current.findings[0].baselined, true);

  const gate = evaluateGate(current, DEFAULT_GATE);
  assert.equal(gate.exitCode, 1);
  assert.deepEqual(gate.blockingFingerprints, [fresh.fingerprint]);

  const onlyKnown = run([finding()]);
  applyBaseline(onlyKnown.findings, baseline, 'b.json');
  assert.equal(evaluateGate(onlyKnown, DEFAULT_GATE).passed, true);
  onlyKnown.gate = evaluateGate(onlyKnown, DEFAULT_GATE);
  const agent = summarizeForAgent(onlyKnown);
  assert.equal(agent.causes.length, 0, 'baselined findings are not reported as causes');
  assert.equal(agent.known, 1);
});

test('baseline never hides execution errors or governance findings', () => {
  const error = finding({ ruleId: 'wcagate/system/adapter-execution', outcome: 'executionError' });
  const expired = finding({ ruleId: 'wcagate/governance/suppression-expired' });
  assert.equal(createBaseline(run([error, expired])).entries.length, 0);
  const baseline = { schemaVersion: 1, entries: [{ key: baselineKey(error), ruleId: error.ruleId }] };
  const current = run([error]);
  applyBaseline(current.findings, baseline, 'b.json');
  assert.equal(current.findings[0].baselined, undefined);
  assert.equal(evaluateGate(current, DEFAULT_GATE).exitCode, 2);
});

test('baseline files are validated and unreadable files are errors', async () => {
  assert.throws(() => parseBaseline({ schemaVersion: 2, entries: [] }), /schemaVersion/);
  assert.throws(() => parseBaseline({ schemaVersion: 1, entries: [{}] }), /requires key and ruleId/);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-baseline-'));
  await assert.rejects(readBaseline(path.join(dir, 'missing.json')), /Cannot read baseline/);
  await fs.writeFile(path.join(dir, 'bad.json'), '{nope');
  await assert.rejects(readBaseline(path.join(dir, 'bad.json')), /Invalid baseline/);
  const file = path.join(dir, 'nested', 'baseline.json');
  await writeBaseline(file, createBaseline(run([finding()])));
  assert.equal((await readBaseline(file)).entries.length, 1);
});

const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/about/</loc></url>
<url><loc>https://example.com/search?q=a&amp;b=1</loc></url>
<url><loc>https://other.example.org/leak/</loc></url></urlset>`;

function fakeFetch(map) {
  return async (url) => {
    const body = map[url];
    return body === undefined
      ? { ok: false, status: 404, text: async () => '' }
      : { ok: true, status: 200, text: async () => body };
  };
}

test('sitemap routes map production URLs onto the audited origin and skip foreign hosts', async () => {
  assert.deepEqual(extractLocs('<loc> https://a.test/x </loc><loc><![CDATA[https://a.test/y]]></loc>'), ['https://a.test/x', 'https://a.test/y']);
  const result = await routesFromSitemap({
    baseUrl: 'http://127.0.0.1:4321',
    source: 'https://example.com/sitemap.xml',
    fetchImpl: fakeFetch({ 'https://example.com/sitemap.xml': SITEMAP })
  });
  assert.deepEqual(result.routes, ['/', '/about/', '/search?q=a&b=1']);
  assert.equal(result.skippedCrossOrigin, 1);
});

test('a local preview serving the production sitemap keeps the production-host pages', async () => {
  const origin = 'http://127.0.0.1:4321';
  const result = await routesFromSitemap({
    baseUrl: origin,
    fetchImpl: fakeFetch({ [`${origin}/sitemap.xml`]: '<urlset><url><loc>https://prod.example/</loc></url><url><loc>https://prod.example/a/</loc></url><url><loc>https://cdn.example/x</loc></url></urlset>' })
  });
  assert.deepEqual(result.routes, ['/', '/a/']);
  assert.equal(result.skippedCrossOrigin, 1);
});

test('sitemap discovery tries sitemap.xml then follows one level of sitemap index with a limit', async () => {
  const origin = 'http://127.0.0.1:4321';
  const result = await routesFromSitemap({
    baseUrl: origin,
    limit: 2,
    fetchImpl: fakeFetch({
      [`${origin}/sitemap-index.xml`]: `<sitemapindex><sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap></sitemapindex>`,
      [`${origin}/sitemap-0.xml`]: '<urlset><url><loc>/a/</loc></url><url><loc>/b/</loc></url><url><loc>/c/</loc></url></urlset>'
    })
  });
  assert.deepEqual(result.routes, ['/a/', '/b/']);
  assert.equal(result.truncated, true);
  await assert.rejects(routesFromSitemap({ baseUrl: origin, fetchImpl: fakeFetch({}) }), /Could not read a sitemap/);
});

test('run overrides apply matrix lists and reject unknown values', () => {
  const config = { adapters: [{ type: 'playwright-axe', baseURL: 'http://a', scenarios: [] }, { type: 'svelte' }] };
  applyRunOverrides(config, { colorSchemes: 'light, dark', viewports: ['mobile'] });
  assert.deepEqual(config.adapters[0].matrix, { colorSchemes: ['light', 'dark'], viewports: ['mobile'] });
  assert.equal(config.adapters[1].matrix, undefined);
  assert.throws(() => applyRunOverrides(config, { colorSchemes: 'sepia' }), /light or dark/);
  assert.throws(() => applyRunOverrides(config, { viewports: 'watch' }), /mobile, tablet, or desktop/);
  assert.deepEqual(splitList(undefined), []);
});

test('CLI: baseline flags write a baseline and then pass the gate that previously failed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-baseline-'));
  await fs.writeFile(path.join(dir, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    project: 'Fixture',
    checks: [{ id: 'kbd', title: 'Keyboard workflow', outcome: 'untested', severity: 'serious', tester: 'T', testedAt: null, expiresAt: null, environment: 'Linux', evidence: '' }]
  }));
  await fs.writeFile(path.join(dir, 'wcagate.config.json'), JSON.stringify({
    schemaVersion: 1,
    project: { name: 'Fixture' },
    adapters: [{ type: 'manual-evidence', file: 'evidence.json' }],
    reporters: [{ type: 'json', file: 'latest.json' }]
  }));
  const sink = () => ({ buffer: '', write(chunk) { this.buffer += chunk; return true; } });
  const io = () => ({ stdout: sink(), stderr: sink() });

  const first = io();
  assert.equal(await main(['run', '--cwd', dir, '--no-serve', '--quiet', '--write-baseline', 'wcag-audit/baseline.json'], first), 3);
  const baseline = JSON.parse(await fs.readFile(path.join(dir, 'wcag-audit', 'baseline.json'), 'utf8'));
  assert.equal(baseline.entries.length, 1);

  const second = io();
  assert.equal(await main(['run', '--cwd', dir, '--no-serve', '--quiet', '--baseline', 'wcag-audit/baseline.json'], second), 0);
  const latest = JSON.parse(await fs.readFile(path.join(dir, 'wcag-audit', 'latest.json'), 'utf8'));
  assert.equal(latest.baseline.known, 1);
  assert.equal(latest.baseline.new, 0);
  assert.equal(latest.findings[0].baselined, true);

  const missing = io();
  assert.equal(await main(['run', '--cwd', dir, '--no-serve', '--quiet', '--baseline', 'nope.json'], missing), 2);
  assert.match(missing.stderr.buffer, /Cannot read baseline/);
});
