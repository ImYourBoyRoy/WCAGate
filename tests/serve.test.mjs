// ./tests/serve.test.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startDashboardServer } from '../src/core/serve.mjs';

test('results server returns text/html for the overwritten results page', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-serve-'));
  await fs.writeFile(path.join(root, 'results.html'), '<!doctype html><html lang="en"><title>results</title></html>\n');
  const hosted = await startDashboardServer({ directory: root, port: 4179 });
  try {
    const response = await fetch(hosted.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const body = await response.text();
    assert.match(body, /<title>results<\/title>/);
    assert.match(hosted.url, /^http:\/\/127\.0\.0\.1:\d+\/results\.html$/);
  } finally {
    await new Promise((resolve) => hosted.server.close(resolve));
  }
});
