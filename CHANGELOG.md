# Changelog

## 2.4.2 — 2026-11-17

### Fixed (Windows: verified on a real Windows Server 2025 guest)

- `wcagate skills link` used a relative junction target on Windows; Node resolves that against the working directory, so the link never reached `SKILL.md`. Windows now links with an absolute target.
- `listenerBelongsTo` returned unknown on Windows, so the refusal of a foreign server answering on the managed port never fired. It now follows the parent chain through CIM and treats a listener older than the managed process as foreign.
- `lint` no longer requires a POSIX executable bit on Windows. Tests no longer hard-code `/tmp` paths, and a Windows-only test (`tests/windows-server.test.mjs`) covers `autoPort` through the `npm` shim and whole-tree stop. The complete `check` passes on Linux, macOS 26 and Windows Server 2025.

## 2.4.1 — 2026-11-17

### Fixed

- `wcagate skills link` wrote the relative symlink target from the unresolved project path. When the project lives under a symlinked directory (macOS temp dirs: `/var` is `/private/var`) the link pointed one level too shallow and `SKILL.md` was not reachable. The target is now computed from real paths. Found by the first macOS CI run; regression test added.

## 2.4.0 — 2026-11-16

- **Agent report: findings grouped by root cause, ~100x fewer tokens.** The console and the new `wcag-audit/agent.md` print one block per cause (contrast failures group by color pair, so one token change fixes every element) with the fix once, bounded element lists, route/variant reach, counts instead of passes, and `since last run` / `NEW` markers. A real run went from a 137,792-token `latest.json` to 1,182 tokens. New `wcagate report [--group gN] [--json]` re-prints it or drills into one cause; `--verbose` keeps the old per-finding console. MCP `run` returns the same compact causes. axe check arrays are compacted in evidence (relatedNodes HTML dropped). See `docs/AGENT_REPORT.md`.

