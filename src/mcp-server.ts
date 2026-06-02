import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { loadConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import {
  type ConversationAgentLoginArgs,
  type ConversationAgentLoginResult,
  type ConversationPayCreateResult,
  type ConversationPayPreviewResult,
  type CreateAlipayPendingOrderArgs,
  createStoreGateway,
  type ListProductsArgs,
  type ListStoresArgs,
  type PreviewAlipayOrderArgs,
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
  previewAlipayOrder(args: PreviewAlipayOrderArgs): Promise<ConversationPayPreviewResult>;
  createAlipayPendingOrder(args: CreateAlipayPendingOrderArgs): Promise<ConversationPayCreateResult>;
  conversationAgentLogin(args: ConversationAgentLoginArgs): Promise<ConversationAgentLoginResult>;
}

interface FixtureOrderVariant {
  id: string;
  name: string;
  unit_price: number;
}

interface FixtureOrderPayload {
  store: StoreRecord;
  variants: FixtureOrderVariant[];
  payment_action: Record<string, unknown> | null;
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
  async function resolveOrderPreview(args: PreviewAlipayOrderArgs) {
    const payload = await loadFixtureJson<FixtureOrderPayload>(fixtureDir, 'order-create.json');

    if (payload.store.id !== args.storeId) {
      throw new Error('Store not found');
    }

    const variant = payload.variants.find(candidate => candidate.id === args.variantId);

    if (!variant) {
      throw new Error(`Product variant not found: ${args.variantId}`);
    }

    const quantity = args.quantity ?? 1;
    const amount = variant.unit_price * quantity;

    return {
      payload,
      item: {
        variant_id: variant.id,
        name: variant.name,
        quantity,
        unit_price: variant.unit_price,
        final_unit_price: variant.unit_price,
        amount
      },
      amount
    };
  }

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

    async conversationAgentLogin() {
      return {
        access_token: 'fixture-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        user: {
          id: 'fixture-user',
          mobile: '138****8000',
          is_new_user: false
        }
      };
    },

    async previewAlipayOrder(args) {
      const preview = await resolveOrderPreview(args);

      return {
        preview: {
          org_id: args.orgId,
          store_id: args.storeId,
          user_id: 'fixture-user',
          items: [preview.item],
          amount: preview.amount,
          currency: 'CNY',
          payment_channel_type: 'alipay'
        },
        assistant_message: `订单合计 ${preview.amount} 元。确认购买后我会为你创建支付宝待支付订单。`
      };
    },

    async createAlipayPendingOrder(args) {
      const preview = await resolveOrderPreview(args);

      return {
        order: {
          order_id: 'fixture-order-1',
          order_no: 'ORD-FIXTURE-1',
          amount: preview.amount,
          currency: 'CNY',
          status: 'pending',
          expires_at: null
        },
        payment: {
          channel_type: 'alipay',
          payment_id: 'fixture-payment-1',
          payment_ref: 'PAY-FIXTURE-1',
          provider: 'alipay'
        },
        payment_action: preview.payload.payment_action,
        assistant_message: `订单已创建，金额 ${preview.amount} 元。请在支付宝完成支付，支付成功后订单会自动更新。`
      };
    }
  };
}

function normalizeConversationAgentLoginArgs(args: {
  org_id: string;
  api_key: string;
  api_secret: string;
  secret_version: string;
  encrypted_phone: string;
}): ConversationAgentLoginArgs {
  return {
    orgId: args.org_id,
    apiKey: args.api_key,
    apiSecret: args.api_secret,
    secretVersion: args.secret_version,
    encryptedPhone: args.encrypted_phone
  };
}

function normalizePreviewAlipayOrderArgs(args: {
  org_id: string;
  mobile: string;
  store_id: string;
  variant_id: string;
  quantity?: number;
  participant_id?: string;
  user_coupon_id?: string;
  promotion_id?: string;
}): PreviewAlipayOrderArgs {
  return {
    orgId: args.org_id,
    mobile: args.mobile,
    storeId: args.store_id,
    variantId: args.variant_id,
    quantity: args.quantity,
    participantId: args.participant_id,
    userCouponId: args.user_coupon_id,
    promotionId: args.promotion_id
  };
}

function normalizeCreateAlipayPendingOrderArgs(args: {
  org_id: string;
  mobile: string;
  store_id: string;
  variant_id: string;
  quantity?: number;
  participant_id?: string;
  user_coupon_id?: string;
  promotion_id?: string;
  payment_action_type?: 'web_cashier' | 'mini_program';
}): CreateAlipayPendingOrderArgs {
  return {
    ...normalizePreviewAlipayOrderArgs(args),
    paymentActionType: args.payment_action_type
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

    async conversationAgentLogin(args) {
      const result = await gateway.conversationAgentLogin(args);
      return result.data;
    },

    async previewAlipayOrder(args) {
      const result = await gateway.previewAlipayOrder(args);
      return result.data;
    },

    async createAlipayPendingOrder(args) {
      const result = await gateway.createAlipayPendingOrder(args);
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
    'conversation-agent-login',
    {
      description: 'Login a conversation agent user with encrypted mobile phone headers and return an access token.',
      inputSchema: {
        org_id: z.string().min(1).describe('Organization id.'),
        api_key: z.string().min(1).describe('Conversation agent api key.'),
        api_secret: z.string().min(1).describe('Conversation agent public key. Forwarded as X-API-SECRET.'),
        secret_version: z.string().min(1).describe('Conversation agent secret version. Forwarded as X-SECRET-VERSION.'),
        encrypted_phone: z.string().min(1).describe('Encrypted mobile phone ciphertext. Forwarded as X-Encryped-PHONE.')
      }
    },
    async (args) => createTextResult(await service.conversationAgentLogin(normalizeConversationAgentLoginArgs(args)))
  );

  const conversationPayInputSchema = {
    org_id: z.string().min(1).describe('Organization id.'),
    mobile: z.string().min(1).describe('Payer mobile number.'),
    store_id: z.string().min(1).describe('Store id.'),
    variant_id: z.string().min(1).describe('Product variant id from products[].variants[].id.'),
    quantity: z.number().int().positive().optional().describe('Item quantity. Defaults to 1.'),
    participant_id: z.string().optional().describe('Participant id.'),
    user_coupon_id: z.string().optional().describe('User coupon id.'),
    promotion_id: z.string().optional().describe('Promotion id.')
  };

  server.registerTool(
    'preview-alipay-order',
    {
      description: 'Preview an Alipay pending order before user confirmation.',
      inputSchema: conversationPayInputSchema
    },
    async (args) => createTextResult(await service.previewAlipayOrder(normalizePreviewAlipayOrderArgs(args)))
  );

  server.registerTool(
    'create-alipay-pending-order',
    {
      description: 'Create an Alipay pending order and return the payment action from Betly API.',
      inputSchema: {
        ...conversationPayInputSchema,
        payment_action_type: z.enum(['web_cashier', 'mini_program']).optional().describe('Alipay action type. Defaults to web_cashier in Betly API.')
      }
    },
    async (args) => createTextResult(await service.createAlipayPendingOrder(normalizeCreateAlipayPendingOrderArgs(args)))
  );

  return server;
}

export async function runMcpServer(env: EnvMap = process.env) {
  const server = await createMcpServer(env);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
