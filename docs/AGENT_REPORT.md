# Agent report

Raw runs are large: one real 7-route x 4-variant audit produced a 137,792-token `latest.json` for 105 findings, almost all
of it the same few causes repeated per route, variant, and element (raw axe check arrays, HTML, fingerprints). Reading
that costs context and buries the answer.

The agent report (`wcag-audit/agent.md`, and the console output) reduces the same run to **1,182 tokens**
without dropping what a model needs to act:

```
WCAGate 2.4.0 | ReadyForUs | wcag22-aa
GATE FAIL exit 1 (blockingFindings) | 7 routes x 4 variants | 50s
blocking 5 causes/99 | unresolved 1 cause/2 | 1332 contrast samples passed
since last run: 3 fixed, 1 new, 40 unchanged

[g3] FAIL NEW serious axe/color-contrast | 25 findings, 19 elements, 5 routes | WCAG 1.4.3 AA
  only in: dark, mobile / dark, desktop
  3.73:1 (needs 4.5) text #fdf8f0 on #648874
  fix: text #fdf8f0 -> #171616 (4.57:1) OR surface #648874 -> #597967 (4.56:1); the pair is shared, so one token change fixes every listed element
  - button[data-analytics-choice="granted"] "Allow analytics" (home about legal reflections)
  - .hero-primary-cta "Choose a reflection ->" (home)
  +17 more element(s): wcagate report --group g3
```

## What it does

- **One block per root cause.** Contrast failures group by (text color, surface color, required ratio): every element
  sharing the pair shares one fix. Other findings group by rule and outcome (focus findings also by verdict).
- **Fix stated once**, with measured, validated suggestions (nearest passing text color and surface color).
- **Reach, not rows:** findings, elements (DOM instances counted), routes, and which color-scheme/viewport variants
  show it (`only in: dark, mobile` is often the whole diagnosis). Elements are ranked by reach and capped
  (`--max-elements`, default 5; `--max-groups`, default 12).
- **Counts instead of passes.** Measured contrast passes are a number, never a list.
- **Delta since the previous run** (`since last run`, `NEW` markers), so a fix-and-rerun loop re-reads only what changed.
  `--no-compare` turns it off.
- **Nothing duplicated:** raw HTML, fingerprints, URLs, and standards boilerplate stay in `latest.json`.
  axe check arrays are compacted (the repeated `relatedNodes` HTML is dropped).
- Suppressed, out-of-scope, and baselined findings are not causes (baselined ones are counted).

## Commands

```bash
wcagate run ...                     # console = agent view; also writes agent.md, latest.json, results.html
wcagate run --verbose               # the old per-finding listing, for a human debugging a gate
wcagate report                      # re-print the agent view from latest.json
wcagate report --group g3           # full members of one cause (elements, routes, variants, sample HTML)
wcagate report --json               # same content as compact JSON (what MCP `run` returns)
wcagate report --file path.json     # any run file
```

Group ids (`g1`, `g2`, ...) are stable for a given run file; the order is errors, blocking, unresolved, advisory,
then severity and reach.

## Reporter

`{ type: 'agent', file: 'agent.md' }` is in the default reporters and the `init` presets. The console reporter takes
`options: { style: 'verbose' }` to keep the long form permanently.
