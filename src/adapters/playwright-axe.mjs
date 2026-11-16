import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AdapterError } from '../core/errors.mjs';
import { ensureDirectory, normalizePath } from '../core/filesystem.mjs';
import { importOptional } from '../core/dependencies.mjs';
import { startManagedWebServer } from '../core/web-server.mjs';
import { axeRemediationWithFrostHint } from '../core/frost-ui.mjs';
import { axeRunOnlyForProfile, levelFromAxeTag } from '../core/profile.mjs';
import { resolveContrastFindings } from '../core/contrast-resolver.mjs';
import { expandScenarioMatrix } from '../core/matrix.mjs';
import { runReflowProbe, runTextSpacingProbe } from './runtime-probes.mjs';
import { runFocusIndicatorProbe } from './focus-probe.mjs';
import { settlePage } from './settle.mjs';

function defaultConcurrency() {
  return Math.min(4, Math.max(1, (os.availableParallelism?.() ?? 2) - 1));
}

/** Site-level checks that need more than one page: duplicate titles across distinct routes (WCAG 2.4.2). */
function crossRouteFindings(scenarioMetadata, adapterName) {
  const byTitle = new Map();
  const seenPaths = new Set();
  for (const meta of scenarioMetadata) {
    const page = meta.page;
    if (!page || !page.title || meta.httpStatus >= 400) continue;
    const base = meta.name.replace(/\s\[[^\]]*\]$/, '');
    if (seenPaths.has(base)) continue;
    seenPaths.add(base);
    const list = byTitle.get(page.title) ?? [];
    list.push({ scenario: base, path: page.path });
    byTitle.set(page.title, list);
  }
  const findings = [];
  for (const [title, pages] of byTitle) {
    if (pages.length < 2) continue;
    findings.push({
      ruleId: 'wcagate/site/duplicate-title',
      title: 'Several pages share the same <title>',
      description: `${pages.length} routes are titled "${title}": ${pages.map((entry) => entry.path).join(', ')}. Page titles should identify each page (WCAG 2.4.2).`,
      outcome: 'failed',
      severity: 'advisory',
      confidence: 'medium',
      automation: 'automatic',
      target: { adapter: adapterName, routeOrScene: pages[0].scenario },
      standards: [{ document: 'WCAG-2.2', requirement: '2.4.2', level: 'A', mapping: 'secondary' }],
      evidence: { id: 'duplicate-title', title, routes: pages.map((entry) => entry.path) },
      remediation: 'Give each page a distinct title that names its topic or purpose (for example "Pricing | Brand" and "About | Brand"). Advisory: it does not block the default gate.',
      helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html',
      tags: ['site-level', 'titles']
    });
  }
  return findings;
}

