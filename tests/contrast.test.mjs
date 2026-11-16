import assert from 'node:assert/strict';
import test from 'node:test';
import { runPlaywrightAxeAdapter } from '../src/adapters/playwright-axe.mjs';
import {
  classifyContrast,
  composite,
  contrastRatio,
  histogramFromRgba,
  isLargeText,
  requiredRatio,
  suggestForeground,
  suggestForegroundForSurface,
  toHex
} from '../src/core/contrast.mjs';
import { expandScenarioMatrix } from '../src/core/matrix.mjs';
import { decodePng, encodePng } from '../src/core/png.mjs';
import { validateConfig } from '../src/core/config.mjs';

function solid(width, height, [r, g, b, a = 255]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) rgba.set([r, g, b, a], pixel * 4);
  return rgba;
}

test('contrast math matches published WCAG values', () => {
  assert.equal(Number(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2)), 21);
  assert.equal(Number(contrastRatio([119, 119, 119], [255, 255, 255]).toFixed(2)), 4.48);
  assert.deepEqual(composite([255, 255, 255, 0.5], [0, 0, 0]).map(Math.round), [128, 128, 128]);
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(requiredRatio({ sizePx: 16, weight: 400 }), 4.5);
  assert.equal(requiredRatio({ sizePx: 16, weight: 400, level: 'AAA' }), 7);
  assert.equal(requiredRatio({ sizePx: 30, weight: 400, level: 'AAA' }), 4.5);
});

test('PNG codec round-trips RGBA pixels', () => {
  const source = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 10, 20, 30, 255]);
  const decoded = decodePng(encodePng(2, 2, source));
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual([...decoded.rgba], [...source]);
  assert.throws(() => decodePng(Buffer.from('not a png at all, definitely not')), /Not a PNG/);
});

test('pixel classification passes, fails, and leaves mixed backgrounds unresolved', () => {
  const black = [0, 0, 0, 1];
  const onWhite = classifyContrast(histogramFromRgba(solid(20, 10, [255, 255, 255])), black, 4.5);
  assert.equal(onWhite.outcome, 'passed');

  const grayText = [200, 200, 200, 1];
  const onPale = classifyContrast(histogramFromRgba(solid(20, 10, [245, 230, 168])), grayText, 4.5);
  assert.equal(onPale.outcome, 'failed');
  assert.equal(onPale.confidence, 'high');
  assert.ok(onPale.worst.ratio < 4.5);

  const half = new Uint8Array(20 * 10 * 4);
  half.set(solid(10, 10, [255, 255, 255]), 0);
  half.set(solid(10, 10, [10, 10, 10]), 10 * 10 * 4);
  const mixed = classifyContrast(histogramFromRgba(half), [0, 0, 0, 1], 4.5, { failShare: 0.9 });
  assert.equal(mixed.outcome, 'cantTell');
  assert.equal(mixed.reason, 'mixed-background');

  assert.equal(classifyContrast({ colors: new Map(), total: 0 }, black, 4.5).outcome, 'cantTell');
});

test('translucent foreground is composited before comparing', () => {
  const histogram = histogramFromRgba(solid(8, 8, [0, 0, 0]));
  assert.equal(classifyContrast(histogram, [255, 255, 255, 1], 4.5).outcome, 'passed');
  assert.equal(classifyContrast(histogram, [255, 255, 255, 0.2], 4.5).outcome, 'failed');
});

