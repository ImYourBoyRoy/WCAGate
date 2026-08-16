// ./tests/doctor.test.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { diagnoseEnvironment, formatDoctorReport, nodeSatisfiesEngines } from '../src/core/doctor.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('nodeSatisfiesEngines accepts Node 24 and newer', () => {
  assert.equal(nodeSatisfiesEngines('24.0.0', '>=24.0.0'), true);
  assert.equal(nodeSatisfiesEngines('23.11.0', '>=24.0.0'), false);
  assert.equal(nodeSatisfiesEngines('24.19.0', '>=24.0.0'), true);
  assert.equal(nodeSatisfiesEngines('26.7.0', '>=24.0.0'), true);
});

test('doctor fails closed when this package is missing entrypoints', async () => {
  const fake = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-doctor-pkg-'));
  await fs.writeFile(path.join(fake, 'package.json'), JSON.stringify({
    name: 'incomplete',
    engines: { node: '>=24.0.0' }
  }));
  const diagnosis = await diagnoseEnvironment({
    packageRoot: fake,
    projectRoot: fake,
    nodeVersion: '24.0.0'
  });
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.exitCode, 2);
  assert.equal(diagnosis.checks.find((item) => item.id === 'package-files')?.ok, false);
});

test('doctor fails closed when a required command-evidence binary is missing', async () => {
  const diagnosis = await diagnoseEnvironment({
    packageRoot,
    projectRoot: packageRoot,
    config: {
      adapters: [{ type: 'command-evidence', id: 'exporter', command: 'definitely-not-on-path-wcagate', required: true }]
    },
    env: { PATH: '/no-such-command-dir' }
  });
  assert.equal(diagnosis.ok, false);
  assert.equal(diagnosis.exitCode, 2);
  assert.equal(diagnosis.checks.find((item) => item.id === 'command:exporter')?.ok, false);
  assert.match(formatDoctorReport(diagnosis), /not found/);
});

test('doctor passes package integrity for this checkout without adapter extras', async () => {
  const diagnosis = await diagnoseEnvironment({
    packageRoot,
    projectRoot: packageRoot
  });
  assert.equal(diagnosis.ok, true, formatDoctorReport(diagnosis));
});
