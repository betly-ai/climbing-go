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
    expect(helpText).toContain('auth');
    expect(helpText).toContain('order');
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

  it('shows product, auth, and order subcommands in help output', async () => {
    const cliModule = await importCliModule();
    const createProgram = cliModule?.createProgram;

    const program = typeof createProgram === 'function' ? createProgram() : null;
    const productCommand = program?.commands.find((command: { name(): string }) => command.name() === 'product');
    const authCommand = program?.commands.find((command: { name(): string }) => command.name() === 'auth');
    const orderCommand = program?.commands.find((command: { name(): string }) => command.name() === 'order');

    expect(productCommand?.helpInformation()).toContain('list');
    expect(authCommand?.helpInformation()).toContain('login');
    expect(orderCommand?.helpInformation()).toContain('preview');
    expect(orderCommand?.helpInformation()).toContain('create');
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

  it('runs product list with filters', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedStoreArgs: unknown;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli(
            [
              'product',
              'list',
              '--city',
              '上海',
              '--search',
              '单次',
              '--limit',
              '3'
            ],
            {
              env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
              gatewayFactory: () => ({
                async listStores(args) {
                  receivedStoreArgs = args;
                  return {
                    ok: true,
                    tool: 'listStores',
                    endpoint: 'https://env.example.com/api/climbing/mcp',
                    data: {
                      stores: [
                        { id: 'store-1', name: '香蕉攀岩上海旗舰馆' },
                        { id: 'store-2', name: '香蕉攀岩上海静安店' }
                      ],
                      count: 2
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
                      products: [
                        {
                          id: 'product-1',
                          name: '单次攀岩票',
                          type: 'card',
                          variants: []
                        }
                      ]
                    }
                  };
                },
                async authLogin() {
                  throw new Error('unused');
                },
                async previewOrder() {
                  throw new Error('unused');
                },
                async createOrder() {
                  throw new Error('unused');
                }
              })
            }
          )
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedStoreArgs).toEqual({
      city: '上海',
      search: undefined
    });
    expect(receivedArgs).toEqual({
      storeIds: ['store-1', 'store-2'],
      productTypes: undefined,
      keyword: '单次',
      limit: 3
    });
    expect(result.stdout).toContain('"tool": "listProducts"');
    expect(result.stdout).toContain('单次攀岩票');
  });

  it('runs auth login with header-equivalent arguments', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli(
            [
              'auth',
              'login',
              '--org-id',
              'org-1',
              '--api-key',
              'api-key',
              '--api-secret',
              'api-secret',
              '--secret-version',
              'v1',
              '--encrypted-phone',
              'encrypted-phone'
            ],
            {
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
                async authLogin(args) {
                  receivedArgs = args;
                  return {
                    ok: true,
                    tool: 'authLogin',
                    endpoint: 'https://env.example.com/api/climbing/mcp',
                    data: {
                      access_token: 'agent-token',
                      token_type: 'Bearer',
                      expires_in: 300
                    }
                  };
                },
                async previewOrder() {
                  throw new Error('unused');
                },
                async createOrder() {
                  throw new Error('unused');
                }
              })
            }
          )
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedArgs).toEqual({
      org_id: 'org-1',
      api_key: 'api-key',
      api_secret: 'api-secret',
      secret_version: 'v1',
      encrypted_phone: 'encrypted-phone'
    });
    expect(result.stdout).toContain('"tool": "authLogin"');
    expect(result.stdout).toContain('"access_token": "agent-token"');
  });

  it('runs order create with alipay options', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;
    let receivedArgs: unknown;

    const result =
      typeof runCli === 'function'
        ? await runCli(
            [
              'order',
              'create',
              '--store-id',
              'store-1',
              '--variant-id',
              'variant-1',
              '--access-token',
              'agent-token',
              '--org-id',
              'org-1',
              '--quantity',
              '2',
              '--payment-action-type',
              'web_cashier'
            ],
            {
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
                async authLogin() {
                  throw new Error('unused');
                },
                async previewOrder() {
                  throw new Error('unused');
                },
                async createOrder(args) {
                  receivedArgs = args;
                  return {
                    ok: true,
                    tool: 'createOrder',
                    endpoint: 'https://env.example.com/api/climbing/mcp',
                    data: {
                      order: { order_id: 'order-1', amount: 99, status: 'pending' },
                      payment_action: { type: 'web_cashier', payment_url: 'https://example.com/pay' }
                    }
                  };
                }
              })
            }
          )
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(receivedArgs).toEqual({
      store_id: 'store-1',
      variant_id: 'variant-1',
      access_token: 'agent-token',
      org_id: 'org-1',
      quantity: 2,
      participant_id: undefined,
      user_coupon_id: undefined,
      promotion_id: undefined,
      payment_action_type: 'web_cashier'
    });
    expect(result.stdout).toContain('"tool": "createOrder"');
    expect(result.stdout).toContain('https://example.com/pay');
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
