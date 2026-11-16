// ./src/core/contrast-resolver.mjs
/**
 * Resolves axe-core `color-contrast` incompletes (WCAGate cantTell) from rendered pixels.
 *
 * How: for each incomplete node, measure the text's computed color, size, weight, and the rectangles its
 * glyphs occupy; hide glyph painting only (-webkit-text-fill-color, text-shadow, decorations; layout and
 * currentColor backgrounds are untouched); screenshot those rectangles; classify the real pixels behind the text.
 * This handles translucent layers, gradients, images, backdrop-filter, and overlapping elements, which static
 * ancestor-chain math cannot.
 *
 * Anything it cannot measure (gradient-clipped text, iframes, shadow DOM, offscreen or hidden nodes) stays cantTell
 * and carries the reason in evidence.contrastResolution. Never throws for a single node; the gate stays fail-closed.
 */

import { decodePng } from './png.mjs';
import {
  classifyContrast,
  histogramFromRgba,
  requiredRatio,
  suggestBackground,
  suggestForegroundForSurface,
  fromHex
} from './contrast.mjs';

export const CONTRAST_RULE_IDS = Object.freeze(['axe/color-contrast', 'axe/color-contrast-enhanced']);

const MAX_CLIP_WIDTH = 1600;
const MAX_CLIP_HEIGHT = 500;

const HIDE_GLYPHS_CSS = `
*, *::before, *::after, ::placeholder {
  -webkit-text-fill-color: transparent !important;
  -webkit-text-stroke-color: transparent !important;
  text-shadow: none !important;
  text-decoration-color: transparent !important;
  caret-color: transparent !important;
  transition: none !important;
  animation: none !important;
}
svg text, svg tspan, svg textPath { fill: transparent !important; stroke: transparent !important; }
`;

/**
 * @param {object} args
 * @param {import('playwright').Page} args.page
 * @param {object[]} args.findings Normalized-but-raw adapter findings (mutated copies are returned).
 * @param {{ enabled?: boolean, maxNodes?: number, passShare?: number, failShare?: number }} [args.options]
 * @returns {Promise<{ findings: object[], summary: object, passes: object[] }>}
 */
export async function resolveContrastFindings({ page, findings, options = {} }) {
  const summary = { examined: 0, passed: 0, failed: 0, unresolved: 0, skipped: 0 };
  const passes = [];
  const candidates = findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding.outcome === 'cantTell' && CONTRAST_RULE_IDS.includes(finding.ruleId));
  if (candidates.length === 0 || options.enabled === false) return { findings, summary, passes };

  const maxNodes = options.maxNodes ?? 250;
  const output = findings.slice();
  const work = candidates.slice(0, maxNodes);
  summary.skipped = candidates.length - work.length;

  let measured;
  try {
    measured = await measureTargets(page, work.map(({ finding }) => singleSelector(finding.target?.selectorOrNode)));
  } catch (error) {
    for (const { finding, index } of work) {
      output[index] = annotateUnresolved(finding, `measurement-failed: ${error.message}`);
      summary.unresolved += 1;
    }
    return { findings: output, summary, passes };
  }

  const scrollOrigin = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })).catch(() => null);
  const sheet = await installGlyphHider(page);
  try {
    for (let item = 0; item < work.length; item += 1) {
      const { finding, index } = work[item];
      const target = measured[item];
      summary.examined += 1;
      const level = finding.ruleId.endsWith('enhanced') ? 'AAA' : 'AA';
      if (!target || target.skip) {
        output[index] = annotateUnresolved(finding, target?.skip ?? 'selector-not-measurable');
        summary.unresolved += 1;
        continue;
      }
      const need = requiredRatio({ sizePx: target.fontSize, weight: target.fontWeight, level });
      try {
        const histogram = await sampleBackground(page, singleSelector(finding.target?.selectorOrNode));
        const foreground = [target.color[0], target.color[1], target.color[2], target.color[3] * target.opacity];
        const decision = classifyContrast(histogram, foreground, need, options);
        if (decision.outcome === 'passed') {
          summary.passed += 1;
          passes.push({
            selector: finding.target.selectorOrNode,
            ratio: decision.worst.ratio,
            need,
            text: target.text
          });
          output[index] = null;
        } else if (decision.outcome === 'failed') {
          summary.failed += 1;
          output[index] = promoteToFailure(finding, decision, target, level, histogram);
        } else {
          summary.unresolved += 1;
          output[index] = annotateUnresolved(finding, decision.reason, decision);
        }
      } catch (error) {
        summary.unresolved += 1;
        output[index] = annotateUnresolved(finding, `sampling-failed: ${error.message}`);
      }
    }
  } finally {
    await removeGlyphHider(page, sheet);
    if (scrollOrigin) await page.evaluate(({ x, y }) => window.scrollTo(x, y), scrollOrigin).catch(() => {});
  }
  return { findings: output.filter(Boolean), summary, passes };
}

