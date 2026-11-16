// ./src/core/sitemap.mjs
/**
 * Route discovery from sitemap.xml for website runs.
 *
 * `wcagate run --base-url http://127.0.0.1:4321 --sitemap` audits every page the site lists instead of a hand-kept
 * route list. Reads the sitemap from the base URL (or a given URL/file), follows one level of sitemap index,
 * and returns paths. A production sitemap lists production URLs; they are mapped onto the audited origin. Pages on a
 * host other than the site's own (the host most entries use), the sitemap's host, or the audited origin are skipped and counted.
 */

import { promises as fs } from 'node:fs';

const MAX_BYTES = 5 * 1024 * 1024;

export function extractLocs(xml) {
  const locs = [];
  for (const match of String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
    locs.push(decodeEntities(match[1]));
  }
  return locs;
}

function decodeEntities(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * @param {object} options
 * @param {string} options.baseUrl Origin that pages must belong to (the audited server).
 * @param {string} [options.source] Sitemap URL or file path; default `${baseUrl}/sitemap.xml`, then `/sitemap-index.xml`.
 * @param {number} [options.limit] Maximum routes (default 50).
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ routes: string[], source: string, truncated: boolean, skippedCrossOrigin: number }>}
 */
export async function routesFromSitemap({ baseUrl, source, limit = 50, fetchImpl = globalThis.fetch }) {
  const origin = new URL(baseUrl).origin;
  const candidates = source ? [source] : [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`];
  const errors = [];
  for (const candidate of candidates) {
    try {
      const result = await collect(candidate, origin, fetchImpl, 0);
      if (result.pages.length === 0) throw new Error(`${candidate} lists no pages`);
      const unique = [...new Set(result.pages)];
      return {
        routes: unique.slice(0, limit),
        source: candidate,
        truncated: unique.length > limit,
        skippedCrossOrigin: result.crossOrigin
      };
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`Could not read a sitemap for ${origin}: ${errors.join('; ')}`);
}

async function collect(location, origin, fetchImpl, depth) {
  const xml = await load(location, fetchImpl);
  const locs = extractLocs(xml);
  if (isSitemapIndex(xml)) {
    if (depth >= 1) throw new Error('Nested sitemap indexes deeper than one level are not followed');
    const pages = [];
    let crossOrigin = 0;
    for (const child of locs.slice(0, 20)) {
      const target = rewriteToOrigin(child, origin);
      if (!target) {
        crossOrigin += 1;
        continue;
      }
      const result = await collect(target, origin, fetchImpl, depth + 1);
      pages.push(...result.pages);
      crossOrigin += result.crossOrigin;
    }
    return { pages, crossOrigin };
  }
  // A preview serves the production sitemap, so its pages usually live on the production host. The site's own host
  // is the one most pages use; the audited origin and the sitemap's own origin are accepted too.
  const hostCounts = new Map();
  for (const loc of locs) {
    try {
      const host = new URL(loc).origin;
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    } catch {
      // relative entries are handled below
    }
  }
  const dominant = [...hostCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const own = /^https?:\/\//i.test(location) ? new URL(location).origin : null;
  const allowed = new Set([origin, own, dominant].filter(Boolean));
  const pages = [];
  let crossOrigin = 0;
  for (const loc of locs) {
    const pathname = toPathname(loc, allowed, false);
    if (pathname === null) crossOrigin += 1;
    else pages.push(pathname);
  }
  return { pages, crossOrigin };
}

/** Path (trailing slash kept as listed) when the page belongs to an allowed host; null otherwise. */
function toPathname(loc, allowed, anyHost) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    return loc.startsWith('/') ? loc : null;
  }
  if (!anyHost && !allowed.has(url.origin)) return null;
  return `${url.pathname}${url.search}`;
}

function rewriteToOrigin(loc, origin) {
  try {
    const url = new URL(loc);
    return `${origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function load(location, fetchImpl) {
  if (/^https?:\/\//i.test(location)) {
    const response = await fetchImpl(location, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' } });
    if (!response.ok) throw new Error(`${location} returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error(`${location} is larger than ${MAX_BYTES} bytes`);
    return text;
  }
  const stat = await fs.stat(location);
  if (stat.size > MAX_BYTES) throw new Error(`${location} is larger than ${MAX_BYTES} bytes`);
  return fs.readFile(location, 'utf8');
}
