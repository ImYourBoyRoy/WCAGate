#!/usr/bin/env node
// ./src/cli.mjs
/**
 * CLI for the standalone WCAGate.
 *
 * Commands: init, run, serve, prepare, doctor, validate-config, list-rules, explain,
 * core-path, skills link, version, help.
 */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXIT_CODES, TOOLKIT_NAME, TOOLKIT_VERSION } from './core/constants.mjs';
import { applyRunOverrides, configUsesPlaywright } from './core/run-overrides.mjs';
import { diagnoseEnvironment, formatDoctorReport } from './core/doctor.mjs';
import { findConfig, loadConfig, writeStarterFiles } from './core/config.mjs';
import { findBuiltinRule, getBuiltinRules } from './core/rules.mjs';
import { runAccessibility } from './core/runner.mjs';
import { ensurePlaywrightReady } from './core/prepare.mjs';
import { CONSUMER_NPM_SCRIPTS, INIT_PRESETS } from './core/presets.mjs';
import {
  DEFAULT_RESULTS_PORT,
  formatResultsOpenLine,
  openInBrowser,
  shouldServeResults,
  startResultsServer
} from './core/serve.mjs';
import { linkSkillsIntoProject } from './core/skills-link.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const parsed = parseArguments(argv);
  try {
    switch (parsed.command) {
      case 'run':
        return await runCommand(parsed, io);
      case 'init':
        return await initCommand(parsed, io);
      case 'serve':
        return await serveCommand(parsed, io);
      case 'prepare':
        return await prepareCommand(parsed, io);
      case 'doctor':
        return await doctorCommand(parsed, io);
      case 'validate-config':
        return await validateConfigCommand(parsed, io);
      case 'list-rules':
        return listRulesCommand(io);
      case 'explain':
        return explainCommand(parsed, io);
      case 'core-path':
        io.stdout.write(`${PACKAGE_ROOT}\n`);
        return EXIT_CODES.PASS;
      case 'skills':
        return await skillsCommand(parsed, io);
      case 'version':
      case '--version':
      case '-v':
        io.stdout.write(`${TOOLKIT_VERSION}\n`);
        return EXIT_CODES.PASS;
      case 'help':
      case '--help':
      case '-h':
        io.stdout.write(helpText());
        return EXIT_CODES.PASS;
      default:
        io.stderr.write(`Unknown command: ${parsed.command}\n\n${helpText()}`);
        return EXIT_CODES.EXECUTION_ERROR;
    }
  } catch (error) {
    io.stderr.write(`[${error.code ?? 'ERROR'}] ${error.message}\n`);
    return EXIT_CODES.EXECUTION_ERROR;
  }
}

async function runCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  if (!configPath) throw new Error(`No wcagate.config.mjs, wcagate.config.js, or wcagate.config.json found from ${cwd}`);
  const config = await loadConfig(configPath, { cwd });
  applyRunOverrides(config, {
    baseUrl: parsed.options['base-url'],
    routes: parsed.options.routes
  });

  const needsPlaywright = configUsesPlaywright(config);
  const skipPlaywright = Boolean(parsed.options['skip-playwright-install']);
  const ensurePlaywright = needsPlaywright || Boolean(parsed.options['ensure-playwright']);
  const diagnosis = await diagnoseEnvironment({
    config,
    projectRoot: config.project.root,
    autoInstallPlaywright: ensurePlaywright && !skipPlaywright
  });
  if (!diagnosis.ok) {
    io.stderr.write(formatDoctorReport(diagnosis));
    throw new Error(diagnosis.blocking.map((item) => item.detail).join(' '));
  }

  const run = await runAccessibility(config, {
    configIsNormalized: true,
    quiet: parsed.options.quiet,
    color: parsed.options.color,
    stream: io.stdout
  });

  const shouldServe = shouldServeResults({
    serve: parsed.options.serve,
    noServe: parsed.options['no-serve']
  });
  if (shouldServe) {
    const hosted = await startResultsServer({
      directory: config.outputDirectory,
      port: Number.parseInt(String(parsed.options.port ?? DEFAULT_RESULTS_PORT), 10)
    });
    run.resultsUrl = hosted.url;
    run.dashboardUrl = hosted.url;
    io.stdout.write(`${formatResultsOpenLine(hosted.url)}\n`);
    if (parsed.options.open) await openInBrowser(hosted.url);
    if (!parsed.options.quiet) {
      io.stdout.write('Serving results until interrupt (Ctrl+C).\n');
    }
    await waitForInterrupt(hosted.server);
  }
  return run.gate.exitCode;
}

