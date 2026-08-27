# Distribution

This repository is the canonical WCAGate. Other computers get it from **GitHub**, not the npm registry and not by copying a folder off this workstation. Requires **Node 24 or newer** (26 is supported).

## Consume from GitHub

```bash
git clone https://github.com/imyourboyroy/WCAGate.git
cd WCAGate
npm ci
npm run check

# from a site or app (this is the portable install):
npm install --save-dev github:imyourboyroy/WCAGate
# pin a release:
npm install --save-dev github:imyourboyroy/WCAGate#v2.3.1
npx wcagate init --preset astro
```

npm 12+ defaults `allow-git=none`. GitHub installs need `--allow-git=all` (or `NPM_CONFIG_ALLOW_GIT=all`).

That git install still lands in `node_modules/@imyourboyroy/wcagate` because that is the `name` in `package.json`. Do not run `npm publish`. Do not use `npm install @imyourboyroy/wcagate` — that talks to the npm registry, which this package does not use.

Do not depend on `file:/home/…` except on this machine.

## Portable Web Toolkit

Do **not** re-vendor adapters into `Web_Toolkit/wcag_auditor`. The toolkit keeps a thin site-profile wrapper and depends on this GitHub repo:

```bash
cd Web_Toolkit
npm install --allow-git=all   # package.json: "github:imyourboyroy/WCAGate" (unpinned)
node ./wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/node_modules/@imyourboyroy/wcagate
```

Missing engine is exit `2`, never a silent pass. Do not use a git submodule. Do not resolve `AI/wcag-auditor`.
