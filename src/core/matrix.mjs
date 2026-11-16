// ./src/core/matrix.mjs
/**
 * Scenario matrix expansion for playwright-axe adapters.
 *
 * One scenario list plus `matrix: { colorSchemes, viewports }` becomes every combination, so a site is checked in
 * light and dark and at phone width without writing each scenario by hand. Expansion runs inside the adapter,
 * after CLI overrides such as --routes, so overrides keep the matrix.
 */

export const VIEWPORT_PRESETS = Object.freeze({
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 }
});

export const COLOR_SCHEMES = Object.freeze(['light', 'dark']);

export function normalizeViewport(entry) {
  if (typeof entry === 'string') {
    const preset = VIEWPORT_PRESETS[entry];
    return preset ? { name: entry, ...preset } : null;
  }
  if (entry && typeof entry === 'object' && Number.isInteger(entry.width) && Number.isInteger(entry.height)) {
    return { name: entry.name ?? `${entry.width}x${entry.height}`, width: entry.width, height: entry.height };
  }
  return null;
}

/**
 * @param {object[]} scenarios
 * @param {{ colorSchemes?: string[], viewports?: Array<string | { name?: string, width: number, height: number }> } | undefined} matrix
 */
export function expandScenarioMatrix(scenarios, matrix) {
  if (!matrix) return scenarios;
  const schemes = matrix.colorSchemes?.length ? matrix.colorSchemes : [undefined];
  const viewports = matrix.viewports?.length ? matrix.viewports.map(normalizeViewport) : [undefined];
  const expanded = [];
  for (const scenario of scenarios) {
    const schemeAxis = scenario.colorScheme ? [scenario.colorScheme] : schemes;
    const viewportAxis = scenario.viewport ? [normalizeViewport(scenario.viewport)] : viewports;
    for (const colorScheme of schemeAxis) {
      for (const viewport of viewportAxis) {
        const labels = [];
        if (colorScheme && !scenario.colorScheme && matrix.colorSchemes?.length) labels.push(colorScheme);
        if (viewport && !scenario.viewport && matrix.viewports?.length) labels.push(viewport.name);
        expanded.push({
          ...scenario,
          name: labels.length > 0 ? `${scenario.name} [${labels.join(', ')}]` : scenario.name,
          ...(colorScheme ? { colorScheme } : {}),
          ...(viewport ? { viewport } : {})
        });
      }
    }
  }
  return expanded;
}
