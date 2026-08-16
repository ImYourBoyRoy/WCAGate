export type Outcome = 'passed' | 'failed' | 'inapplicable' | 'cantTell' | 'untested' | 'executionError';
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'advisory';
export type Confidence = 'high' | 'medium' | 'low';
export type AutomationLevel = 'automatic' | 'semi-automatic' | 'manual';
export type StandardMappingKind = 'conformance' | 'secondary' | 'policy';

export interface StandardMapping {
  document: string;
  requirement: string;
  level?: string;
  mapping?: StandardMappingKind;
}

export interface FindingTarget {
  project?: string;
  adapter?: string;
  routeOrScene?: string;
  state?: string;
  selectorOrNode?: string | string[];
  file?: string;
  line?: number;
  column?: number;
  sourceHint?: string;
  sourceMatch?: string;
  sourceKind?: string;
}

export interface RawFinding {
  ruleId: string;
  ruleVersion?: string;
  title: string;
  description?: string;
  outcome: Outcome;
  severity: Severity;
  confidence?: Confidence;
  automation?: AutomationLevel;
  target?: FindingTarget;
  standards?: StandardMapping[];
  evidence?: unknown;
  remediation?: string;
  helpUrl?: string;
  tags?: string[];
  fingerprint?: string;
}

export interface Finding extends Omit<RawFinding, 'target' | 'confidence' | 'automation' | 'standards' | 'tags'> {
  runId: string;
  target: Required<Pick<FindingTarget, 'project' | 'adapter'>> & FindingTarget;
  confidence: Confidence;
  automation: AutomationLevel;
  standards: StandardMapping[];
  tags: string[];
  fingerprint: string;
  suppressed: boolean;
  outOfScope?: boolean;
  suppression?: AppliedSuppression;
}

export interface Suppression {
  fingerprint?: string;
  ruleId?: string;
  adapter?: string;
  routeOrScene?: string;
  state?: string;
  justification: string;
  owner: string;
  ticket: string;
  createdAt: string;
  expiresAt: string;
  outcomes?: Array<'failed' | 'cantTell'>;
}

export type AppliedSuppression = Pick<Suppression, 'justification' | 'owner' | 'ticket' | 'createdAt' | 'expiresAt' | 'outcomes'>;

export interface AdapterResult {
  findings: RawFinding[];
  surfaceCount: number;
  metadata?: Record<string, unknown>;
}

export interface AdapterContext {
  runId: string;
  now: Date;
  projectName: string;
  projectRoot: string;
  outputDirectory: string;
  adapterName: string;
  profile: string;
  metadata: Record<string, unknown>;
  importModule?: (specifier: string) => Promise<unknown>;
  modules?: Record<string, unknown>;
}

export type AdapterRunner<Config extends object = Record<string, unknown>> = (
  config: Config,
  context: AdapterContext
) => Promise<AdapterResult>;

interface AdapterBase {
  id?: string;
  required?: boolean;
}

export interface ManualEvidenceAdapterConfig extends AdapterBase {
  type: 'manual-evidence';
  file: string;
  allowProjectMismatch?: boolean;
}

export interface NativeEvidenceAdapterConfig extends AdapterBase {
  type: 'native-evidence';
  file?: string;
  files?: string[];
}

export interface CommandEvidenceAdapterConfig extends AdapterBase {
  type: 'command-evidence';
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  outputFile?: string;
  captureStderr?: boolean;
}

export interface ModuleAdapterConfig extends AdapterBase {
  type: 'module';
  module: string;
  options?: Record<string, unknown>;
}

export interface SvelteAdapterConfig extends AdapterBase {
  type: 'svelte';
  include?: string[];
  ignoreNames?: string[];
  maxFiles?: number;
  allowEmpty?: boolean;
  compilerOptions?: Record<string, unknown>;
}

