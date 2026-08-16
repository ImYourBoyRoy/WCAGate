# Results

Each run overwrites two files:

- `wcag-audit/latest.json` — machine report for coding models and CI
- `wcag-audit/results.html` — optional HTML view of the same gate

This is **not** a GUI application. Models should read `latest.json` (or MCP `run`) and **tell the user** the gate plus blocking/unresolved findings. Humans who want a page can run `npm run wcagate:results` (`wcagate serve`).

Reporter type `results` is the default. Type `dashboard` and `dashboard.html` still work as aliases.

## Coding-model flow

```bash
npm run wcagate:doctor
npm run wcagate:audit
```

If those scripts are missing: `npx wcagate doctor` then `npx wcagate run --base-url http://127.0.0.1:<preview-port> --routes /`.

Then tell the user:

- exit code (`0` pass, `1` blocking, `2` execution, `3` unresolved)
- profile (`wcag22-aa` by default)
- each blocking or unresolved finding with `file:line` when present

Do not invent a WCAG percentage or certification. Do not open `results.html` as a workspace text file (that shows source). If a human wants the page:

```bash
npm run wcagate:results
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
