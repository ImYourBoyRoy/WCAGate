# ADR-003: CLI + MCP for coding models; optional HTML results — not a GUI app

## Status
Accepted

## Date
2026-08-16

## Context

Operators want this auditor available to coding agents. A native GUI that “points at a project and auto-navigates” would duplicate CLI/MCP work and still need Playwright, axe, and native exporters.

## Decision

Keep **one Node evidence engine**. Primary surfaces for coding models:

| Surface | Role |
|---|---|
| **CLI** | Canonical: `doctor`, `run`, `prepare`, `init` |
| **MCP stdio** | Same operations with a compact `run` summary the model **shows the user** |

`wcag-audit/results.html` is an **optional results page**, served only when someone asks (`serve` / `run --serve`). It is not a product GUI and does not auto-discover a project.

Do **not** rewrite the engine in Rust. Do **not** ship Tauri/egui for this package.

## Consequences

- Models present gate + findings from `latest.json` or MCP `run`.
- HTTP serve remains for humans who want a browser view.
- Playwright auto-install stays on `prepare` / `run`; `doctor` stays diagnose-only except when `run` opts into Playwright install.