export type PlaywrightStep =
  | ((page: unknown) => void | Promise<void>)
  | { action: 'click' | 'check' | 'uncheck'; selector: string; options?: Record<string, unknown> }
  | { action: 'fill'; selector: string; value?: unknown; options?: Record<string, unknown> }
  | { action: 'press'; selector: string; key: string; options?: Record<string, unknown> }
  | { action: 'selectOption'; selector: string; value: unknown; options?: Record<string, unknown> }
  | { action: 'waitFor' | 'expectVisible'; selector: string; state?: string; options?: Record<string, unknown> }
  | { action: 'waitForURL'; url: string | RegExp; options?: Record<string, unknown> }
  | { action: 'waitForTimeout'; milliseconds: number }
  | { action: 'setViewport'; width: number; height: number };

export interface TargetSizeProbeConfig {
  enabled: boolean;
  minimum?: number;
  selector?: string;
  ignoreSelector?: string;
  severity?: Severity;
}

export interface FocusIndicatorProbeConfig {
  enabled: boolean;
  maxTabs?: number;
  severity?: Severity;
}

export interface RuntimeProbeConfig {
  targetSizeEnhanced?: TargetSizeProbeConfig;
  focusIndicatorReview?: FocusIndicatorProbeConfig;
}

export interface PlaywrightScenarioConfig {
  name: string;
  path?: string;
  url?: string;
  waitUntil?: string;
  timeoutMs?: number;
  setup?: (page: unknown, context: AdapterContext) => void | Promise<void>;
  teardown?: (page: unknown, context: AdapterContext) => void | Promise<void>;
  steps?: PlaywrightStep[];
  runOnly?: string[];
  include?: string[];
  exclude?: string[];
  axeOptions?: Record<string, unknown>;
  probes?: RuntimeProbeConfig;
  screenshotOnFinding?: boolean;
}

export interface ManagedWebServerConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  maxOutputBytes?: number;
  reuseExistingServer?: boolean;
}

export interface PlaywrightAxeAdapterConfig extends AdapterBase {
  type: 'playwright-axe';
  baseURL?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  scenarios: PlaywrightScenarioConfig[];
  timeoutMs?: number;
  launchOptions?: Record<string, unknown>;
  contextOptions?: Record<string, unknown>;
  webServer?: ManagedWebServerConfig;
  runOnly?: string[];
  include?: string[];
  exclude?: string[];
  axeOptions?: Record<string, unknown>;
  probes?: RuntimeProbeConfig;
  screenshotOnFinding?: boolean;
}

export type AdapterConfig =
  | ManualEvidenceAdapterConfig
  | NativeEvidenceAdapterConfig
  | CommandEvidenceAdapterConfig
  | ModuleAdapterConfig
  | SvelteAdapterConfig
  | PlaywrightAxeAdapterConfig;

export interface ConsoleReporterConfig {
  type: 'console';
  options?: Record<string, unknown>;
}

export interface FileReporterConfig {
  type: 'json' | 'sarif' | 'junit' | 'html' | 'markdown' | 'results' | 'dashboard';
  file: string;
  options?: Record<string, unknown>;
}

export type ReporterConfig = ConsoleReporterConfig | FileReporterConfig;

export interface GateConfig {
  failOnSeverities?: Severity[];
  failOnOutcomes?: Outcome[];
  unresolvedOutcomes?: Outcome[];
  unresolvedEvidence?: 'error' | 'ignore';
  executionErrors?: 'error' | 'ignore';
  requireApplicableSurface?: boolean;
}

