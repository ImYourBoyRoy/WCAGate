// ./src/adapters/runtime-probes.mjs
/**
 * Rendered-page probes for WCAG criteria axe-core cannot decide on its own.
 *
 *  - reflow       (1.4.10 Reflow, AA): no two-dimensional scrolling at a 320 CSS px wide viewport
 *  - textSpacing  (1.4.12 Text Spacing, AA): no clipped or lost text after the user-override spacing is applied
 *
 * Both restore the page (viewport, injected stylesheet) before returning, so later probes see the original state.
 */

const SPACING_CSS = `
*, *::before, *::after {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
p, li, dd { margin-bottom: 2em !important; }
`;

export async function runReflowProbe(page, options, adapterName, scenarioName) {
  const width = options.width ?? 320;
  const height = options.height ?? 800;
  const tolerance = options.tolerance ?? 1;
  const original = page.viewportSize();
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(options.settleMs ?? 200);
  let measured;
  try {
    measured = await page.evaluate(({ limit, slack, ignoreSelector }) => {
      const cssPath = (element) => {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          let part = current.localName;
          const parent = current.parentElement;
          if (parent) {
            const siblings = [...parent.children].filter((candidate) => candidate.localName === current.localName);
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
          parts.unshift(part);
          current = parent;
        }
        return parts.join(' > ');
      };
      const scrollRoot = document.scrollingElement || document.documentElement;
      const scrollWidth = scrollRoot.scrollWidth;
      const clientWidth = scrollRoot.clientWidth;
      const before = window.scrollX;
      window.scrollTo(scrollWidth, window.scrollY);
      const scrollable = window.scrollX > 0;
      window.scrollTo(before, window.scrollY);

      const contained = (element) => {
        for (let cursor = element.parentElement; cursor && cursor !== document.body && cursor !== document.documentElement; cursor = cursor.parentElement) {
          const overflowX = getComputedStyle(cursor).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return true;
        }
        return false;
      };
      const offenders = [];
      for (const element of document.body.querySelectorAll('*')) {
        if (ignoreSelector && element.closest(ignoreSelector)) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.right <= limit + slack) continue;
        if (contained(element)) continue;
        const parent = element.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : null;
        const isSource = !parentRect || parent === document.body || parentRect.right <= limit + slack;
        if (!isSource) continue;
        offenders.push({
          selector: cssPath(element),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
        });
        if (offenders.length >= 8) break;
      }
      return { scrollWidth, clientWidth, scrollable, offenders };
    }, { limit: width, slack: tolerance, ignoreSelector: options.ignoreSelector ?? null });
  } finally {
    if (original) await page.setViewportSize(original);
  }

  const overflow = measured.scrollable && measured.scrollWidth > measured.clientWidth + tolerance;
  const findings = [];
  if (overflow) {
    findings.push({
      ruleId: 'wcagate/runtime/reflow',
      title: `Page scrolls horizontally at ${width} CSS px wide`,
      description: `Content is ${measured.scrollWidth}px wide in a ${measured.clientWidth}px viewport (WCAG 1.4.10 requires no two-dimensional scrolling at 320 CSS px, except for content that needs two dimensions such as data tables, maps, and diagrams).`,
      outcome: 'failed',
      severity: options.severity ?? 'serious',
      confidence: measured.offenders.length > 0 ? 'high' : 'medium',
      automation: 'automatic',
      target: {
        adapter: adapterName,
        routeOrScene: scenarioName,
        selectorOrNode: measured.offenders[0]?.selector
      },
      standards: [{ document: 'WCAG-2.2', requirement: '1.4.10', level: 'AA', mapping: 'secondary' }],
      evidence: { id: 'reflow', viewportWidth: width, ...measured },
      remediation: 'Let the named elements wrap or shrink (min-width: 0, max-width: 100%, overflow-wrap: anywhere, responsive grids). If an element truly needs two-dimensional layout (data table, map), wrap it in its own overflow:auto region and suppress with a documented reason.',
      helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
      tags: ['runtime-probe', 'reflow', 'responsive']
    });
  }
  return { findings, surfaceCount: 1 };
}

export async function runTextSpacingProbe(page, options, adapterName, scenarioName) {
  const measured = await page.evaluate(({ css, ignoreSelector }) => {
    const cssPath = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.localName;
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((candidate) => candidate.localName === current.localName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    };
    const clippedElements = () => {
      const found = new Map();
      for (const element of document.body.querySelectorAll('*')) {
        if (ignoreSelector && element.closest(ignoreSelector)) continue;
        const hasText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (!hasText) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const clipsY = style.overflowY !== 'visible' && style.overflowY !== 'auto' && style.overflowY !== 'scroll';
        const clipsX = style.overflowX !== 'visible' && style.overflowX !== 'auto' && style.overflowX !== 'scroll';
        const hiddenY = clipsY && element.scrollHeight > element.clientHeight + 1;
        const hiddenX = clipsX && element.scrollWidth > element.clientWidth + 1 && style.textOverflow !== 'ellipsis';
        if (hiddenY || hiddenX) {
          found.set(cssPath(element), {
            selector: cssPath(element),
            text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            axis: hiddenY && hiddenX ? 'both' : hiddenY ? 'vertical' : 'horizontal'
          });
        }
      }
      return found;
    };

    const baseline = clippedElements();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    let spaced;
    try {
      spaced = clippedElements();
    } finally {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
    }
    const introduced = [];
    for (const [key, value] of spaced) if (!baseline.has(key)) introduced.push(value);
    return { baselineClipped: baseline.size, introduced: introduced.slice(0, 12), introducedTotal: introduced.length };
  }, { css: options.css ?? SPACING_CSS, ignoreSelector: options.ignoreSelector ?? null });

  const findings = measured.introduced.map((entry) => ({
    ruleId: 'wcagate/runtime/text-spacing',
    title: 'Text is clipped when the user overrides text spacing',
    description: `With line-height 1.5, letter-spacing 0.12em, word-spacing 0.16em, and paragraph spacing 2em, "${entry.text}" is clipped (${entry.axis}: content ${entry.axis === 'horizontal' ? entry.scrollWidth : entry.scrollHeight}px in a ${entry.axis === 'horizontal' ? entry.clientWidth : entry.clientHeight}px box).`,
    outcome: 'failed',
    severity: options.severity ?? 'serious',
    confidence: 'medium',
    automation: 'automatic',
    target: { adapter: adapterName, routeOrScene: scenarioName, selectorOrNode: entry.selector },
    standards: [{ document: 'WCAG-2.2', requirement: '1.4.12', level: 'AA', mapping: 'secondary' }],
    evidence: { id: 'text-spacing', ...entry },
    remediation: 'Remove fixed height/max-height and overflow:hidden from text containers (use min-height), or let the container grow with its content.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html',
    tags: ['runtime-probe', 'text-spacing']
  }));
  return { findings, surfaceCount: 1 };
}
