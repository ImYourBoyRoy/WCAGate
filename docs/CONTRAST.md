# Contrast resolution

axe-core can only decide `color-contrast` when the text sits on a solid, opaque background. Text on gradients,
images, translucent layers, `backdrop-filter`, or partly overlapped by another element comes back as
`incomplete`, which WCAGate reports as `cantTell` (exit 3). On a modern site that is often most of the page, and
it hides real failures (a white button label on a pale gold gradient passes the gate as "unresolved").

Since 2.4.0 WCAGate **resolves those incompletes itself** from rendered pixels, in the same browser session.

## How it works

For every `color-contrast` / `color-contrast-enhanced` incomplete node:

1. Read the text's computed paint color (alpha and ancestor opacity included), font size, and weight, and the
   rectangles its glyphs occupy.
2. Scroll the element into view and hide glyph painting only (`-webkit-text-fill-color`, `text-shadow`, decorations) through a constructed
   stylesheet, so layout and `currentColor` backgrounds do not change and page CSP cannot block it.
3. Screenshot those rectangles and classify the real pixels behind the text against the required ratio
   (4.5:1 normal, 3:1 large; 7:1 / 4.5:1 for AAA).

| Share of background pixels failing | Result |
|---|---|
| at most `passShare` (default 2%) | finding removed; counted in `metadata.scenarios[].contrast` with the measured ratio |
| at least `failShare` (default 50%) | `failed`, with measured worst ratio, failing share, and a suggested text color that passes against the **whole** sampled surface (omitted when none exists) |
| in between | stays `cantTell`, `evidence.contrastResolution.reason = "mixed-background"` |

Anything it cannot measure stays `cantTell` and says why in `evidence.contrastResolution.reason`:
`gradient-clipped-or-transparent-text`, `iframe-or-shadow-target`, `not-rendered`, `no-text-geometry`,
`sampling-failed: ...`. It never turns an unmeasured node into a pass.

A failure on a uniform surface (a button fill) also reports `suggestedForeground` and `suggestedBackground`, each validated to reach the required ratio.

Fingerprints are unchanged by resolution, so existing suppressions keep working.

## Configuration

On by default. Tune or disable per adapter or scenario:

```js
probes: {
  contrastResolution: { enabled: true, maxNodes: 250, passShare: 0.02, failShare: 0.5 }
  // contrastResolution: { enabled: false }  // keep axe incompletes as cantTell
}
```

## Limits (be honest in reports)

- States are measured as rendered at audit time: default, not hover/focus/active. Add scenario `steps` to reach
  other states, or use `colorScheme` / the matrix for dark and light.
- Shadow DOM and iframe targets are not sampled.
- Text over video or animated canvas is sampled from one frame (animations are disabled for the capture).
- This is evidence for WCAG 1.4.3 / 1.4.6, not a conformance certificate.
