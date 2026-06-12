import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer, type StoreService } from '../src/mcp-server.js';

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
      ...process.env
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
  it('serves climbing tools with injected service handlers', async () => {
    const receivedPopularTimesStoreIds: string[] = [];
    let receivedStoreLookupArgs: unknown;

    const service: StoreService = {
      async listStores(args) {
        receivedStoreLookupArgs = args;
        return {
          stores: [
            { id: 'store-1', name: '香蕉攀岩上海旗舰馆', city: '上海' },
            { id: 'store-2', name: '香蕉攀岩上海静安旗舰馆', city: '上海' }
          ],
          count: 2
        };
      },
      async getStore() {
        return { id: '23b9298b-5dbe-426f-94d2-5905bb41558f', name: '香蕉攀岩上海旗舰馆' };
      },
      async getStorePopularTimes(storeId) {
        receivedPopularTimesStoreIds.push(storeId);
        return {
          popular_times: [
            { day_of_week: 1, hour: 19, value: storeId === 'store-1' ? 88 : 90 },
            { day_of_week: 6, hour: 14, value: 100 }
          ]
        };
      },
      async listProducts() {
        return {
          products: [
            {
              id: 'product-1',
              name: '单次攀岩票',
              type: 'card',
              variants: [{ id: 'variant-1', name: '单次票' }]
            }
          ]
        };
      },
      async previewOrder(args) {
        return {
          preview: {
            store_id: args.store_id,
            variant_id: args.variant_id,
            amount: 99,
            currency: 'CNY',
            payment_channel_type: 'alipay'
          }
        };
      },
      async createOrder() {
        return {
          order_id: 'order-1',
          amount: 99,
          status: 'pending',
          payment_url: 'https://example.com/pay/order-1',
          payment_qr_code_url: 'https://example.com/pay/order-1'
        };
      }
    };
    const client = createClient();
    const server = await createMcpServer({}, { service });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'listStores',
      'getStore',
      'getStorePopularTimes',
      'listProducts',
      'previewOrder',
      'createOrder'
    ]));

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
    const productResult = await client.callTool({
      name: 'listProducts',
      arguments: {
        productTypes: ['card'],
        keyword: '单次',
        limit: 1
      }
    });
    const popularTimesResult = await client.callTool({
      name: 'getStorePopularTimes',
      arguments: {
        city: '上海',
        search: '旗舰'
      }
    });
    const singlePopularTimesResult = await client.callTool({
      name: 'getStorePopularTimes',
      arguments: {
        id: '23b9298b-5dbe-426f-94d2-5905bb41558f'
      }
    });
    const previewResult = await client.callTool({
      name: 'previewOrder',
      arguments: {
        store_id: '23b9298b-5dbe-426f-94d2-5905bb41558f',
        variant_id: '33333333-3333-4333-8333-333333333333',
        payment_channel: 'alipay',
        quantity: 1
      }
    });
    const createResult = await client.callTool({
      name: 'createOrder',
      arguments: {
        store_id: '23b9298b-5dbe-426f-94d2-5905bb41558f',
        variant_id: '33333333-3333-4333-8333-333333333333',
        payment_channel: 'alipay'
      }
    });

    const listText = listResult.content.find(item => item.type === 'text');
    const getText = getResult.content.find(item => item.type === 'text');
    const productText = productResult.content.find(item => item.type === 'text');
    const popularTimesText = popularTimesResult.content.find(item => item.type === 'text');
    const singlePopularTimesText = singlePopularTimesResult.content.find(item => item.type === 'text');
    const previewText = previewResult.content.find(item => item.type === 'text');
    const createText = createResult.content.find(item => item.type === 'text');

    expect(listText?.text).toContain('"stores"');
    expect(listText?.text).toContain('上海');
    expect(getText?.text).toContain('"id": "23b9298b-5dbe-426f-94d2-5905bb41558f"');
    expect(productText?.text).toContain('单次攀岩票');
    expect(popularTimesText?.text).toContain('"stores"');
    expect(popularTimesText?.text).not.toContain('"store"');
    expect(popularTimesText?.text).toContain('香蕉攀岩上海旗舰馆');
    expect(popularTimesText?.text).toContain('香蕉攀岩上海静安旗舰馆');
    expect(popularTimesText?.text).toContain('"value": 100');
    expect(singlePopularTimesText?.text).toContain('"stores"');
    expect(singlePopularTimesText?.text).toContain('"count": 1');
    expect(singlePopularTimesText?.text).not.toContain('"store"');
    expect(singlePopularTimesText?.text).toContain('"id": "23b9298b-5dbe-426f-94d2-5905bb41558f"');
    expect(receivedStoreLookupArgs).toEqual({
      city: '上海',
      search: '旗舰',
      limit: 100
    });
    expect(receivedPopularTimesStoreIds).toEqual(['store-1', 'store-2', '23b9298b-5dbe-426f-94d2-5905bb41558f']);
    expect(previewText?.text).toContain('"payment_channel_type": "alipay"');
    expect(createText?.text).toContain('https://example.com/pay/order-1');

    await client.close();
    await server.close();
  });

  it('starts over stdio with the --mcp entrypoint', async () => {
    const client = createClient();
    const transport = createTransport(['--mcp']);

    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'listStores',
      'getStore',
      'getStorePopularTimes',
      'listProducts',
      'previewOrder',
      'createOrder'
    ]));

    await client.close();
  });

  it('supports the mcp-serve subcommand alias', async () => {
    const client = createClient();
    const transport = createTransport(['mcp-serve']);

    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'getStore',
      'getStorePopularTimes'
    ]));

    await client.close();
  });
});
