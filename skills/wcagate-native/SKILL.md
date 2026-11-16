---
name: wcagate-native
description: Export native GUI accessibility evidence (AccessKit, Godot AccessibilityServer, Tauri WebView) into WCAGate's native-evidence JSON. Use when a Bevy, Godot, or packaged Tauri harness owns collection instead of Playwright.
---

# WCAGate — native evidence

The Node package does not reconstruct AccessKit or Godot trees from source. The application or test harness owns collection and writes JSON that this auditor ingests.

## Contract

Emit `@imyourboyroy/wcagate/schema/native-evidence`:

- `producer.name`, `producer.version`, `producer.kind`
- `surfaceCount` = number of applicable nodes, states, or workflows inspected (never `1` just to avoid an empty-surface failure)
- `findings[]` with `ruleId`, `title`, `outcome`, `severity`, `target`, `evidence`, optional `standards`

Outcomes: `passed`, `failed`, `inapplicable`, `cantTell`, `untested`, `executionError`.

## Engines

| Engine | Artifact | Adapter |
|---|---|---|
| Bevy | AccessKit nodes, actions, focus, bounds after state changes | `native-evidence` or `command-evidence` wrapping a Rust test |
| Godot | AccessibilityServer + Control focus neighbors | same |
| Tauri packaged WebView | WebDriver / `tauri-driver` / project exporter | `command-evidence` plus browser-mode Playwright for the frontend |

## Commands

```bash
pnpm exec wcagate init --preset native
pnpm exec wcagate init --preset tauri
pnpm exec wcagate run
```

Read the CLI output (or `wcag-audit/agent.md`; grouped by root cause) and tell the user the gate. Use `wcagate report --group <id>` for detail; do not read `latest.json` whole. Optional HTML: `pnpm exec wcagate serve` → `http://127.0.0.1:4179/results.html`. Do not open the `.html` file as text. Do not claim WCAG certification.

## Fail closed

Missing exporter output, `surfaceCount: 0`, or a crashed command is exit `2` or `3`, never pass.
