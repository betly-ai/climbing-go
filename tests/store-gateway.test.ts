import { describe, expect, it } from 'vitest';

async function importStoreGatewayModule() {
  return import('../src/store-gateway.js').catch(() => null);
}

describe('store gateway endpoint validation', () => {
  it('rejects non-http/https endpoints', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    expect(
      typeof createStoreGateway === 'function'
        ? () => createStoreGateway('file:///etc/passwd')
        : null
    ).toThrow(/only http: and https: are allowed/);
  });

  it('rejects insecure http endpoints unless allowInsecure is enabled', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    expect(
      typeof createStoreGateway === 'function'
        ? () => createStoreGateway('http://example.com')
        : null
    ).toThrow(/--insecure/);

    expect(
      typeof createStoreGateway === 'function'
        ? () => createStoreGateway('http://example.com', { allowInsecure: true })
        : null
    ).not.toThrow();
  });

  it('strips userinfo from normalized endpoint', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;
    let requestedUrl = '';

    const fetchMock = async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ stores: [], count: 0 })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    if (typeof createStoreGateway === 'function') {
      await createStoreGateway('https://user:pass@example.com', { fetch: fetchMock }).listStores();
      expect(requestedUrl).not.toContain('user:pass');
      expect(requestedUrl).toContain('example.com');
    }
  });
});

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

  it('requests a large default product limit when no limit is provided', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;
    let requestedLimit: number | undefined;
    let requestedTool: string | undefined;

    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params?: {
          name?: string;
          arguments?: {
            limit?: number;
          };
        };
      };
      requestedTool = body.params?.name;
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
                  store: { id: 'store-1', name: '香蕉攀岩' },
                  products: [
                    {
                      id: 'product-1',
                      name: 'Fixture Count Product',
                      product_id: 'product-1',
                      variants: [{ id: 'variant-1', name: 'Fixture Count SKU', price: 123, original_price: 123 }]
                    }
                  ],
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
    };

    const result =
      typeof createStoreGateway === 'function'
        ? await createStoreGateway('https://example.com', { fetch: fetchMock }).listProducts()
        : null;

    expect(result).toEqual({
      ok: true,
      tool: 'listProducts',
      endpoint: 'https://example.com/api/climbing/mcp',
      data: {
        store: { id: 'store-1', name: '香蕉攀岩' },
        products: [
          {
            id: 'product-1',
            name: 'Fixture Count Product',
            product_id: 'product-1',
            variants: [{ id: 'variant-1', name: 'Fixture Count SKU', price: 123, original_price: 123 }]
          }
        ],
        count: 1
      }
    });
    expect(requestedTool).toBe('listProducts');
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

  it('parses listProducts MCP content into structured product data', async () => {
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
                  store: {
                    id: 'store-1',
                    name: 'Fixture Product Store'
                  },
                  products: [
                    {
                      id: 'product-1',
                      name: 'Fixture Time Product',
                      product_id: 'product-1',
                      type: 'time',
                      variants: [{ id: 'variant-1', name: 'Fixture Time SKU', price: 456, original_price: 456 }]
                    }
                  ],
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
        ? await createStoreGateway('https://example.com/base/', { fetch: fetchMock }).listProducts({
            city: 'fixture-city',
            storeSearch: 'Fixture'
          })
        : null;

    expect(result).toEqual({
      ok: true,
      tool: 'listProducts',
      endpoint: 'https://example.com/base/api/climbing/mcp',
      data: {
        store: {
          id: 'store-1',
          name: 'Fixture Product Store'
        },
        products: [
          {
            id: 'product-1',
            name: 'Fixture Time Product',
            product_id: 'product-1',
            type: 'time',
            variants: [{ id: 'variant-1', name: 'Fixture Time SKU', price: 456, original_price: 456 }]
          }
        ],
        count: 1
      }
    });
  });

  it('calls preview-alipay-order and parses structured preview data', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;
    let requestedTool: string | undefined;
    let requestedArgs: unknown;

    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params?: {
          name?: string;
          arguments?: unknown;
        };
      };
      requestedTool = body.params?.name;
      requestedArgs = body.params?.arguments;

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  preview: {
                    org_id: 'fixture-org',
                    store_id: 'fixture-store',
                    user_id: 'fixture-user',
                    amount: 123,
                    currency: 'CNY',
                    items: [
                      {
                        variant_id: 'fixture-variant',
                        quantity: 1,
                        unit_price: 123,
                        subtotal: 123
                      }
                    ],
                    payment_channel_type: 'alipay'
                  }
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
        ? await createStoreGateway('https://example.com/base/', { fetch: fetchMock }).previewAlipayOrder({
            orgId: 'fixture-org',
            mobile: '13800138000',
            storeId: 'fixture-store',
            variantId: 'fixture-variant',
            quantity: 1
          })
        : null;

    expect(requestedTool).toBe('preview-alipay-order');
    expect(requestedArgs).toEqual({
      org_id: 'fixture-org',
      mobile: '13800138000',
      store_id: 'fixture-store',
      variant_id: 'fixture-variant',
      quantity: 1
    });
    expect(result).toEqual({
      ok: true,
      tool: 'preview-alipay-order',
      endpoint: 'https://example.com/base/api/climbing/mcp',
      data: {
        preview: {
          org_id: 'fixture-org',
          store_id: 'fixture-store',
          user_id: 'fixture-user',
          amount: 123,
          currency: 'CNY',
          items: [
            {
              variant_id: 'fixture-variant',
              quantity: 1,
              unit_price: 123,
              subtotal: 123
            }
          ],
          payment_channel_type: 'alipay'
        }
      }
    });
  });

  it('calls create-alipay-pending-order and parses payment action data', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;
    let requestedTool: string | undefined;
    let requestedArgs: unknown;

    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params?: {
          name?: string;
          arguments?: unknown;
        };
      };
      requestedTool = body.params?.name;
      requestedArgs = body.params?.arguments;

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  order: {
                    order_id: 'fixture-order',
                    order_no: 'ORD-FIXTURE',
                    status: 'pending',
                    amount: 123,
                    currency: 'CNY'
                  },
                  payment: {
                    channel_type: 'alipay',
                    payment_id: 'fixture-payment',
                    payment_ref: 'PAY-FIXTURE',
                    provider: 'alipay'
                  },
                  payment_action: {
                    type: 'web_cashier',
                    payment_url: 'https://api.example.com/api/conversation-pay/redirect/fixture-token'
                  }
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
        ? await createStoreGateway('https://example.com/base/', { fetch: fetchMock }).createAlipayPendingOrder({
            orgId: 'fixture-org',
            mobile: '13800138000',
            storeId: 'fixture-store',
            variantId: 'fixture-variant',
            quantity: 1,
            paymentActionType: 'web_cashier'
          })
        : null;

    expect(requestedTool).toBe('create-alipay-pending-order');
    expect(requestedArgs).toEqual({
      org_id: 'fixture-org',
      mobile: '13800138000',
      store_id: 'fixture-store',
      variant_id: 'fixture-variant',
      quantity: 1,
      payment_action_type: 'web_cashier'
    });
    expect(result).toEqual({
      ok: true,
      tool: 'create-alipay-pending-order',
      endpoint: 'https://example.com/base/api/climbing/mcp',
      data: {
        order: {
          order_id: 'fixture-order',
          order_no: 'ORD-FIXTURE',
          status: 'pending',
          amount: 123,
          currency: 'CNY'
        },
        payment: {
          channel_type: 'alipay',
          payment_id: 'fixture-payment',
          payment_ref: 'PAY-FIXTURE',
          provider: 'alipay'
        },
        payment_action: {
          type: 'web_cashier',
          payment_url: 'https://api.example.com/api/conversation-pay/redirect/fixture-token'
        }
      }
    });
  });

  it('rejects create-alipay-pending-order content missing required fields', async () => {
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
                text: JSON.stringify({ order: { id: 'fixture-order' } })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.createAlipayPendingOrder({
      orgId: 'fixture-org',
      mobile: '13800138000',
      storeId: 'fixture-store',
      variantId: 'fixture-variant'
    })).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('create-alipay-pending-order response')
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

  it('rejects non-2xx responses with truncated error body', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const longBody = 'x'.repeat(1000);
    const fetchMock = async () => new Response(longBody, { status: 500 });
    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'service_error'
    });

    try {
      await gateway?.listStores();
    } catch (error: unknown) {
      const msg = (error as Error).message;
      expect(msg.length).toBeLessThan(700);
      expect(msg).toContain('truncated');
    }
  });

  it('rejects JSON-RPC response without jsonrpc field', async () => {
    const storeGatewayModule = await importStoreGatewayModule();
    const createStoreGateway = storeGatewayModule?.createStoreGateway;

    const fetchMock = async () =>
      new Response(JSON.stringify({ data: 'not json-rpc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('JSON-RPC 2.0')
    });
  });

  it('validates store entries have id and name in listStores', async () => {
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
                text: JSON.stringify({ stores: [{ city: '上海' }], count: 1 })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('missing required id or name')
    });
  });

  it('rejects non-array stores field in listStores response', async () => {
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
                text: JSON.stringify({ stores: 'oops', count: 1 })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listStores()).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('"stores" must be an array')
    });
  });

  it('validates product entries have id and name in listProducts', async () => {
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
                text: JSON.stringify({ products: [{ price: 123 }], count: 1 })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listProducts()).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('missing required id or name')
    });
  });

  it('rejects non-array products field in listProducts response', async () => {
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
                text: JSON.stringify({ products: 'oops', count: 1 })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.listProducts()).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('"products" must be an array')
    });
  });

  it('validates getStore response has id and name', async () => {
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
                text: JSON.stringify({ city: '上海' })
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const gateway =
      typeof createStoreGateway === 'function'
        ? createStoreGateway('https://example.com', { fetch: fetchMock })
        : null;

    await expect(gateway?.getStore('store-1')).rejects.toMatchObject({
      code: 'invalid_response',
      message: expect.stringContaining('missing required id or name')
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
