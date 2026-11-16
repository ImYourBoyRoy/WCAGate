// ./src/core/package-manager.mjs
/**
 * Which package manager the AUDITED project uses, so WCAGate installs its Playwright/axe peers and prints fix commands the
 * way that project does (a pnpm site must not gain a package-lock.json). Lockfile first; with none, pnpm when it is
 * installed, otherwise npm. Standalone: this package has no dependency on the Portable Web Toolkit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LOCKFILES = [['pnpm-lock.yaml', 'pnpm'], ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']];

function binary(name) {
  return process.platform === 'win32' && name !== 'bun' ? `${name}.cmd` : name;
}

export function detectPackageManager(projectRoot, { exists = fs.existsSync, installed } = {}) {
  for (const [file, name] of LOCKFILES) if (exists(path.join(projectRoot, file))) return name;
  const probe = installed ?? ((name) => spawnSync(binary(name), ['--version'], { stdio: 'ignore', timeout: 15_000 }).status === 0);
  return probe('pnpm') ? 'pnpm' : 'npm';
}

export function addDevArgs(manager, packages) {
  if (manager === 'npm') return ['install', '--save-dev', ...packages];
  if (manager === 'bun') return ['add', '-d', ...packages];
  return ['add', '-D', ...packages];
}

/** [command, args] to run a locally installed binary. */
export function execArgs(manager, bin, args = []) {
  switch (manager) {
    case 'pnpm': return [binary('pnpm'), ['exec', bin, ...args]];
    case 'yarn': return [binary('yarn'), [bin, ...args]];
    case 'bun': return ['bun', ['x', bin, ...args]];
    default: return [binary('npx'), [bin, ...args]];
  }
}

export function managerCommand(manager) {
  return binary(manager);
}

/** [command, args] to run a package.json script with extra flags: npm needs `--`, the others pass flags straight through. */
export function runScriptArgs(manager, script, extra = []) {
  const flags = extra.length === 0 ? [] : manager === 'npm' ? ['--', ...extra] : extra;
  return [binary(manager).replace(/\.cmd$/, ''), ['run', script, ...flags]];
}

/** The pair of human-readable fix commands used in doctor and prepare messages. */
export function installFix(manager, packages, browser = 'chromium') {
  const add = [manager, ...addDevArgs(manager, packages)].join(' ');
  const [bin, args] = execArgs(manager, 'playwright', ['install', browser]);
  return `${add} && ${[bin.replace(/\.cmd$/, ''), ...args].join(' ')}`;
}
