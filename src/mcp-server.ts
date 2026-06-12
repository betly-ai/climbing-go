import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { loadConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import {
  createStoreGateway,
  type ClimbingGateway,
  type CreateOrderArgs,
  type JsonObject,
  type ListProductsArgs,
  type ListStoresArgs,
  type PopularTimesRecord,
  type PreviewOrderArgs,
  type ProductRecord,
  type StoreRecord
} from './store-gateway.js';
import { CLIMBING_GO_VERSION } from './version.js';

export const MCP_SERVER_COMMANDS = new Set(['mcp-serve', 'serve']);

export interface StoreService {
  listStores(args: ListStoresArgs): Promise<{
    stores: StoreRecord[];
    count: number;
  }>;
  getStore(storeId: string): Promise<StoreRecord>;
  getStorePopularTimes(storeId: string): Promise<{
    popular_times: PopularTimesRecord[];
  }>;
  listProducts(args: ListProductsArgs): Promise<{
    products: ProductRecord[];
  }>;
  previewOrder(args: PreviewOrderArgs): Promise<JsonObject>;
  createOrder(args: CreateOrderArgs): Promise<JsonObject>;
}

export interface CreateMcpServerOptions {
  service?: StoreService;
}

async function resolveStoreIdForPopularTimes(
  service: StoreService,
  input: {
    id?: string;
    city?: string;
    search?: string;
  }
) {
  if (input.id?.trim()) {
    return {
      id: input.id.trim(),
      stores: null
    };
  }

  if (!input.city?.trim() && !input.search?.trim()) {
    const error = new Error('Missing store id. Pass id or use city/search to resolve stores.');
    Object.assign(error, { code: 'store_lookup_required' });
    throw error;
  }

  const storesResult = await service.listStores({
    city: input.city?.trim() || undefined,
    search: input.search?.trim() || undefined,
    limit: 100
  });

  return {
    id: null,
    stores: storesResult.stores
  };
}

async function resolveGateway(env: EnvMap): Promise<ClimbingGateway> {
  const config = await loadConfig(env);
  const endpoint = resolveEndpoint({
    configEndpoint: config.endpoint,
    env
  });

  return createStoreGateway(endpoint, {
    orderContext: {
      authorization: env.CLIMBING_MCP_AUTHORIZATION
    }
  });
}

async function createStoreService(env: EnvMap): Promise<StoreService> {
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

    async getStorePopularTimes(storeId) {
      const result = await gateway.getStorePopularTimes(storeId);
      return result.data;
    },

    async listProducts(args) {
      const result = await gateway.listProducts(args);
      return result.data;
    },

    async previewOrder(args) {
      const result = await gateway.previewOrder(args);
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

export async function createMcpServer(
  env: EnvMap = process.env,
  options: CreateMcpServerOptions = {}
) {
  const service = options.service ?? await createStoreService(env);
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
    'getStorePopularTimes',
    {
      description:
        'Get normalized store busy levels by weekday and hour for one or more public Banana Climbing stores.',
      inputSchema: {
        id: z.string().min(1).optional().describe('Store id.'),
        city: z.string().optional().describe('Filter stores by city name before resolving stores.'),
        search: z.string().optional().describe('Filter stores by keyword in the store name before resolving stores.')
      }
    },
    async (args) => {
      const resolved = await resolveStoreIdForPopularTimes(service, args);

      const result = resolved.id
        ? await Promise.all([
            (async () => ({
              ...(await service.getStore(resolved.id as string)),
              popular_times: (await service.getStorePopularTimes(resolved.id as string)).popular_times
            }))()
          ])
        : await Promise.all(
            (resolved.stores ?? []).map(async (store) => ({
              ...store,
              popular_times: (await service.getStorePopularTimes(store.id)).popular_times
            }))
          );

      return createTextResult({
        stores: result,
        count: result.length
      });
    }
  );

  server.registerTool(
    'listProducts',
    {
      description: 'List purchasable Banana Climbing products for conversation checkout.',
      inputSchema: {
        storeIds: z.array(z.string()).optional().describe('Candidate store ids. Omit when the user has not selected a store.'),
        productTypes: z.array(z.string()).optional().describe('Product types such as card, bundle, or goods.'),
        keyword: z.string().optional().describe('Keyword such as 新手, 体验, or 单次.'),
        limit: z.number().int().positive().optional().describe('Maximum number of products to return.')
      }
    },
    async (args) => createTextResult(await service.listProducts(args))
  );

  const orderBaseInputSchema = {
    store_id: z.string().min(1).describe('Purchase store id.'),
    variant_id: z.string().min(1).describe('Product variant id from listProducts variants[].id.'),
    payment_channel: z.string().min(1).describe('Payment channel such as alipay or wechat.'),
    quantity: z.number().int().positive().optional().describe('Purchase quantity. Defaults to 1.'),
    participant_id: z.string().optional().describe('Participant id.'),
    user_coupon_id: z.string().optional().describe('User coupon id.'),
    promotion_id: z.string().optional().describe('Promotion id.')
  };

  server.registerTool(
    'previewOrder',
    {
      description: 'Preview a pending order before user confirmation. This does not create an order.',
      inputSchema: orderBaseInputSchema
    },
    async (args) => createTextResult(await service.previewOrder(args))
  );

  server.registerTool(
    'createOrder',
    {
      description: 'Create a pending order only after explicit user confirmation.',
      inputSchema: orderBaseInputSchema
    },
    async (args) => createTextResult(await service.createOrder(args))
  );

  return server;
}

export async function runMcpServer(env: EnvMap = process.env) {
  const server = await createMcpServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
