---
name: wcagate
description: Run the standalone WCAGate evidence gate (Playwright + axe, Svelte, native JSON, manual evidence) for websites, Tauri, Bevy, and Godot. Run doctor first, then run, then tell the user the gate and findings. Never invent WCAG conformance percentages.
---

# WCAGate

Use this package (`@imyourboyroy/wcagate`). Do not redirect app or site work to a Portable Web Toolkit re-bundle when this engine is the workspace or the installed dependency.

Evidence gate only — not a WCAG conformance certificate. Not a GUI app.

## Prerequisites

1. Consumer project has `wcagate.config.mjs` (or `wcagate init --preset web|astro|static|tauri|native`).
2. Run `wcagate doctor` and fix missing tools before claiming a gate result.
3. For rendered web/Tauri: Playwright peers in the **consumer** project (`playwright`, `@axe-core/playwright`) and Chromium (`wcagate prepare`).
4. Profile is a real target: `wcag22-aa` default; `wcag22-a` and `wcag22-aaa` are allowed.

## Preferred commands

```bash
pnpm run wcagate:doctor
pnpm run wcagate:audit
```

If those scripts are missing, use `pnpm exec wcagate doctor` then `pnpm exec wcagate run --base-url http://127.0.0.1:4321 --routes /`. Confirm: `wcagate core-path` is this package (it contains `bin/wcagate.mjs`).

Consumer `package.json` should depend on `github:imyourboyroy/WCAGate` and define `wcagate:doctor`, `wcagate:prepare`, `wcagate:audit`, and `wcagate:results`. See the README prompts (install / install-and-audit / audit-only).

## Coverage options (2.4+)

- `--color-schemes light,dark` and `--viewports mobile,tablet,desktop` run every route in each combination (or `matrix` in config).
- `--sitemap [url|file] [--max-routes 50]` audits the routes a site lists instead of a hand-kept list.
- `reflow` (1.4.10) and `textSpacing` (1.4.12) probes are on in the AA presets.
- Adopting the gate on a legacy project: `--write-baseline wcag-audit/baseline.json` once, then `--baseline wcag-audit/baseline.json` so only NEW findings block. Never baseline to hide execution errors (they cannot be baselined).

## After every run — tell the user

1. State the gate: exit `0` pass, `1` blocking, `2` execution/config, `3` unresolved.
2. Read the console output (or `wcag-audit/agent.md`): findings are grouped by root cause with the fix stated once. Report each cause, its fix, and where it occurs (`file:line` when mapped). For one cause run `wcagate report --group <id>`. **Do not read `latest.json` whole** (it is the full evidence, often 100k+ tokens).
3. Fix the smallest markup/CSS/native change (a shared color pair means one token change), then re-run; the report says what is NEW or fixed since the last run. Do not claim WCAG certification.
4. Optional HTML view: `pnpm run wcagate:results` → `http://127.0.0.1:4179/results.html`. Do not open the `.html` file as text.

CI (`CI=true`) must not start the viewer.

## Rules

1. Fail closed: missing targets, empty surfaces, and adapter failures are exit `2` / unresolved `3`, never silent passes.
2. Do not invent conformance percentages, `AA PASS`, or certification.
3. Prefer adapter evidence over source regex heuristics.
4. Glassmorphism / frost UI is supported. Axe `color-contrast` incompletes are resolved from rendered pixels into pass or `failed` (with a suggested color); only text it cannot measure stays `cantTell`. See `docs/CONTRAST.md` and `docs/GLASSMORPHISM.md`.
5. Never set `gate.unresolvedEvidence: "ignore"` just to ship glass.
6. AAA-only criteria must not fail an AA gate; they show as out of scope.
7. Keep secrets out of configs, suppressions, and committed reports.
8. For `.svelte` sources, run the Svelte MCP `svelte-autofixer` on each changed component before re-running the gate (the `svelte` adapter then confirms the compiler `a11y_*` diagnostics).
9. Skills are local-only. Never copy them into `~/.cursor/skills`.
