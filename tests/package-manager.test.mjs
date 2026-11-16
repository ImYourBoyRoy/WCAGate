import assert from 'node:assert/strict';
import test from 'node:test';
import { addDevArgs, detectPackageManager, execArgs, installFix } from '../src/core/package-manager.mjs';

const has = (...names) => (file) => names.some((name) => file.endsWith(name));

test('the project lockfile decides; with none, pnpm if installed, else npm', () => {
  assert.equal(detectPackageManager('/p', { exists: has('pnpm-lock.yaml'), installed: () => false }), 'pnpm');
  assert.equal(detectPackageManager('/p', { exists: has('package-lock.json'), installed: () => true }), 'npm', 'an existing npm site is never switched');
  assert.equal(detectPackageManager('/p', { exists: has('yarn.lock'), installed: () => true }), 'yarn');
  assert.equal(detectPackageManager('/p', { exists: has('bun.lock'), installed: () => true }), 'bun');
  assert.equal(detectPackageManager('/p', { exists: () => false, installed: () => true }), 'pnpm');
  assert.equal(detectPackageManager('/p', { exists: () => false, installed: () => false }), 'npm');
});

test('install and exec commands are the manager\'s own', () => {
  assert.deepEqual(addDevArgs('pnpm', ['a']), ['add', '-D', 'a']);
  assert.deepEqual(addDevArgs('npm', ['a']), ['install', '--save-dev', 'a']);
  assert.deepEqual(execArgs('pnpm', 'playwright', ['install', 'chromium']).flat().slice(0, 4), [process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', 'exec', 'playwright', 'install']);
  assert.match(installFix('pnpm', ['playwright', '@axe-core/playwright']), /^pnpm add -D playwright @axe-core\/playwright && pnpm exec playwright install chromium$/);
  assert.match(installFix('npm', ['playwright']), /^npm install --save-dev playwright && npx playwright install chromium$/);
});

test('runScriptArgs: npm needs the -- separator, pnpm/yarn/bun pass flags straight through', async () => {
  const { runScriptArgs } = await import('../src/core/package-manager.mjs');
  assert.deepEqual(runScriptArgs('npm', 'preview', ['--port', '4321']), ['npm', ['run', 'preview', '--', '--port', '4321']]);
  assert.deepEqual(runScriptArgs('pnpm', 'preview', ['--port', '4321']), ['pnpm', ['run', 'preview', '--port', '4321']]);
  assert.deepEqual(runScriptArgs('pnpm', 'test:x'), ['pnpm', ['run', 'test:x']]);
});

test('init presets launch the preview server with the project package manager', async () => {
  const { starterConfigSource } = await import('../src/core/presets.mjs');
  const pnpm = starterConfigSource({ preset: 'astro', packageManager: 'pnpm' });
  assert.match(pnpm, /command: 'pnpm',\s+args: \['run', 'preview', '--host', '127\.0\.0\.1', '--port', '4321'\]/);
  const npm = starterConfigSource({ preset: 'astro' });
  assert.match(npm, /command: 'npm',\s+args: \['run', 'preview', '--', '--host'/);
  assert.match(starterConfigSource({ preset: 'tauri', packageManager: 'yarn' }), /command: 'yarn',\s+args: \['run', 'test:tauri-a11y-export'\]/);
});
