# MEMORY.md — WCAGate

## 1. Project Snapshot
- **Name**: WCAGate (`@imyourboyroy/wcagate`)
- **Version**: `2.3.1`
- **Path**: `/home/v1x0r/Desktop/AI/wcag-auditor`
- **Purpose**: Canonical accessibility evidence gate for web, Astro, Svelte, Tauri, Bevy, and Godot
- **Split**: This repo owns the engine. Portable Web Toolkit should keep only a thin site-profile bridge (follow-up: toolkit copy is still a re-bundle as of 2.0.3)

## 2. Working Directory Map
- `bin/wcagate.mjs` — CLI entry
- `bin/wcagate-mcp.mjs` — MCP stdio entry
- `src/` — core, adapters, reporters, schemas, MCP
- `src/core/doctor.mjs` — fail-fast tool checks (diagnose only)
- `src/mcp/stdio.mjs` — JSON-RPC MCP server; `run` returns `summarizeForAgent`
- `src/core/profile.mjs` — A/AA/AAA target, axe tags, scorecard
- `src/core/serve.mjs` — optional loopback HTTP results (default port 4179)
- `src/reporters/dashboard.mjs` — `renderResultsReport` (type `dashboard` is an alias)
- `docs/` — architecture, ADRs, results, consumers, skills, CI, native, glass
- `examples/` — basic, Astro (+ frost), Tauri, tauri-gui, Bevy, Godot
- `skills/` — local-only: `wcagate`, `wcagate-native`
- `tests/` — unit + CLI fixtures
- `wcag-audit/` — generated `latest.json` / `results.html` (gitignored artifacts)

## 3. Current Goals
- Remain the single source of truth for WCAG evidence gating across sites and apps
- Stay free of Portable Web Toolkit site-profile coupling
- Coding models present the gate to the user; optional HTML is a results page, not a GUI

## 4. Active Tasks
- [x] Standalone repo created at `AI/wcag-auditor` (product renamed to WCAGate in 2.3.0)
- [x] 2.1.0: results HTML, source-locate, frost/cantTell, serve, presets, `--base-url`/`--routes`, local skills
- [x] 2.2.0 (never published): doctor, MCP stdio; brief PDF plane
- [x] 2.3.0: rename to WCAGate (`wcagate` / `wcagate-mcp`); remove PDF/UA plane; results (not dashboard/GUI); MCP compact summary for models
- [x] Published GitHub repo `ImYourBoyRoy/WCAGate`. Current release `v2.3.1` (`github:imyourboyroy/WCAGate#v2.3.1`). No npm registry publish.
- [ ] Follow-up other repos: thin toolkit submodule/npm dep; pyenv-native; Tailscale_GUI / DNA_Tools

## 5. Architecture Notes
- Peer deps optional: Playwright, `@axe-core/playwright`, Svelte
- Exit codes: 0 pass, 1 blocking findings, 2 execution/config, 3 unresolved evidence
- Default reporters: console + `latest.json` + `results.html` (overwrite in place)
- Default output dir: `wcag-audit`
- Profile drives axe `runOnly` and gate scope; AAA probes off unless `wcag22-aaa`
- Auto-prepare Playwright when a run uses `playwright-axe` (skip with `--skip-playwright-install`)
- Site overlays: `run --base-url` and `--routes`
- Init presets: `web`, `astro`, `static`, `tauri`, `native`
- Surfaces: CLI + MCP for agents; optional `serve` for humans. Not a Tauri/egui GUI. Not a Rust rewrite (ADR-003)

## 6. Decisions & Conventions
- Core package name: `@imyourboyroy/wcagate` (product **WCAGate**; CLI `wcagate`; MCP `wcagate-mcp`). Install via `github:imyourboyroy/WCAGate`, not the npm registry.
- Portable Web Toolkit depends on this package via file path / future thin bridge — does not vendor full source into *this* repo
- Skills never install to `~/.cursor/skills`
- Models tell the user gate + findings; optional `http://127.0.0.1:<port>/results.html`, never `file://`
- PDF/UA is out of scope (ADR-002 withdrawn). Use veraPDF/PAC outside this package
- `doctor` diagnoses only; Playwright auto-install happens on `prepare` / `run`

## 7. Verified Resources & Versions
- Node `>=24.0.0` (engines). CI matrix: **Node 24** Active LTS and **Node 26** Current (verified 2026-08-16). Operator machines often Node 26+.
- Package version `2.3.1`
- TypeScript `6.0.3` (devDependency, checked 2026-08-16)
- GitHub Actions: `actions/checkout@v7`, `actions/setup-node@v7` (checked 2026-08-16)

## 8–10. Stylesheet / Brand / Discovery
- N/A (CLI package). `results.html` is a generated report, not a site.

## 11. Known Issues / Risks
- Toolkit `Web_Toolkit/wcag_auditor` 2.0.3 is still a full re-bundle; agents may pick the wrong tree until that follow-up
- pyenv-native still uses static jsdom axe with contrast off — incomplete vs this Tauri preset
- Not published to the npm registry. GitHub is canonical: https://github.com/ImYourBoyRoy/WCAGate

## 12. Recent Changes
- 2026-08-16: 2.3.1 — engines `>=24.0.0`; CI on Node 24 and 26
- 2026-08-16: Published `ImYourBoyRoy/WCAGate` (`v2.3.0` tag + GitHub Release). Main and tag CI (`npm ci` + `npm run check` on Node 24) succeeded.
- 2026-08-16: README prompts for coding models (install / install-and-audit / audit-only) plus consumer `package.json` scripts (`wcagate:doctor`, `wcagate:prepare`, `wcagate:audit`, `wcagate:results`)
- 2026-08-16: README shortened to a human landing page; adapter/suppression detail lives in `docs/ARCHITECTURE.md`
- 2026-08-16: 2.3.0 — renamed to WCAGate; GitHub-only distribution (`github:imyourboyroy/WCAGate`); no npm registry; removed PDF plane; results HTML; MCP compact summary
- 2026-08-16: 2.2.0 (unpublished) — doctor + MCP; brief document-evidence (removed)
- 2026-08-16: Site DX — `--base-url`, `--routes`, auto Playwright prepare, `init --preset static`
- 2026-08-04: Extracted standalone package from Portable Web Toolkit vendored copy

## 13. Validation / Tests Run
- 2026-08-16: `npm run check` passed locally; GitHub Actions check succeeded on `main` and `v2.3.0` (Node 24, `npm ci`)

## 14. Next Session Quick Start
```bash
cd /home/v1x0r/Desktop/AI/wcag-auditor
npm run check
node ./bin/wcagate.mjs doctor
node ./bin/wcagate.mjs help
```
