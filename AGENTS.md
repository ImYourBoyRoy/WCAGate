# WCAGate — Agent Instructions

Standalone accessibility evidence gate for websites, Svelte, Tauri, Bevy, and Godot.

## Authority

1. Explicit user request
2. This repo's `AGENTS.md` / `README.md` / `MEMORY.md`
3. Consumer project instructions when operating *inside* that project

## Rules

- Do **not** invent WCAG conformance percentages or claim certification.
- Prefer adapter evidence (`playwright-axe`, `svelte`, `manual-evidence`, `native-evidence`, `command-evidence`) over source regex heuristics.
- Fail closed: missing targets, empty surfaces, missing collector binaries (`doctor`), and adapter failures are exit `2` / unresolved `3`, never silent passes.
- Run `wcagate doctor` then `wcagate run`. **Tell the user** the gate (exit code + reason) and blocking/unresolved findings with `file:line` when present.
- `wcag-audit/results.html` is an optional results page, not a GUI app. Serve it only if a human wants the HTML view. Never open the `.html` as a text file.
- For Astro and other websites, use this package directly (`init --preset astro|web|static`, `run --base-url`, `--routes`). Do not require Portable Web Toolkit.
- Keep secrets out of configs, suppressions, and committed reports.
- Verify Node/package versions from this repo + registry — do not trust model memory.
- Skills are local-only under `skills/`. Never install them globally.

## Toolkit relationship

This repo is the canonical engine. Portable Web Toolkit keeps a **thin site-profile bridge** only. Do not re-vendor the full engine into the toolkit. Do not treat a toolkit re-bundle as canonical for apps.

## Profile

Default target is WCAG 2.2 AA (`wcag22-aa`). A and AAA are supported. AAA-only findings must not fail an AA gate.
