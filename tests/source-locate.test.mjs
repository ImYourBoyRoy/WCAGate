// ./tests/source-locate.test.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { enrichFindingsWithSourceLocations } from '../src/core/source-locate.mjs';
import { renderDashboardReport } from '../src/reporters/dashboard.mjs';
import { runAccessibility } from '../src/core/runner.mjs';

test('source locator maps class selectors to markup file:line', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-source-locate-'));
  await fs.mkdir(path.join(root, 'src', 'layouts'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'styles'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'src', 'layouts', 'Layout.astro'),
    `<header class="site-header">\n  <a class="site-header__brand-name" href="/">Brand</a>\n</header>\n`
  );
  await fs.writeFile(
    path.join(root, 'src', 'styles', 'header.css'),
    `.site-header__brand-name { font-size: 1rem; }\n`
  );

  const [enriched] = enrichFindingsWithSourceLocations([{
    ruleId: 'target-size',
    title: 'Target size',
    outcome: 'failed',
    severity: 'serious',
    target: {
      routeOrScene: '/',
      selectorOrNode: '.site-header > .site-header__brand-name'
    },
    evidence: {
      html: '<a class="site-header__brand-name" href="/">Brand</a>'
    }
  }], { projectRoot: root });

  assert.equal(enriched.target.file, 'src/layouts/Layout.astro');
  assert.equal(enriched.target.line, 2);
  assert.equal(enriched.target.sourceKind, 'markup');
});

test('source locator finds Tauri crate ui roots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-source-tauri-'));
  await fs.mkdir(path.join(root, 'crates', 'pyenv-gui', 'ui'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'crates', 'pyenv-gui', 'ui', 'index.html'),
    `<button class="install-btn">Install</button>\n`
  );
  const [enriched] = enrichFindingsWithSourceLocations([{
    ruleId: 'button-name',
    outcome: 'failed',
    severity: 'serious',
    target: { selectorOrNode: 'button.install-btn' },
    evidence: { html: '<button class="install-btn">Install</button>' }
  }], { projectRoot: root });
  assert.equal(enriched.target.file, 'crates/pyenv-gui/ui/index.html');
});

test('results reporter overwrites a single file and shows the scorecard', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-dashboard-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'Page.astro'), `<a class="cta-link" href="/go">Go</a>\n`);
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    producer: { name: 'fixture', version: '1.0.0', kind: 'test' },
    surfaceCount: 1,
    findings: [{
      ruleId: 'target-size',
      title: 'Target size',
      outcome: 'failed',
      severity: 'serious',
      target: { routeOrScene: '/', selectorOrNode: 'a.cta-link' },
      evidence: { html: '<a class="cta-link" href="/go">Go</a>' },
      remediation: 'Enlarge the control.'
    }]
  }));

  const config = {
    schemaVersion: 1,
    project: { name: 'DashboardFixture', root },
    adapters: [{ type: 'native-evidence', file: 'evidence.json' }],
    reporters: [
      { type: 'json', file: 'latest.json' },
      { type: 'results', file: 'results.html' }
    ]
  };
  const first = await runAccessibility(config, { quiet: true });
  const second = await runAccessibility(config, { quiet: true });
  assert.equal(first.gate.exitCode, 1);
  assert.equal(second.gate.exitCode, 1);

  const resultsPath = path.join(root, 'wcag-audit', 'results.html');
  const listing = await fs.readdir(path.join(root, 'wcag-audit'));
  assert.equal(listing.filter((name) => name.includes('results.html')).length, 1);

  const html = await fs.readFile(resultsPath, 'utf8');
  assert.match(html, /WCAG audit results/);
  assert.match(html, /src\/Page\.astro:1/);
  assert.match(html, /Evidence completeness/);
  assert.match(html, /not a conformance score/);
  assert.match(html, /WCAG 2\.2 AA/);

  const rendered = renderDashboardReport(second);
  assert.match(rendered, /Unique fingerprints/);
});
