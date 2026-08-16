// ./src/core/skills-link.mjs
/**
 * Link this package's local-only skills into a consumer project.
 *
 * Never copies into ~/.cursor/skills or other global agent homes.
 * Targets: <project>/.cursor/skills and <project>/.agents/skills
 *
 * Usage: wcagate skills link --project <path>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function packageSkillsDirectory(packageRoot = PACKAGE_ROOT) {
  return path.join(packageRoot, 'skills');
}

export function listPackageSkills(packageRoot = PACKAGE_ROOT) {
  const root = packageSkillsDirectory(packageRoot);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function linkSkill(source, destination) {
  try {
    const stat = fs.lstatSync(destination);
    if (stat.isSymbolicLink()) fs.unlinkSync(destination);
    else {
      return { ok: false, destination, reason: 'exists and is not a symlink' };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return { ok: false, destination, reason: error.message };
    }
  }
  const linkTarget = path.relative(path.dirname(destination), source) || source;
  fs.symlinkSync(linkTarget, destination, process.platform === 'win32' ? 'junction' : 'dir');
  return { ok: true, destination, source };
}

/**
 * @param {{ projectRoot: string, packageRoot?: string }} options
 */
export function linkSkillsIntoProject({ projectRoot, packageRoot = PACKAGE_ROOT } = {}) {
  const project = path.resolve(projectRoot);
  const names = listPackageSkills(packageRoot);
  if (names.length === 0) {
    throw new Error(`No skills found under ${packageSkillsDirectory(packageRoot)}`);
  }
  const targets = [
    path.join(project, '.cursor', 'skills'),
    path.join(project, '.agents', 'skills')
  ];
  const linked = [];
  for (const target of targets) {
    ensureDir(target);
    for (const name of names) {
      const source = path.join(packageSkillsDirectory(packageRoot), name);
      const destination = path.join(target, name);
      const result = linkSkill(source, destination);
      linked.push({ ...result, name, target });
    }
  }
  return { project, skills: names, linked };
}

export function linkSkillsIntoThisRepo(packageRoot = PACKAGE_ROOT) {
  return linkSkillsIntoProject({ projectRoot: packageRoot, packageRoot });
}