export async function runPlaywrightAxeAdapter(config, context) {
  const managedServer = await startManagedWebServer(config.webServer, context, config.baseURL);
  // autoPort may have moved the server off a busy port; scenarios then resolve against the origin it really got.
  const baseURL = managedServer.baseURL ?? config.baseURL;
  try {
    const playwright = context.modules?.playwright
      ?? await importOptional('playwright', 'the rendered browser accessibility adapter', context.importModule);
    const axeModule = context.modules?.axePlaywright
      ?? await importOptional('@axe-core/playwright', 'the rendered browser accessibility adapter', context.importModule);
    const AxeBuilder = axeModule.AxeBuilder ?? axeModule.default;
    if (typeof AxeBuilder !== 'function') throw new AdapterError('@axe-core/playwright did not expose AxeBuilder');

    const browserName = config.browser ?? 'chromium';
    // Package-name import exposes browsers on the namespace; file-URL import
    // (createProjectImporter) often nests them under .default (CJS interop).
    const browserType = playwright?.[browserName] ?? playwright?.default?.[browserName];
    if (!browserType || typeof browserType.launch !== 'function') {
      throw new AdapterError(`Unsupported Playwright browser: ${browserName}`);
    }
    if (!Array.isArray(config.scenarios) || config.scenarios.length === 0) {
      throw new AdapterError('playwright-axe adapter requires at least one scenario');
    }
    const scenarioList = expandScenarioMatrix(config.scenarios, config.matrix);

    const browser = await browserType.launch(config.launchOptions ?? {});
    const browserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...config.contextOptions
    });

    const findings = [];
    let surfaceCount = 0;
    const scenarios = [];
    try {
      // Scenarios are independent pages in one browser context; run a few at a time and keep results in config order.
      const limit = Math.max(1, Math.min(scenarioList.length, config.concurrency ?? defaultConcurrency()));
      const results = new Array(scenarioList.length);
      let next = 0;
      let failure = null;
      const worker = async () => {
        while (failure === null) {
          const index = next;
          next += 1;
          if (index >= scenarioList.length) return;
          try {
            results[index] = await runScenario({ scenario: scenarioList[index], config, baseURL, context, browserContext, AxeBuilder });
          } catch (error) {
            failure = failure ?? error;
          }
        }
      };
      await Promise.all(Array.from({ length: limit }, worker));
      if (failure) throw failure;
      for (const result of results) {
        findings.push(...result.findings);
        surfaceCount += result.surfaceCount;
        scenarios.push(result.metadata);
      }
      findings.push(...crossRouteFindings(scenarios, context.adapterName));
    } finally {
      try {
        await browserContext.close();
      } finally {
        await browser.close();
      }
    }

    return {
      findings,
      surfaceCount,
      metadata: { browser: browserName, scenarios, webServer: managedServer.metadata }
    };
  } finally {
    await managedServer.close();
  }
}

