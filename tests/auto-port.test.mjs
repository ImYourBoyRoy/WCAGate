import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startManagedWebServer } from '../src/core/web-server.mjs';
import { findFreePort, isPortFree, replacePort } from '../src/core/ports.mjs';
import { applyRunOverrides } from '../src/core/run-overrides.mjs';
import { starterConfigSource } from '../src/core/presets.mjs';

function holdPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const SERVER_SOURCE = `const http=require('http');const i=process.argv.indexOf('--port');const port=Number(process.argv[i+1]||process.env.PORT);http.createServer((q,r)=>r.end('managed')).listen(port,'127.0.0.1');`;

test('replacePort rewrites each flag form and placeholders only for the requested port', () => {
  assert.deepEqual(replacePort(['--port', '4321', '--host', 'x'], 4321, 9), ['--port', '9', '--host', 'x']);
  assert.deepEqual(replacePort(['--port=4321'], 4321, 9), ['--port=9']);
  assert.deepEqual(replacePort(['-p', '4321'], 4321, 9), ['-p', '9']);
  assert.deepEqual(replacePort(['--port', '3000'], 4321, 9), ['--port', '3000']);
  assert.deepEqual(replacePort(['http://x:{port}/'], 4321, 9), ['http://x:9/']);
  // Loopback host:port forms follow the port; other hosts and longer numbers never do.
  assert.deepEqual(replacePort(['--origin=http://localhost:4321/a', 'http://127.0.0.1:4321'], 4321, 9), ['--origin=http://localhost:9/a', 'http://127.0.0.1:9']);
  assert.deepEqual(replacePort(['--proxy=http://backend:4321', 'localhost:43210', 'http://localhost:432'], 4321, 9), ['--proxy=http://backend:4321', 'localhost:43210', 'http://localhost:432']);
});

test('a wildcard listener makes a port busy; a command that cannot start is an AdapterError, not a crash', async () => {
  const holder = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '0.0.0.0', () => resolve(server));
  });
  try {
    assert.equal(await isPortFree(holder.address().port), false);
  } finally {
    holder.close();
  }
  const { port } = await findFreePort();
  await assert.rejects(
    startManagedWebServer({ command: 'definitely-not-a-real-command-xyz', url: `http://127.0.0.1:${port}`, autoPort: true, timeoutMs: 5000 }, { projectRoot: process.cwd() }, undefined),
    /Unable to start web server command|exited before becoming ready/
  );
});

test('autoPort leaves a busy port and its owner alone, runs on a free port, and reports the origin it got', async () => {
  const holder = await holdPort();
  const busy = holder.address().port;
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auto-port-')), 'server.cjs');
  fs.writeFileSync(script, SERVER_SOURCE);
  const server = await startManagedWebServer({
    command: process.execPath,
    args: [script, '--port', String(busy)],
    url: `http://127.0.0.1:${busy}`,
    autoPort: true,
    reuseExistingServer: false,
    timeoutMs: 20000
  }, { projectRoot: process.cwd() }, undefined);
  try {
    assert.ok(server.baseURL, 'a moved server reports its origin');
    assert.notEqual(new URL(server.baseURL).port, String(busy));
    assert.equal(server.metadata.autoPort.moved, true);
    assert.equal(server.metadata.autoPort.requestedPort, busy);
    assert.equal(await (await fetch(server.baseURL)).text(), 'managed');
    assert.equal(await isPortFree(busy), false, 'the original listener is untouched');
  } finally {
    await server.close();
    holder.close();
  }
});

test('autoPort uses the preferred port when it is free and reports no move', async () => {
  const { port } = await findFreePort();
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auto-port-')), 'server.cjs');
  fs.writeFileSync(script, SERVER_SOURCE);
  const server = await startManagedWebServer({ command: process.execPath, args: [script, '--port', String(port)], url: `http://127.0.0.1:${port}`, autoPort: true, timeoutMs: 20000 }, { projectRoot: process.cwd() }, undefined);
  try {
    assert.equal(server.baseURL, undefined);
    assert.equal(server.metadata.autoPort.moved, false);
  } finally {
    await server.close();
  }
});

test('generated presets own their server on a free port; an explicit --base-url adopts the caller\'s server', () => {
  const source = starterConfigSource({ preset: 'astro', packageManager: 'pnpm' });
  assert.match(source, /autoPort: true,\s+reuseExistingServer: false/);
  const config = { adapters: [{ type: 'playwright-axe', baseURL: 'http://127.0.0.1:4321', scenarios: [], webServer: { command: 'x', url: 'http://127.0.0.1:4321', autoPort: true, reuseExistingServer: false } }] };
  applyRunOverrides(config, { baseUrl: 'http://127.0.0.1:4500' });
  const server = config.adapters[0].webServer;
  assert.equal(server.url, 'http://127.0.0.1:4500');
  assert.equal(server.autoPort, false);
  assert.equal(server.reuseExistingServer, true);
});
