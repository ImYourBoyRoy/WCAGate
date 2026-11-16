import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { runPlaywrightAxeAdapter } from '../src/adapters/playwright-axe.mjs';
import { suggestBackground, contrastRatio, fromHex } from '../src/core/contrast.mjs';
import { mergeMatrixDuplicates, splitScenarioName } from '../src/core/merge.mjs';
import { validateConfig } from '../src/core/config.mjs';

function finding(route, overrides = {}) {
  return {
    ruleId: 'axe/color-contrast',
    outcome: 'failed',
    severity: 'serious',
    title: 'Contrast',
    fingerprint: `fp-${route}`,
    evidence: { id: 'color-contrast', html: '<a>x</a>' },
    tags: ['axe-core'],
    target: { adapter: 'web', routeOrScene: route, selectorOrNode: '.cta' },
    ...overrides
  };
}

test('matrix variants of one defect merge into one finding with stable identity', () => {
  assert.deepEqual(splitScenarioName('home [dark, mobile]'), { base: 'home', variant: 'dark, mobile' });
  assert.deepEqual(splitScenarioName('home'), { base: 'home', variant: null });

  const merged = mergeMatrixDuplicates([
    finding('home [light, mobile]'),
    finding('home [dark, mobile]', { severity: 'critical' }),
    finding('home [dark, desktop]'),
    finding('about [dark, desktop]'),
    finding('plain')
  ]);
  assert.equal(merged.length, 3, 'home x3 -> 1, about -> 1, plain stays');
  const home = merged.find((entry) => entry.target.routeOrScene === 'home');
  assert.deepEqual(home.evidence.variants, ['light, mobile', 'dark, mobile', 'dark, desktop']);
  assert.equal(home.evidence.variantCount, 3);
  assert.equal(home.severity, 'critical', 'highest severity wins');
  assert.ok(home.tags.includes('matrix-merged'));

  const again = mergeMatrixDuplicates([finding('home [dark, desktop]'), finding('home [light, mobile]')]);
  assert.equal(again[0].fingerprint, home.fingerprint, 'fingerprint ignores which variant came first');
  assert.equal(merged.find((entry) => entry.target.routeOrScene === 'plain').fingerprint, 'fp-plain');
});

test('different outcomes or selectors never merge', () => {
  const merged = mergeMatrixDuplicates([
    finding('home [a]'),
    finding('home [b]', { outcome: 'cantTell' }),
    finding('home [c]', { target: { adapter: 'web', routeOrScene: 'home [c]', selectorOrNode: '.other' } })
  ]);
  assert.equal(merged.length, 3);
});

test('background suggestions move the surface away from the text', () => {
  const lightText = fromHex('#fdf8f0');
  const suggestion = suggestBackground(lightText, fromHex('#648874'), 4.5);
  assert.ok(suggestion.ratio >= 4.5);
  assert.ok(contrastRatio(lightText, fromHex(suggestion.color)) >= 4.5);
  assert.equal(suggestBackground([0, 0, 0], [255, 255, 255], 4.5), null);
  const darkText = suggestBackground(fromHex('#222222'), fromHex('#555555'), 4.5);
  assert.ok(darkText && fromHex(darkText.color)[0] > 0x55, 'dark text on mid gray lightens the surface');
});

test('configuration validates expectStatus and concurrency', () => {
  const config = (scenario, adapter = {}) => ({ schemaVersion: 1, project: { name: 'x' }, adapters: [{ type: 'playwright-axe', baseURL: 'http://127.0.0.1:1', scenarios: [{ name: 'a', path: '/', ...scenario }], ...adapter }] });
  assert.deepEqual(validateConfig(config({ expectStatus: 404 }, { concurrency: 2 })), []);
  assert.deepEqual(validateConfig(config({ expectStatus: [200, 404] })), []);
  assert.match(validateConfig(config({ expectStatus: 'ok' })).join(), /expectStatus must be an HTTP status/);
  assert.match(validateConfig(config({}, { concurrency: 0 })).join(), /concurrency/);
});

async function browserModules() {
  try {
    const playwright = await import('playwright');
    const axe = await import('@axe-core/playwright');
    const browser = await (playwright.chromium ?? playwright.default.chromium).launch();
    await browser.close();
    return { playwright: playwright.default ?? playwright, axePlaywright: axe };
  } catch {
    return null;
  }
}

function adapterContext(modules) {
  return { runId: 'run', now: new Date(), projectName: 'Fixture', projectRoot: process.cwd(), outputDirectory: process.cwd(), adapterName: 'browser', profile: 'wcag22-aa', metadata: {}, modules };
}

