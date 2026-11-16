# Astro site example

This package audits Astro sites directly. You do not need Portable Web Toolkit or a site-profile for that.

```bash
pnpm add -D github:imyourboyroy/WCAGate
pnpm exec wcagate init --preset astro
pnpm run wcagate:doctor
pnpm run wcagate:audit
```

Add the GitHub dependency and scripts from [Consumers](../../docs/CONSUMERS.md) (`wcagate:doctor`, `wcagate:prepare`, `wcagate:audit`, `wcagate:results`). For this preset, `wcagate:audit` should include `--base-url http://127.0.0.1:4321 --routes /`.

`init --preset astro` writes Playwright against the Astro preview port (4321), optional Svelte diagnostics (`allowEmpty` so content-only sites do not fail), and frost manual evidence.

Add one scenario per public route in `wcagate.config.mjs`, or pass `--routes` on the run. Pass `--base-url` for a live host or a different preview port.

Tell the user the gate and findings from the CLI / `wcag-audit/latest.json`. Optional HTML view: `pnpm exec wcagate serve` → `http://127.0.0.1:4179/results.html`. Do not open the `.html` file as text.