function singleSelector(target) {
  if (typeof target === 'string') return target;
  if (Array.isArray(target) && target.length === 1 && typeof target[0] === 'string') return target[0];
  return null;
}

async function installGlyphHider(page) {
  return page.evaluate((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    window.__wcagateContrastSheet = sheet;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return true;
  }, HIDE_GLYPHS_CSS);
}

async function removeGlyphHider(page, installed) {
  if (!installed) return;
  await page.evaluate(() => {
    const sheet = window.__wcagateContrastSheet;
    if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
    delete window.__wcagateContrastSheet;
  }).catch(() => {});
}

async function measureTargets(page, selectors) {
  return page.evaluate((list) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const toRgba = (css) => {
      context.globalCompositeOperation = 'copy';
      context.fillStyle = '#000';
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    };

    return list.map((selector) => {
      if (!selector) return { skip: 'iframe-or-shadow-target' };
      let element;
      try {
        element = document.querySelector(selector);
      } catch {
        return { skip: 'selector-not-queryable' };
      }
      if (!element) return { skip: 'element-not-found' };
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return { skip: 'not-rendered' };

      const svg = element instanceof SVGElement;
      const fill = svg ? style.fill : style.webkitTextFillColor || style.color;
      if (!fill || fill === 'none') return { skip: 'no-text-paint' };
      const color = toRgba(fill);
      if (color[3] === 0) return { skip: 'gradient-clipped-or-transparent-text' };

      let opacity = 1;
      for (let cursor = element; cursor; cursor = cursor.parentElement) opacity *= Number(getComputedStyle(cursor).opacity);
      if (opacity < 0.02) return { skip: 'effectively-transparent' };

      return {
        color,
        opacity,
        fontSize: Number.parseFloat(style.fontSize) || 16,
        fontWeight: style.fontWeight,
        text: (element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      };
    });
  }, selectors);
}

/**
 * Scrolls the element into view, measures the rectangles its glyphs occupy in viewport coordinates, and screenshots
 * those rectangles. Viewport clips (not full-page) keep fixed, sticky, and scroll-container content correct.
 */
async function sampleBackground(page, selector) {
  const geometry = await page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!element) return { skip: 'element-not-found' };
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rects = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width >= 1 && rect.height >= 1) rects.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      }
    }
    if (rects.length === 0 && (element.matches('input,textarea,select') || element instanceof SVGElement)) {
      const rect = element.getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) rects.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
    return { rects, viewport: { width: window.innerWidth, height: window.innerHeight } };
  }, selector);
  if (geometry.skip) throw new Error(geometry.skip);
  if (geometry.rects.length === 0) throw new Error('no-text-geometry');

  const { width: viewWidth, height: viewHeight } = geometry.viewport;
  const combined = { colors: new Map(), total: 0, shift: 0 };
  for (const rect of mergeRects(geometry.rects).slice(0, 6)) {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const width = Math.min(MAX_CLIP_WIDTH, Math.ceil(Math.min(rect.x + rect.width, viewWidth) - x));
    const height = Math.min(MAX_CLIP_HEIGHT, Math.ceil(Math.min(rect.y + rect.height, viewHeight) - y));
    if (width < 1 || height < 1) continue;
    const buffer = await page.screenshot({ type: 'png', clip: { x, y, width, height }, animations: 'disabled', caret: 'hide' });
    mergeHistogram(combined, histogramFromRgba(decodePng(buffer).rgba));
  }
  if (combined.total === 0) throw new Error('text-outside-viewport');
  return combined;
}

