import { sanitizeEndpoint, validateEndpoint } from './endpoint.js';

export interface StoreRecord {
  id: string;
  name: string;
  city?: string;
  [key: string]: unknown;
}

export interface ListStoresArgs {
  city?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ProductRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ListProductsArgs {
  storeIds?: string[];
  productTypes?: string[];
  keyword?: string;
  limit?: number;
}

export interface PreviewAlipayOrderArgs {
  orgId?: string;
  accessToken?: string;
  storeId: string;
  variantId: string;
  quantity?: number;
  participantId?: string;
  userCouponId?: string;
  promotionId?: string;
}

export interface CreateAlipayPendingOrderArgs extends PreviewAlipayOrderArgs {
  paymentActionType?: 'web_cashier' | 'mini_program';
}

export interface ConversationAgentLoginArgs {
  orgId: string;
  apiKey: string;
  apiSecret: string;
  secretVersion: string;
  encryptedPhone: string;
}

export interface ConversationPayPreviewResult {
  preview: Record<string, unknown>;
  assistant_message?: string;
  [key: string]: unknown;
}

export interface ConversationPayCreateResult {
  order: Record<string, unknown>;
  payment: Record<string, unknown>;
  payment_action: Record<string, unknown> | null;
  assistant_message?: string;
  [key: string]: unknown;
}

export interface ConversationAgentLoginResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  user?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoreGateway {
  listStores(args?: ListStoresArgs): Promise<{
    ok: true;
    tool: 'listStores';
    endpoint: string;
    data: {
      stores: StoreRecord[];
      count: number;
    };
  }>;
  getStore(storeId: string): Promise<{
    ok: true;
    tool: 'getStore';
    endpoint: string;
    data: {
      store: StoreRecord;
    };
  }>;
  listProducts(args?: ListProductsArgs): Promise<{
    ok: true;
    tool: 'listProducts';
    endpoint: string;
    data: {
      store?: StoreRecord;
      products: ProductRecord[];
      count: number;
    };
  }>;
  conversationAgentLogin(args: ConversationAgentLoginArgs): Promise<{
    ok: true;
    tool: 'conversation-agent-login';
    endpoint: string;
    data: ConversationAgentLoginResult;
  }>;
  previewAlipayOrder(args: PreviewAlipayOrderArgs): Promise<{
    ok: true;
    tool: 'preview-alipay-order';
    endpoint: string;
    data: ConversationPayPreviewResult;
  }>;
  createAlipayPendingOrder(args: CreateAlipayPendingOrderArgs): Promise<{
    ok: true;
    tool: 'create-alipay-pending-order';
    endpoint: string;
    data: ConversationPayCreateResult;
  }>;
}

export interface StoreGatewayOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  allowInsecure?: boolean;
}

export class StoreGatewayError extends Error {
  code: string;
  endpoint: string;
  status?: number;

