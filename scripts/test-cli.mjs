import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.mjs');

for (const fixture of [
  { name: 'pass', outcome: null, surfaceCount: 1, expected: 0 },
  { name: 'fail', outcome: 'failed', surfaceCount: 1, expected: 1 },
  { name: 'unresolved', outcome: 'untested', surfaceCount: 1, expected: 3 },
  { name: 'empty', outcome: null, surfaceCount: 0, expected: 2 }
]) {
  const directory = await createFixture(fixture);
  const result = await execute(['run', '--cwd', directory, '--quiet', '--no-color']);
  assert.equal(result.code, fixture.expected, `${fixture.name}: ${result.stderr}`);
  const report = JSON.parse(await fs.readFile(path.join(directory, 'wcag-audit', 'run.json'), 'utf8'));
  assert.equal(report.gate.exitCode, fixture.expected);
}

const missing = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-missing-'));
assert.equal((await execute(['run', '--cwd', missing, '--quiet'])).code, 2);

const initialized = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-init-'));
assert.equal((await execute(['init', initialized])).code, 0);
await fs.access(path.join(initialized, 'wcagate.config.mjs'));
await fs.access(path.join(initialized, 'wcag-audit', 'manual-evidence.json'));
assert.equal((await execute(['validate-config', '--cwd', initialized])).code, 0);

assert.equal((await execute(['version'])).stdout.trim(), '2.3.1');
assert.match((await execute(['help'])).stdout, /Exit codes:/);
assert.match((await execute(['help'])).stdout, /doctor/);
const doctor = await execute(['doctor', '--json']);
assert.equal(doctor.code, 0, doctor.stderr + doctor.stdout);
assert.match(doctor.stdout, /"ok": true/);
const corePath = (await execute(['core-path'])).stdout.trim();
await fs.access(path.join(corePath, 'bin', 'wcagate.mjs'));
assert.match((await execute(['list-rules'])).stdout, /wcagate\/system\/adapter-execution/);
assert.match((await execute(['explain', 'wcagate/runtime/target-size-enhanced'])).stdout, /target-size-enhanced/);

const tauriInit = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-tauri-'));
assert.equal((await execute(['init', tauriInit, '--preset', 'tauri'])).code, 0);
const tauriConfig = await fs.readFile(path.join(tauriInit, 'wcagate.config.mjs'), 'utf8');
assert.match(tauriConfig, /frontend-browser-mode/);
assert.match(tauriConfig, /results\.html/);
assert.equal((await execute(['validate-config', '--cwd', tauriInit])).code, 0);

const nativeInit = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-native-'));
assert.equal((await execute(['init', nativeInit, '--preset', 'native'])).code, 0);
assert.equal((await execute(['validate-config', '--cwd', nativeInit])).code, 0);

const astroInit = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-astro-'));
assert.equal((await execute(['init', astroInit, '--preset', 'astro'])).code, 0);
const astroConfig = await fs.readFile(path.join(astroInit, 'wcagate.config.mjs'), 'utf8');
assert.match(astroConfig, /127\.0\.0\.1:4321/);
assert.match(astroConfig, /allowEmpty: true/);
assert.equal((await execute(['validate-config', '--cwd', astroInit])).code, 0);

const staticInit = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-static-'));
assert.equal((await execute(['init', staticInit, '--preset', 'static'])).code, 0);
assert.equal((await execute(['validate-config', '--cwd', staticInit])).code, 0);

const skillProject = await fs.mkdtemp(path.join(os.tmpdir(), 'wcagate-cli-skills-'));
assert.equal((await execute(['skills', 'link', '--project', skillProject])).code, 0);
await fs.lstat(path.join(skillProject, '.cursor', 'skills', 'wcagate'));
await fs.lstat(path.join(skillProject, '.agents', 'skills', 'wcagate-native'));

process.stdout.write('CLI tests passed for exit codes 0, 1, 2, and 3.\n');

async function createFixture(fixture) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `wcagate-cli-${fixture.name}-`));
  const findings = fixture.outcome ? [{
    ruleId: 'fixture/rule',
    title: 'Fixture rule',
    outcome: fixture.outcome,
    severity: 'serious'
  }] : [];
  await fs.writeFile(path.join(directory, 'evidence.json'), JSON.stringify({
    schemaVersion: 1,
    producer: { name: 'fixture', version: '1.0.0', kind: 'cli-test' },
    surfaceCount: fixture.surfaceCount,
    findings
  }));
  await fs.writeFile(path.join(directory, 'wcagate.config.json'), JSON.stringify({
    schemaVersion: 1,
    project: { name: fixture.name, root: '.' },
    adapters: [{ type: 'native-evidence', file: 'evidence.json' }],
    reporters: [{ type: 'json', file: 'run.json' }]
  }));
  return directory;
}

function execute(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
