// ./src/adapters/focus-probe.mjs
/**
 * Keyboard focus probe: tabs through the page and decides, per focusable element, whether focus is visible.
 *
 * Old behavior: a style heuristic (outline or box-shadow) that left every other valid design (border, background,
 * underline, inset ring, ::after ring) as `cantTell`, which made "focus indicator review" the largest unresolved
 * finding on every real site. Now the verdict comes from pixels: the element region is captured while focused and
 * again after blur, and the difference is measured.
 *
 *   - failed (2.4.7):   essentially nothing changed on screen when the element took focus
 *   - passed:           enough changed pixels contrast at least 3:1 with their unfocused color
 *   - cantTell:         something changed but weakly, or the region could not be captured
 *   - failed (2.4.11):  a fixed or sticky element covers every sample point of the focused element
 *
 * Transitions and animations are disabled for the probe so a fading outline is measured at its final state.
 */

import { decodePng } from '../core/png.mjs';
import { contrastRatio } from '../core/contrast.mjs';

const PAD = 6;
const MAX_CLIP_WIDTH = 700;
const MAX_CLIP_HEIGHT = 320;
const CHANGE_THRESHOLD = 12;
const STRONG_RATIO = 3;
const MIN_STRONG_SHARE = 0.005;
const MIN_STRONG_PIXELS = 20;

/** Pure comparison of two RGBA captures of the same size. Exported for tests. */
export function compareFocusCaptures(before, after, width, height) {
  const total = width * height;
  let changed = 0;
  let strong = 0;
  let strongest = 1;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const dr = Math.abs(before[index] - after[index]);
    const dg = Math.abs(before[index + 1] - after[index + 1]);
    const db = Math.abs(before[index + 2] - after[index + 2]);
    if (Math.max(dr, dg, db) < CHANGE_THRESHOLD) continue;
    changed += 1;
    const ratio = contrastRatio([before[index], before[index + 1], before[index + 2]], [after[index], after[index + 1], after[index + 2]]);
    if (ratio > strongest) strongest = ratio;
    if (ratio >= STRONG_RATIO) strong += 1;
  }
  const needed = Math.max(MIN_STRONG_PIXELS, Math.ceil(total * MIN_STRONG_SHARE));
  let verdict;
  if (changed < Math.max(6, Math.ceil(total * 0.0005))) verdict = 'none';
  else if (strong >= needed) verdict = 'visible';
  else verdict = 'weak';
  return { verdict, changedPixels: changed, strongPixels: strong, neededStrongPixels: needed, totalPixels: total, strongestRatio: Number(strongest.toFixed(2)) };
}

export async function runFocusIndicatorProbe(page, options, adapterName, scenarioName) {
  const maxTabs = options.maxTabs ?? 80;
  const findings = [];
  const seen = new Set();
  const summary = { tabbed: 0, visible: 0, failed: 0, unresolved: 0 };

  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }');
    window.__wcagateFocusSheet = sheet;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  try {
    for (let index = 0; index < maxTabs; index += 1) {
      await page.keyboard.press('Tab');
      const info = await describeFocused(page);
      if (!info) break;
      const key = `${info.selector}|${info.name}`;
      if (seen.has(key)) break;
      seen.add(key);
      summary.tabbed += 1;

      const result = await judgeFocus(page, info);
      if (result.obscured) {
        summary.failed += 1;
        findings.push(obscuredFinding(info, result.obscured, options, adapterName, scenarioName));
      }
      if (result.verdict === 'visible') {
        summary.visible += 1;
      } else if (result.verdict === 'offscreen') {
        summary.failed += 1;
        findings.push(offscreenFinding(info, options, adapterName, scenarioName));
      } else if (result.verdict === 'none') {
        summary.failed += 1;
        findings.push(indicatorFinding(info, result, 'failed', options, adapterName, scenarioName));
      } else {
        summary.unresolved += 1;
        findings.push(indicatorFinding(info, result, 'cantTell', options, adapterName, scenarioName));
      }
    }
  } finally {
    await page.evaluate(() => {
      const sheet = window.__wcagateFocusSheet;
      if (sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
      delete window.__wcagateFocusSheet;
    }).catch(() => {});
  }
  return { findings, surfaceCount: summary.tabbed, summary };
}

