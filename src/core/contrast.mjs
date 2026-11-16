// ./src/core/contrast.mjs
/**
 * WCAG contrast math and pixel-sample classification.
 *
 * Purpose: axe-core reports text on translucent, gradient, image, or overlapping backgrounds as
 * `incomplete` (WCAGate: cantTell). The contrast resolver renders the page with glyphs hidden, samples
 * the real pixels behind the text, and uses this module to decide passed / failed / still cantTell.
 *
 * Decision policy (documented in docs/CONTRAST.md):
 *   - passed:  at most `passShare` (default 2%) of sampled background pixels fail the required ratio
 *   - failed:  at least `failShare` (default 50%) of sampled background pixels fail
 *   - cantTell: anything in between (text straddles a hard background edge or busy image)
 */

export const DEFAULT_PASS_SHARE = 0.02;
export const DEFAULT_FAIL_SHARE = 0.5;
const MAX_UNIQUE_COLORS = 4096;

function channelLuminance(value) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** @param {ArrayLike<number>} rgb */
export function relativeLuminance(rgb) {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Composite an RGBA foreground over an opaque RGB background. */
export function composite(foreground, background) {
  const alpha = clamp(foreground[3] ?? 1, 0, 1);
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha)
  ];
}

/** WCAG large text: >= 24px, or >= 18.66px (14pt) at bold weight. */
export function isLargeText(sizePx, weight) {
  const numericWeight = typeof weight === 'string' && weight === 'bold' ? 700 : Number(weight);
  return sizePx >= 24 || (sizePx >= 18.66 && numericWeight >= 700);
}

/**
 * @param {{ sizePx: number, weight?: string | number, level?: 'AA' | 'AAA' }} input
 */
export function requiredRatio({ sizePx, weight, level = 'AA' }) {
  const large = isLargeText(sizePx, weight);
  if (level === 'AAA') return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

/**
 * Builds a color histogram from RGBA pixels, ignoring fully transparent ones.
 * Quantizes (drops low bits) only when a busy image would exceed MAX_UNIQUE_COLORS.
 *
 * @param {Uint8Array} rgba
 * @param {{ maxSamples?: number }} [options]
 * @returns {{ colors: Map<number, number>, total: number }} key = r<<16|g<<8|b
 */
export function histogramFromRgba(rgba, options = {}) {
  const pixelCount = Math.floor(rgba.length / 4);
  const maxSamples = options.maxSamples ?? 250_000;
  const step = Math.max(1, Math.ceil(pixelCount / maxSamples));
  let shift = 0;
  let colors = new Map();
  let total = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const index = pixel * 4;
    if (rgba[index + 3] === 0) continue;
    const key = pack(rgba[index], rgba[index + 1], rgba[index + 2], shift);
    colors.set(key, (colors.get(key) ?? 0) + 1);
    total += 1;
    if (colors.size > MAX_UNIQUE_COLORS) {
      shift += 1;
      colors = requantize(colors);
    }
  }
  // Keys store the already-quantized value; remember the shift so unpack() can restore the midpoint.
  return { colors, total, shift };
}

function pack(r, g, b, shift) {
  return ((r >> shift) << 16) | ((g >> shift) << 8) | (b >> shift);
}

function requantize(colors) {
  const next = new Map();
  for (const [key, count] of colors) {
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    const merged = ((r >> 1) << 16) | ((g >> 1) << 8) | (b >> 1);
    next.set(merged, (next.get(merged) ?? 0) + count);
  }
  return next;
}

function unpack(key, shift) {
  const spread = shift > 0 ? (1 << shift) / 2 : 0;
  return [
    Math.min(255, ((key >> 16) & 0xff) * (1 << shift) + spread),
    Math.min(255, ((key >> 8) & 0xff) * (1 << shift) + spread),
    Math.min(255, (key & 0xff) * (1 << shift) + spread)
  ];
}

/**
 * Classifies one text node's foreground against the sampled backgrounds.
 *
 * @param {{ colors: Map<number, number>, total: number, shift?: number }} histogram
 * @param {[number, number, number, number]} foreground RGBA with opacity already folded into alpha.
 * @param {number} need Required contrast ratio.
 * @param {{ passShare?: number, failShare?: number }} [options]
 */
