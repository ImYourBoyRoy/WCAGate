# CI integration

## Gate semantics

Do not collapse all nonzero outcomes into a generic failure message. Preserve the distinction:

- `1`: accessibility defect requiring remediation or accountable suppression
- `2`: test system did not produce trustworthy evidence
- `3`: required human or inconclusive evidence remains unresolved

Do not start `wcagate serve`, `run --serve`, or `npm run wcagate:results` in CI (`CI=true` already disables the viewer). Upload `wcag-audit/latest.json` and `wcag-audit/results.html` as artifacts. Consumer projects should define the scripts in [CONSUMERS.md](CONSUMERS.md).

## Generic shell

```bash
set +e
npm run wcagate:audit -- --no-color
code=$?
set -e

case "$code" in
  0) echo "Accessibility gate passed" ;;
  1) echo "Blocking accessibility findings" ;;
  2) echo "Accessibility test execution failed" ;;
  3) echo "Accessibility evidence is unresolved" ;;
  *) echo "Unexpected exit code: $code" ;;
esac

exit "$code"
```

## GitHub Actions (consumer project)

```yaml
name: accessibility
on:
  pull_request:
  push:
    branches: [main]

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run preview -- --host 127.0.0.1 &
      - run: npm run wcagate:audit -- --no-color
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: accessibility-evidence
          path: |
            wcag-audit/latest.json
            wcag-audit/results.html
```

Pin action revisions to immutable commit SHAs when your supply-chain policy requires it.

This package's own check workflow is `.github/workflows/check.yml` (`npm ci` then `npm run check` on Node 24 and Node 26).

## Baselines

Do not baseline by deleting old failures. Store fingerprints with owner, ticket, justification, and expiration. New findings remain visible. Expired suppressions block release.

## Matrix testing

Rendered browser evidence should cover supported engines, viewports, color schemes, reduced-motion settings, and forced-colors behavior where applicable. Native evidence should cover supported operating systems and assistive technologies. Keep fast pull-request gates separate from broader scheduled matrices, but do not label the fast gate as complete conformance.
