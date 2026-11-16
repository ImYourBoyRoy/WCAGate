// ./src/core/run-overrides.mjs
/**
 * CLI overlays for website runs (Astro, Vite, static, live URLs).
 *
 * Lets operators pass --base-url and --routes without rewriting config.
 * Does not read Portable Web Toolkit site profiles.
 */

import { COLOR_SCHEMES, normalizeViewport } from './matrix.mjs';

export function normalizeBaseUrl(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim().replace(/\/$/, '');
}

export function scenariosFromRoutes(routes) {
  const list = Array.isArray(routes)
    ? routes
    : String(routes || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  if (list.length === 0) return null;
  return list.map((route, index) => {
    const pathname = route.startsWith('/') ? route : `/${route}`;
    const name = pathname === '/'
      ? 'home'
      : pathname.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `route-${index + 1}`;
    return { name, path: pathname, steps: [] };
  });
}

export function configUsesPlaywright(config) {
  return (config?.adapters ?? []).some((adapter) => adapter.type === 'playwright-axe');
}

/**
 * Mutates playwright-axe adapters in a loaded config.
 * @param {object} config
 * @param {{ baseUrl?: string, routes?: string | string[], colorSchemes?: string | string[], viewports?: string | string[] }} overlays
 */
export function applyRunOverrides(config, overlays = {}) {
  const baseURL = normalizeBaseUrl(overlays.baseUrl);
  const scenarios = overlays.routes === undefined ? null : scenariosFromRoutes(overlays.routes);
  const colorSchemes = splitList(overlays.colorSchemes);
  const viewports = splitList(overlays.viewports);
  const matrix = colorSchemes.length > 0 || viewports.length > 0
    ? { ...(colorSchemes.length > 0 ? { colorSchemes } : {}), ...(viewports.length > 0 ? { viewports } : {}) }
    : null;
  if (matrix) {
    const errors = [];
    for (const scheme of colorSchemes) if (!COLOR_SCHEMES.includes(scheme)) errors.push(`--color-schemes: "${scheme}" must be light or dark`);
    for (const viewport of viewports) if (!normalizeViewport(viewport)) errors.push(`--viewports: "${viewport}" must be mobile, tablet, or desktop`);
    if (errors.length > 0) throw new Error(errors.join('; '));
  }
  if (!baseURL && !scenarios && !matrix) return config;
  for (const adapter of config.adapters ?? []) {
    if (adapter.type !== 'playwright-axe') continue;
    if (baseURL) {
      adapter.baseURL = baseURL;
      if (adapter.webServer && typeof adapter.webServer === 'object') {
        adapter.webServer.url = baseURL;
        // An explicit --base-url names a server the caller runs: adopt it instead of choosing another port.
        adapter.webServer.autoPort = false;
        adapter.webServer.reuseExistingServer = true;
      }
    }
    if (scenarios) adapter.scenarios = scenarios;
    if (matrix) adapter.matrix = { ...(adapter.matrix ?? {}), ...matrix };
  }
  return config;
}

export function splitList(value) {
  if (value === undefined || value === null || value === true) return [];
  return (Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

/** First playwright-axe baseURL in a loaded config, for deriving the sitemap origin. */
export function firstBaseUrl(config) {
  return (config?.adapters ?? []).find((adapter) => adapter.type === 'playwright-axe' && adapter.baseURL)?.baseURL ?? null;
}
