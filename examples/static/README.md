# Static site example

Use this when the surface is already built HTML (`dist/`, `public/`, or any static host).

```bash
pnpm exec wcagate init --preset static
pnpm exec wcagate doctor
pnpm exec wcagate run --base-url http://127.0.0.1:4173 --routes /
```

The starter tries `npx serve dist -p 4173`. Point `--base-url` at Cloudflare Pages preview, `wrangler pages dev`, or any other host instead.
