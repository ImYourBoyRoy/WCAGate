// ./src/core/presets.mjs
/**
 * Init presets for websites and applications.
 *
 * Usage: wcagate init [--preset web|astro|static|tauri|native]
 */

import {
  axeRunOnlyForProfile,
  DEFAULT_PROFILE,
  defaultProbesForProfile,
  requireProfile
} from './profile.mjs';
import { frostGlassContrastCheck } from './frost-ui.mjs';

export const INIT_PRESETS = Object.freeze(['web', 'astro', 'static', 'tauri', 'native']);

/** GitHub git-install specifier. Do not use the npm registry name as an install target. */
export const CONSUMER_GITHUB_SPEC = 'github:imyourboyroy/WCAGate';

/** Scripts a consumer should add to package.json. `wcagate:results` serves the HTML view (not a GUI). */
export const CONSUMER_NPM_SCRIPTS = Object.freeze({
  'wcagate:doctor': 'wcagate doctor',
  'wcagate:prepare': 'wcagate prepare',
  'wcagate:audit': 'wcagate run',
  'wcagate:results': 'wcagate serve'
});

export const ASTRO_AUDIT_SCRIPT = 'wcagate run --base-url http://127.0.0.1:4321 --routes /';

export function consumerPackageJsonExample({ preset = 'web' } = {}) {
  const audit = preset === 'astro' ? ASTRO_AUDIT_SCRIPT : CONSUMER_NPM_SCRIPTS['wcagate:audit'];
  return {
    devDependencies: {
      '@imyourboyroy/wcagate': CONSUMER_GITHUB_SPEC
    },
    scripts: {
      ...CONSUMER_NPM_SCRIPTS,
      'wcagate:audit': audit
    }
  };
}

export function normalizePreset(value) {
  const preset = typeof value === 'string' ? value.trim().toLowerCase() : 'web';
  if (!INIT_PRESETS.includes(preset)) return null;
  return preset;
}

function reportersBlock() {
  return `  reporters: [
    { type: 'console' },
    { type: 'json', file: 'latest.json' },
    { type: 'results', file: 'results.html' }
  ],`;
}

function gateBlock() {
  return `  gate: {
    failOnSeverities: ['critical', 'serious', 'moderate', 'minor'],
    failOnOutcomes: ['failed'],
    unresolvedOutcomes: ['cantTell', 'untested'],
    unresolvedEvidence: 'error',
    executionErrors: 'error',
    requireApplicableSurface: true
  },`;
}

function probesLiteral(profileId) {
  const probes = defaultProbesForProfile(profileId);
  return `{
        targetSizeEnhanced: { enabled: ${probes.targetSizeEnhanced.enabled}, minimum: 44 },
        focusIndicatorReview: { enabled: ${probes.focusIndicatorReview.enabled}, maxTabs: 80 }
      }`;
}

function runOnlyLiteral(profileId) {
  return JSON.stringify(axeRunOnlyForProfile(profileId));
}

