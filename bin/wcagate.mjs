#!/usr/bin/env node
// ./bin/wcagate.mjs
/**
 * CLI entry for the standalone WCAGate package.
 */
import { main } from '../src/cli.mjs';

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