export function classifyContrast(histogram, foreground, need, options = {}) {
  const passShare = options.passShare ?? DEFAULT_PASS_SHARE;
  const failShare = options.failShare ?? DEFAULT_FAIL_SHARE;
  if (!histogram.total) {
    return { outcome: 'cantTell', reason: 'no-background-pixels', need };
  }
  let failing = 0;
  let worst = null;
  let best = null;
  for (const [key, count] of histogram.colors) {
    const background = unpack(key, histogram.shift ?? 0);
    const text = composite(foreground, background);
    const ratio = contrastRatio(text, background);
    if (ratio < need) failing += count;
    if (!worst || ratio < worst.ratio) worst = { ratio, background, foreground: text };
    if (!best || ratio > best.ratio) best = { ratio, background, foreground: text };
  }
  const share = failing / histogram.total;
  const base = {
    need,
    sampledPixels: histogram.total,
    failingShare: Number(share.toFixed(4)),
    worst: describe(worst),
    best: describe(best)
  };
  if (share <= passShare) return { outcome: 'passed', ...base };
  if (share >= failShare) {
    return { outcome: 'failed', confidence: share >= 0.98 ? 'high' : 'medium', ...base };
  }
  return { outcome: 'cantTell', reason: 'mixed-background', ...base };
}

function describe(entry) {
  return {
    ratio: Number(entry.ratio.toFixed(2)),
    background: toHex(entry.background),
    foreground: toHex(entry.foreground)
  };
}

/** @param {ArrayLike<number>} rgb */
export function toHex(rgb) {
  return `#${[0, 1, 2].map((index) => Math.round(clamp(rgb[index], 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

/** @param {string} hex */
export function fromHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Nearest foreground (by moving toward black or white) that reaches `need` against the worst background.
 * Returns null when the foreground already passes or no solid color can reach the ratio.
 *
 * @param {ArrayLike<number>} foreground RGB
 * @param {ArrayLike<number>} background RGB
 * @param {number} need
 */
export function suggestForeground(foreground, background, need) {
  if (contrastRatio(foreground, background) >= need) return null;
  const candidates = [];
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    for (let step = 1; step <= 100; step += 1) {
      const mix = step / 100;
      const color = [0, 1, 2].map((index) => foreground[index] + (target[index] - foreground[index]) * mix);
      if (contrastRatio(color, background) >= need) {
        candidates.push({ color, distance: step });
        break;
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates[0].color;
  return { color: toHex(chosen), ratio: Number(contrastRatio(chosen, background).toFixed(2)) };
}

/**
 * Nearest background (moved away from the text luminance) that gives the text `need`:1.
 * Only meaningful for a (nearly) uniform surface such as a button fill.
 *
 * @param {ArrayLike<number>} foreground RGB (opacity already composited)
 * @param {ArrayLike<number>} background RGB
 */
export function suggestBackground(foreground, background, need) {
  if (contrastRatio(foreground, background) >= need) return null;
  const target = relativeLuminance(foreground) > relativeLuminance(background) ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 100; step += 1) {
    const mix = step / 100;
    const color = [0, 1, 2].map((index) => background[index] + (target[index] - background[index]) * mix);
    if (contrastRatio(foreground, color) >= need) return { color: toHex(color), ratio: Number(contrastRatio(foreground, color).toFixed(2)) };
  }
  return null;
}

/**
 * Nearest text color (toward black or white) that passes against the whole sampled surface, not just its worst pixel.
 * Returns null when already passing or when no solid color works (busy gradients, mid-tone images).
 *
 * @param {{ colors: Map<number, number>, total: number, shift?: number }} histogram
 * @param {[number, number, number, number]} foreground
 * @param {number} need
 * @param {{ passShare?: number }} [options]
 */
export function suggestForegroundForSurface(histogram, foreground, need, options = {}) {
  const passShare = options.passShare ?? DEFAULT_PASS_SHARE;
  const attempts = [];
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    for (let step = 1; step <= 100; step += 1) {
      const mix = step / 100;
      const color = [0, 1, 2].map((index) => foreground[index] + (target[index] - foreground[index]) * mix);
      const decision = classifyContrast(histogram, [color[0], color[1], color[2], 1], need, { passShare });
      if (decision.outcome === 'passed') {
        attempts.push({ color, distance: step, ratio: decision.worst.ratio });
        break;
      }
    }
  }
  if (attempts.length === 0) return null;
  attempts.sort((a, b) => a.distance - b.distance);
  return { color: toHex(attempts[0].color), ratio: attempts[0].ratio };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