  constructor(input: { code: string; message: string; endpoint: string; status?: number }) {
    super(input.message);
    this.name = 'StoreGatewayError';
    this.code = input.code;
    this.endpoint = input.endpoint;
    this.status = input.status;
  }
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STORE_LIST_LIMIT = 20;
const DEFAULT_PRODUCT_LIST_LIMIT = 20;
const DEFAULT_PRODUCT_TYPES = ['card'];
const MAX_ERROR_BODY_LENGTH = 512;

function normalizeEndpoint(endpoint: string, allowInsecure = false) {
  const url = validateEndpoint(endpoint, { allowInsecure });

  if (url.protocol === 'http:') {
    process.stderr.write(
      `Warning: endpoint uses insecure http: scheme — consider using https: instead\n`
    );
  }

  // Strip userinfo — credentials must not travel in the URL
  url.username = '';
  url.password = '';

  const normalizedPath = url.pathname.replace(/\/+$/, '');

  if (normalizedPath.endsWith('/api/climbing/mcp')) {
    url.pathname = normalizedPath;
    return url.toString();
  }

  url.pathname = `${normalizedPath}/api/climbing/mcp`.replace(/\/{2,}/g, '/');
  return url.toString();
}

async function parseJsonResponse(response: Response, endpoint: string): Promise<JsonRpcSuccess> {
  const rawText = await response.text();
  const safeEndpoint = sanitizeEndpoint(endpoint);

  if (response.status === 404) {
    throw new StoreGatewayError({
      code: 'endpoint_not_found',
      message: `MCP endpoint not found: ${safeEndpoint}`,
      endpoint: safeEndpoint,
      status: 404
    });
  }

  if (!response.ok) {
    const body = rawText || response.statusText;
    const truncatedBody = body.length > MAX_ERROR_BODY_LENGTH
      ? `${body.slice(0, MAX_ERROR_BODY_LENGTH)}… (truncated)`
      : body;
    throw new StoreGatewayError({
      code: 'service_error',
      message: `MCP service error (${response.status}): ${truncatedBody}`,
      endpoint: safeEndpoint,
      status: response.status
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new StoreGatewayError({
      code: 'invalid_response',
      message: 'MCP service returned invalid JSON',
      endpoint: safeEndpoint,
      status: response.status
    });
  }

  if (typeof parsed !== 'object' || parsed === null || !('jsonrpc' in parsed)) {
    throw new StoreGatewayError({
      code: 'invalid_response',
      message: 'MCP response is not a valid JSON-RPC 2.0 object',
      endpoint: safeEndpoint,
      status: response.status
    });
  }

  return parsed as JsonRpcSuccess;
}

function parseContentText(payload: JsonRpcSuccess, endpoint: string) {
  const safeEndpoint = sanitizeEndpoint(endpoint);

  if (payload.error?.message) {
    throw new StoreGatewayError({
      code: 'service_error',
      message: payload.error.message,
      endpoint: safeEndpoint
    });
  }

  const text = payload.result?.content?.find(item => item.type === 'text' && typeof item.text === 'string')?.text;

  if (!text) {
    throw new StoreGatewayError({
      code: 'invalid_response',
      message: 'MCP response did not include text content',
      endpoint: safeEndpoint
    });
  }

  if (text === 'Store not found') {
    throw new StoreGatewayError({
      code: 'not_found',
      message: text,
      endpoint: safeEndpoint,
      status: 404
    });
  }

  if (text.startsWith('Error:')) {
    throw new StoreGatewayError({
      code: 'service_error',
      message: text.slice('Error:'.length).trim(),
      endpoint: safeEndpoint
    });
  }

  return text;
}

function parseToolJson(text: string, toolName: string, endpoint: string) {
  try {
    const data = JSON.parse(text);

    if (typeof data !== 'object' || data === null) {
      throw new StoreGatewayError({
        code: 'invalid_response',
        message: `${toolName} content is not a JSON object`,
        endpoint
      });
    }

    const record = data as Record<string, unknown>;
    if (record.success === false) {
      throw new StoreGatewayError({
        code: typeof record.code === 'string' ? record.code : 'service_error',
        message: typeof record.message === 'string' ? record.message : `${toolName} request failed`,
        endpoint,
        status: typeof record.http_status === 'number' ? record.http_status : undefined
      });
    }

    return record;
  } catch (error) {
    if (error instanceof StoreGatewayError) {
      throw error;
    }

    throw new StoreGatewayError({
      code: 'invalid_response',
      message: `${toolName} content is not valid JSON`,
      endpoint
    });
  }
}

async function callTool(
  input: {
    endpoint: string;
    toolName:
      | 'listStores'
      | 'getStore'
      | 'listProducts'
      | 'conversation-agent-login'
      | 'preview-alipay-order'
      | 'create-alipay-pending-order';
    args: object;
    headers?: Record<string, string>;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  }
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...input.headers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: input.toolName,
          arguments: input.args
        }
      }),
      signal: controller.signal
    });

    return await parseJsonResponse(response, input.endpoint);
  } catch (error) {
    if (error instanceof StoreGatewayError) {
      throw error;
    }

    const safeEndpoint = sanitizeEndpoint(input.endpoint);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new StoreGatewayError({
        code: 'timeout',
        message: `Request timed out after ${input.timeoutMs}ms`,
        endpoint: safeEndpoint
      });
    }

    throw new StoreGatewayError({
      code: 'network_error',
      message: error instanceof Error ? error.message : 'Network error',
      endpoint: safeEndpoint
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function toConversationPayArgs(args: PreviewAlipayOrderArgs | CreateAlipayPendingOrderArgs) {
  const payload: Record<string, unknown> = {
    store_id: args.storeId,
    variant_id: args.variantId
  };

  if (args.quantity !== undefined) payload.quantity = args.quantity;
  if (args.participantId !== undefined) payload.participant_id = args.participantId;
  if (args.userCouponId !== undefined) payload.user_coupon_id = args.userCouponId;
  if (args.promotionId !== undefined) payload.promotion_id = args.promotionId;
  if ('paymentActionType' in args && args.paymentActionType !== undefined) {
    payload.payment_action_type = args.paymentActionType;
  }

  return payload;
}

function toListProductsArgs(args: ListProductsArgs) {
  const payload: Record<string, unknown> = {
    productTypes: args.productTypes ?? DEFAULT_PRODUCT_TYPES
  };

  if (args.storeIds !== undefined) payload.storeIds = args.storeIds;
  if (args.keyword !== undefined) payload.keyword = args.keyword;
  if (args.limit !== undefined) payload.limit = args.limit;

  return payload;
}

function toConversationAgentLoginHeaders(args: ConversationAgentLoginArgs) {
  return {
    'X-ORG-ID': args.orgId,
    'X-API-KEY': args.apiKey,
    'X-API-SECRET': args.apiSecret,
    'X-SECRET-VERSION': args.secretVersion,
    'X-Encryped-PHONE': args.encryptedPhone
  };
}

function toConversationPayHeaders(args: PreviewAlipayOrderArgs | CreateAlipayPendingOrderArgs) {
  const headers: Record<string, string> = {};
  if (args.orgId) headers['X-ORG-ID'] = args.orgId;
  if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`;
  return headers;
}

export function createStoreGateway(endpoint: string, options: StoreGatewayOptions = {}): StoreGateway {
  const normalizedEndpoint = normalizeEndpoint(endpoint, options.allowInsecure);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async listStores(args: ListStoresArgs = {}) {
      const requestArgs =
        args.limit === undefined
          ? { ...args, limit: DEFAULT_STORE_LIST_LIMIT }
          : args;

      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'listStores',
        args: requestArgs,
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listStores content is not valid JSON',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof data !== 'object' || data === null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listStores content is not a JSON object',
          endpoint: normalizedEndpoint
        });
      }

      const record = data as Record<string, unknown>;

      if ('stores' in record && !Array.isArray(record.stores)) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listStores response field "stores" must be an array',
          endpoint: normalizedEndpoint
        });
      }

      const stores = Array.isArray(record.stores) ? record.stores as StoreRecord[] : [];

      for (const store of stores) {
        if (typeof store !== 'object' || store === null || typeof store.id !== 'string' || typeof store.name !== 'string') {
          throw new StoreGatewayError({
            code: 'invalid_response',
            message: 'listStores contains a store entry missing required id or name fields',
            endpoint: normalizedEndpoint
          });
        }
      }

      return {
        ok: true,
        tool: 'listStores',
        endpoint: normalizedEndpoint,
        data: {
          stores,
          count: typeof record.count === 'number' ? record.count : stores.length
        }
      };
    },

    async getStore(storeId: string) {
      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'getStore',
        args: { id: storeId },
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'getStore content is not valid JSON',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof data !== 'object' || data === null || typeof (data as StoreRecord).id !== 'string' || typeof (data as StoreRecord).name !== 'string') {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'getStore response missing required id or name fields',
          endpoint: normalizedEndpoint
        });
      }

      const store = data as StoreRecord;

      return {
        ok: true,
        tool: 'getStore',
        endpoint: normalizedEndpoint,
        data: {
          store
        }
      };
    },

    async listProducts(args: ListProductsArgs = {}) {
      const requestArgs =
        args.limit === undefined
          ? { ...args, limit: DEFAULT_PRODUCT_LIST_LIMIT }
          : args;

      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'listProducts',
        args: toListProductsArgs(requestArgs),
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listProducts content is not valid JSON',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof data !== 'object' || data === null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listProducts content is not a JSON object',
          endpoint: normalizedEndpoint
        });
      }

      const record = data as Record<string, unknown>;

      if ('products' in record && !Array.isArray(record.products)) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'listProducts response field "products" must be an array',
          endpoint: normalizedEndpoint
        });
      }

      const products = Array.isArray(record.products) ? record.products as ProductRecord[] : [];

      for (const product of products) {
        if (typeof product !== 'object' || product === null || typeof product.id !== 'string' || typeof product.name !== 'string') {
          throw new StoreGatewayError({
            code: 'invalid_response',
            message: 'listProducts contains a product entry missing required id or name fields',
            endpoint: normalizedEndpoint
          });
        }
      }

      return {
        ok: true,
        tool: 'listProducts',
        endpoint: normalizedEndpoint,
        data: {
          store: record.store as StoreRecord | undefined,
          products,
          count: typeof record.count === 'number' ? record.count : products.length
        }
      };
    },

    async conversationAgentLogin(args: ConversationAgentLoginArgs) {
      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'conversation-agent-login',
        args: {},
        headers: toConversationAgentLoginHeaders(args),
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);
      const record = parseToolJson(text, 'conversation-agent-login', normalizedEndpoint);

      if (typeof record.access_token !== 'string' || typeof record.token_type !== 'string') {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'conversation-agent-login response missing required access_token or token_type fields',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof record.expires_in !== 'number') {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'conversation-agent-login response missing required expires_in field',
          endpoint: normalizedEndpoint
        });
      }

      return {
        ok: true,
        tool: 'conversation-agent-login',
        endpoint: normalizedEndpoint,
        data: record as unknown as ConversationAgentLoginResult
      };
    },

    async previewAlipayOrder(args: PreviewAlipayOrderArgs) {
      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'preview-alipay-order',
        args: toConversationPayArgs(args),
        headers: toConversationPayHeaders(args),
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);
      const record = parseToolJson(text, 'preview-alipay-order', normalizedEndpoint);

      if (typeof record.preview !== 'object' || record.preview === null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'preview-alipay-order response missing required preview object',
          endpoint: normalizedEndpoint
        });
      }

      return {
        ok: true,
        tool: 'preview-alipay-order',
        endpoint: normalizedEndpoint,
        data: record as unknown as ConversationPayPreviewResult
      };
    },

    async createAlipayPendingOrder(args: CreateAlipayPendingOrderArgs) {
      const response = await callTool({
        endpoint: normalizedEndpoint,
        toolName: 'create-alipay-pending-order',
        args: toConversationPayArgs(args),
        headers: toConversationPayHeaders(args),
        fetchImpl,
        timeoutMs
      });
      const text = parseContentText(response, normalizedEndpoint);
      const record = parseToolJson(text, 'create-alipay-pending-order', normalizedEndpoint);

      if (typeof record.order !== 'object' || record.order === null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'create-alipay-pending-order response missing required order object',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof record.payment !== 'object' || record.payment === null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'create-alipay-pending-order response missing required payment object',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof record.payment_action !== 'object' && record.payment_action !== null) {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'create-alipay-pending-order response payment_action must be an object or null',
          endpoint: normalizedEndpoint
        });
      }

      const order = record.order as Record<string, unknown>;
      const payment = record.payment as Record<string, unknown>;

      if (typeof order.order_id !== 'string' || typeof order.status !== 'string') {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'create-alipay-pending-order response order missing required order_id or status fields',
          endpoint: normalizedEndpoint
        });
      }

      if (typeof payment.channel_type !== 'string' || typeof payment.payment_ref !== 'string') {
        throw new StoreGatewayError({
          code: 'invalid_response',
          message: 'create-alipay-pending-order response payment missing required channel_type or payment_ref fields',
          endpoint: normalizedEndpoint
        });
      }

      return {
        ok: true,
        tool: 'create-alipay-pending-order',
        endpoint: normalizedEndpoint,
        data: record as unknown as ConversationPayCreateResult
      };
    }
  };
}
