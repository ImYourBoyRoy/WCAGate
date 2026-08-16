# MCP and coding-agent surfaces

This package is **one Node evidence engine**. Coding models use the CLI or MCP. There is no project-picking GUI.

| Surface | Binary | Role |
|---|---|---|
| **CLI** | `wcagate` | Canonical for CI and agents that spawn processes |
| **MCP stdio** | `wcagate-mcp` | `doctor`, `run`, `validate_config`, `version`, `core_path`, `explain` |
| **Results page** | `wcagate serve` | Optional HTML at `http://127.0.0.1:4179/results.html` |

## Fail fast

`wcagate doctor` (and `run`) exit `2` when required tools for the loaded config are missing:

- Node `< 24.0.0`
- Incomplete package checkout
- `playwright-axe` without Playwright peers / Chromium (`run` can auto-install those npm peers)
- required `svelte` adapter without `svelte` installed
- `command-evidence` when the command is not on PATH

`doctor` itself does not install Java, system packages, or a GUI.

## After `run`

MCP `run` returns a compact list of blocking and unresolved findings. **Tell the user that list.** Fix `file:line` next. Do not invent a WCAG percentage.

## Cursor MCP config

```json
{
  "mcpServers": {
    "wcagate-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/WCAGate/bin/wcagate-mcp.mjs"]
    }
  }
}
```
