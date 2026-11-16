# Consumers

This package is the engine. Consumer projects install it; they do not copy `src/`.

## Install

GitHub (the portable path; npm still places it at `@imyourboyroy/wcagate`):

```bash
pnpm add -D github:imyourboyroy/WCAGate
# latest release, never a pinned version (semver range over release tags):
pnpm add -D 'github:imyourboyroy/WCAGate#semver:*'
```

Sibling checkout:

```bash
pnpm add -D file:../wcag-auditor
```

Do not `npm install @imyourboyroy/wcagate` from the npm registry. This package is not published there.

Then:

```bash
pnpm exec wcagate init --preset web   # or astro | static | tauri | native
pnpm exec wcagate doctor
pnpm exec wcagate prepare
pnpm exec wcagate run --base-url http://127.0.0.1:4321 --routes /
pnpm exec wcagate skills link --project .
```

`core-path` must print this package root (the directory that contains `bin/wcagate.mjs`), not a toolkit re-bundle.

## package.json

Add the GitHub dependency and four scripts. `wcagate:results` serves the HTML view (`wcagate serve`). It is not a dashboard GUI.

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

Astro (preview on 4321):

```json
{
  "scripts": {
    "wcagate:audit": "wcagate run --base-url http://127.0.0.1:4321 --routes /"
  }
}
```

Then:

```bash
pnpm run wcagate:doctor
pnpm run wcagate:prepare
pnpm run wcagate:audit
pnpm run wcagate:results
```

CI should call `pnpm run wcagate:audit --no-color` (or `pnpm exec wcagate run --no-color`) and must not start `wcagate:results`. Extra flags after `--` pass through to `wcagate`.

Copy-paste prompts for a coding model: [README](../README.md#ask-a-coding-model).

## Presets

| Preset | Adapters | Typical consumer |
|---|---|---|
| `web` | optional Svelte, Playwright/axe, manual evidence | Vite/Svelte/generic sites |
| `astro` | same; preview on port 4321 | Astro sites without the toolkit |
| `static` | Playwright against `dist/` or `--base-url` | Prebuilt HTML / Pages |
| `tauri` | Playwright against the GUI URL + optional packaged `command-evidence` | pyenv-gui, Tailscale GUI, DNA Tools |
| `native` | native-evidence + manual evidence | Bevy / Godot / AccessKit exporters |

## Portable Web Toolkit sites

Toolkit-managed Astro sites may keep a **thin** `Web_Toolkit/wcag_auditor` wrapper for `*.site-profile.json`. Core logic still belongs here. Do not treat the toolkit re-bundle as canonical for apps.

Follow-up (other repo): restore that wrapper as a dependency on this package.

## Tauri apps

Use two layers:

1. **Browser-mode** `playwright-axe` against the Vite/dev URL (drawers, live states, contrast on).
2. Optional **packaged WebView** via `command-evidence` emitting native JSON.

A static jsdom+axe scan of `index.html` with scripts stripped (pyenv-native `scripts/gui-a11y` today) is incomplete: it misses drawers and often disables contrast. Wrap that script as `command-evidence` first if you must keep it, then add Playwright.

See `examples/tauri/` and `examples/tauri-gui/`.

Known app-shaped consumers (follow-up in those repos, not this campaign):

- **pyenv-native** — Tauri v2 GUI under `crates/*/ui`
- **Tailscale_GUI** — already has a WCAG config; point it at this package
- **DNA_Tools** — another Tauri app

## Native engines

Bevy and Godot own collection. This package only ingests JSON. See [NATIVE_INTEGRATION.md](NATIVE_INTEGRATION.md) and `examples/bevy/`, `examples/godot/`.

## CI exit codes

Preserve `0` / `1` / `2` / `3` distinctly. Do not collapse them in a wrapper script. See [CI.md](CI.md).

## Skills

Skills stay **local**. Canonical files live in this repo's `skills/`. `wcagate skills link --project <consumer>` symlinks them into that project's `.cursor/skills/` and `.agents/skills/` only. Never install into `~/.cursor/skills`.
