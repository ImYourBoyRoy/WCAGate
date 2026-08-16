// ./src/core/run-overrides.mjs
/**
 * CLI overlays for website runs (Astro, Vite, static, live URLs).
 *
 * Lets operators pass --base-url and --routes without rewriting config.
 * Does not read Portable Web Toolkit site profiles.
 */

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
 * @param {{ baseUrl?: string, routes?: string | string[] }} overlays
 */
export function applyRunOverrides(config, overlays = {}) {
  const baseURL = normalizeBaseUrl(overlays.baseUrl);
  const scenarios = overlays.routes === undefined ? null : scenariosFromRoutes(overlays.routes);
  if (!baseURL && !scenarios) return config;
  for (const adapter of config.adapters ?? []) {
    if (adapter.type !== 'playwright-axe') continue;
    if (baseURL) {
      adapter.baseURL = baseURL;
      if (adapter.webServer && typeof adapter.webServer === 'object') {
        adapter.webServer.url = baseURL;
      }
    }
    if (scenarios) adapter.scenarios = scenarios;
  }
  return config;
}
