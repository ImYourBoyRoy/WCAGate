// ./tests/presets.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { writeFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ASTRO_AUDIT_SCRIPT,
  CONSUMER_GITHUB_SPEC,
  CONSUMER_NPM_SCRIPTS,
  consumerPackageJsonExample,
  INIT_PRESETS,
  starterConfigSource
} from '../src/core/presets.mjs';
import { validateConfig } from '../src/core/config.mjs';

test('init presets emit parseable configs that satisfy runtime validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wcag-presets-'));
  for (const preset of INIT_PRESETS) {
    const source = starterConfigSource({ preset, profile: 'wcag22-aa', projectName: `preset-${preset}` });
    const file = path.join(root, `${preset}.mjs`);
    await writeFile(file, source);
    const imported = await import(`${pathToFileURL(file).href}?t=${preset}`);
    const errors = validateConfig(imported.default);
    assert.deepEqual(errors, [], `${preset} starter config is invalid: ${errors.join('; ')}`);
  }
});

test('consumer package.json example uses GitHub install and named scripts', () => {
  assert.equal(CONSUMER_GITHUB_SPEC, 'github:imyourboyroy/WCAGate');
  assert.deepEqual(Object.keys(CONSUMER_NPM_SCRIPTS), [
    'wcagate:doctor',
    'wcagate:prepare',
    'wcagate:audit',
    'wcagate:results'
  ]);
  const generic = consumerPackageJsonExample();
  assert.equal(generic.devDependencies['@imyourboyroy/wcagate'], CONSUMER_GITHUB_SPEC);
  assert.equal(generic.scripts['wcagate:audit'], 'wcagate run');
  assert.equal(generic.scripts['wcagate:results'], 'wcagate serve');
  const astro = consumerPackageJsonExample({ preset: 'astro' });
  assert.equal(astro.scripts['wcagate:audit'], ASTRO_AUDIT_SCRIPT);
});
