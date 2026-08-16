// ./src/core/doctor.mjs
/**
 * Fail-fast environment checks before a gate run.
 *
 * Missing Node, Playwright peers, Svelte (when required), or this package's
 * own entrypoints are execution errors (exit 2). Never a silent pass.
 *
 * Usage: wcagate doctor [--config file] [--cwd directory] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from './constants.mjs';
import { ensurePlaywrightReady } from './prepare.mjs';
import { configUsesPlaywright } from './run-overrides.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function check(id, ok, { required = true, detail = '', fix = '' } = {}) {
  return { id, ok, required, detail, fix };
}

export function parseEnginesRange(enginesNode) {
  const match = String(enginesNode || '').match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { major: 24, minor: 0, patch: 0 };
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function nodeSatisfiesEngines(currentVersion, enginesNode) {
  const minimum = parseEnginesRange(enginesNode);
  const [major, minor, patch] = String(currentVersion).split('.').map((part) => Number.parseInt(part, 10) || 0);
  if (major !== minimum.major) return major > minimum.major;
  if (minor !== minimum.minor) return minor > minimum.minor;
  return patch >= minimum.patch;
}

function commandOnPath(command, env = process.env) {
  if (!command) return false;
  if (command.includes(path.sep) || command.includes('/')) return fs.existsSync(command);
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    env
  });
  return which.status === 0;
}

function packageExists(projectRoot, name) {
  return fs.existsSync(path.join(projectRoot, 'node_modules', name, 'package.json'));
}

/**
 * @param {{
 *   config?: object,
 *   projectRoot?: string,
 *   packageRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   autoInstallPlaywright?: boolean,
 *   nodeVersion?: string
 * }} options
 */
export async function diagnoseEnvironment(options = {}) {
  const env = options.env ?? process.env;
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const projectRoot = path.resolve(options.projectRoot ?? packageRoot);
  const checks = [];
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const nodeVersion = options.nodeVersion ?? process.versions.node;

  checks.push(check('node-engines', nodeSatisfiesEngines(nodeVersion, packageJson.engines?.node), {
    detail: `Node ${nodeVersion}; requires ${packageJson.engines?.node ?? '>=24.0.0'}`,
    fix: 'Install Node.js 24 or newer (Active LTS or Current).'
  }));

  const requiredFiles = [
    'bin/wcagate.mjs',
    'bin/wcagate-mcp.mjs',
    'src/cli.mjs',
    'src/adapters/playwright-axe.mjs',
    'src/adapters/native-evidence.mjs'
  ];
  const missingPackageFiles = requiredFiles.filter((relative) => !fs.existsSync(path.join(packageRoot, relative)));
  checks.push(check('package-files', missingPackageFiles.length === 0, {
    detail: missingPackageFiles.length === 0 ? 'package entrypoints present' : `missing ${missingPackageFiles.join(', ')}`,
    fix: 'Reinstall from GitHub (`npm install github:imyourboyroy/WCAGate`) or a complete checkout. Do not copy a partial src/ tree.'
  }));

  const adapters = options.config?.adapters ?? [];
  if (configUsesPlaywright(options.config)) {
    const ready = await ensurePlaywrightReady({
      projectRoot,
      autoInstall: Boolean(options.autoInstallPlaywright)
    });
    checks.push(check('playwright-axe', ready.ok, {
      detail: ready.ok ? 'Playwright + axe peers and Chromium are ready' : ready.warnings.join(' '),
      fix: 'From the consumer project: npm install --save-dev playwright @axe-core/playwright && npx playwright install chromium'
    }));
  }

  if (adapters.some((adapter) => adapter.type === 'svelte' && adapter.required !== false && adapter.allowEmpty !== true)) {
    const svelteOk = packageExists(projectRoot, 'svelte');
    checks.push(check('svelte', svelteOk, {
      detail: svelteOk ? 'svelte is installed in the consumer project' : 'required svelte adapter but svelte is not installed',
      fix: 'npm install --save-dev svelte'
    }));
  }

  for (const adapter of adapters) {
    if (adapter.type !== 'command-evidence') continue;
    const present = commandOnPath(adapter.command, env);
    checks.push(check(`command:${adapter.id ?? adapter.command}`, present, {
      required: adapter.required !== false,
      detail: present ? `${adapter.command} is available` : `command not found: ${adapter.command}`,
      fix: `Install or build ${adapter.command} so it is on PATH, then re-run doctor.`
    }));
  }

  const blocking = checks.filter((item) => item.required && !item.ok);
  return {
    ok: blocking.length === 0,
    exitCode: blocking.length === 0 ? EXIT_CODES.PASS : EXIT_CODES.EXECUTION_ERROR,
    checks,
    blocking
  };
}

export function formatDoctorReport(diagnosis, { json = false } = {}) {
  if (json) return `${JSON.stringify(diagnosis, null, 2)}\n`;
  const lines = diagnosis.ok ? ['doctor: all required tools are present'] : ['doctor: missing required tools (fail closed)'];
  for (const item of diagnosis.checks) {
    const mark = item.ok ? 'ok' : (item.required ? 'FAIL' : 'skip');
    lines.push(`  [${mark}] ${item.id}: ${item.detail}`);
    if (!item.ok && item.fix) lines.push(`         fix: ${item.fix}`);
  }
  return `${lines.join('\n')}\n`;
}
