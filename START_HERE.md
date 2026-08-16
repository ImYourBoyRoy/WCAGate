# START HERE — WCAGate

Fail-closed accessibility evidence gate for websites, Svelte, Tauri, Bevy, and Godot. Coding models run it and **tell the user** the result. No GUI. No invented WCAG percentage.

Human landing page: **[README.md](README.md)** (includes three copy-paste prompts for a coding model, plus `package.json` scripts).

```bash
npm install --save-dev github:imyourboyroy/WCAGate
npx wcagate init --preset astro
npx wcagate doctor
npx wcagate run --base-url http://127.0.0.1:4321 --routes /
```

This checkout:

```bash
node ./bin/wcagate.mjs help
node ./bin/wcagate.mjs doctor
npm run check
```

Then read [Consumers](docs/CONSUMERS.md), [Results](docs/RESULTS.md), and [MCP](docs/MCP.md).
