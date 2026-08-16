export default {
  schemaVersion: 1,
  project: { name: 'example-static-site', root: '../..' },
  profile: 'wcag22-aa',
  adapters: [
    {
      type: 'playwright-axe',
      baseURL: 'http://127.0.0.1:4173',
      scenarios: [{ name: 'home', path: '/', steps: [] }]
    },
    {
      type: 'manual-evidence',
      file: 'examples/basic/manual-evidence.json',
      required: false
    }
  ],
  reporters: [
    { type: 'console' },
    { type: 'json', file: 'latest.json' },
    { type: 'results', file: 'results.html' }
  ]
};