function serve(routes) {
  const server = http.createServer((request, response) => {
    const route = routes[new URL(request.url, 'http://x').pathname];
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/html' });
      return response.end('<!doctype html><html lang="en"><title>Not found</title><main><h1>Not found</h1></main></html>');
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(route);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const page = (title) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;

test('real browser: a 404 route is an executionError, not a passing page; expectStatus allows it', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const { server, base } = await serve({ '/': page('Home') });
  try {
    const result = await runPlaywrightAxeAdapter({
      baseURL: base,
      scenarios: [{ name: 'home', path: '/' }, { name: 'missing', path: '/nope/' }, { name: 'custom-404', path: '/nope/', expectStatus: 404 }]
    }, adapterContext(modules));
    const status = result.findings.filter((entry) => entry.ruleId === 'wcagate/runtime/http-status');
    assert.equal(status.length, 1);
    assert.equal(status[0].outcome, 'executionError');
    assert.equal(status[0].target.routeOrScene, 'missing');
    assert.equal(result.metadata.scenarios.find((scenario) => scenario.name === 'custom-404').httpStatus, 404);
    assert.ok(!result.metadata.scenarios.find((scenario) => scenario.name === 'custom-404').skipped);
  } finally {
    server.close();
  }
});

test('real browser: duplicate titles across routes are reported once, and parallel scenarios keep config order', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const { server, base } = await serve({ '/': page('Same'), '/a/': page('Same'), '/b/': page('Different'), '/c/': page('Another') });
  try {
    const result = await runPlaywrightAxeAdapter({
      baseURL: base,
      concurrency: 3,
      scenarios: [{ name: 'home', path: '/' }, { name: 'a', path: '/a/' }, { name: 'b', path: '/b/' }, { name: 'c', path: '/c/' }],
      matrix: { colorSchemes: ['light', 'dark'] }
    }, adapterContext(modules));
    assert.deepEqual(result.metadata.scenarios.map((scenario) => scenario.name), [
      'home [light]', 'home [dark]', 'a [light]', 'a [dark]', 'b [light]', 'b [dark]', 'c [light]', 'c [dark]'
    ]);
    const duplicates = result.findings.filter((entry) => entry.ruleId === 'wcagate/site/duplicate-title');
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].severity, 'advisory');
    assert.deepEqual(duplicates[0].evidence.routes, ['/', '/a/']);
  } finally {
    server.close();
  }
});

test('settle: disabled settle is a no-op and an unusable page never throws', async () => {
  const { settlePage } = await import('../src/adapters/settle.mjs');
  assert.deepEqual(await settlePage({}, false), { settled: false, skipped: true });
  const broken = { waitForLoadState: async () => { throw new Error('closed'); }, evaluate: async () => { throw new Error('closed'); } };
  const report = await settlePage(broken, { timeoutMs: 50 });
  assert.equal(report.settled, false);
  assert.match(report.error, /closed/);
});

test('real browser: a fade-in is measured after it finishes, not mid-animation', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const html = `<!doctype html><html lang="en"><head><title>Fade</title><style>
  body{margin:0;background:#101010;color:#fff;font:18px sans-serif}
  @keyframes in{from{opacity:0}to{opacity:1}}
  p{margin:20px;animation:in 900ms ease-out both}
  .reveal{margin:40px 20px;opacity:0;transition:opacity 300ms}
  .reveal.on{opacity:1}
  </style></head><body><main><h1>Fade</h1><p id="fade">Text that fades in on load</p><div style="height:1400px"></div>
  <p class="reveal" id="late">Revealed once scrolled into view</p></main>
  <script>new IntersectionObserver((entries)=>entries.forEach((e)=>e.isIntersecting&&e.target.classList.add('on'))).observe(document.getElementById('late'));</script>
  </body></html>`;
  const { server, base } = await serve({ '/': html });
  try {
    const run = (settle) => runPlaywrightAxeAdapter({ baseURL: base, scenarios: [{ name: 'fade', path: '/' }], settle, probes: { contrastResolution: { enabled: false } } }, adapterContext(modules));
    const settled = await run(undefined);
    assert.equal(settled.findings.filter((entry) => entry.ruleId === 'axe/color-contrast').length, 0);
    assert.equal(settled.metadata.scenarios[0].settle.settled, true);
    assert.ok(settled.metadata.scenarios[0].settle.scrollSteps >= 1, 'the scroll pass triggers reveal-on-scroll content');
  } finally {
    server.close();
  }
});
