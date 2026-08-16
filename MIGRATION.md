# Migration

## 2.2 → 2.3

Version 2.3 keeps the evidence model and exit codes. Operator-facing defaults change:

- **Renamed to WCAGate.** CLI `wcagate`, MCP `wcagate-mcp`, package `@imyourboyroy/wcagate` (GitHub install only), config `wcagate.config.mjs`. Skills `wcagate` and `wcagate-native`.

- **PDF/UA plane removed.** `document-evidence`, `init --preset document`, veraPDF doctor checks, `examples/document/`, and the documents skill are gone. Use veraPDF (or PAC) directly if you need tagged-PDF checks.
- Default HTML artifact is `wcag-audit/results.html` (reporter type `results`). Type `dashboard` and `dashboard.html` still work as aliases.
- Coding models should **tell the user** the gate and findings from `latest.json` or MCP `run`. `serve` / `run --serve` is an optional HTML view, not a GUI app.
- Relink skills with `wcagate skills link --project .` so the documents skill is no longer linked.

2.2.0 was never published.

## 2.1 → 2.2

Version 2.2 kept the evidence model and exit codes. It briefly added a document plane and MCP stdio. **2.3.0 removes the document plane** (see above). Doctor and MCP remain.

## 2.0 → 2.1

Version 2.1 keeps the 2.0 evidence model and exit codes. Operator-facing defaults change:

- Output directory default is `wcag-audit` (was `.wcag-audit-results`).
- Default reporters are console, `latest.json`, and `results.html` (2.1 shipped `dashboard.html`; 2.3 renamed it). Add `html` / SARIF / JUnit explicitly if CI still needs them.
- `profile` is no longer reporting metadata only. Set `wcag22-aa` (default), `wcag22-a`, or `wcag22-aaa`. AAA-only axe tags no longer fail an AA gate.
- After a local run, tell the user the gate. Optionally open `http://127.0.0.1:4179/results.html` via `wcagate serve`. Do not rely on opening the `.html` file in the editor.
- Suppressions may set `outcomes: ["cantTell"]` for frost/glass incompletes. Default remains `failed` only.
- `init` accepts `--preset web|astro|tauri|native`.
- `gate.unresolvedEvidence` remains `error` | `ignore` only (`warn` was never valid).

No invented `AA PASS` or WCAG percentage labels were added. Evidence completeness on the results page is not a conformance score.

## Migration to 2.0

Version 2.0 is an intentional replacement rather than a compatibility release.

## Removed behavior (2.0)

- Source-code regular-expression auditing
- Percentage scores
- `AA PASS` or `AAA PASS` labels
- Successful exit codes when findings exist
- Successful empty-directory and missing-target runs
- Direct-file behavior that was documented but not implemented

No compatibility shim is included. Existing scripts should be deleted and replaced with the package entry point.

## Replacement workflow

1. Install the package and the optional adapters used by the project.
2. Run `wcagate init --preset web` (or `astro` / `tauri` / `native`).
3. Define rendered scenarios for essential states and complete processes.
4. Keep framework diagnostics as a separate adapter.
5. Add current manual evidence for checks automation cannot establish.
6. Configure CI to preserve exit codes `0`, `1`, `2`, and `3` distinctly.
7. Review JSON or SARIF fingerprints before creating a bounded suppression.
8. Tell the user the gate after local runs; optionally serve `results.html`. Do not treat file tabs as the report.

## Result-model change

Every result has an explicit outcome. A lack of emitted failures is not equivalent to tested conformance. `cantTell`, `untested`, and `executionError` remain visible and can block release independently.
