import { Command, CommanderError } from 'commander';

import { getConfigPath, loadConfig, saveConfig, type EnvMap } from './config.js';
import { EndpointValidationError, resolveEndpoint, sanitizeEndpoint, validateEndpoint } from './endpoint.js';
import { CLIMBING_GO_VERSION } from './version.js';
import { createStoreGateway, StoreGatewayError, type StoreGateway } from './store-gateway.js';

export interface GatewayFactoryOptions {
  allowInsecure?: boolean;
}

export interface RunCliOptions {
  env?: EnvMap;
  gatewayFactory?: (endpoint: string, options?: GatewayFactoryOptions) => StoreGateway;
  writeOut?: (value: string) => void;
  writeErr?: (value: string) => void;
}

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function collectValues(value: string, previous: string[] = []) {
  return [...previous, value];
}

function parseOrderItem(value: string) {
  const [variantId, quantityText, extra] = value.split(':');

  if (!variantId || extra !== undefined) {
    throw new Error('--item must be formatted as <variantId> or <variantId>:<quantity>');
  }

  if (quantityText === undefined || quantityText === '') {
    return {
      variantId,
      quantity: 1
    };
  }

  const quantity = Number.parseInt(quantityText, 10);

  if (!Number.isInteger(quantity) || quantity <= 0 || String(quantity) !== quantityText) {
    throw new Error('--item quantity must be a positive integer');
  }

  return {
    variantId,
    quantity
  };
}

function serializeCliError(error: unknown) {
  if (error instanceof EndpointValidationError) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: 'invalid_endpoint',
          message: error.message
        }
      },
      null,
      2
    );
  }

  if (error instanceof StoreGatewayError) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          endpoint: sanitizeEndpoint(error.endpoint),
          status: error.status
        }
      },
      null,
      2
    );
  }

  if (error instanceof Error && 'code' in error) {
    const code = typeof error.code === 'string' ? error.code : 'unknown_error';
    const rawEndpoint = 'endpoint' in error && typeof error.endpoint === 'string' ? error.endpoint : undefined;
    const endpoint = rawEndpoint ? sanitizeEndpoint(rawEndpoint) : undefined;
    const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;

    return JSON.stringify(
      {
        ok: false,
        error: {
          code,
          message: error.message,
          endpoint,
          status
        }
      },
      null,
      2
    );
  }

  if (error instanceof Error) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: 'unknown_error',
          message: error.message
        }
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      ok: false,
      error: {
        code: 'unknown_error',
        message: 'Unknown error'
      }
    },
    null,
    2
  );
}

