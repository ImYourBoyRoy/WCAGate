# Architecture

## Design objective

This package answers a narrow question: did the configured accessibility evidence complete, and does that evidence satisfy the project's release policy for a chosen WCAG 2.2 target (A, AA, or AAA)?

It does not infer whole-product conformance from a source scan, a numerical average, or an invented `AA PASS` label.

## Canonical package

`@imyourboyroy/wcagate` (`AI/wcag-auditor`, product **WCAGate**) is the source of truth for adapters, the fail-closed gate, reporters, and an optional HTML results page. Portable Web Toolkit should keep only a thin site-profile bridge. Until that bridge is restored, agents working on websites or apps should prefer this package — not a re-bundled toolkit copy.

See [ADR-001](decisions/ADR-001-canonical-package.md).

## Pipeline

1. Load and validate configuration.
2. Optionally prepare Playwright peers in the **consumer** project (`prepare` / `--ensure-playwright`).
3. Execute each required or optional adapter.
4. Map selectors/classes to source `file:line` hints when possible.
5. Annotate findings that sit above the selected WCAG target as out of scope.
6. Apply bounded suppressions without deleting evidence.
7. Add suppression-governance findings.
8. Reject an empty applicable surface.
9. Evaluate deterministic gate policy (in-scope findings only).
10. Build an evidence-completeness scorecard (not a conformance score).
11. Overwrite `wcag-audit/latest.json` and `wcag-audit/results.html`.
12. Coding models present the gate from JSON or MCP `run`. Optionally serve the folder over `http://127.0.0.1:<port>/` for humans who want the HTML view.

## Evidence planes

### Static framework plane

Compiler and framework diagnostics can identify invalid structures close to the source artifact. They cannot observe runtime rendering, computed style, focus order, accessibility APIs, or complete processes.

### Rendered web plane

Playwright moves the application into explicit states. Axe evaluates the rendered document using tags for the selected profile. Geometry and keyboard-focus probes supply additional triage signals while preserving `cantTell` where the auditor cannot prove a criterion. Frost/glass UI is supported; axe contrast incompletes stay `cantTell` until manual evidence plus a bounded suppression resolve them.

### Native / WCAG2ICT plane

Native engines own their accessibility trees and platform bridges. Bevy evidence should be derived from AccessKit nodes and actions. Godot evidence should be derived from AccessibilityServer, Control focus relationships, and real interaction tests. Tauri should test both browser-mode frontend behavior and the packaged WebView.

### Manual plane

Manual evidence records platform, assistive technology, tester, time, result, and artifacts. Expiration prevents an old pass from silently surviving product changes.

PDF/UA collection is **out of scope**. See [ADR-002](decisions/ADR-002-document-plane.md) (withdrawn).

## WCAG target and scorecard

`profile` is the gate target, default `wcag22-aa`:

| Profile | Axe tags | Gate |
|---|---|---|
| `wcag22-a` | A | Findings whose highest mapped level is above A are out of scope |
| `wcag22-aa` (default) | A + AA | AAA-only criteria (for example 2.5.5) do not fail the gate |
| `wcag22-aaa` | A + AA + AAA | AAA probes such as enhanced target size may be enabled |

**Evidence completeness** is `conclusive / (conclusive + unresolved)` among **in-scope, unsuppressed** findings. Results HTML labels it *Evidence completeness (not a conformance score)*. There is no second score that averages severities into a fake WCAG percentage.

## Presentation

Each run overwrites the same two artifacts:

- `wcag-audit/latest.json` — machine copy for coding models and CI
- `wcag-audit/results.html` — optional HTML view of the same gate

Models **tell the user** the gate and findings. `wcagate serve` hosts that directory on a stable loopback URL (default port 4179) when a human wants the page. Opening the `.html` file path typically shows source. This is not a GUI application. See [ADR-003](decisions/ADR-003-surfaces.md).

## Adapters

| Type | What it collects |
|---|---|
| `playwright-axe` | Rendered routes and states (Playwright + axe-core). Optional `webServer` starts a project command without a shell. |
| `svelte` | Svelte compiler `a11y_*` warnings. Parse errors are execution failures. |
| `manual-evidence` | Versioned human checks. Expired evidence becomes untested. See [Manual testing](MANUAL_TESTING.md). |
| `native-evidence` | JSON from Bevy, Godot, Tauri-native, or other GUI harnesses. See [Native integration](NATIVE_INTEGRATION.md). |
| `command-evidence` | Runs a collector binary (no shell) and ingests its native JSON. |
| `module` | Project-local ES module exporting `runAdapter`. |

Config lives in `wcagate.config.mjs`. Copy a preset with `wcagate init`, or start from [examples/](../examples/).

Frost/glass contrast incompletes stay `cantTell` until manual evidence plus a bounded suppression. See [Glassmorphism](GLASSMORPHISM.md).

## Suppressions

Prefer exact fingerprints. Each entry needs owner, justification, ticket, `createdAt`, and `expiresAt`. Target `failed` (default) or `cantTell`. Expired or malformed suppressions fail governance; they do not rewrite the finding. See [CI](CI.md).

## Stable fingerprints

Fingerprints are derived from the rule, adapter, route or scene, state, canonical target, file location, and compact evidence identity. They are designed for review workflows, not cryptographic authentication.

## Extension model

Use the native evidence contract when another process owns collection. Use the command adapter to execute that collector. Use the module adapter when collection belongs inside the Node process. Custom adapters must return findings and a non-negative applicable-surface count.

## Failure containment

One adapter can emit per-file execution errors and continue. A thrown adapter error is converted into system evidence. Optional missing peer dependencies skip only that adapter. A required adapter failure blocks with exit code `2`. Missing targets, empty surfaces, and adapter failures never become silent passes.

## Consumer topology

```text
Astro / web  --playwright-axe + optional svelte-->  this package
Tauri apps   --playwright-axe + command-evidence-->  this package
Bevy/Godot   --native-evidence / command-evidence-->  this package
```

Do not re-vendor this engine into Portable Web Toolkit, Tailscale GUI, DNA Tools, or pyenv-native.