async function describeFocused(page) {
  return page.evaluate((pad) => {
    const element = document.activeElement;
    if (!element || element === document.body || element === document.documentElement) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const cssPath = (node) => {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const own = node.localName + (node.getAttribute('name') ? `[name="${CSS.escape(node.getAttribute('name'))}"]` : '');
      const parent = node.parentElement;
      if (!parent) return own;
      const siblings = [...parent.children].filter((candidate) => candidate.localName === node.localName);
      return `${parent === document.body ? 'body' : parent.localName} > ${own}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`;
    };
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    return {
      selector: cssPath(element),
      role: element.getAttribute('role') || element.localName,
      name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      visible,
      outline: { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset },
      boxShadow: style.boxShadow,
      heuristicIndicator: (outlineWidth > 0 && style.outlineStyle !== 'none' && style.outlineColor !== 'transparent') || (style.boxShadow !== 'none' && style.boxShadow !== ''),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      pad
    };
  }, PAD);
}

async function judgeFocus(page, info) {
  const result = { verdict: 'unknown', method: 'pixel-diff' };
  result.obscured = await coveredByFixed(page);
  if (!info.visible) return { ...result, verdict: 'offscreen', reason: 'focused-element-not-in-viewport' };

  const clip = clipFor(info);
  if (!clip) return { ...result, verdict: 'unknown', reason: 'no-capturable-region' };
  try {
    const focused = decodePng(await page.screenshot({ type: 'png', clip, animations: 'disabled', caret: 'hide' }));
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const unfocused = decodePng(await page.screenshot({ type: 'png', clip, animations: 'disabled', caret: 'hide' }));
    await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element) element.focus({ preventScroll: true });
    }, info.selector);
    if (focused.width !== unfocused.width || focused.height !== unfocused.height) {
      return { ...result, verdict: 'unknown', reason: 'capture-size-changed' };
    }
    return { ...result, ...compareFocusCaptures(unfocused.rgba, focused.rgba, focused.width, focused.height) };
  } catch (error) {
    return { ...result, verdict: 'unknown', reason: `capture-failed: ${error.message.split('\n')[0]}` };
  }
}

function clipFor(info) {
  const { rect, viewport } = info;
  const x = Math.max(0, Math.floor(rect.x - PAD));
  const y = Math.max(0, Math.floor(rect.y - PAD));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width + PAD));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height + PAD));
  const width = Math.min(MAX_CLIP_WIDTH, right - x);
  const height = Math.min(MAX_CLIP_HEIGHT, bottom - y);
  return width >= 2 && height >= 2 ? { x, y, width, height } : null;
}

/** A fixed or sticky element on top of every sample point of the focused element (2.4.11 Focus Not Obscured). */
async function coveredByFixed(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return null;
    const points = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]
      .map(([fx, fy]) => [rect.left + rect.width * fx, rect.top + rect.height * fy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    if (points.length < 5) return null;
    let coverer = null;
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (!top || element.contains(top) || top.contains(element)) return null;
      let fixed = null;
      for (let cursor = top; cursor && cursor !== document.body; cursor = cursor.parentElement) {
        const position = getComputedStyle(cursor).position;
        if (position === 'fixed' || position === 'sticky') { fixed = cursor; break; }
      }
      if (!fixed) return null;
      coverer = coverer ?? fixed;
    }
    const label = coverer.id ? `#${coverer.id}` : coverer.localName + (typeof coverer.className === 'string' && coverer.className.trim() ? `.${coverer.className.trim().split(/\s+/)[0]}` : '');
    return { selector: label };
  });
}

