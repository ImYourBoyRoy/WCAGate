// ./src/core/prepare.mjs
/**
 * Ensure Playwright + axe peers and a browser binary in the *consumer* project.
 *
 * Never installs into this package. Used by `wcagate prepare` and
 * `run --ensure-playwright`.
 */

import { addDevArgs, detectPackageManager, execArgs, installFix, managerCommand } from './package-manager.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function packageExists(projectRoot, name) {
  return fs.existsSync(path.join(projectRoot, 'node_modules', name, 'package.json'));
}

function runManager(manager, projectRoot, args, { inherit = true } = {}) {
  return spawnSync(managerCommand(manager), args, {
    cwd: projectRoot,
    stdio: inherit ? 'inherit' : 'pipe',
    shell: process.platform === 'win32',
    env: process.env
  });
}

async function chromiumLaunchWorks(projectRoot) {
  try {
    const require = createRequire(path.join(projectRoot, 'package.json'));
    const entry = require.resolve('playwright');
    const playwright = await import(pathToFileURL(entry).href);
    const browserType = playwright.chromium || playwright.default?.chromium;
    if (!browserType?.launch) return false;
    const browser = await browserType.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ projectRoot: string, browser?: string, autoInstall?: boolean }} options
 * @returns {Promise<{ ok: boolean, actions: string[], warnings: string[] }>}
 */
export async function ensurePlaywrightReady({
  projectRoot,
  browser = 'chromium',
  autoInstall = true
} = {}) {
  const actions = [];
  const warnings = [];
  const root = path.resolve(projectRoot);

  if (!fs.existsSync(path.join(root, 'package.json'))) {
    return {
      ok: false,
      actions,
      warnings: [`No package.json under ${root} — install playwright peers in the client project.`]
    };
  }

  const manager = detectPackageManager(root);
  const missing = [];
  if (!packageExists(root, 'playwright')) missing.push('playwright');
  if (!packageExists(root, '@axe-core/playwright')) missing.push('@axe-core/playwright');

  if (missing.length > 0) {
    if (!autoInstall) {
      return {
        ok: false,
        actions,
        warnings: [
          `Missing peers in client project: ${missing.join(', ')}.`,
          `Run: ${installFix(manager, missing, browser)}`
        ]
      };
    }
    const addArgs = addDevArgs(manager, missing);
    const install = runManager(manager, root, addArgs);
    actions.push([manager, ...addArgs].join(' '));
    if (install.status !== 0) {
      return {
        ok: false,
        actions,
        warnings: [`Failed to install ${missing.join(', ')} (exit ${install.status}).`]
      };
    }
  }

  const browserOk = await chromiumLaunchWorks(root);
  if (!browserOk) {
    if (!autoInstall) {
      return {
        ok: false,
        actions,
        warnings: [
          `Playwright ${browser} browser binary missing or broken.`,
          `Run from the client project: ${execArgs(manager, 'playwright', ['install', browser]).flat().join(' ')}`
        ]
      };
    }
    const [installBin, installArgs] = execArgs(manager, 'playwright', ['install', browser]);
    const browserInstall = spawnSync(installBin, installArgs, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env
    });
    actions.push([installBin, ...installArgs].join(' '));
    if (browserInstall.status !== 0) {
      return {
        ok: false,
        actions,
        warnings: [`Failed to install Playwright ${browser} (exit ${browserInstall.status}).`]
      };
    }
    const retry = await chromiumLaunchWorks(root);
    if (!retry) {
      return {
        ok: false,
        actions,
        warnings: [`Playwright ${browser} still cannot launch after install.`]
      };
    }
  }

  return { ok: true, actions, warnings };
}
