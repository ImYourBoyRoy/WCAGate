# Contributing

WCAGate is a fail-closed WCAG 2.2 accessibility **evidence gate**. Pull requests should keep that contract: no invented conformance percentages, no silent passes when evidence is missing.

## Requirements

- Node.js **24 or newer** (26 is supported)
- A clone of [ImYourBoyRoy/WCAGate](https://github.com/ImYourBoyRoy/WCAGate)

```bash
git clone https://github.com/ImYourBoyRoy/WCAGate.git
cd WCAGate
npm ci
npm run check
```

`npm run check` is lint, schema, types, unit tests, CLI smoke, and packed-install verification.

## Scope

- Prefer adapter evidence (`playwright-axe`, `svelte`, `manual-evidence`, `native-evidence`, `command-evidence`) over source regex heuristics.
- AAA-only findings must not fail an AA gate.
- Keep secrets out of configs, suppressions, and reports.
- Skills stay local under `skills/`. Never install them globally.

## Pull requests

Open PRs against `main`. Include the `npm run check` outcome. Do not publish to the npm registry.
