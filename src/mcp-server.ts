import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { loadConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import {
  type CreateOrderArgs,
  createStoreGateway,
  type ListProductsArgs,
  type ListStoresArgs,
  type OrderRecord,
  type PaymentRecord,
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
  createOrder(args: CreateOrderArgs): Promise<{
    order: OrderRecord;
    payment: PaymentRecord;
  }>;
}

interface FixtureOrderVariant {
  id: string;
  name: string;
  unit_price: number;
}

interface FixtureOrderPayload {
  store: StoreRecord;
  variants: FixtureOrderVariant[];
  payment: PaymentRecord;
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

      const filtered = (payload.products ?? []).filter(product => {
        if (args.search && !product.name.toLowerCase().includes(args.search.toLowerCase())) {
          return false;
        }

        return true;
      });
      const start = Math.max(args.offset ?? 0, 0);
      const end = args.limit ? start + Math.max(args.limit, 0) : undefined;

      return {
        store: payload.store,
        products: filtered.slice(start, end),
        count: filtered.length
      };
    },

    async createOrder(args) {
      const payload = await loadFixtureJson<FixtureOrderPayload>(fixtureDir, 'order-create.json');

      if (payload.store.id !== args.storeId) {
        throw new Error('Store not found');
      }

      const items = args.items.map(item => {
        const variant = payload.variants.find(candidate => candidate.id === item.variantId);

        if (!variant) {
          throw new Error(`Product variant not found: ${item.variantId}`);
        }

        return {
          variant_id: variant.id,
          name: variant.name,
          quantity: item.quantity,
          unit_price: variant.unit_price,
          subtotal: variant.unit_price * item.quantity
        };
      });
      const amount = items.reduce((sum, item) => sum + item.subtotal, 0);

      return {
        order: {
          id: 'fixture-order-1',
          store_id: args.storeId,
          user_id: args.userId,
          status: 'pending_payment',
          amount,
          currency: 'CNY',
          items
        },
        payment: payload.payment
      };
    }
  };
}

function normalizeCreateOrderArgs(args: {
  storeId: string;
  userId: string;
  items: Array<{
    variantId: string;
    quantity?: number;
  }>;
  paymentChannel?: 'alipay';
}): CreateOrderArgs {
  return {
    storeId: args.storeId,
    userId: args.userId,
    items: args.items.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity ?? 1
    })),
    paymentChannel: args.paymentChannel ?? 'alipay'
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
    },

    async createOrder(args) {
      const result = await gateway.createOrder(args);
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
      description: 'List public Banana Climbing products for a store or city.',
      inputSchema: {
        storeId: z.string().optional().describe('Store id. Takes precedence over city.'),
        city: z.string().optional().describe('Select a store by city when storeId is not provided.'),
        storeSearch: z.string().optional().describe('Search store name when storeId is not provided.'),
        search: z.string().optional().describe('Filter products by keyword in the product name.'),
        limit: z.number().int().nonnegative().optional().describe('Limit the number of returned products.'),
        offset: z.number().int().nonnegative().optional().describe('Skip this many products before returning results.')
      }
    },
    async (args) => createTextResult(await service.listProducts(args))
  );

  server.registerTool(
    'createOrder',
    {
      description: 'Create a card product order and start Alipay payment.',
      inputSchema: {
        storeId: z.string().min(1).describe('Store id.'),
        userId: z.string().min(1).describe('Public user id for creating the order.'),
        items: z.array(z.object({
          variantId: z.string().min(1).describe('Product variant id from products[].variants[].id.'),
          quantity: z.number().int().positive().optional().describe('Item quantity. Defaults to 1.')
        })).min(1).describe('Order items.'),
        paymentChannel: z.literal('alipay').optional().describe('Payment channel. Defaults to alipay.')
      }
    },
    async (args) => createTextResult(await service.createOrder(normalizeCreateOrderArgs(args)))
  );

  return server;
}

export async function runMcpServer(env: EnvMap = process.env) {
  const server = await createMcpServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
