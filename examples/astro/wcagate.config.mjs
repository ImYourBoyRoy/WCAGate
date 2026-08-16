// Astro example configuration.
// Copy to the client project root as wcagate.config.mjs and edit routes.
export default {
  schemaVersion: 1,
  project: {
    name: 'example-astro-site',
    root: '.'
  },
  profile: 'wcag22-aa',
  outputDirectory: 'wcag-audit',
  adapters: [
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4321',
      browser: 'chromium',
      scenarios: [
        { name: 'home', path: '/', steps: [] }
      ],
      probes: {
        targetSizeEnhanced: { enabled: false, minimum: 44 },
        focusIndicatorReview: { enabled: true, maxTabs: 80 }
      },
      webServer: {
        command: 'npm',
        args: ['run', 'preview'],
        url: 'http://127.0.0.1:4321',
        timeoutMs: 120000,
        reuseExistingServer: true
      }
    },
    {
      type: 'manual-evidence',
      file: 'wcag-audit/manual-evidence.json',
      required: false
    }
  ],
  gate: {
    failOnSeverities: ['critical', 'serious', 'moderate', 'minor'],
    failOnOutcomes: ['failed'],
    unresolvedOutcomes: ['cantTell', 'untested'],
    unresolvedEvidence: 'error',
    executionErrors: 'error',
    requireApplicableSurface: true
  },
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'latest.json' },
    { type: 'results', file: 'results.html' }
  ],
  // After frost-glass-contrast manual AA pass, add cantTell suppressions for axe/color-contrast.
  // See docs/GLASSMORPHISM.md and examples/astro/frost-canttell-suppression.example.mjs
  suppressions: [],
  metadata: {
    stack: 'astro'
  }
};
