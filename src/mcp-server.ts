import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { loadConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import {
  createStoreGateway,
  type ListProductsArgs,
  type ListStoresArgs,
  type ProductRecord,
  type StoreGateway,
  type StoreRecord
} from './store-gateway.js';
import { CLIMBING_GO_VERSION } from './version.js';

export const MCP_SERVER_COMMANDS = new Set(['mcp-serve', 'serve']);

interface StoreService {
  listStores(args: ListStoresArgs): Promise<{
    stores: StoreRecord[];
    count: number;
  }>;
  getStore(storeId: string): Promise<StoreRecord>;
  listProducts(args: ListProductsArgs): Promise<{
    store?: StoreRecord;
    products: ProductRecord[];
    count: number;
  }>;
}

async function loadFixtureJson<T>(fixtureDir: string, fileName: string) {
  const raw = await readFile(path.join(fixtureDir, fileName), 'utf8');
  return JSON.parse(raw) as T;
}

function applyListFilters(
  stores: StoreRecord[],
  args: ListStoresArgs
) {
  const filtered = stores.filter(store => {
    if (args.city && store.city !== args.city) {
      return false;
    }

    if (args.search && !store.name.toLowerCase().includes(args.search.toLowerCase())) {
      return false;
    }

    return true;
  });
  const start = Math.max(args.offset ?? 0, 0);
  const end = args.limit ? start + Math.max(args.limit, 0) : undefined;

  return {
    stores: filtered.slice(start, end),
    count: filtered.length
  };
}

function createFixtureStoreService(fixtureDir: string): StoreService {
  return {
    async listStores(args) {
      const payload = await loadFixtureJson<{ stores: StoreRecord[]; count?: number }>(fixtureDir, 'store-list.json');

      return applyListFilters(payload.stores ?? [], args);
    },

    async getStore(storeId) {
      const payload = await loadFixtureJson<StoreRecord>(fixtureDir, 'store-detail.json');

      if (payload.id !== storeId) {
        throw new Error('Store not found');
      }

      return payload;
    },

    async listProducts(args) {
      const payload = await loadFixtureJson<{
        store?: StoreRecord;
        products: ProductRecord[];
        count?: number;
      }>(fixtureDir, 'product-list.json');

      if (args.storeIds?.length && payload.store && !args.storeIds.includes(payload.store.id)) {
        return {
          store: payload.store,
          products: [],
          count: 0
        };
      }

      const filtered = (payload.products ?? []).filter(product => {
        if (args.productTypes?.length && !args.productTypes.includes(String(product.type ?? ''))) {
          return false;
        }

        if (args.keyword && !product.name.toLowerCase().includes(args.keyword.toLowerCase())) {
          return false;
        }

        return true;
      });
      const end = args.limit ? Math.max(args.limit, 0) : undefined;

      return {
        store: payload.store,
        products: filtered.slice(0, end),
        count: filtered.length
      };
    }
  };
}

async function resolveGateway(env: EnvMap): Promise<StoreGateway> {
  const config = await loadConfig(env);
  const endpoint = resolveEndpoint({
    configEndpoint: config.endpoint,
    env
  });

  return createStoreGateway(endpoint);
}

async function createStoreService(env: EnvMap): Promise<StoreService> {
  if (env.CLIMBING_GO_FIXTURE_DIR) {
    return createFixtureStoreService(env.CLIMBING_GO_FIXTURE_DIR);
  }

  const gateway = await resolveGateway(env);

  return {
    async listStores(args) {
      const result = await gateway.listStores(args);
      return result.data;
    },

    async getStore(storeId) {
      const result = await gateway.getStore(storeId);
      return result.data.store;
    },

    async listProducts(args) {
      const result = await gateway.listProducts(args);
      return result.data;
    }
  };
}

function createTextResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export function shouldRunMcpServer(argv: string[]) {
  return argv.includes('--mcp') || MCP_SERVER_COMMANDS.has(argv[0] ?? '');
}

export async function createMcpServer(env: EnvMap = process.env) {
  const service = await createStoreService(env);
  const server = new McpServer({
    name: 'climbing-go',
    version: CLIMBING_GO_VERSION
  });

  server.registerTool(
    'listStores',
    {
      description: 'List public Banana Climbing stores by city or keyword.',
      inputSchema: {
        city: z.string().optional().describe('Filter stores by city name.'),
        search: z.string().optional().describe('Filter stores by keyword in the store name.'),
        limit: z.number().int().nonnegative().optional().describe('Limit the number of returned stores.'),
        offset: z.number().int().nonnegative().optional().describe('Skip this many stores before returning results.')
      }
    },
    async (args) => createTextResult(await service.listStores(args))
  );

  server.registerTool(
    'getStore',
    {
      description: 'Get one public Banana Climbing store by id.',
      inputSchema: {
        id: z.string().min(1).describe('Store id.')
      }
    },
    async ({ id }) => createTextResult(await service.getStore(id))
  );

  server.registerTool(
    'listProducts',
    {
      description: 'List public Banana Climbing products by candidate stores, product type, or keyword.',
      inputSchema: {
        storeIds: z.array(z.string()).optional().describe('Candidate store ids. Omit when the user has not selected a store.'),
        productTypes: z.array(z.string()).optional().describe('Filter by product type, for example card.'),
        keyword: z.string().optional().describe('Filter products by keyword in product name, description, or SKU name.'),
        limit: z.number().int().nonnegative().optional().describe('Limit the number of returned products.')
      }
    },
    async (args) => createTextResult(await service.listProducts(args))
  );

  return server;
}

export async function runMcpServer(env: EnvMap = process.env) {
  const server = await createMcpServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
