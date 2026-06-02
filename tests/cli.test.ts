import { describe, expect, it } from 'vitest';

async function importCliModule() {
  return import('../src/cli.js').catch(() => null);
}

describe('CLI skeleton', () => {
  it('registers store and config commands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const helpText =
      typeof createProgram === 'function'
        ? createProgram().helpInformation()
        : '';

    expect(helpText).toContain('store');
    expect(helpText).toContain('product');
    expect(helpText).toContain('order');
    expect(helpText).toContain('auth');
    expect(helpText).toContain('config');
    expect(helpText).toContain('mcp-serve');
  });

  it('shows store subcommands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const program = typeof createProgram === 'function' ? createProgram() : null;
    const storeCommand = program?.commands.find((command: { name(): string }) => command.name() === 'store');
    const helpText = storeCommand?.helpInformation() ?? '';

    expect(helpText).toContain('list');
    expect(helpText).toContain('get');
  });

  it('shows product subcommands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const program = typeof createProgram === 'function' ? createProgram() : null;
    const productCommand = program?.commands.find((command: { name(): string }) => command.name() === 'product');
    const helpText = productCommand?.helpInformation() ?? '';

    expect(helpText).toContain('list');
  });

  it('shows order subcommands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const program = typeof createProgram === 'function' ? createProgram() : null;
    const orderCommand = program?.commands.find((command: { name(): string }) => command.name() === 'order');
    const helpText = orderCommand?.helpInformation() ?? '';

    expect(helpText).toContain('create');
  });

  it('shows auth subcommands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const program = typeof createProgram === 'function' ? createProgram() : null;
    const authCommand = program?.commands.find((command: { name(): string }) => command.name() === 'auth');
    const helpText = authCommand?.helpInformation() ?? '';

    expect(helpText).toContain('login');
  });

  it('runs store list with resolved endpoint output', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                return {
                  ok: true,
                  tool: 'listStores',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    stores: [{ id: 'store-1', name: '香蕉攀岩' }],
                    count: 1
                  }
                };
              },
              async getStore() {
                throw new Error('unused');
              }
            })
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"tool": "listStores"');
    expect(result.stdout).toContain('"endpoint": "https://env.example.com/api/climbing/mcp"');
    expect(result.stdout).toContain('"name": "香蕉攀岩"');
  });

  it('runs product list with resolved endpoint output', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedStoreArgs: unknown;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli(['product', 'list', '--city', 'fixture-city', '--store-search', 'Fixture', '--search', 'Fixture Time'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores(args) {
                receivedStoreArgs = args;
                return {
                  ok: true,
                  tool: 'listStores',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    stores: [{ id: 'fixture-store-product', name: 'Fixture Product Store' }],
                    count: 1
                  }
                };
              },
              async getStore() {
                throw new Error('unused');
              },
              async listProducts(args) {
                receivedArgs = args;
                return {
                  ok: true,
                  tool: 'listProducts',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    store: { id: 'fixture-store-product', name: 'Fixture Product Store' },
                    products: [
                      {
                        id: 'fixture-product-time',
                        name: 'Fixture Time Product',
                        variants: [
                          {
                            id: 'fixture-variant-time',
                            name: 'Fixture Time SKU',
                            price: 456,
                            original_price: 456
                          }
                        ]
                      }
                    ],
                    count: 1
                  }
                };
              }
            })
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedStoreArgs).toEqual({
      city: 'fixture-city',
      search: 'Fixture',
      limit: 20
    });
    expect(receivedArgs).toEqual({
      storeIds: ['fixture-store-product'],
      productTypes: ['card'],
      keyword: 'Fixture Time',
      limit: undefined
    });
    expect(result.stdout).toContain('"tool": "listProducts"');
    expect(result.stdout).toContain('"name": "Fixture Time Product"');
    expect(result.stdout).toContain('"id": "fixture-variant-time"');
    expect(result.stdout).toContain('"price": 456');
  });

  it('runs auth login with conversation agent headers', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli([
            'auth',
            'login',
            '--org-id',
            'fixture-org',
            '--api-key',
            'fixture-api-key',
            '--api-secret',
            'fixture-public-key',
            '--secret-version',
            'v1',
            '--encrypted-phone',
            'fixture-ciphertext'
          ], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('unused');
              },
              async getStore() {
                throw new Error('unused');
              },
              async listProducts() {
                throw new Error('unused');
              },
              async conversationAgentLogin(args) {
                receivedArgs = args;
                return {
                  ok: true,
                  tool: 'conversation-agent-login',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    access_token: 'fixture-access-token',
                    token_type: 'Bearer',
                    expires_in: 300,
                    user: {
                      id: 'fixture-user',
                      mobile: '138****8000',
                      is_new_user: false
                    }
                  }
                };
              },
              async previewAlipayOrder() {
                throw new Error('unused');
              },
              async createAlipayPendingOrder() {
                throw new Error('unused');
              }
            })
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedArgs).toEqual({
      orgId: 'fixture-org',
      apiKey: 'fixture-api-key',
      apiSecret: 'fixture-public-key',
      secretVersion: 'v1',
      encryptedPhone: 'fixture-ciphertext'
    });
    expect(result.stdout).toContain('"tool": "conversation-agent-login"');
    expect(result.stdout).toContain('"access_token": "fixture-access-token"');
  });

  it('runs order preview with conversation pay arguments', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedLoginArgs: unknown;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli([
            'order',
            'preview',
            '--org-id',
            'fixture-org',
            '--api-key',
            'fixture-api-key',
            '--api-secret',
            'fixture-public-key',
            '--secret-version',
            'v1',
            '--mobile',
            '13800138000',
            '--encrypted-phone',
            'fixture-ciphertext',
            '--store-id',
            'fixture-store',
            '--variant-id',
            'fixture-variant'
          ], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('unused');
              },
              async getStore() {
                throw new Error('unused');
              },
              async listProducts() {
                throw new Error('unused');
              },
              async conversationAgentLogin(args) {
                receivedLoginArgs = args;
                return {
                  ok: true,
                  tool: 'conversation-agent-login',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    access_token: 'fixture-access-token',
                    token_type: 'Bearer',
                    expires_in: 300
                  }
                };
              },
              async previewAlipayOrder(args) {
                receivedArgs = args;
                return {
                  ok: true,
                  tool: 'preview-alipay-order',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
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
                      ]
                    }
                  }
                };
              },
              async createAlipayPendingOrder() {
                throw new Error('unused');
              }
            })
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedLoginArgs).toEqual({
      orgId: 'fixture-org',
      apiKey: 'fixture-api-key',
      apiSecret: 'fixture-public-key',
      secretVersion: 'v1',
      encryptedPhone: 'fixture-ciphertext'
    });
    expect(receivedArgs).toEqual({
      orgId: 'fixture-org',
      accessToken: 'fixture-access-token',
      storeId: 'fixture-store',
      variantId: 'fixture-variant',
      quantity: undefined,
      participantId: undefined,
      userCouponId: undefined,
      promotionId: undefined
    });
    expect(result.stdout).toContain('"tool": "preview-alipay-order"');
    expect(result.stdout).toContain('"quantity": 1');
  });

  it('runs order create with explicit quantity and payment action type', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedLoginArgs: unknown;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli([
            'order',
            'create',
            '--org-id',
            'fixture-org',
            '--api-key',
            'fixture-api-key',
            '--api-secret',
            'fixture-public-key',
            '--secret-version',
            'v1',
            '--mobile',
            '13800138000',
            '--encrypted-phone',
            'fixture-ciphertext',
            '--store-id',
            'fixture-store',
            '--variant-id',
            'fixture-variant',
            '--quantity',
            '2',
            '--payment-action-type',
            'mini_program'
          ], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('unused');
              },
              async getStore() {
                throw new Error('unused');
              },
              async listProducts() {
                throw new Error('unused');
              },
              async conversationAgentLogin(args) {
                receivedLoginArgs = args;
                return {
                  ok: true,
                  tool: 'conversation-agent-login',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    access_token: 'fixture-access-token',
                    token_type: 'Bearer',
                    expires_in: 300
                  }
                };
              },
              async previewAlipayOrder() {
                throw new Error('unused');
              },
              async createAlipayPendingOrder(args) {
                receivedArgs = args;
                return {
                  ok: true,
                  tool: 'create-alipay-pending-order',
                  endpoint: 'https://env.example.com/api/climbing/mcp',
                  data: {
                    order: {
                      order_id: 'fixture-order',
                      order_no: 'ORD-FIXTURE',
                      status: 'pending',
                      amount: 246,
                      currency: 'CNY'
                    },
                    payment: {
                      channel_type: 'alipay',
                      payment_id: 'fixture-payment',
                      payment_ref: 'PAY-FIXTURE',
                      provider: 'alipay'
                    },
                    payment_action: {
                      type: 'mini_program',
                      order_str: 'fixture-order-str',
                      payment_url: null
                    }
                  }
                };
              }
            })
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedLoginArgs).toEqual({
      orgId: 'fixture-org',
      apiKey: 'fixture-api-key',
      apiSecret: 'fixture-public-key',
      secretVersion: 'v1',
      encryptedPhone: 'fixture-ciphertext'
    });
    expect(receivedArgs).toEqual({
      orgId: 'fixture-org',
      accessToken: 'fixture-access-token',
      storeId: 'fixture-store',
      variantId: 'fixture-variant',
      quantity: 2,
      participantId: undefined,
      userCouponId: undefined,
      promotionId: undefined,
      paymentActionType: 'mini_program'
    });
    expect(result.stdout).toContain('"tool": "create-alipay-pending-order"');
    expect(result.stdout).toContain('"payment_ref": "PAY-FIXTURE"');
  });

  it('rejects non-positive order quantity', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli([
            'order',
            'create',
            '--org-id',
            'fixture-org',
            '--api-key',
            'fixture-api-key',
            '--api-secret',
            'fixture-public-key',
            '--secret-version',
            'v1',
            '--encrypted-phone',
            'fixture-ciphertext',
            '--store-id',
            'fixture-store',
            '--variant-id',
            'fixture-variant',
            '--quantity',
            '0'
          ], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('should not be called');
              },
              async getStore() {
                throw new Error('should not be called');
              },
              async listProducts() {
                throw new Error('should not be called');
              },
              async previewAlipayOrder() {
                throw new Error('should not be called');
              },
              async createAlipayPendingOrder() {
                throw new Error('should not be called');
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('positive integer');
  });

  it('rejects endpoints with disallowed scheme', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list', '--endpoint', 'file:///etc/passwd'], {
            env: {},
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('should not be called');
              },
              async getStore() {
                throw new Error('should not be called');
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"code": "invalid_endpoint"');
    expect(result.stderr).toContain('only http: and https: are allowed');
  });

  it('rejects insecure http endpoints without --insecure', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list', '--endpoint', 'http://example.com'], {
            env: {},
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('should not be called');
              },
              async getStore() {
                throw new Error('should not be called');
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--insecure');
  });

  it('allows insecure http endpoints with --insecure', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let allowInsecure: boolean | undefined;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list', '--endpoint', 'http://example.com', '--insecure'], {
            env: {},
            gatewayFactory: (_endpoint, options) => {
              allowInsecure = options?.allowInsecure;
              return {
                async listStores() {
                  return {
                    ok: true,
                    tool: 'listStores',
                    endpoint: 'http://example.com/api/climbing/mcp',
                    data: {
                      stores: [],
                      count: 0
                    }
                  };
                },
                async getStore() {
                  throw new Error('unused');
                }
              };
            }
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(allowInsecure).toBe(true);
    expect(result.stdout).toContain('"endpoint": "http://example.com/api/climbing/mcp"');
  });

  it('sanitizes endpoint in error output', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'get', 'some-store'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('unused');
              },
              async getStore() {
                const error = new Error('Store not found');
                Object.assign(error, {
                  code: 'not_found',
                  endpoint: 'https://user:pass@env.example.com/path?token=secret'
                });
                throw error;
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain('user:pass');
    expect(result.stderr).not.toContain('token=secret');
    expect(result.stderr).toContain('env.example.com');
  });

  it('rejects negative --limit value', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list', '--limit', '-5'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('should not be called');
              },
              async getStore() {
                throw new Error('should not be called');
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('non-negative integer');
  });

  it('rejects NaN --offset value', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list', '--offset', 'abc'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('should not be called');
              },
              async getStore() {
                throw new Error('should not be called');
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('non-negative integer');
  });

  it('prints structured errors for store get failures', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'get', 'missing-store'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            gatewayFactory: () => ({
              async listStores() {
                throw new Error('unused');
              },
              async getStore() {
                const error = new Error('Store not found');
                Object.assign(error, { code: 'not_found', endpoint: 'https://env.example.com/api/climbing/mcp' });
                throw error;
              }
            })
          })
        : { exitCode: 0, stdout: '', stderr: '' };

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
    expect(result.stderr).toContain('"code": "not_found"');
    expect(result.stderr).toContain('"message": "Store not found"');
  });
});
