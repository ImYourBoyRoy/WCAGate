// ./tests/run-overrides.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRunOverrides, scenariosFromRoutes } from '../src/core/run-overrides.mjs';
import { shouldServeDashboard } from '../src/core/serve.mjs';

test('run overlays rewrite playwright baseURL and routes', () => {
  const config = {
    adapters: [
      {
        type: 'playwright-axe',
        baseURL: 'http://127.0.0.1:4321',
        webServer: { command: 'npm', url: 'http://127.0.0.1:4321' },
        scenarios: [{ name: 'home', path: '/', steps: [] }]
      },
      { type: 'manual-evidence', file: 'manual.json' }
    ]
  };
  applyRunOverrides(config, { baseUrl: 'https://example.com/', routes: '/,/about,blog' });
  assert.equal(config.adapters[0].baseURL, 'https://example.com');
  assert.equal(config.adapters[0].webServer.url, 'https://example.com');
  assert.deepEqual(config.adapters[0].scenarios.map((scenario) => scenario.path), ['/', '/about', '/blog']);
  assert.equal(config.adapters[1].file, 'manual.json');
});

test('scenariosFromRoutes names home and sanitizes paths', () => {
  const scenarios = scenariosFromRoutes(['/', '/docs/start']);
  assert.equal(scenarios[0].name, 'home');
  assert.equal(scenarios[1].path, '/docs/start');
});

test('dashboard serve stays off in CI and unless --serve is passed', () => {
  assert.equal(shouldServeDashboard({ serve: true, env: { CI: 'true' } }), false);
  assert.equal(shouldServeDashboard({ serve: true, noServe: true, env: {} }), false);
  assert.equal(shouldServeDashboard({ serve: false, env: {} }), false);
  assert.equal(shouldServeDashboard({ serve: true, env: {} }), true);
});
