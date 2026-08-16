# WCAGate

A fail-closed **accessibility evidence gate** for websites, Svelte, Tauri, Bevy, and Godot.

It does **not** invent a WCAG percentage and does **not** certify conformance. Coding models run it, then **tell you** the gate and the findings. There is no project-picking GUI.

```bash
npm install --save-dev github:imyourboyroy/WCAGate
npx wcagate init --preset astro    # or web | static | tauri | native
npx wcagate doctor
npx wcagate run --base-url http://127.0.0.1:4321 --routes /
```

Not on the npm registry. Requires **Node 24 or newer** (26 is fine). The install specifier is `github:imyourboyroy/WCAGate` (not `github://`, not `npm install @imyourboyroy/wcagate`). Pin a release with `#v2.3.1`. Details: [Distribution](docs/DISTRIBUTION.md) · [Consumers](docs/CONSUMERS.md).

## Ask a coding model

Paste one of these into the project chat.

**1. Install only**

```text
Install WCAGate in this project from GitHub, not the npm registry.

npm install --save-dev github:imyourboyroy/WCAGate

Add these scripts to package.json:
  "wcagate:doctor": "wcagate doctor",
  "wcagate:prepare": "wcagate prepare",
  "wcagate:audit": "wcagate run",
  "wcagate:results": "wcagate serve"

If this is an Astro site, set wcagate:audit to:
  "wcagate run --base-url http://127.0.0.1:4321 --routes /"

If there is no wcagate.config.mjs, run npx wcagate init --preset matching this repo (astro, web, static, tauri, or native). Do not overwrite an existing config unless I ask. Then: npx wcagate skills link --project .

Do not run npm install @imyourboyroy/wcagate. Do not invent a WCAG percentage.
```

**2. Install and audit**

```text
Install WCAGate from GitHub and run an accessibility evidence gate on this project.

1. npm install --save-dev github:imyourboyroy/WCAGate
2. Add package.json scripts wcagate:doctor, wcagate:prepare, wcagate:audit, and wcagate:results (wcagate doctor / prepare / run / serve). For a live site preview, put --base-url and --routes on wcagate:audit.
3. If wcagate.config.mjs is missing, npx wcagate init --preset matching this stack.
4. npm run wcagate:doctor — fix missing tools. npm run wcagate:prepare if Playwright is needed.
5. Start the project's preview if the audit needs a live URL, then npm run wcagate:audit.
6. Tell me the gate: exit 0 pass, 1 blocking, 2 execution/config, 3 unresolved — and each blocking or unresolved finding with file:line. Do not invent a WCAG percentage or certification.
7. Optional: npm run wcagate:results and give me http://127.0.0.1:4179/results.html. Do not open results.html as a text file.
```

**3. Audit (already installed)**

```text
WCAGate is already a dependency. Run the accessibility evidence gate on this project.

1. npm run wcagate:doctor (or npx wcagate doctor). Fix missing tools first.
2. npm run wcagate:audit — or npx wcagate run --base-url <preview-url> --routes / if a live URL is required.
3. Tell me the gate (exit 0 pass, 1 blocking, 2 execution/config, 3 unresolved) and each blocking or unresolved finding with file:line. Do not invent a WCAG percentage or certification.
4. Optional HTML: npm run wcagate:results → http://127.0.0.1:4179/results.html. Do not open the HTML as text.
```

## In your package.json

```json
{
  "devDependencies": {
    "@imyourboyroy/wcagate": "github:imyourboyroy/WCAGate"
  },
  "scripts": {
    "wcagate:doctor": "wcagate doctor",
    "wcagate:prepare": "wcagate prepare",
    "wcagate:audit": "wcagate run",
    "wcagate:results": "wcagate serve"
  }
}
```

`wcagate:results` is the optional HTML view (`serve`), not a GUI. Astro preview variant and CI notes: [Consumers](docs/CONSUMERS.md).

## What you get

| Exit | Meaning |
|---:|---|
| `0` | Gate passed |
| `1` | Blocking findings |
| `2` | Config, missing tools, or empty surface — not a silent pass |
| `3` | Evidence still untested or inconclusive |

Each run overwrites `wcag-audit/latest.json` and `wcag-audit/results.html`. Default target is WCAG 2.2 AA. Optional HTML view: `npm run wcagate:results` → [results](docs/RESULTS.md).

Need Playwright or Svelte? `npm run wcagate:prepare` installs those peers in **your** project, not inside this package.

Config is `wcagate.config.mjs`. Copy a preset with `init`, or start from [examples/](examples/). Adapter and suppression rules: [Architecture](docs/ARCHITECTURE.md).

## Stacks

| You have | Start with |
|---|---|
| Astro / Vite / static HTML | `init --preset astro` / `web` / `static` |
| Svelte | Playwright + optional Svelte compiler adapter |
| Tauri | `init --preset tauri` — [example](examples/tauri-gui/) |
| Bevy / Godot | `init --preset native` — they export JSON, this package gates it |

Presets, CI, and consumer wiring: [Consumers](docs/CONSUMERS.md). Native JSON contract: [Native integration](docs/NATIVE_INTEGRATION.md).

## Docs

- [Start here](START_HERE.md) — operator quick path
- [Consumers](docs/CONSUMERS.md) — install, `package.json` scripts, presets, prompts
- [Results](docs/RESULTS.md) — `latest.json`, optional HTML, what to tell a human
- [MCP](docs/MCP.md) — `wcagate-mcp` for coding agents
- [CI](docs/CI.md) — keep exit codes `0` / `1` / `2` / `3` distinct
- [Architecture](docs/ARCHITECTURE.md) — planes, adapters, suppressions, fail-closed gate
- [Glassmorphism](docs/GLASSMORPHISM.md) — frost UI and `cantTell` contrast
- [Skills](docs/SKILLS.md) — local agent skills only
- [Manual testing](docs/MANUAL_TESTING.md) · [Rule authoring](docs/RULE_AUTHORING.md) · [Evidence sources](docs/SOURCE_EVALUATION.md)
- [Migration](MIGRATION.md) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md)
- [ADR-001](docs/decisions/ADR-001-canonical-package.md) · [ADR-002](docs/decisions/ADR-002-document-plane.md) (withdrawn) · [ADR-003](docs/decisions/ADR-003-surfaces.md)

`npx wcagate help` lists every command. `npm run check` is the verification suite.

Automated checks find many defects. They cannot prove every process works with assistive technology — that still needs human evidence.

MIT. [github.com/imyourboyroy/WCAGate](https://github.com/imyourboyroy/WCAGate)
