# Tauri GUI example (static HTML/JS webview)

Use this when the app is Tauri + a static `ui/` (or `crates/*/ui`) frontend — the same shape as pyenv-native's GUI.

Static jsdom+axe on `index.html` with scripts stripped is **not** a substitute. It misses drawers, live states, and contrast. Prefer Playwright against the served UI, then optional packaged WebView evidence.

```bash
node /path/to/WCAGate/bin/wcagate.mjs init --preset tauri
node /path/to/WCAGate/bin/wcagate.mjs doctor
node /path/to/WCAGate/bin/wcagate.mjs run
```

Tell the user the gate and findings. Optional HTML view: `npx wcagate serve` → `http://127.0.0.1:4179/results.html`.