async function initCommand(parsed, io) {
  const target = path.resolve(parsed.positionals[0] ?? parsed.options.cwd ?? process.cwd());
  const files = await writeStarterFiles(target, {
    force: parsed.options.force,
    preset: parsed.options.preset ?? 'web',
    profile: parsed.options.profile
  });
  io.stdout.write(`Created ${files.configPath}\nCreated ${files.evidencePath}\n`);
  if (files.nativeEvidencePath) io.stdout.write(`Created ${files.nativeEvidencePath}\n`);
  const preset = parsed.options.preset ?? 'web';
  io.stdout.write(
    `Add package.json scripts ${Object.keys(CONSUMER_NPM_SCRIPTS).join(', ')} (see docs/CONSUMERS.md).\n`
  );
  if (preset === 'astro' || preset === 'web' || preset === 'static') {
    io.stdout.write('Site run: npm run wcagate:doctor && npm run wcagate:audit\n');
  }
  return EXIT_CODES.PASS;
}

async function serveCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  const outputDirectory = configPath
    ? (await loadConfig(configPath, { cwd })).outputDirectory
    : path.resolve(cwd, 'wcag-audit');
  const hosted = await startResultsServer({
    directory: outputDirectory,
    port: Number.parseInt(String(parsed.options.port ?? DEFAULT_RESULTS_PORT), 10)
  });
  io.stdout.write(`${formatResultsOpenLine(hosted.url)}\n`);
  if (parsed.options.open) await openInBrowser(hosted.url);
  io.stdout.write('Serving results until interrupt (Ctrl+C).\n');
  await waitForInterrupt(hosted.server);
  return EXIT_CODES.PASS;
}

async function prepareCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? parsed.positionals[0] ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  const config = configPath ? await loadConfig(configPath, { cwd }) : undefined;
  if (!config || configUsesPlaywright(config)) {
    const ready = await ensurePlaywrightReady({
      projectRoot: config?.project.root ?? cwd,
      autoInstall: !parsed.options['skip-playwright-install']
    });
    for (const action of ready.actions) io.stdout.write(`${action}\n`);
    for (const warning of ready.warnings) io.stderr.write(`${warning}\n`);
    if (!ready.ok) throw new Error('Playwright is not ready in the client project.');
    io.stdout.write('Playwright peers and Chromium are ready in the client project.\n');
  }
  const diagnosis = await diagnoseEnvironment({
    config,
    projectRoot: config?.project.root ?? cwd,
    autoInstallPlaywright: false
  });
  io.stdout.write(formatDoctorReport(diagnosis, { json: Boolean(parsed.options.json) }));
  if (!diagnosis.ok) throw new Error('doctor: missing required tools');
  return EXIT_CODES.PASS;
}

async function doctorCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? parsed.positionals[0] ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  const config = configPath ? await loadConfig(configPath, { cwd }) : undefined;
  const diagnosis = await diagnoseEnvironment({
    config,
    projectRoot: config?.project.root ?? cwd,
    autoInstallPlaywright: false
  });
  io.stdout.write(formatDoctorReport(diagnosis, { json: Boolean(parsed.options.json) }));
  return diagnosis.exitCode;
}

async function validateConfigCommand(parsed, io) {
  const cwd = path.resolve(parsed.options.cwd ?? process.cwd());
  const configPath = parsed.options.config
    ? path.resolve(cwd, parsed.options.config)
    : await findConfig(cwd);
  if (!configPath) throw new Error(`No accessibility configuration found from ${cwd}`);
  const config = await loadConfig(configPath, { cwd });
  io.stdout.write(`Valid configuration: ${config.configPath}\nProject: ${config.project.name}\nAdapters: ${config.adapters.length}\nProfile: ${config.profile}\nOutput: ${config.outputDirectory}\n`);
  return EXIT_CODES.PASS;
}

