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

That git install still lands in `node_modules/@imyourboyroy/wcagate` because that is the `name` in `package.json`. Do not run `npm publish`. Do not use `npm install @imyourboyroy/wcagate` — that talks to the npm registry, which this package does not use.

Do not depend on `file:/home/…` except on this machine.

## Later: Portable Web Toolkit (not in this change)

Do **not** re-vendor adapters into `Web_Toolkit/wcag_auditor`. After this package is on GitHub:

1. Toolkit keeps `--site-profile`, `--from-profile`, Astro ephemeral configs, and `--manage-server`.
2. Toolkit **depends on this GitHub repo** (`npm install github:imyourboyroy/WCAGate`).
3. If you choose a submodule and someone clones the toolkit without `--recurse-submodules`, ship a placeholder at `Web_Toolkit/wcag_auditor/core/README.md` that says to run `git submodule update --init` (or a small fetch script). An empty engine that silently passes is forbidden.

An npm git dependency is simpler than a submodule. Do not implement the bridge until this repo clones cleanly on another computer.