function indicatorFinding(info, result, outcome, options, adapterName, scenarioName) {
  const failed = outcome === 'failed';
  return {
    ruleId: 'wcagate/runtime/focus-indicator-review',
    title: failed ? 'Keyboard focus is not visible' : 'Keyboard focus indicator is weak or could not be measured',
    description: failed
      ? `Focusing ${info.role} "${info.name}" changed ${result.changedPixels} of ${result.totalPixels} pixels around it; there is no visible focus indicator (WCAG 2.4.7).`
      : result.reason
        ? `The focus indicator could not be measured (${result.reason}).`
        : `Focus changed the pixels around ${info.role} "${info.name}", but only ${result.strongPixels} of ${result.neededStrongPixels} needed pixels differ by 3:1 or more (strongest ${result.strongestRatio}:1).`,
    outcome,
    severity: options.severity ?? 'serious',
    confidence: failed ? 'high' : 'medium',
    automation: failed ? 'automatic' : 'semi-automatic',
    target: { adapter: adapterName, routeOrScene: scenarioName, selectorOrNode: info.selector },
    // Scope follows the highest level listed: a missing indicator is 2.4.7 (AA, gates AA runs); a visible but sub-3:1
    // indicator only misses 2.4.13 (AAA), so it must not hold an AA gate open.
    standards: result.verdict === 'weak'
      ? [{ document: 'WCAG-2.2', requirement: '2.4.13', level: 'AAA', mapping: 'secondary' }, { document: 'INTERNAL', requirement: 'focus-indicator-review', mapping: 'policy' }]
      : [{ document: 'WCAG-2.2', requirement: '2.4.7', level: 'AA', mapping: 'secondary' }, { document: 'INTERNAL', requirement: 'focus-indicator-review', mapping: 'policy' }],
    evidence: {
      id: 'focus-indicator',
      selector: info.selector,
      role: info.role,
      name: info.name,
      method: result.method,
      verdict: result.verdict,
      reason: result.reason,
      changedPixels: result.changedPixels,
      strongPixels: result.strongPixels,
      totalPixels: result.totalPixels,
      strongestRatio: result.strongestRatio,
      styleHeuristic: { outline: info.outline, boxShadow: info.boxShadow, found: info.heuristicIndicator }
    },
    remediation: failed
      ? 'Add a visible :focus-visible style: for example outline: 3px solid <color with 3:1 contrast against the surface>; outline-offset: 2px. Do not set outline: none without a replacement.'
      : 'Strengthen the :focus-visible style (thicker outline or an outline color with at least 3:1 contrast against the unfocused state), then re-run.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
    tags: ['focus', 'keyboard', 'runtime-probe', 'pixel-measured']
  };
}

function offscreenFinding(info, options, adapterName, scenarioName) {
  return {
    ruleId: 'wcagate/runtime/focus-offscreen',
    title: 'Keyboard focus lands on an element the user cannot see',
    description: `Tabbing reached ${info.role} "${info.name}", but it is outside the visible viewport even after the browser scrolled to it. This is typical of a closed off-canvas menu or drawer whose controls are still focusable (WCAG 2.4.7).`,
    outcome: 'failed',
    severity: options.severity ?? 'moderate',
    confidence: 'medium',
    automation: 'automatic',
    target: { adapter: adapterName, routeOrScene: scenarioName, selectorOrNode: info.selector },
    standards: [{ document: 'WCAG-2.2', requirement: '2.4.7', level: 'AA', mapping: 'secondary' }],
    evidence: { id: 'focus-offscreen', selector: info.selector, role: info.role, name: info.name, rect: info.rect, viewport: info.viewport },
    remediation: 'Take closed drawers and menus out of the tab order: add the inert attribute (or visibility:hidden / display:none) while closed, and remove it when opened.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
    tags: ['focus', 'keyboard', 'runtime-probe', 'off-canvas']
  };
}

function obscuredFinding(info, coverer, options, adapterName, scenarioName) {
  return {
    ruleId: 'wcagate/runtime/focus-not-obscured',
    title: 'Focused element is hidden behind a fixed or sticky element',
    description: `${info.role} "${info.name}" is completely covered by ${coverer.selector} when it receives keyboard focus (WCAG 2.4.11).`,
    outcome: 'failed',
    severity: options.severity ?? 'serious',
    confidence: 'high',
    automation: 'automatic',
    target: { adapter: adapterName, routeOrScene: scenarioName, selectorOrNode: info.selector },
    standards: [{ document: 'WCAG-2.2', requirement: '2.4.11', level: 'AA', mapping: 'secondary' }],
    evidence: { id: 'focus-not-obscured', selector: info.selector, name: info.name, coveredBy: coverer.selector },
    remediation: 'Add scroll-padding-top/bottom equal to the sticky bar height (html { scroll-padding-block: <height> }) or make the sticky element non-overlapping so focused controls scroll into the clear.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html',
    tags: ['focus', 'keyboard', 'runtime-probe', 'sticky-header']
  };
}
