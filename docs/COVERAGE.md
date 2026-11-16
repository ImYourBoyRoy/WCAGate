# What a run covers

A `playwright-axe` adapter runs, per scenario (route, color scheme, viewport):

| Check | Source | Notes |
|---|---|---|
| axe-core rules for the profile | axe | `runOnly` follows the profile (A/AA/AAA) |
| Contrast on gradients, images, glass | pixel sampling | [Contrast resolution](CONTRAST.md) |
| Keyboard focus visible (2.4.7) | pixel diff | focused vs blurred capture; also off-screen focus and sticky bars covering focus (2.4.11) |
| Reflow at 320 px (1.4.10) | `reflow` probe | on in AA/AAA presets |
| Text spacing (1.4.12) | `textSpacing` probe | on in AA/AAA presets |
| Target size (2.5.5) | `targetSizeEnhanced` probe | AAA presets |
| Reachable route | HTTP status guard | 4xx/5xx is an `executionError` |
| Duplicate titles (2.4.2) | cross-route | advisory |

## Before auditing: settle

Pages are audited at rest: load, fonts, one scroll pass (reveal-on-scroll, lazy content), and finite animations
finished (`settle: { scroll, timeoutMs }`, `settle: false` to disable). Without it, axe measures text mid-fade and the
result depends on machine load.

## Scale

`--sitemap`, `--color-schemes`, `--viewports` (or `matrix`) multiply scenarios; `concurrency` (default
`min(4, CPUs - 1)`) runs them in parallel while keeping results in config order. The same defect in several variants
is merged into one finding that lists its `variants`.

## Not covered (say so in reports)

Hover and active states, content behind interactions you did not script (use scenario `steps`), shadow DOM and iframe
text sampling, video and canvas content beyond a single frame, and everything that needs a human (meaning of alt text,
reading order, captions). This is evidence for an accessibility gate, not a conformance certificate.