- **Contrast resolution.** axe `color-contrast` incompletes (previously always `cantTell`, exit 3) are measured from rendered pixels: glyphs are hidden, the text's rectangles are screenshotted, and the real background is classified against the required ratio. Passes drop out and are counted in scenario metadata; failures become `failed` with measured worst ratio, failing share, and a suggested text color validated against the whole surface; only unmeasurable text (gradient-clipped, iframe, shadow DOM) stays `cantTell` with a stated reason. Fingerprints are unchanged so suppressions still apply. Tune with `probes.contrastResolution` (`enabled`, `maxNodes`, `passShare`, `failShare`). See `docs/CONTRAST.md`. Verified on a real Tauri GUI: 73 of 73 contrast incompletes resolved.
- **Scenario matrix.** `matrix: { colorSchemes, viewports }` on a playwright-axe adapter (or `--color-schemes light,dark --viewports mobile,tablet,desktop`) expands every scenario across color schemes and viewports. Scenarios can also set `colorScheme`, `viewport`, `reducedMotion`, and `forcedColors` directly.
- **Reflow probe** (WCAG 1.4.10): horizontal scrolling at 320 CSS px, with the elements that cause it. **Text-spacing probe** (WCAG 1.4.12): text clipped after the user-override spacing is applied. Both on in AA/AAA `init` presets; opt-in elsewhere.
- **Baseline ratchet.** `--write-baseline <file>` records known findings; `--baseline <file>` keeps them visible (`baselined`) but only new findings block the gate, and fixed ones are counted. Keys ignore preview ports, line numbers, and matrix labels. Execution errors, governance, and system findings can never be baselined; an unreadable baseline is exit 2.
- **Sitemap routes.** `--sitemap [url|file] [--max-routes 50]` derives routes from sitemap.xml (one level of sitemap index; production URLs are mapped onto the audited origin; foreign hosts are skipped).
- Console prints baseline counts; MCP `run` summary excludes baselined findings and reports baseline counts.
- **Settle before auditing** (`settle`, on by default; `false` disables). Audits used to start at `domcontentloaded`, so axe measured text mid-fade and reveal-on-scroll content before it appeared; results also changed with machine load. WCAGate now waits for load and fonts, scrolls the page once to trigger observers, and waits for finite animations. On a real site this removed 88 false `color-contrast` violations that were text caught mid-animation, and made sequential and parallel runs agree.
- **Focus indicator is measured, not guessed.** The probe now captures the element while focused and after blur and compares the pixels: no visible change is `failed` (2.4.7), a change that contrasts at least 3:1 passes, a weaker one is `cantTell` (2.4.13, AAA only). The old outline/box-shadow heuristic left every border, background, underline, or `::after` ring as `cantTell` (110 to 354 findings per real site). New failures: `focus-offscreen` (focus lands on a closed off-canvas drawer) and `focus-not-obscured` (a fixed/sticky bar fully covers the focused element, 2.4.11). A missing indicator now carries only the 2.4.7 (AA) standard, so it counts at the default AA gate; before, it was listed with 2.4.13 (AAA) and was silently out of scope.
- **HTTP status guard.** A route that returns 4xx/5xx is an `executionError` (`wcagate/runtime/http-status`) instead of being audited as a normal page. `expectStatus: 404` on a scenario allows an intentional error page.
- **Parallel scenarios** (`concurrency`, default `min(4, CPUs - 1)`; results stay in config order). A 10-route, 4-variant audit went from 119 s to 33 s.
- **Matrix duplicates merge.** The same defect in several color-scheme/viewport variants is one finding listing its `variants` (a real site went from 128 rows to 42 distinct defects). Fingerprints ignore the variant.
- **Duplicate `<title>` across routes** (`wcagate/site/duplicate-title`, advisory, WCAG 2.4.2).
- **Contrast fixes found on real sites:** samples are taken as viewport clips after scrolling the element into view (fixed/sticky and scroll-container text produced 120 "clipped area" errors), failures also suggest a passing **background** color for uniform surfaces, and `contrast-resolved` text suggestions are validated against the whole surface.
- **Managed servers never collide with your dev server.** `webServer.autoPort` (on in every `init` preset, with `reuseExistingServer: false`) runs the preview on a free port, owns and stops it, rewrites `--port` and `{port}` in the command and `baseURL` to the origin it got, and reports `autoPort: { requestedPort, port, occupiedBy }` in the run metadata. Before, a preset that reused whatever answered on 4321 could audit the wrong site. An explicit `--base-url` still means "use my server".
- **pnpm is the package manager of this repository** (`pnpm-lock.yaml`, `pnpm run check`, CI installs with `--frozen-lockfile`), docs lead with pnpm and note npm. Peers (Playwright, axe) are installed automatically for development, so the real-browser tests now run instead of skipping. `package:check` smoke-installs the packed tarball with every manager present (pnpm and npm).
- **Windows and macOS hardening (pre-release audit).** A managed server's pnpm/npm/yarn `.cmd` shim runs through `cmd.exe` on Windows (Node refuses to spawn it directly); stopping it takes the whole tree (`taskkill /T`) and sweeps descendants that outlive a wrapper; a failed spawn is an `AdapterError`, not an unhandled `error` event; a free port must also refuse connections on IPv4 and IPv6 loopback (macOS and Windows let a bind succeed beside a wildcard listener); `autoPort` rewrites only loopback `host:port` forms and flags, never `:43210` or a proxy target, and refuses an answer from a process that is not the managed server. `.gitattributes` keeps LF in checkouts. CI runs on Linux and macOS (blocking) and Windows (reported).
- **`init` uses the project's package manager** for the generated preview server (`pnpm run preview --port ...`, `npm` keeps `--`) and the Tauri export script; before, every generated config said `npm`.
- Sitemap discovery now keeps production-host pages when a local preview serves the production sitemap (previously every page was skipped), and reports every candidate's error.
- `TOOLKIT_VERSION` is read from `package.json` (single source); `#semver:` ranges replace pinned versions in the install docs.

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
