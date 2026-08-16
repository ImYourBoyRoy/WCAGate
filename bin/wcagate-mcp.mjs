#!/usr/bin/env node
// ./bin/wcagate-mcp.mjs
/**
 * MCP stdio entry wrapping the WCAGate CLI/API.
 */
import { startStdioServer } from '../src/mcp/stdio.mjs';

await startStdioServer();
