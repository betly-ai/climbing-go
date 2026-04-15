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

function normalizeEndpoint(endpoint: string) {
  const url = new URL(endpoint);
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

  if (response.status === 404) {
    throw new StoreGatewayError({
      code: 'endpoint_not_found',
      message: `MCP endpoint not found: ${endpoint}`,
      endpoint,
      status: 404
    });
  }

  if (!response.ok) {
    throw new StoreGatewayError({
      code: 'service_error',
      message: `MCP service error (${response.status}): ${rawText || response.statusText}`,
      endpoint,
      status: response.status
    });
  }

  try {
    return JSON.parse(rawText) as JsonRpcSuccess;
  } catch {
    throw new StoreGatewayError({
      code: 'invalid_response',
      message: 'MCP service returned invalid JSON',
      endpoint,
      status: response.status
    });
  }
}

function parseContentText(payload: JsonRpcSuccess, endpoint: string) {
  if (payload.error?.message) {
    throw new StoreGatewayError({
      code: 'service_error',
      message: payload.error.message,
      endpoint
    });
  }

  const text = payload.result?.content?.find(item => item.type === 'text' && typeof item.text === 'string')?.text;

  if (!text) {
    throw new StoreGatewayError({
      code: 'invalid_response',
      message: 'MCP response did not include text content',
      endpoint
    });
  }

  if (text === 'Store not found') {
    throw new StoreGatewayError({
      code: 'not_found',
      message: text,
      endpoint,
      status: 404
    });
  }

  if (text.startsWith('Error:')) {
    throw new StoreGatewayError({
      code: 'service_error',
      message: text.slice('Error:'.length).trim(),
      endpoint
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

    if (error instanceof Error && error.name === 'AbortError') {
      throw new StoreGatewayError({
        code: 'timeout',
        message: `Request timed out after ${input.timeoutMs}ms`,
        endpoint: input.endpoint
      });
    }

    throw new StoreGatewayError({
      code: 'network_error',
      message: error instanceof Error ? error.message : 'Network error',
      endpoint: input.endpoint
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createStoreGateway(endpoint: string, options: StoreGatewayOptions = {}): StoreGateway {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
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
      const data = JSON.parse(text) as { stores?: StoreRecord[]; count?: number };

      return {
        ok: true,
        tool: 'listStores',
        endpoint: normalizedEndpoint,
        data: {
          stores: data.stores ?? [],
          count: data.count ?? (data.stores ?? []).length
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
      const store = JSON.parse(text) as StoreRecord;

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
