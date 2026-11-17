// Windows-only: the managed web server runs behind the npm .cmd shim, moves off a busy port, stops its whole process tree
// and never touches the foreign server. Skipped on POSIX, where tests/auto-port.test.mjs covers process groups.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { isPortFree, listenerBelongsTo } from '../src/core/ports.mjs';
import { startManagedWebServer } from '../src/core/web-server.mjs';

const WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const code = 'require("http").createServer((q,r)=>r.end("ok")).listen(process.env.PORT,"127.0.0.1")';

test('autoPort through the npm shim: moves off a foreign server, answers, and close() frees the port', { skip: !WIN, timeout: 150_000 }, async () => {
  const requested = 4451;
  const foreign = spawn(process.execPath, ['-e', `require("http").createServer((q,r)=>r.end("foreign")).listen(${requested},"127.0.0.1")`], { stdio: 'ignore', windowsHide: true });
  let managed;
  try {
    for (let i = 0; i < 20 && (await isPortFree(requested)); i += 1) await sleep(300);
    managed = await startManagedWebServer({
      command: 'npm',
      args: ['exec', '--yes', '--', 'node', '-e', code],
      url: `http://127.0.0.1:${requested}`,
      timeoutMs: 120_000,
      autoPort: true,
      reuseExistingServer: false
    }, { projectRoot: process.cwd() });
    const { autoPort } = managed.metadata;
    assert.equal(autoPort.moved, true);
    assert.notEqual(autoPort.port, requested);
    assert.equal(new URL(managed.baseURL).port, String(autoPort.port));
    assert.equal(await (await fetch(managed.baseURL)).text(), 'ok', 'the managed server answers, not the foreign one');
    assert.equal(await (await fetch(`http://127.0.0.1:${requested}`)).text(), 'foreign', 'the foreign server is untouched');
    assert.notEqual(listenerBelongsTo(autoPort.port, foreign.pid), true, 'the managed listener is not a descendant of the foreign server');
    const movedPort = autoPort.port;
    await managed.close();
    managed = null;
    await sleep(1500);
    assert.equal(await isPortFree(movedPort), true, 'taskkill /T must stop the grandchild that holds the port');
    assert.equal(await isPortFree(requested), false, 'the foreign server still runs');
  } finally {
    await managed?.close();
    foreign.kill();
  }
});