export function createProgram(options: RunCliOptions = {}) {
  const env = options.env ?? process.env;
  const gatewayFactory = options.gatewayFactory ?? createStoreGateway;
  const writeOut = options.writeOut ?? ((value: string) => process.stdout.write(value));
  const program = new Command();

  program
    .name('climbing-go')
    .description('CLI skeleton for Betly climbing MCP integrations')
    .version(CLIMBING_GO_VERSION);

  const configCommand = program.command('config').description('Manage local CLI configuration');

  configCommand
    .command('set')
    .description('Set config values')
    .command('endpoint <url>')
    .description('Set the climbing MCP endpoint')
    .option('--insecure', 'allow storing an http: endpoint explicitly')
    .action(async (url: string, command: { insecure?: boolean }) => {
      validateEndpoint(url, { allowInsecure: command.insecure });
      const currentConfig = await loadConfig(env);
      await saveConfig({ ...currentConfig, endpoint: url }, env);
      writeOut(`Saved endpoint to ${getConfigPath(env)}\n`);
    });

  configCommand
    .command('get')
    .description('Get config values')
    .command('endpoint')
    .description('Print the configured climbing MCP endpoint')
    .action(async () => {
      const config = await loadConfig(env);

      if (!config.endpoint) {
        throw new Error('No climbing MCP endpoint configured. Use "climbing-go config set endpoint <url>".');
      }

      writeOut(`${config.endpoint}\n`);
    });

  const storeCommand = program.command('store').description('Query public climbing stores');
  const productCommand = program.command('product').description('Query public climbing products');
  const orderCommand = program.command('order').description('Create climbing orders');

  program
    .command('mcp-serve')
    .alias('serve')
    .description('Run the local MCP server over stdio')
    .action(() => {
      throw new Error('The MCP server must be started from the climbing-go process entrypoint.');
    });

  storeCommand
    .command('list')
    .description('List public climbing stores')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .option('--city <city>', 'filter stores by city')
    .option('--search <keyword>', 'search stores by name keyword')
    .option('--limit <number>', 'limit returned stores (non-negative integer)', value => {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error('--limit must be a non-negative integer');
      }
      return n;
    })
    .option('--offset <number>', 'offset returned stores (non-negative integer)', value => {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error('--offset must be a non-negative integer');
      }
      return n;
    })
    .action(
      async ({
        endpoint,
        city,
        search,
        limit,
        offset,
        insecure
      }: {
        endpoint?: string;
        city?: string;
        search?: string;
        limit?: number;
        offset?: number;
        insecure?: boolean;
      }) => {
      const config = await loadConfig(env);
      const resolvedEndpoint = resolveEndpoint({
        cliEndpoint: endpoint,
        configEndpoint: config.endpoint,
        env
      });

      if (!resolvedEndpoint) {
        throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
      }

      validateEndpoint(resolvedEndpoint, { allowInsecure: insecure });
      const gateway = gatewayFactory(resolvedEndpoint, { allowInsecure: insecure });
      const result = await gateway.listStores({ city, search, limit, offset });
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  storeCommand
    .command('get <storeId>')
    .description('Get a public climbing store by id')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .action(async (storeId: string, { endpoint, insecure }: { endpoint?: string; insecure?: boolean }) => {
      const config = await loadConfig(env);
      const resolvedEndpoint = resolveEndpoint({
        cliEndpoint: endpoint,
        configEndpoint: config.endpoint,
        env
      });

      if (!resolvedEndpoint) {
        throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
      }

      validateEndpoint(resolvedEndpoint, { allowInsecure: insecure });
      const gateway = gatewayFactory(resolvedEndpoint, { allowInsecure: insecure });
      const result = await gateway.getStore(storeId);
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
    });

  productCommand
    .command('list')
    .description('List public climbing products')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .option('--store-id <storeId>', 'filter products by store id')
    .option('--city <city>', 'select a store by city when store id is not provided')
    .option('--store-search <keyword>', 'search store name when store id is not provided')
    .option('--search <keyword>', 'search products by name keyword')
    .option('--limit <number>', 'limit returned products (non-negative integer)', value => {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error('--limit must be a non-negative integer');
      }
      return n;
    })
    .option('--offset <number>', 'offset returned products (non-negative integer)', value => {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n) || n < 0) {
        throw new Error('--offset must be a non-negative integer');
      }
      return n;
    })
    .action(
      async ({
        endpoint,
        storeId,
        city,
        storeSearch,
        search,
        limit,
        offset,
        insecure
      }: {
        endpoint?: string;
        storeId?: string;
        city?: string;
        storeSearch?: string;
        search?: string;
        limit?: number;
        offset?: number;
        insecure?: boolean;
      }) => {
        const config = await loadConfig(env);
        const resolvedEndpoint = resolveEndpoint({
          cliEndpoint: endpoint,
          configEndpoint: config.endpoint,
          env
        });

        if (!resolvedEndpoint) {
          throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
        }

        validateEndpoint(resolvedEndpoint, { allowInsecure: insecure });
        const gateway = gatewayFactory(resolvedEndpoint, { allowInsecure: insecure });
        const result = await gateway.listProducts({
          storeId,
          city,
          storeSearch,
          search,
          limit,
          offset
        });
        writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  orderCommand
    .command('create')
    .description('Create a card product order')
    .requiredOption('--store-id <storeId>', 'store id')
    .requiredOption('--user-id <userId>', 'public user id')
    .option('--item <variantId[:quantity]>', 'product variant id and optional quantity', collectValues, [])
    .option('--payment-channel <channel>', 'payment channel', 'alipay')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .action(
      async ({
        endpoint,
        storeId,
        userId,
        item,
        paymentChannel,
        insecure
      }: {
        endpoint?: string;
        storeId: string;
        userId: string;
        item: string[];
        paymentChannel: string;
        insecure?: boolean;
      }) => {
        if (item.length === 0) {
          throw new Error('At least one --item is required');
        }

        if (paymentChannel !== 'alipay') {
          throw new Error('--payment-channel currently only supports alipay');
        }

        const config = await loadConfig(env);
        const resolvedEndpoint = resolveEndpoint({
          cliEndpoint: endpoint,
          configEndpoint: config.endpoint,
          env
        });

        if (!resolvedEndpoint) {
          throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
        }

        validateEndpoint(resolvedEndpoint, { allowInsecure: insecure });
        const gateway = gatewayFactory(resolvedEndpoint, { allowInsecure: insecure });
        const result = await gateway.createOrder({
          storeId,
          userId,
          items: item.map(parseOrderItem),
          paymentChannel
        });
        writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  return program;
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<RunCliResult> {
  let stdout = '';
  let stderr = '';

  const program = createProgram({
    ...options,
    writeOut: (value) => {
      stdout += value;
    },
    writeErr: (value) => {
      stderr += value;
    }
  });
  program.configureOutput({
    writeOut: (value) => {
      stdout += value;
    },
    writeErr: (value) => {
      stderr += value;
    },
    outputError: (value, write) => {
      write(value);
    }
  });
  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: 'user' });

    return {
      exitCode: 0,
      stdout,
      stderr
    };
  } catch (error) {
    if (error instanceof CommanderError) {
      return {
        exitCode: error.exitCode,
        stdout,
        stderr
      };
    }

    stderr += `${serializeCliError(error)}\n`;

    return {
      exitCode: 1,
      stdout,
      stderr
    };
  }
}
