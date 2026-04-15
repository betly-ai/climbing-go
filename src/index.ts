#!/usr/bin/env node

import { runCli } from './cli.js';
import { runMcpServer, shouldRunMcpServer } from './mcp-server.js';

const argv = process.argv.slice(2);

if (shouldRunMcpServer(argv)) {
  await runMcpServer(process.env);
} else {
  const result = await runCli(argv, {
    env: process.env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}
