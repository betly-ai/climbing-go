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
const DEFAULT_STORE_LIST_LIMIT = 100;
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

async function callTool(
  input: {
    endpoint: string;
    toolName: 'listStores' | 'getStore';
    args: object;
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
        'content-type': 'application/json'
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
    }
  };
}
