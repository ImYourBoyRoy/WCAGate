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
npm run wcagate:doctor
npm run wcagate:audit
```

If those scripts are missing, use `npx wcagate doctor` then `npx wcagate run --base-url http://127.0.0.1:4321 --routes /`. Confirm: `wcagate core-path` is this package (it contains `bin/wcagate.mjs`).

Consumer `package.json` should depend on `github:imyourboyroy/WCAGate` and define `wcagate:doctor`, `wcagate:prepare`, `wcagate:audit`, and `wcagate:results`. See the README prompts (install / install-and-audit / audit-only).

## After every run — tell the user

1. State the gate: exit `0` pass, `1` blocking, `2` execution/config, `3` unresolved.
2. List blocking and unresolved findings with `file:line` when present (from console output or `wcag-audit/latest.json`).
3. Fix the smallest markup/CSS/native change, then re-run. Do not claim WCAG certification.
4. Optional HTML view: `npm run wcagate:results` → `http://127.0.0.1:4179/results.html`. Do not open the `.html` file as text.

CI (`CI=true`) must not start the viewer.

## Rules

1. Fail closed: missing targets, empty surfaces, and adapter failures are exit `2` / unresolved `3`, never silent passes.
2. Do not invent conformance percentages, `AA PASS`, or certification.
3. Prefer adapter evidence over source regex heuristics.
4. Glassmorphism / frost UI is supported. Axe `color-contrast` incompletes map to `cantTell` (exit 3 unresolved), not an auto-fail. See `docs/GLASSMORPHISM.md`.
5. Never set `gate.unresolvedEvidence: "ignore"` just to ship glass.
6. AAA-only criteria must not fail an AA gate; they show as out of scope.
7. Keep secrets out of configs, suppressions, and committed reports.
8. Skills are local-only. Never copy them into `~/.cursor/skills`.
