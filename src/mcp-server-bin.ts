#!/usr/bin/env node

import { runMcpServer } from './mcp-server.js';

await runMcpServer(process.env);
