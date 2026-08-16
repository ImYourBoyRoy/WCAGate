# Changelog

## 2.3.1 — 2026-08-16

- Require **Node 24 or newer** (`engines.node: >=24.0.0`). Node 26 is supported. CI runs the check suite on Node 24 (Active LTS) and Node 26 (Current).

## 2.3.0 — 2026-08-16

- Renamed the product to **WCAGate**. CLI is `wcagate`, MCP is `wcagate-mcp`, package name is `@imyourboyroy/wcagate`. Config is `wcagate.config.mjs`. Distribute from GitHub (`imyourboyroy/WCAGate`); do not publish to the npm registry.
- Removed the PDF/UA document plane (`document-evidence`, veraPDF, `init --preset document`). This engine is for web, Svelte, Tauri, Bevy, and Godot. Use veraPDF directly if you need tagged-PDF checks.
- Results, not a GUI: default artifact is `wcag-audit/results.html` (reporter type `results`; `dashboard` still accepted). Coding models tell the user the gate and findings from `latest.json` or MCP `run`.
- `wcagate-mcp` `run` returns a compact blocking/unresolved list for the model to present.
- `doctor` stays fail-closed for Node, package files, Playwright, required Svelte, and command adapters.
- Consumer wiring: README copy-paste prompts (install / install-and-audit / audit-only) and `package.json` scripts `wcagate:doctor`, `wcagate:prepare`, `wcagate:audit`, `wcagate:results`.
- GitHub distribution: ship `package-lock.json`; CI runs `npm ci` on Node 24 LTS (`actions/checkout@v7`, `actions/setup-node@v7`).

## 2.2.0 — 2026-08-16 (never published; superseded by 2.3.0)

- Briefly added a PDF/UA document plane (`document-evidence`, veraPDF, `init --preset document`). **Removed in 2.3.0.**
- `wcagate doctor` fail-fast checks for Node engines, package entrypoints, Playwright, and command adapters.
- `wcagate-mcp` stdio MCP server for coding agents (CLI + optional HTTP results; not a Rust rewrite — ADR-003).
- Package version `2.2.0`.

## 2.1.0 — 2026-08-16

- This repository is the canonical evidence engine for websites and applications (see ADR-001).
- Added stakeholder dashboard reporter: one overwritten `wcag-audit/dashboard.html` with target, gate, and evidence-completeness scorecard (not a conformance percentage).
- Added `serve` and `run --serve` to host the dashboard at `http://127.0.0.1:4179/` (disabled when `CI` is set) so agents open a website instead of HTML source.
- `profile` is a real WCAG 2.2 target (`wcag22-a` | `wcag22-aa` | `wcag22-aaa`): drives axe tags, AAA probes, and out-of-scope filtering on the gate.
- Added source-locate (`file:line` hints) with roots for `src`, `ui`, `frontend`, `src-ui`, and `crates/*/ui`.
- Added frost/glass path: `cantTell` suppressions, frost manual check, axe contrast remediation tags.
- Default output directory is `wcag-audit`; default reporters are console, `latest.json`, and `dashboard.html`. The detailed HTML reporter is opt-in.
- Added `init --preset web|astro|static|tauri|native`, `run --base-url` / `--routes`, auto Playwright prepare for web adapters, `prepare` / `core-path`, and `skills link --project`.
- Added local-only skills under `skills/` (never global).
- Document/PDF plane designed via command-evidence collectors (ADR-002); no in-process parser in this release.
- `npm run check` includes `typecheck`. README no longer claims thresholded code coverage.

## 2.0.0 — 2026-07-30

- Rebuilt the package around evidence-oriented outcomes and deterministic CI gates.
- Removed the source-regex auditor and all percentage-based conformance labels.
- Added rendered Playwright and axe-core scenarios.
- Added Svelte compiler diagnostics.
- Added native JSON, command, module, and manual-evidence adapters.
- Added expiring suppression governance.
- Added JSON, SARIF, JUnit, accessible HTML, Markdown, and console reporters.
- Added schemas, TypeScript declarations, adversarial tests, CLI exit-code tests, and package inspection.
- Resolve optional framework dependencies from the audited project root, including project-local Svelte, Playwright, and axe installations.
- Added managed web-server lifecycle support and made all non-advisory failures blocking by default.