test('suggested foregrounds are validated against the surface', () => {
  const gray = suggestForeground([255, 255, 255], [255, 255, 255], 4.5);
  assert.ok(gray.ratio >= 4.5 && gray.ratio < 4.7, 'nearest passing gray is just over the threshold');
  assert.equal(suggestForeground([0, 0, 0], [255, 255, 255], 4.5), null);
  const gradient = new Uint8Array(2 * 4);
  gradient.set([0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(suggestForegroundForSurface(histogramFromRgba(gradient), [128, 128, 128, 1], 5), null);
  const pale = suggestForegroundForSurface(histogramFromRgba(solid(4, 4, [245, 230, 168])), [255, 255, 255, 1], 4.5);
  assert.ok(pale && pale.ratio >= 4.5);
  assert.match(toHex([255, 0, 128]), /^#ff0080$/);
});

test('scenario matrix expands schemes and viewports without overriding explicit scenario choices', () => {
  const scenarios = [{ name: 'home', path: '/' }, { name: 'dark-only', path: '/d', colorScheme: 'dark' }];
  const expanded = expandScenarioMatrix(scenarios, { colorSchemes: ['light', 'dark'], viewports: ['mobile', { name: 'wide', width: 1600, height: 900 }] });
  assert.deepEqual(expanded.map((scenario) => scenario.name), [
    'home [light, mobile]', 'home [light, wide]', 'home [dark, mobile]', 'home [dark, wide]',
    'dark-only [mobile]', 'dark-only [wide]'
  ]);
  assert.equal(expanded[0].viewport.width, 375);
  assert.equal(expanded[4].colorScheme, 'dark');
  assert.equal(expandScenarioMatrix(scenarios, undefined), scenarios);
});

test('configuration validates matrix, scenario emulation, and new probes', () => {
  const base = {
    schemaVersion: 1,
    project: { name: 'x' },
    adapters: [{
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:1',
      matrix: { colorSchemes: ['light', 'dark'], viewports: ['mobile', { width: 800, height: 600 }] },
      probes: {
        contrastResolution: { enabled: true, maxNodes: 50, passShare: 0.05 },
        reflow: { enabled: true },
        textSpacing: { enabled: true }
      },
      scenarios: [{ name: 'home', path: '/', colorScheme: 'dark', viewport: 'tablet', reducedMotion: 'reduce' }]
    }]
  };
  assert.deepEqual(validateConfig(base), []);
  const bad = structuredClone(base);
  bad.adapters[0].matrix = { colorSchemes: ['sepia'], viewports: ['watch'] };
  bad.adapters[0].probes.contrastResolution = { failShare: 4 };
  bad.adapters[0].scenarios[0].colorScheme = 'neon';
  const errors = validateConfig(bad).join('\n');
  assert.match(errors, /colorSchemes must be an array of light or dark/);
  assert.match(errors, /viewports\[0\] must be/);
  assert.match(errors, /failShare must be a number between 0 and 1/);
  assert.match(errors, /colorScheme must be light or dark/);
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

const FIXTURE = `<!doctype html><html lang="en"><head><title>Contrast fixture</title><style>
body{margin:0;font:16px sans-serif;background:#101018;color:#fff}
.grad{background:linear-gradient(90deg,#f5e6a8,#e8d58a);padding:20px;margin:10px}
.grad a{color:#fff;font-weight:600}
.pass{background:linear-gradient(90deg,#102030,#203040);padding:20px;margin:10px;color:#fff}
.clip{background:linear-gradient(90deg,red,blue);-webkit-background-clip:text;color:transparent;font-size:30px}
</style></head><body><main><h1>Heading</h1>
<div class="grad"><a href="#x">pale button text</a></div>
<div class="pass">Good gradient text</div>
<div class="clip">Clipped gradient</div>
</main></body></html>`;

function adapterContext(modules) {
  return {
    runId: 'run',
    now: new Date(),
    projectName: 'Fixture',
    projectRoot: process.cwd(),
    outputDirectory: process.cwd(),
    adapterName: 'browser',
    profile: 'wcag22-aa',
    metadata: {},
    modules
  };
}

test('real browser: gradient incompletes become failed or pass instead of cantTell', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(FIXTURE)}`;
  const result = await runPlaywrightAxeAdapter({ scenarios: [{ name: 'fixture', url }] }, adapterContext(modules));
  const contrast = result.findings.filter((finding) => finding.ruleId === 'axe/color-contrast');

  const pale = contrast.find((finding) => finding.target.selectorOrNode.includes('a'));
  assert.ok(pale, 'white link on a pale gradient must be reported');
  assert.equal(pale.outcome, 'failed');
  assert.ok(pale.tags.includes('contrast-resolved') || pale.automation === 'automatic');
  assert.ok(pale.evidence.contrastResolution?.suggestedForeground || pale.evidence.failureSummary);

  assert.ok(!contrast.some((finding) => finding.target.selectorOrNode.includes('.pass')), 'passing gradient must not stay unresolved');
  const clipped = contrast.find((finding) => finding.target.selectorOrNode.includes('.clip'));
  if (clipped) {
    assert.equal(clipped.outcome, 'cantTell');
    assert.match(clipped.evidence.contrastResolution.reason, /gradient-clipped/);
  }
  assert.ok(result.metadata.scenarios[0].contrast.examined >= 1);
});

test('real browser: reflow and text-spacing probes find real defects and restore the page', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const html = `<!doctype html><html lang="en"><head><title>Probes</title><style>
  body{margin:0;font:16px sans-serif}
  .wide{width:900px;background:#eee}
  .card{height:22px;overflow:hidden;width:400px;border:1px solid #333}
  </style></head><body><main><h1>Probes</h1>
  <div class="wide">This box is far wider than a phone.</div>
  <div class="card">Fits one line today.</div>
  </main></body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const result = await runPlaywrightAxeAdapter({
    scenarios: [{ name: 'probes', url }],
    probes: { reflow: { enabled: true }, textSpacing: { enabled: true }, contrastResolution: { enabled: false } }
  }, adapterContext(modules));
  const reflow = result.findings.find((finding) => finding.ruleId === 'wcagate/runtime/reflow');
  assert.ok(reflow, 'reflow overflow at 320px must be reported');
  assert.equal(reflow.outcome, 'failed');
  assert.ok(reflow.evidence.offenders.some((offender) => offender.selector.includes('div')));
  const spacing = result.findings.find((finding) => finding.ruleId === 'wcagate/runtime/text-spacing');
  assert.ok(spacing, 'clipped text after spacing override must be reported');
  assert.equal(spacing.target.selectorOrNode.includes('div'), true);
});

test('real browser: matrix emulates color scheme and viewport per scenario', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const html = '<!doctype html><html lang="en"><head><title>Matrix</title></head><body><main><h1>Matrix</h1></main></body></html>';
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const result = await runPlaywrightAxeAdapter({
    scenarios: [{ name: 'matrix', url }],
    matrix: { colorSchemes: ['light', 'dark'], viewports: ['mobile'] }
  }, adapterContext(modules));
  const names = result.metadata.scenarios.map((scenario) => scenario.name);
  assert.deepEqual(names, ['matrix [light, mobile]', 'matrix [dark, mobile]']);
  assert.equal(result.metadata.scenarios[1].colorScheme, 'dark');
  assert.equal(result.metadata.scenarios[1].viewport.width, 375);
});

test('focus capture comparison separates visible, weak, and absent indicators', async () => {
  const { compareFocusCaptures } = await import('../src/adapters/focus-probe.mjs');
  const width = 40;
  const height = 20;
  const base = solid(width, height, [250, 250, 250]);
  const same = compareFocusCaptures(base, solid(width, height, [250, 250, 250]), width, height);
  assert.equal(same.verdict, 'none');

  const ring = solid(width, height, [250, 250, 250]);
  for (let x = 0; x < width; x += 1) for (const y of [0, 1, height - 2, height - 1]) ring.set([0, 40, 200, 255], (y * width + x) * 4);
  assert.equal(compareFocusCaptures(base, ring, width, height).verdict, 'visible');

  const faint = solid(width, height, [250, 250, 250]);
  for (let x = 0; x < width; x += 1) for (const y of [0, 1, height - 2, height - 1]) faint.set([232, 232, 240, 255], (y * width + x) * 4);
  const weak = compareFocusCaptures(base, faint, width, height);
  assert.equal(weak.verdict, 'weak');
  assert.ok(weak.strongestRatio < 3);
});

test('real browser: focus probe measures border-only, outline, and missing focus styles', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const html = `<!doctype html><html lang="en"><head><title>Focus</title><style>
  body{margin:20px;font:16px sans-serif;background:#fff}
  a,button{display:inline-block;margin:12px;padding:10px 14px}
  .outline:focus-visible{outline:3px solid #0033cc;outline-offset:2px}
  .border{border:2px solid transparent;background:#eee}
  .border:focus-visible{border-color:#000}
  .none{outline:none;background:#eee;border:0}
  </style></head><body><main><h1>Focus</h1>
  <a class="outline" href="#a">Outlined link</a>
  <button class="border">Border button</button>
  <button class="none">No focus style</button>
  </main></body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const result = await runPlaywrightAxeAdapter({
    scenarios: [{ name: 'focus', url }],
    probes: { focusIndicatorReview: { enabled: true, maxTabs: 10 }, contrastResolution: { enabled: false } }
  }, adapterContext(modules));
  const focus = result.findings.filter((finding) => finding.ruleId === 'wcagate/runtime/focus-indicator-review');
  assert.equal(focus.length, 1, JSON.stringify(focus.map((finding) => [finding.target.selectorOrNode, finding.outcome])));
  assert.equal(focus[0].outcome, 'failed');
  assert.match(focus[0].target.selectorOrNode, /button/);
  assert.match(focus[0].evidence.name, /No focus style/);
  assert.equal(result.metadata.scenarios[0].focus.visible, 2);
  // A missing indicator is a 2.4.7 (AA) failure, so it must count at the default AA gate.
  const { isFindingInScope } = await import('../src/core/profile.mjs');
  assert.equal(isFindingInScope(focus[0], 'wcag22-aa'), true);
});

test('real browser: focus on a closed off-canvas drawer is reported, and sticky bars covering focus are 2.4.11 failures', async (t) => {
  const modules = await browserModules();
  if (!modules) return t.skip('Playwright, @axe-core/playwright, and Chromium are not installed here');
  const html = `<!doctype html><html lang="en"><head><title>Drawer</title><style>
  body{margin:0;font:16px sans-serif}
  a:focus-visible,button:focus-visible{outline:3px solid #0033cc}
  .drawer{position:fixed;top:0;left:-400px;width:300px;background:#eee}
  .bar{position:fixed;top:0;left:0;right:0;height:60px;background:#222;z-index:9}
  main{padding-top:80px}
  </style></head><body><div class="bar"></div><div class="drawer"><button id="drawer-close">Close drawer</button></div>
  <main><h1>Drawer</h1><a href="#x">Visible link</a></main></body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const result = await runPlaywrightAxeAdapter({
    scenarios: [{ name: 'drawer', url }],
    probes: { focusIndicatorReview: { enabled: true, maxTabs: 6 }, contrastResolution: { enabled: false } }
  }, adapterContext(modules));
  const offscreen = result.findings.find((entry) => entry.ruleId === 'wcagate/runtime/focus-offscreen');
  assert.ok(offscreen, 'closed drawer button is focusable but invisible');
  assert.equal(offscreen.evidence.name, 'Close drawer');
  assert.ok(!result.findings.some((entry) => entry.ruleId === 'wcagate/runtime/focus-indicator-review' && entry.outcome === 'failed'));
});
