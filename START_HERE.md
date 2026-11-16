# START HERE — WCAGate

Fail-closed accessibility evidence gate for websites, Svelte, Tauri, Bevy, and Godot. Coding models run it and **tell the user** the result. No GUI. No invented WCAG percentage.

Human landing page: **[README.md](README.md)** (includes three copy-paste prompts for a coding model, plus `package.json` scripts). Maintainer: [Roy Dawson IV](https://github.com/ImYourBoyRoy).

```bash
pnpm add -D github:imyourboyroy/WCAGate
pnpm exec wcagate init --preset astro
pnpm exec wcagate doctor
pnpm exec wcagate run --base-url http://127.0.0.1:4321 --routes /
```

This checkout:

```bash
node ./bin/wcagate.mjs help
node ./bin/wcagate.mjs doctor
pnpm run check
```

Then read [Consumers](docs/CONSUMERS.md), [Results](docs/RESULTS.md), and [MCP](docs/MCP.md).