export interface ToolkitConfig {
  schemaVersion: 1;
  project: {
    name: string;
    root?: string;
    commit?: string | null;
  };
  profile?: 'wcag22-a' | 'wcag22-aa' | 'wcag22-aaa';
  adapters: AdapterConfig[];
  gate?: GateConfig;
  reporters?: ReporterConfig[];
  suppressions?: Suppression[];
  outputDirectory?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedToolkitConfig extends Omit<ToolkitConfig, 'project' | 'adapters' | 'gate' | 'reporters' | 'suppressions' | 'outputDirectory' | 'metadata' | 'profile'> {
  project: { name: string; root: string; commit: string | null };
  profile: string;
  adapters: Array<AdapterConfig & { id: string; required: boolean }>;
  gate: Required<GateConfig>;
  reporters: ReporterConfig[];
  suppressions: Suppression[];
  outputDirectory: string;
  metadata: Record<string, unknown>;
  configPath: string | null;
}

export interface GateResult {
  passed: boolean;
  exitCode: 0 | 1 | 2 | 3;
  reason: 'passed' | 'blockingFindings' | 'executionError' | 'noApplicableSurface' | 'unresolvedEvidence';
  blockingFingerprints: string[];
}

export interface AdapterRun {
  id: string;
  type: AdapterConfig['type'];
  required: boolean;
  status: 'completed' | 'skipped' | 'failed';
  surfaceCount: number;
  findingCount: number;
  durationMs: number;
  metadata: Record<string, unknown>;
}

export interface AccessibilitySummary {
  total: number;
  outcomes: Record<Outcome, number>;
  severities: Record<Severity, number>;
  suppressed: number;
  active: number;
}

export interface AccessibilityScorecard {
  profile: string;
  label: string;
  level: 'A' | 'AA' | 'AAA';
  inScope: number;
  outOfScope: number;
  conclusive: number;
  unresolved: number;
  blocking: number;
  completenessPercent: number | null;
  disclaimer: string;
}

export interface AccessibilityRun {
  schemaVersion: '1.0.0';
  id: string;
  toolkit: { name: string; version: string };
  project: { name: string; root: string; commit: string | null };
  profile: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outputDirectory: string;
  surfaceCount: number;
  adapters: AdapterRun[];
  findings: Finding[];
  summary: AccessibilitySummary;
  scorecard: AccessibilityScorecard;
  gate: GateResult;
  metadata: Record<string, unknown>;
  reportFiles: string[];
  resultsUrl?: string;
  dashboardUrl?: string;
}

export interface WritableLike {
  write(chunk: string): unknown;
}

export interface RunOptions {
  cwd?: string;
  configIsNormalized?: boolean;
  now?: Date;
  runId?: string;
  quiet?: boolean;
  color?: boolean;
  stream?: WritableLike;
  adapters?: Record<string, AdapterRunner>;
  importModule?: (specifier: string) => Promise<unknown>;
  modules?: Record<string, unknown>;
}

export const TOOLKIT_NAME: string;
export const PACKAGE_NAME: string;
export const TOOLKIT_VERSION: string;
export const CONFIG_SCHEMA_VERSION: 1;
export const EVIDENCE_SCHEMA_VERSION: 1;
export const NATIVE_EVIDENCE_SCHEMA_VERSION: 1;
export const RUN_SCHEMA_VERSION: '1.0.0';
export const OUTCOMES: readonly Outcome[];
export const SEVERITIES: readonly Severity[];
export const EXIT_CODES: Readonly<{ PASS: 0; BLOCKING_FINDINGS: 1; EXECUTION_ERROR: 2; UNRESOLVED_EVIDENCE: 3 }>;

export function findConfig(startDirectory?: string): Promise<string | null>;
export function loadConfig(configPath: string, options?: { cwd?: string }): Promise<NormalizedToolkitConfig>;
export function normalizeConfig(config: ToolkitConfig, options?: { cwd?: string; configPath?: string }): NormalizedToolkitConfig;
export function validateConfig(config: unknown): string[];
export function writeStarterFiles(targetDirectory: string, options?: { force?: boolean; preset?: 'web' | 'astro' | 'static' | 'tauri' | 'native'; profile?: 'wcag22-a' | 'wcag22-aa' | 'wcag22-aaa'; projectName?: string }): Promise<{ configPath: string; evidencePath: string; nativeEvidencePath?: string }>;
export function runAccessibility(config: ToolkitConfig | NormalizedToolkitConfig, options?: RunOptions): Promise<AccessibilityRun>;
export function evaluateGate(run: AccessibilityRun, gate: Required<GateConfig>): GateResult;
export function normalizeFinding(input: RawFinding, context: { runId: string; projectName: string; adapterName: string }): Finding;
export function createFindingFingerprint(input: RawFinding, context: { projectName: string; adapterName: string }): string;
export function summarizeFindings(findings: Finding[]): AccessibilitySummary;
export function summarizeForAgent(run: AccessibilityRun, options?: { limit?: number }): {
  exitCode?: 0 | 1 | 2 | 3;
  reason?: GateResult['reason'];
  passed: boolean;
  profile: string;
  surfaceCount: number;
  summary?: AccessibilitySummary;
  scorecard?: AccessibilityScorecard;
  outputDirectory: string;
  reportFiles?: string[];
  blocking: Array<{ ruleId: string; title: string; outcome: Outcome; severity: Severity; file?: string; line?: number; location?: string; remediation?: string }>;
  blockingOmitted: number;
  unresolved: Array<{ ruleId: string; title: string; outcome: Outcome; severity: Severity; file?: string; line?: number; location?: string; remediation?: string }>;
  unresolvedOmitted: number;
  tellTheUser: string;
};
export function applySuppressions(findings: Finding[], suppressions?: Suppression[], now?: Date): { findings: Finding[]; expired: Suppression[]; invalid: Array<{ suppression: unknown; problem: string }> };
export function validateSuppression(value: unknown, now?: Date): string | null;
export function getBuiltinAdapters(): Record<string, AdapterRunner>;
export function getBuiltinRules(): Array<Record<string, unknown>>;
export function findBuiltinRule(ruleId: string): Record<string, unknown> | null;
export function renderHtmlReport(run: AccessibilityRun): string;
export function renderJsonReport(run: AccessibilityRun, options?: { compact?: boolean }): string;
export function renderJunitReport(run: AccessibilityRun): string;
export function renderMarkdownReport(run: AccessibilityRun): string;
export function renderSarifReport(run: AccessibilityRun): string;
export function renderDashboardReport(run: AccessibilityRun): string;
export function renderResultsReport(run: AccessibilityRun): string;
export function startResultsServer(options: { directory: string; port?: number }): Promise<{
  url: string;
  port: number;
  directory: string;
  server: { close(callback?: (error?: Error) => void): void };
}>;
export function startDashboardServer(options: { directory: string; port?: number }): Promise<{
  url: string;
  port: number;
  directory: string;
  server: { close(callback?: (error?: Error) => void): void };
}>;
export function formatResultsOpenLine(url: string): string;
export function formatDashboardOpenLine(url: string): string;
export function shouldServeResults(options?: { serve?: boolean; noServe?: boolean; env?: Record<string, string | undefined> }): boolean;
export function shouldServeDashboard(options?: { serve?: boolean; noServe?: boolean; env?: Record<string, string | undefined> }): boolean;
export function applyRunOverrides(config: NormalizedToolkitConfig, overlays?: { baseUrl?: string; routes?: string | string[] }): NormalizedToolkitConfig;
export function configUsesPlaywright(config: { adapters?: Array<{ type: string }> }): boolean;
export function diagnoseEnvironment(options?: {
  config?: NormalizedToolkitConfig | { adapters?: Array<{ type: string; id?: string; command?: string; required?: boolean; allowEmpty?: boolean }> };
  projectRoot?: string;
  packageRoot?: string;
  env?: Record<string, string | undefined>;
  autoInstallPlaywright?: boolean;
  nodeVersion?: string;
}): Promise<{
  ok: boolean;
  exitCode: 0 | 2;
  checks: Array<{ id: string; ok: boolean; required: boolean; detail: string; fix: string }>;
  blocking: Array<{ id: string; ok: boolean; required: boolean; detail: string; fix: string }>;
}>;
export function formatDoctorReport(diagnosis: { ok: boolean; checks: Array<{ id: string; ok: boolean; required: boolean; detail: string; fix: string }> }, options?: { json?: boolean }): string;
export const DEFAULT_PROFILE: 'wcag22-aa';
export const KNOWN_PROFILES: readonly ['wcag22-a', 'wcag22-aa', 'wcag22-aaa'];
export function parseProfile(value: unknown): { id: string; document: string; level: 'A' | 'AA' | 'AAA'; label: string } | null;
export function isFindingInScope(finding: { standards?: StandardMapping[]; tags?: string[] }, profileId?: string): boolean;
export function buildScorecard(findings: Finding[], profileId?: string): AccessibilityScorecard;
export function annotateScope<T extends { tags?: string[] }>(findings: T[], profileId?: string): Array<T & { outOfScope: boolean }>;

