import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transports: StdioClientTransport[] = [];

afterEach(async () => {
  while (transports.length > 0) {
    const transport = transports.pop();

    if (!transport) {
      continue;
    }

    await transport.close().catch(() => undefined);
  }
});

function createTransport(args: string[]) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', path.resolve(import.meta.dirname, '../src/index.ts'), ...args],
    env: {
      ...process.env,
      CLIMBING_GO_FIXTURE_DIR: path.resolve(import.meta.dirname, 'fixtures')
    },
    stderr: 'pipe'
  });

  transports.push(transport);
  return transport;
}

function createClient() {
  return new Client(
    {
      name: 'climbing-go-test-client',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
}

describe('MCP stdio server', () => {
  it('serves store tools over stdio with the --mcp entrypoint', async () => {
    const client = createClient();
    const transport = createTransport(['--mcp']);

    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['listStores', 'getStore']));

    const listResult = await client.callTool({
      name: 'listStores',
      arguments: {
        city: '上海',
        limit: 1
      }
    });

    const getResult = await client.callTool({
      name: 'getStore',
      arguments: {
        id: '23b9298b-5dbe-426f-94d2-5905bb41558f'
      }
    });

    const listText = listResult.content.find(item => item.type === 'text');
    const getText = getResult.content.find(item => item.type === 'text');

    expect(listText?.text).toContain('"stores"');
    expect(listText?.text).toContain('上海');
    expect(getText?.text).toContain('"id": "23b9298b-5dbe-426f-94d2-5905bb41558f"');

    await client.close();
  });

  it('supports the mcp-serve subcommand alias', async () => {
    const client = createClient();
    const transport = createTransport(['mcp-serve']);

    await client.connect(transport);

    const result = await client.callTool({
      name: 'getStore',
      arguments: {
        id: '23b9298b-5dbe-426f-94d2-5905bb41558f'
      }
    });

    const content = result.content.find(item => item.type === 'text');

    expect(content?.text).toContain('23b9298b-5dbe-426f-94d2-5905bb41558f');

    await client.close();
  });
});