function mergeHistogram(target, source) {
  const shift = Math.max(target.shift, source.shift);
  const rebase = (colors, from) => {
    const delta = shift - from;
    if (delta === 0) return colors;
    const next = new Map();
    for (const [key, count] of colors) {
      const merged = (((key >> 16) & 0xff) >> delta) << 16 | (((key >> 8) & 0xff) >> delta) << 8 | ((key & 0xff) >> delta);
      next.set(merged, (next.get(merged) ?? 0) + count);
    }
    return next;
  };
  const current = rebase(target.colors, target.shift);
  for (const [key, count] of rebase(source.colors, source.shift)) current.set(key, (current.get(key) ?? 0) + count);
  target.colors = current;
  target.shift = shift;
  target.total += source.total;
}

function mergeRects(rects) {
  // Combine line boxes that sit on the same row; separate rows (wrapped paragraphs) stay separate clips.
  const sorted = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const rect of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - rect.y) < Math.max(2, candidate.height / 2));
    if (!row) {
      rows.push({ ...rect });
      continue;
    }
    const right = Math.max(row.x + row.width, rect.x + rect.width);
    const bottom = Math.max(row.y + row.height, rect.y + rect.height);
    row.x = Math.min(row.x, rect.x);
    row.y = Math.min(row.y, rect.y);
    row.width = right - row.x;
    row.height = bottom - row.y;
  }
  return rows;
}

function annotateUnresolved(finding, reason, decision) {
  return {
    ...finding,
    evidence: {
      ...(finding.evidence && typeof finding.evidence === 'object' ? finding.evidence : {}),
      contrastResolution: { status: 'unresolved', reason, ...(decision ? { measured: stripKeys(decision) } : {}) }
    }
  };
}

function promoteToFailure(finding, decision, target, level, histogram) {
  const worst = decision.worst;
  // Only suggest a text color that passes against the whole sampled surface; busy gradients often have none.
  const suggestion = histogram
    ? suggestForegroundForSurface(histogram, [target.color[0], target.color[1], target.color[2], target.color[3] * target.opacity], decision.need)
    : null;
  const uniform = decision.failingShare >= 0.9;
  const backgroundSuggestion = uniform ? suggestBackground(fromHex(worst.foreground), fromHex(worst.background), decision.need) : null;
  const percent = Math.round(decision.failingShare * 100);
  return {
    ...finding,
    outcome: 'failed',
    confidence: decision.confidence,
    automation: 'automatic',
    description: `Measured contrast ${worst.ratio}:1 over rendered pixels (needs ${decision.need}:1, ${level}); ${percent}% of the pixels behind this text fail.`,
    evidence: {
      ...(finding.evidence && typeof finding.evidence === 'object' ? finding.evidence : {}),
      contrastResolution: {
        status: 'failed',
        method: 'pixel-sample',
        text: target.text,
        fontSizePx: target.fontSize,
        fontWeight: target.fontWeight,
        ...stripKeys(decision),
        ...(suggestion ? { suggestedForeground: suggestion } : {}),
        ...(backgroundSuggestion ? { suggestedBackground: backgroundSuggestion } : {})
      }
    },
    remediation: [
      `Text ${worst.foreground} on ${worst.background} measures ${worst.ratio}:1 at its worst; ${level} needs ${decision.need}:1.`,
      suggestion
        ? `Either change the text to ${suggestion.color} (${suggestion.ratio}:1)${backgroundSuggestion ? ` or change the surface to ${backgroundSuggestion.color} (${backgroundSuggestion.ratio}:1)` : ''}, or add a solid scrim under the text.`
        : uniform
          ? 'No solid text color reaches the ratio on this surface; change the surface (opaque scrim, stronger frost tint) behind the text.'
          : 'The surface behind the text varies too much for one text color; put the text on an opaque or scrimmed panel so every pixel behind it meets the ratio.'
    ].join(' '),
    tags: [...new Set([...(finding.tags ?? []).filter((tag) => tag !== 'frost-ui-review' && tag !== 'glassmorphism-friendly'), 'contrast-resolved'])]
  };
}

function stripKeys(decision) {
  const { outcome, ...rest } = decision;
  void outcome;
  return rest;
}