async function runScenario({ scenario, config, baseURL = config.baseURL, context, browserContext, AxeBuilder }) {
  if (!scenario || typeof scenario !== 'object') throw new AdapterError('Each Playwright scenario must be an object');
  if (typeof scenario.name !== 'string' || scenario.name.trim() === '') throw new AdapterError('Each Playwright scenario requires name');

  const page = await browserContext.newPage();
  const findings = [];
  const started = Date.now();
  try {
    const url = scenario.url ?? resolveScenarioUrl(baseURL, scenario.path);
    if (scenario.viewport) await page.setViewportSize({ width: scenario.viewport.width, height: scenario.viewport.height });
    const media = {};
    if (scenario.colorScheme) media.colorScheme = scenario.colorScheme;
    if (scenario.reducedMotion) media.reducedMotion = scenario.reducedMotion;
    if (scenario.forcedColors) media.forcedColors = scenario.forcedColors;
    if (Object.keys(media).length > 0) await page.emulateMedia(media);
    const response = await page.goto(url, { waitUntil: scenario.waitUntil ?? 'domcontentloaded', timeout: scenario.timeoutMs ?? config.timeoutMs ?? 30_000 });
    const status = typeof response?.status === 'function' ? response.status() : null;
    const expected = [].concat(scenario.expectStatus ?? []);
    if (status !== null && (expected.length > 0 ? !expected.includes(status) : status >= 400)) {
      // A 404/500 route would otherwise be audited as if it were the intended page and "pass" on an error screen.
      findings.push(statusFinding({ status, expected, url, scenarioName: scenario.name, adapterName: context.adapterName }));
      return {
        findings,
        surfaceCount: 1,
        metadata: { name: scenario.name, url, durationMs: Date.now() - started, httpStatus: status, skipped: 'unexpected-http-status' }
      };
    }
    if (typeof scenario.setup === 'function') await scenario.setup(page, context);
    for (const step of scenario.steps ?? []) await executeStep(page, step);
    const settle = await settlePage(page, scenario.settle ?? config.settle);

    let builder = new AxeBuilder({ page });
    const runOnly = scenario.runOnly ?? config.runOnly ?? axeRunOnlyForProfile(context.profile);
    if (runOnly.length > 0 && typeof builder.withTags === 'function') builder = builder.withTags(runOnly);
    for (const selector of scenario.include ?? config.include ?? []) builder = builder.include(selector);
    for (const selector of scenario.exclude ?? config.exclude ?? []) builder = builder.exclude(selector);
    if (scenario.axeOptions ?? config.axeOptions) builder = builder.options(scenario.axeOptions ?? config.axeOptions);

    const axeResults = await builder.analyze();
    const axeFindings = mapAxeResults(axeResults, {
      adapterName: context.adapterName,
      scenarioName: scenario.name,
      url
    });
    const contrastOptions = scenario.probes?.contrastResolution ?? config.probes?.contrastResolution ?? {};
    const resolution = await resolveContrastFindings({ page, findings: axeFindings, options: contrastOptions });
    findings.push(...resolution.findings);
    let probeSurface = 0;
    const targetProbe = scenario.probes?.targetSizeEnhanced ?? config.probes?.targetSizeEnhanced;
    if (targetProbe?.enabled) {
      const probeResult = await runTargetSizeProbe(page, targetProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
    }

    let focusSummary;
    const focusProbe = scenario.probes?.focusIndicatorReview ?? config.probes?.focusIndicatorReview;
    if (focusProbe?.enabled) {
      const probeResult = await runFocusIndicatorProbe(page, focusProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
      focusSummary = probeResult.summary;
    }

    const reflowProbe = scenario.probes?.reflow ?? config.probes?.reflow;
    if (reflowProbe?.enabled) {
      const probeResult = await runReflowProbe(page, reflowProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
    }

    const spacingProbe = scenario.probes?.textSpacing ?? config.probes?.textSpacing;
    if (spacingProbe?.enabled) {
      const probeResult = await runTextSpacingProbe(page, spacingProbe, context.adapterName, scenario.name);
      findings.push(...probeResult.findings);
      probeSurface += probeResult.surfaceCount;
    }

    let screenshot;
    if ((scenario.screenshotOnFinding ?? config.screenshotOnFinding) && findings.some((finding) => finding.outcome !== 'passed')) {
      screenshot = await captureScenarioScreenshot(page, context, scenario.name);
      for (const finding of findings) {
        if (!finding.evidence || typeof finding.evidence !== 'object') finding.evidence = { value: finding.evidence };
        finding.evidence.screenshot = screenshot;
      }
    }

    const pageMeta = await page.evaluate(() => ({
      title: document.title.replace(/\s+/g, ' ').trim(),
      lang: document.documentElement.getAttribute('lang') || '',
      h1: document.querySelectorAll('h1').length,
      path: location.pathname
    })).catch(() => null);

    const axeSurface = surfaceCountFromAxe(axeResults);
    return {
      findings,
      surfaceCount: Math.max(axeSurface, 1) + probeSurface,
      metadata: {
        name: scenario.name,
        url,
        durationMs: Date.now() - started,
        axe: {
          violations: axeResults.violations?.length ?? 0,
          incomplete: axeResults.incomplete?.length ?? 0,
          passes: axeResults.passes?.length ?? 0,
          inapplicable: axeResults.inapplicable?.length ?? 0
        },
        contrast: resolution.summary.examined > 0
          ? { ...resolution.summary, resolvedPasses: resolution.passes.slice(0, 50) }
          : undefined,
        focus: focusSummary,
        httpStatus: status,
        settle,
        page: pageMeta ?? undefined,
        colorScheme: scenario.colorScheme,
        viewport: scenario.viewport,
        screenshot
      }
    };
  } catch (error) {
    throw new AdapterError(`Playwright scenario "${scenario.name}" failed: ${error.message}`, { scenario: scenario.name }, error);
  } finally {
    try {
      if (typeof scenario.teardown === 'function') await scenario.teardown(page, context);
    } finally {
      await page.close();
    }
  }
}

function statusFinding({ status, expected, url, scenarioName, adapterName }) {
  return {
    ruleId: 'wcagate/runtime/http-status',
    title: `Route returned HTTP ${status}`,
    description: expected.length > 0
      ? `${url} returned ${status}; the scenario expects ${expected.join(' or ')}. The error page was not audited as a normal page.`
      : `${url} returned ${status}. The page was not audited, because auditing an error screen proves nothing about the real page.`,
    outcome: 'executionError',
    severity: 'serious',
    confidence: 'high',
    automation: 'automatic',
    target: { adapter: adapterName, routeOrScene: scenarioName, state: url },
    standards: [{ document: 'INTERNAL', requirement: 'route-reachable', mapping: 'policy' }],
    evidence: { id: 'http-status', status, expected },
    remediation: 'Fix the route or the preview server (is the build current and served from the right directory?). To audit an intentional error page, set expectStatus: 404 on that scenario.',
    tags: ['configuration', 'execution', 'http-status']
  };
}

function mapAxeResults(results, target) {
  const findings = [];
  for (const violation of results.violations ?? []) {
    for (const node of violation.nodes ?? []) {
      findings.push(mapAxeNode(violation, node, 'failed', target));
    }
  }
  for (const incomplete of results.incomplete ?? []) {
    for (const node of incomplete.nodes ?? []) {
      findings.push(mapAxeNode(incomplete, node, 'cantTell', target));
    }
  }
  return findings;
}

function mapAxeNode(rule, node, outcome, target) {
  const tags = [...new Set(rule.tags ?? [])].sort();
  const frostTags = outcome === 'cantTell' && rule.id === 'color-contrast'
    ? ['frost-ui-review', 'glassmorphism-friendly']
    : [];
  return {
    ruleId: `axe/${rule.id}`,
    ruleVersion: 'axe-core',
    title: rule.help ?? rule.id,
    description: rule.description ?? '',
    outcome,
    severity: mapImpact(rule.impact ?? node.impact),
    confidence: outcome === 'failed' ? 'high' : 'medium',
    automation: outcome === 'failed' ? 'automatic' : 'semi-automatic',
    target: {
      adapter: target.adapterName,
      routeOrScene: target.scenarioName,
      state: target.url,
      selectorOrNode: node.target
    },
    standards: standardsFromAxeTags(tags),
    evidence: {
      id: rule.id,
      impact: rule.impact ?? node.impact,
      html: node.html,
      failureSummary: node.failureSummary,
      any: compactChecks(node.any),
      all: compactChecks(node.all),
      none: compactChecks(node.none)
    },
    remediation: axeRemediationWithFrostHint(rule, node, outcome),
    helpUrl: rule.helpUrl,
    tags: ['axe-core', ...tags, ...frostTags]
  };
}

/** Keeps what a model needs from an axe check (id, message, measured data) and drops the repeated relatedNodes HTML. */
function compactChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return checks;
  return checks.map((check) => ({
    id: check.id,
    message: check.message,
    data: check.data,
    related: (check.relatedNodes ?? []).slice(0, 3).map((node) => (Array.isArray(node.target) ? node.target.join(' ') : String(node.html ?? '').slice(0, 80)))
  }));
}

function standardsFromAxeTags(tags) {
  const level = tags.map((tag) => levelFromAxeTag(tag)).find(Boolean) ?? null;
  const standards = [];
  for (const tag of tags) {
    const match = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (!match) continue;
    standards.push({
      document: 'WCAG-2.2',
      requirement: `${match[1]}.${match[2]}.${match[3]}`,
      ...(level ? { level } : {}),
      mapping: 'secondary'
    });
  }
  return standards;
}

function mapImpact(impact) {
  return {
    critical: 'critical',
    serious: 'serious',
    moderate: 'moderate',
    minor: 'minor'
  }[impact] ?? 'moderate';
}

function surfaceCountFromAxe(results) {
  const groups = ['violations', 'incomplete', 'passes', 'inapplicable'];
  return groups.reduce((total, key) => total + (results[key] ?? []).reduce((count, rule) => count + (rule.nodes?.length ?? 0), 0), 0);
}

async function runTargetSizeProbe(page, options, adapterName, scenarioName) {
  const minimum = positiveInteger(options.minimum, 44, 'targetSizeEnhanced.minimum');
  const selector = options.selector ?? [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const targets = await page.evaluate(({ selector: query, minimum: min, ignoreSelector }) => {
    function cssPath(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
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
    }

    return [...document.querySelectorAll(query)].flatMap((element) => {
      if (ignoreSelector && element.matches(ignoreSelector)) return [];
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const hidden = style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width <= 0
        || rect.height <= 0
        || element.closest('[aria-hidden="true"]');
      const disabled = element.matches(':disabled,[aria-disabled="true"]');
      if (hidden || disabled) return [];
      return [{
        selector: cssPath(element),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        belowMinimum: rect.width < min || rect.height < min,
        text: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120)
      }];
    });
  }, { selector, minimum, ignoreSelector: options.ignoreSelector ?? null });

  const findings = targets.filter((target) => target.belowMinimum).map((target) => ({
    ruleId: 'wcagate/runtime/target-size-enhanced',
    title: 'Rendered target is below the enhanced size policy',
    description: `Rendered size is ${target.width} × ${target.height} CSS px; configured minimum is ${minimum} × ${minimum}.`,
    outcome: 'failed',
    severity: options.severity ?? 'moderate',
    confidence: 'medium',
    automation: 'automatic',
    target: {
      adapter: adapterName,
      routeOrScene: scenarioName,
      selectorOrNode: target.selector
    },
    standards: [
      { document: 'WCAG-2.2', requirement: '2.5.5', level: 'AAA', mapping: 'secondary' },
      { document: 'INTERNAL', requirement: 'rendered-target-size-enhanced', mapping: 'policy' }
    ],
    evidence: target,
    remediation: `Increase the rendered target to at least ${minimum} × ${minimum} CSS px or document the applicable exception.`,
    helpUrl: 'https://www.w3.org/TR/WCAG22/#target-size-enhanced',
    tags: ['geometry', 'runtime-probe', 'target-size']
  }));
  return { findings, surfaceCount: targets.length };
}

async function executeStep(page, step) {
  if (typeof step === 'function') {
    await step(page);
    return;
  }
  if (!step || typeof step !== 'object') throw new AdapterError('Playwright steps must be functions or objects');
  const locator = step.selector ? page.locator(step.selector) : null;
  switch (step.action) {
    case 'click':
      await requireLocator(locator, step).click(step.options);
      break;
    case 'fill':
      await requireLocator(locator, step).fill(String(step.value ?? ''), step.options);
      break;
    case 'press':
      await requireLocator(locator, step).press(String(step.key), step.options);
      break;
    case 'check':
      await requireLocator(locator, step).check(step.options);
      break;
    case 'uncheck':
      await requireLocator(locator, step).uncheck(step.options);
      break;
    case 'selectOption':
      await requireLocator(locator, step).selectOption(step.value, step.options);
      break;
    case 'waitFor':
    case 'expectVisible':
      await requireLocator(locator, step).waitFor({ state: step.action === 'expectVisible' ? 'visible' : step.state, ...step.options });
      break;
    case 'waitForURL':
      await page.waitForURL(step.url, step.options);
      break;
    case 'waitForTimeout': {
      const milliseconds = positiveInteger(step.milliseconds, 1, 'waitForTimeout.milliseconds');
      if (milliseconds > 10_000) throw new AdapterError('waitForTimeout is limited to 10,000 ms');
      await page.waitForTimeout(milliseconds);
      break;
    }
    case 'setViewport':
      await page.setViewportSize({ width: positiveInteger(step.width, 1, 'setViewport.width'), height: positiveInteger(step.height, 1, 'setViewport.height') });
      break;
    default:
      throw new AdapterError(`Unsupported Playwright step action: ${step.action}`);
  }
}

function requireLocator(locator, step) {
  if (!locator) throw new AdapterError(`Playwright step ${step.action} requires selector`);
  return locator;
}

function resolveScenarioUrl(baseURL, scenarioPath) {
  if (!baseURL) throw new AdapterError('playwright-axe adapter requires baseURL unless every scenario supplies url');
  if (typeof scenarioPath !== 'string') throw new AdapterError('Playwright scenario requires path or url');
  return new URL(scenarioPath, ensureTrailingSlash(baseURL)).href;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

async function captureScenarioScreenshot(page, context, scenarioName) {
  const directory = path.join(context.outputDirectory, 'screenshots');
  await ensureDirectory(directory);
  const safeName = scenarioName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'scenario';
  const file = path.join(directory, `${safeName}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return normalizePath(path.relative(context.projectRoot, file));
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new AdapterError(`${name} must be a positive integer`);
  return value;
}
