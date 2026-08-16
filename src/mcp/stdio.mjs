// ./src/mcp/stdio.mjs
/**
 * MCP stdio server wrapping the Node evidence engine.
 *
 * Surfaces: doctor, run, validate_config, version, core_path, explain.
 * `run` returns a compact finding list for the model to show the user.
 * Optional HTML results are in wcag-audit/results.html — not a GUI app.
 *
 * Usage: node ./bin/wcagate-mcp.mjs
 * Cursor: { "command": "node", "args": ["<package>/bin/wcagate-mcp.mjs"] }
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBuiltinRule } from '../core/rules.mjs';
import { findConfig, loadConfig } from '../core/config.mjs';
import { diagnoseEnvironment, formatDoctorReport } from '../core/doctor.mjs';
import { applyRunOverrides } from '../core/run-overrides.mjs';
import { runAccessibility } from '../core/runner.mjs';
import { summarizeForAgent } from '../core/result.mjs';
import { PACKAGE_NAME, TOOLKIT_NAME, TOOLKIT_VERSION } from '../core/constants.mjs';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function listTools() {
  const cwd = { type: 'string', description: 'Working directory (defaults to process cwd)' };
  const config = { type: 'string', description: 'Path to wcagate.config.mjs/js/json' };
  return [
    {
      name: 'doctor',
      description: 'Fail-fast check for Node, package files, Playwright, Svelte, and command adapters.',
      inputSchema: { type: 'object', properties: { cwd, config }, additionalProperties: false }
    },
    {
      name: 'run',
      description: 'Run the evidence gate. Returns a compact summary for the model to tell the user (gate + blocking/unresolved findings).',
      inputSchema: {
        type: 'object',
        properties: {
          cwd,
          config,
          baseUrl: { type: 'string' },
          routes: { type: 'string', description: 'Comma-separated routes such as /,/about' },
          ensurePlaywright: { type: 'boolean', default: true }
        },
        additionalProperties: false
      }
    },
    {
      name: 'validate_config',
      description: 'Load and validate wcagate configuration.',
      inputSchema: { type: 'object', properties: { cwd, config }, additionalProperties: false }
    },
    {
      name: 'version',
      description: 'Return the auditor package version.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'core_path',
      description: 'Absolute path to this package root.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'explain',
      description: 'Explain a built-in rule id.',
      inputSchema: {
        type: 'object',
        properties: { ruleId: { type: 'string' } },
        required: ['ruleId'],
        additionalProperties: false
      }
    }
  ];
}

async function resolveConfig(args = {}) {
  const cwd = path.resolve(args.cwd ?? process.cwd());
  const configPath = args.config ? path.resolve(cwd, args.config) : await findConfig(cwd);
  if (!configPath) {
    throw new Error(`No wcagate.config.mjs, wcagate.config.js, or wcagate.config.json found from ${cwd}`);
  }
  const config = await loadConfig(configPath, { cwd });
  return { cwd, configPath, config };
}

export async function callTool(name, args = {}) {
  switch (name) {
    case 'doctor': {
      let config;
      try {
        ({ config } = await resolveConfig(args));
      } catch (error) {
        if (!String(error.message).includes('No wcagate.config')) throw error;
      }
      const diagnosis = await diagnoseEnvironment({
        config,
        projectRoot: config?.project.root ?? path.resolve(args.cwd ?? process.cwd()),
        autoInstallPlaywright: false
      });
      return {
        isError: !diagnosis.ok,
        content: [{ type: 'text', text: formatDoctorReport(diagnosis, { json: true }) }]
      };
    }
    case 'run': {
      const { config } = await resolveConfig(args);
      applyRunOverrides(config, { baseUrl: args.baseUrl, routes: args.routes });
      const diagnosis = await diagnoseEnvironment({
        config,
        projectRoot: config.project.root,
        autoInstallPlaywright: args.ensurePlaywright !== false
      });
      if (!diagnosis.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: formatDoctorReport(diagnosis) }]
        };
      }
      const run = await runAccessibility(config, { configIsNormalized: true, quiet: true });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            package: PACKAGE_NAME,
            version: TOOLKIT_VERSION,
            ...summarizeForAgent(run)
          }, null, 2)
        }]
      };
    }
    case 'validate_config': {
      const { config, configPath } = await resolveConfig(args);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: true,
            configPath,
            project: config.project.name,
            profile: config.profile,
            adapters: config.adapters.map((adapter) => ({ id: adapter.id, type: adapter.type }))
          }, null, 2)
        }]
      };
    }
    case 'version':
      return { content: [{ type: 'text', text: TOOLKIT_VERSION }] };
    case 'core_path':
      return { content: [{ type: 'text', text: PACKAGE_ROOT }] };
    case 'explain': {
      const rule = findBuiltinRule(args.ruleId);
      if (!rule) {
        return { isError: true, content: [{ type: 'text', text: `Unknown built-in rule: ${args.ruleId}` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(rule, null, 2) }] };
    }
    default:
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

export async function handleJsonRpc(message) {
  if (!message || typeof message !== 'object') {
    return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null };
  }
  const { id, method, params } = message;
  const isNotification = id === undefined;
  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: TOOLKIT_NAME, version: TOOLKIT_VERSION }
        }
      };
    }
    if (method === 'notifications/initialized' || method === 'initialized') {
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
    }
    if (method === 'ping') {
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: listTools() } };
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (!name) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'tools/call requires name' } };
      }
      const result = await callTool(name, args);
      return { jsonrpc: '2.0', id, result };
    }
    if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
    if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (error) {
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, error: { code: -32603, message: error.message } };
  }
}

export function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);
}

export function createMessageParser(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      if (buffer[0] === 0x7b) {
        const newline = buffer.indexOf(0x0a);
        if (newline === -1) return;
        const line = buffer.subarray(0, newline).toString('utf8').replace(/\r$/, '');
        buffer = buffer.subarray(newline + 1);
        if (line.trim()) onMessage(JSON.parse(line));
        continue;
      }
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        throw new Error('MCP framing missing Content-Length');
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const json = buffer.subarray(start, start + length).toString('utf8');
      buffer = buffer.subarray(start + length);
      onMessage(JSON.parse(json));
    }
  };
}

export async function startStdioServer({ stdin = process.stdin, stdout = process.stdout } = {}) {
  stdin.setEncoding?.('utf8');
  const write = (payload) => {
    if (!payload) return;
    stdout.write(encodeMessage(payload));
  };
  const feed = createMessageParser(async (message) => {
    const response = await handleJsonRpc(message);
    write(response);
  });
  stdin.on('data', (chunk) => feed(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
}