export function starterConfigSource({ preset = 'web', profile = DEFAULT_PROFILE, projectName = 'replace-with-project-name' } = {}) {
  const resolvedPreset = normalizePreset(preset) ?? 'web';
  const resolvedProfile = requireProfile(profile).id;
  const probes = probesLiteral(resolvedProfile);
  const runOnly = runOnlyLiteral(resolvedProfile);

  if (resolvedPreset === 'native') {
    return `export default {
  schemaVersion: 1,
  project: {
    name: '${projectName}',
    root: '.'
  },
  profile: '${resolvedProfile}',
  outputDirectory: 'wcag-audit',
  adapters: [
    {
      type: 'native-evidence',
      file: 'wcag-audit/native-evidence.json',
      required: true
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: true
    }
  ],
${gateBlock()}
${reportersBlock()}
  suppressions: []
};
`;
  }

  if (resolvedPreset === 'tauri') {
    return `export default {
  schemaVersion: 1,
  project: {
    name: '${projectName}',
    root: '.'
  },
  profile: '${resolvedProfile}',
  outputDirectory: 'wcag-audit',
  adapters: [
    {
      id: 'frontend-browser-mode',
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:1420',
      browser: 'chromium',
      scenarios: [
        { name: 'main-window', path: '/', steps: [] }
      ],
      runOnly: ${runOnly},
      probes: ${probes}
    },
    {
      id: 'packaged-webview',
      type: 'command-evidence',
      command: 'npm',
      args: ['run', 'test:tauri-a11y-export'],
      outputFile: 'target/a11y/tauri-evidence.json',
      timeoutMs: 180000,
      required: false
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: true
    }
  ],
${gateBlock()}
${reportersBlock()}
  suppressions: []
};
`;
  }

  if (resolvedPreset === 'static') {
    return `export default {
  schemaVersion: 1,
  project: {
    name: '${projectName}',
    root: '.'
  },
  profile: '${resolvedProfile}',
  outputDirectory: 'wcag-audit',
  adapters: [
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4173',
      browser: 'chromium',
      scenarios: [
        { name: 'home', path: '/', steps: [] }
      ],
      runOnly: ${runOnly},
      probes: ${probes},
      webServer: {
        command: 'npx',
        args: ['--yes', 'serve', 'dist', '-p', '4173'],
        url: 'http://127.0.0.1:4173',
        timeoutMs: 120000,
        reuseExistingServer: true
      }
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: true
    }
  ],
${gateBlock()}
${reportersBlock()}
  suppressions: []
};
`;
  }

  const baseURL = resolvedPreset === 'astro' ? 'http://127.0.0.1:4321' : 'http://127.0.0.1:4173';
  const svelte = resolvedPreset === 'web' || resolvedPreset === 'astro'
    ? `    {
      type: 'svelte',
      include: ['src/**/*.svelte'],
      required: false,
      allowEmpty: true
    },
`
    : '';

  const webServer = resolvedPreset === 'astro'
    ? `
      webServer: {
        command: 'npm',
        args: ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4321'],
        url: '${baseURL}',
        timeoutMs: 120000,
        reuseExistingServer: true
      }`
    : `
      webServer: {
        command: 'npm',
        args: ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'],
        url: '${baseURL}',
        timeoutMs: 120000,
        reuseExistingServer: true
      }`;

  return `export default {
  schemaVersion: 1,
  project: {
    name: '${projectName}',
    root: '.'
  },
  profile: '${resolvedProfile}',
  outputDirectory: 'wcag-audit',
  adapters: [
${svelte}    {
      type: 'playwright-axe',
      baseURL: '${baseURL}',
      browser: 'chromium',
      scenarios: [
        { name: 'home', path: '/', steps: [] }
        // Add one scenario per public route, or: wcagate run --routes /,/about,/blog
      ],
      runOnly: ${runOnly},
      probes: ${probes},${webServer}
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: true
    }
  ],
${gateBlock()}
${reportersBlock()}
  suppressions: []
};
`;
}

export function starterEvidenceDocument(projectName = 'replace-with-project-name') {
  return {
    schemaVersion: 1,
    project: projectName,
    updatedAt: new Date().toISOString(),
    checks: [
      {
        id: 'keyboard-complete-workflows',
        title: 'Keyboard-only complete workflows',
        outcome: 'untested',
        severity: 'serious',
        tester: 'replace-with-tester',
        testedAt: null,
        expiresAt: null,
        environment: 'Supported OS and browser or WebView, keyboard only',
        standards: [
          { document: 'WCAG-2.2', requirement: '2.1.1', level: 'A', mapping: 'conformance' },
          { document: 'WCAG-2.2', requirement: '2.1.2', level: 'A', mapping: 'conformance' }
        ],
        evidence: '',
        notes: '',
        remediation: 'Complete every essential workflow using only the keyboard and record defects.'
      },
      {
        id: 'screen-reader-smoke',
        title: 'Screen-reader smoke test',
        outcome: 'untested',
        severity: 'serious',
        tester: 'replace-with-tester',
        testedAt: null,
        expiresAt: null,
        environment: 'Supported OS, browser or WebView, and screen reader',
        standards: [
          { document: 'WCAG-2.2', requirement: '4.1.2', level: 'A', mapping: 'conformance' }
        ],
        evidence: '',
        notes: '',
        remediation: 'Verify names, roles, states, values, reading order, announcements, and focus behavior.'
      },
      frostGlassContrastCheck({ routeOrScene: 'home' })
    ]
  };
}

export function starterNativeEvidenceDocument(projectName = 'replace-with-project-name') {
  return {
    schemaVersion: 1,
    producer: {
      name: `${projectName}-a11y-export`,
      version: '0.0.0',
      kind: 'replace-with-engine'
    },
    surfaceCount: 0,
    findings: []
  };
}
