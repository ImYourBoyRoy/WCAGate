// ./tests/skills-link.test.mjs
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { linkSkillsIntoProject, listPackageSkills } from '../src/core/skills-link.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('package skills exist locally and link only into the consumer project', async () => {
  const names = listPackageSkills(packageRoot);
  assert.deepEqual(names, ['wcagate', 'wcagate-native']);
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'wcag-skills-link-'));
  const result = linkSkillsIntoProject({ projectRoot: project, packageRoot });
  assert.deepEqual(result.skills, names);
  for (const name of names) {
    const cursorLink = path.join(project, '.cursor', 'skills', name);
    const agentsLink = path.join(project, '.agents', 'skills', name);
    assert.equal((await fs.lstat(cursorLink)).isSymbolicLink(), true);
    assert.equal((await fs.lstat(cursorLink)).isSymbolicLink(), true);
    assert.equal((await fs.lstat(agentsLink)).isSymbolicLink(), true);
    const linkTarget = await fs.readlink(cursorLink);
    assert.equal(path.isAbsolute(linkTarget), false);
    await fs.access(path.join(cursorLink, 'SKILL.md'));
  }
});
