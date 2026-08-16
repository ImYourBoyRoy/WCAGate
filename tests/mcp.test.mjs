// ./tests/mcp.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessageParser, encodeMessage, handleJsonRpc, listTools, MCP_PROTOCOL_VERSION } from '../src/mcp/stdio.mjs';
import { TOOLKIT_VERSION } from '../src/core/constants.mjs';

test('MCP initialize and tools/list describe the auditor surface', async () => {
  const initialized = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } }
  });
  assert.equal(initialized.result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(initialized.result.serverInfo.version, TOOLKIT_VERSION);

  const listed = await handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), ['core_path', 'doctor', 'explain', 'run', 'validate_config', 'version'].sort());
  assert.equal(listTools().length, names.length);
});

test('MCP version tool returns the package version', async () => {
  const result = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'version', arguments: {} }
  });
  assert.equal(result.result.content[0].text, TOOLKIT_VERSION);
});

test('MCP framing round-trips Content-Length messages', () => {
  const messages = [];
  const feed = createMessageParser((message) => messages.push(message));
  const payload = { jsonrpc: '2.0', id: 9, method: 'ping' };
  feed(encodeMessage(payload));
  assert.deepEqual(messages, [payload]);
});
