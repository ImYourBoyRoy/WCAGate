# Results

Each run overwrites three files:

- `wcag-audit/agent.md` — **what a model reads**: findings grouped by root cause, each fix stated once (see [Agent report](AGENT_REPORT.md)); the console prints the same view
- `wcag-audit/latest.json` — full machine evidence for CI and drill-down (large; do not read it whole)
- `wcag-audit/results.html` — optional HTML view of the same gate

This is **not** a GUI application. Models read the console output or `agent.md` (or MCP `run`) and **tell the user** the gate plus each cause. Humans who want a page can run `pnpm run wcagate:results` (`wcagate serve`).

Reporter type `results` is the default. Type `dashboard` and `dashboard.html` still work as aliases.

## Coding-model flow

```bash
pnpm run wcagate:doctor
pnpm run wcagate:audit
```

If those scripts are missing: `pnpm exec wcagate doctor` then `pnpm exec wcagate run --base-url http://127.0.0.1:<preview-port> --routes /`.

Then tell the user:

- exit code (`0` pass, `1` blocking, `2` execution, `3` unresolved)
- profile (`wcag22-aa` by default)
- each blocking or unresolved finding with `file:line` when present

Do not invent a WCAG percentage or certification. Do not open `results.html` as a workspace text file (that shows source). If a human wants the page:

```bash
pnpm run wcagate:results
```

```text
Results (optional view): http://127.0.0.1:4179/results.html
```

`run --serve` is optional and **off** when `CI=true`.

## Scorecard

Always visible in JSON and HTML:

- Target: WCAG 2.2 A, AA, or AAA
- Gate: PASS / BLOCKING / UNRESOLVED / ERROR and exit code
- Evidence completeness toward that target (not a conformance score)

The completeness figure is `conclusive / (conclusive + unresolved)` among in-scope findings. It must never be labeled `AA PASS`.
