import { describe, expect, it } from 'vitest';

async function importStoreGatewayModule() {
  return import('../src/store-gateway.js').catch(() => null);
}

describe('store gateway', () => {
  it('requests a large default limit when no limit is provided', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;
    let requestedLimit: number | undefined;

    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params?: {
          arguments?: {
            limit?: number;
          };
        };
      };
      requestedLimit = body.params?.arguments?.limit;

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  stores: Array.from({ length: 23 }, (_, index) => ({
                    id: `store-${index + 1}`,
                    name: `门店${index + 1}`
                  })),
                  count: 23
                })
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    };

    const result =
      typeof createStoreGateway === 'function'
        ? await createStoreGateway('https://example.com', { fetch: fetchMock }).listStores()
        : null;

    expect(result).toEqual({
      ok: true,
      tool: 'listStores',
      endpoint: 'https://example.com/api/climbing/mcp',
      data: {
        stores: Array.from({ length: 23 }, (_, index) => ({
          id: `store-${index + 1}`,
          name: `门店${index + 1}`
        })),
        count: 23
      }
    });
    expect(requestedLimit).toBe(100);
  });

  it('parses listStores MCP content into structured list data', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  stores: [{ id: 'store-1', name: '香蕉攀岩' }],
                  count: 1
                })
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );

    const result =
      typeof createStoreGateway === 'function'
        ? await createStoreGateway('https://example.com', { fetch: fetchMock }).listStores({ city: '上海' })
        : null;

    expect(result).toEqual({
      ok: true,
      tool: 'listStores',
      endpoint: 'https://example.com/api/climbing/mcp',
      data: {
        stores: [{ id: 'store-1', name: '香蕉攀岩' }],
        count: 1
      }
    });
  });

  it('parses getStore MCP content into structured store data', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  id: 'store-1',
                  name: '香蕉攀岩',
                  city: '上海'
                })
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );

    const result =
      typeof createStoreGateway === 'function'
        ? await createStoreGateway('https://example.com/base/', { fetch: fetchMock }).getStore('store-1')
        : null;

    expect(result).toEqual({
      ok: true,
      tool: 'getStore',
      endpoint: 'https://example.com/base/api/climbing/mcp',
      data: {
        store: {
          id: 'store-1',
          name: '香蕉攀岩',
          city: '上海'
        }
      }
    });
  });

  it('returns a not_found error when MCP returns Store not found', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: 'Store not found' }]
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.getStore('missing-store')).rejects.toMatchObject({
      code: 'not_found',
      message: 'Store not found'
    });
  });

  it('maps 404 responses to a clear endpoint error', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () => new Response('404 Not Found', { status: 404 });
    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'endpoint_not_found'
    });
  });

  it('maps abort errors to timeout', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    };

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'timeout'
    });
  });
});
