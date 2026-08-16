# Static site example

Use this when the surface is already built HTML (`dist/`, `public/`, or any static host).

```bash
npx wcagate init --preset static
npx wcagate doctor
npx wcagate run --base-url http://127.0.0.1:4173 --routes /
```

The starter tries `npx serve dist -p 4173`. Point `--base-url` at Cloudflare Pages preview, `wrangler pages dev`, or any other host instead.