function listRulesCommand(io) {
  for (const rule of getBuiltinRules()) io.stdout.write(`${rule.id}\t${rule.title}\n`);
  return EXIT_CODES.PASS;
}

function explainCommand(parsed, io) {
  const ruleId = parsed.positionals[0];
  if (!ruleId) throw new Error('explain requires a rule ID');
  const rule = findBuiltinRule(ruleId);
  if (!rule) throw new Error(`Unknown built-in rule: ${ruleId}`);
  io.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
  return EXIT_CODES.PASS;
}

async function skillsCommand(parsed, io) {
  const sub = parsed.positionals[0];
  if (sub !== 'link') {
    throw new Error('Usage: wcagate skills link --project <path>');
  }
  const project = parsed.options.project ?? parsed.positionals[1];
  if (!project) throw new Error('skills link requires --project <path>');
  const result = linkSkillsIntoProject({ projectRoot: project, packageRoot: PACKAGE_ROOT });
  io.stdout.write(`Linked skills (${result.skills.join(', ')}) into ${result.project} .cursor/skills and .agents/skills\n`);
  return EXIT_CODES.PASS;
}

function waitForInterrupt(server) {
  return new Promise((resolve) => {
    const stop = () => {
      server.close(() => resolve());
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

function parseArguments(argv) {
  const command = argv[0] ?? 'help';
  const options = { color: undefined };
  const positionals = [];
  const valueFlags = new Set(['config', 'cwd', 'port', 'preset', 'profile', 'project', 'base-url', 'routes']);
  const booleanFlags = new Set([
    'quiet', 'force', 'serve', 'no-serve', 'open', 'ensure-playwright', 'skip-playwright-install', 'no-color', 'color', 'json'
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--config' || argument === '--cwd' || argument === '--port'
      || argument === '--preset' || argument === '--profile' || argument === '--project'
      || argument === '--base-url' || argument === '--routes') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else if (argument === '--quiet') {
      options.quiet = true;
    } else if (argument === '--force') {
      options.force = true;
    } else if (argument === '--serve') {
      options.serve = true;
    } else if (argument === '--no-serve') {
      options['no-serve'] = true;
    } else if (argument === '--open') {
      options.open = true;
    } else if (argument === '--ensure-playwright') {
      options['ensure-playwright'] = true;
    } else if (argument === '--skip-playwright-install') {
      options['skip-playwright-install'] = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--no-color') {
      options.color = false;
    } else if (argument === '--color') {
      options.color = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  void valueFlags;
  void booleanFlags;
  return { command, options, positionals };
}

function helpText() {
  return `${TOOLKIT_NAME} ${TOOLKIT_VERSION}

Usage:
  wcagate init [directory] [--force] [--preset ${INIT_PRESETS.join('|')}] [--profile wcag22-a|wcag22-aa|wcag22-aaa]
  wcagate run [--config file] [--cwd directory] [--quiet] [--no-color] [--serve] [--no-serve] [--open] [--port 4179] [--base-url url] [--routes /,/about] [--ensure-playwright] [--skip-playwright-install]
  wcagate serve [--cwd directory] [--config file] [--port 4179] [--open]
  wcagate doctor [--cwd directory] [--config file] [--json]
  wcagate prepare [--cwd directory] [--config file] [--skip-playwright-install]
  wcagate validate-config [--config file] [--cwd directory]
  wcagate list-rules
  wcagate explain <rule-id>
  wcagate core-path
  wcagate skills link --project <path>
  wcagate version

MCP:
  wcagate-mcp   stdio MCP for coding agents (doctor, run, validate_config)

Exit codes:
  0  configured gate passed
  1  blocking accessibility findings
  2  configuration, dependency, execution, or empty-surface error
  3  required evidence is untested or inconclusive

Results:
  Each run overwrites wcag-audit/latest.json and wcag-audit/results.html.
  Coding models should tell the user the gate and findings from latest.json.
  Optional HTML view: wcagate serve → http://127.0.0.1:4179/results.html
`;
}

function defaultIo() {
  return { stdout: process.stdout, stderr: process.stderr };
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
})();
if (invokedDirectly) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
