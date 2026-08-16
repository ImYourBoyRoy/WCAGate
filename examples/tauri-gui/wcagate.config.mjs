export default {
  schemaVersion: 1,
  project: { name: 'tauri-gui-application', root: '.' },
  profile: 'wcag22-aa',
  outputDirectory: 'wcag-audit',
  adapters: [
    {
      id: 'frontend-browser-mode',
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:1420',
      scenarios: [
        { name: 'dashboard', path: '/', steps: [] }
      ],
      probes: {
        targetSizeEnhanced: { enabled: false, minimum: 44 },
        focusIndicatorReview: { enabled: true, maxTabs: 80 }
      }
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
      required: false
    }
  ],
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'latest.json' },
    { type: 'results', file: 'results.html' }
  ]
};
