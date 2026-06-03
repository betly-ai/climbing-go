import { Command, CommanderError, Option } from 'commander';

import { getConfigPath, loadConfig, saveConfig, type EnvMap } from './config.js';
import { EndpointValidationError, resolveEndpoint, sanitizeEndpoint, validateEndpoint } from './endpoint.js';
import { CLIMBING_GO_VERSION } from './version.js';
import { createStoreGateway, StoreGatewayError, type ClimbingGateway } from './store-gateway.js';

export interface GatewayFactoryOptions {
  allowInsecure?: boolean;
  orderContext?: {
    authorization?: string;
  };
}

export interface RunCliOptions {
  env?: EnvMap;
  gatewayFactory?: (endpoint: string, options?: GatewayFactoryOptions) => ClimbingGateway;
  writeOut?: (value: string) => void;
  writeErr?: (value: string) => void;
}

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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

function parseNonNegativeInteger(value: string) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error('value must be a non-negative integer');
  }
  return n;
}

function parsePositiveInteger(value: string) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error('value must be a positive integer');
  }
  return n;
}

function collectOptionValue(value: string, previous: string[] = []) {
  const values = value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);

  return [...previous, ...values];
}

export function createProgram(options: RunCliOptions = {}) {
  const env = options.env ?? process.env;
  const gatewayFactory = options.gatewayFactory ?? createStoreGateway;
  const writeOut = options.writeOut ?? ((value: string) => process.stdout.write(value));
  const program = new Command();

  async function createGateway(input: { endpoint?: string; insecure?: boolean }) {
    const config = await loadConfig(env);
    const resolvedEndpoint = resolveEndpoint({
      cliEndpoint: input.endpoint,
      configEndpoint: config.endpoint,
      env
    });

    if (!resolvedEndpoint) {
      throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
    }

    validateEndpoint(resolvedEndpoint, { allowInsecure: input.insecure });
    return gatewayFactory(resolvedEndpoint, {
      allowInsecure: input.insecure,
      orderContext: {
        authorization: env.CLIMBING_MCP_AUTHORIZATION
      }
    });
  }

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
  const productCommand = program.command('product').description('Query purchasable climbing products');
  const orderCommand = program.command('order').description('Conversation agent Alipay order tools');

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
    .option('--limit <number>', 'limit returned stores (non-negative integer)', parseNonNegativeInteger)
    .option('--offset <number>', 'offset returned stores (non-negative integer)', parseNonNegativeInteger)
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
      const gateway = await createGateway({ endpoint, insecure });
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
      const gateway = await createGateway({ endpoint, insecure });
      const result = await gateway.getStore(storeId);
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
    });

  productCommand
    .command('list')
    .description('List purchasable products for conversation checkout')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .option('--city <city>', 'filter products by store city')
    .option('--search <keyword>', 'search products by keyword')
    .option('--store-id <id>', 'filter by store id; repeatable or comma-separated', collectOptionValue)
    .option('--limit <number>', 'limit returned products (positive integer)', parsePositiveInteger)
    .addOption(new Option('--store-search <keyword>', 'filter products by store name keyword').hideHelp())
    .addOption(
      new Option('--product-type <type>', 'filter by product type; repeatable or comma-separated')
        .argParser(collectOptionValue)
        .hideHelp()
    )
    .addOption(new Option('--keyword <keyword>', 'alias for --search').hideHelp())
    .action(
      async ({
        endpoint,
        insecure,
        city,
        search,
        storeId,
        storeSearch,
        productType,
        keyword,
        limit
      }: {
        endpoint?: string;
        insecure?: boolean;
        city?: string;
        search?: string;
        storeId?: string[];
        storeSearch?: string;
        productType?: string[];
        keyword?: string;
        limit?: number;
      }) => {
        const gateway = await createGateway({ endpoint, insecure });
        const explicitStoreIds = storeId && storeId.length > 0 ? storeId : [];
        let storeIds = explicitStoreIds;

        if (city || storeSearch) {
          const storesResult = await gateway.listStores({ city, search: storeSearch });
          const matchedStoreIds = storesResult.data.stores.map(store => store.id);

          if (matchedStoreIds.length === 0 && explicitStoreIds.length === 0) {
            writeOut(`${JSON.stringify(
              {
                ok: true,
                tool: 'listProducts',
                endpoint: storesResult.endpoint,
                data: {
                  products: []
                }
              },
              null,
              2
            )}\n`);
            return;
          }

          storeIds = [...new Set([...explicitStoreIds, ...matchedStoreIds])];
        }

        const result = await gateway.listProducts({
          storeIds: storeIds.length > 0 ? storeIds : undefined,
          productTypes: productType && productType.length > 0 ? productType : undefined,
          keyword: search ?? keyword,
          limit
        });
        writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  orderCommand
    .command('preview')
    .description('Preview a pending order before user confirmation')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .requiredOption('--store-id <id>', 'purchase store id')
    .requiredOption('--variant-id <id>', 'product variant id from product list variants[].id')
    .option('--payment-channel <channel>', 'payment channel such as alipay or wechat', 'alipay')
    .option('--quantity <number>', 'purchase quantity (positive integer)', parsePositiveInteger)
    .option('--participant-id <id>', 'participant id')
    .option('--user-coupon-id <id>', 'user coupon id')
    .option('--promotion-id <id>', 'promotion id')
    .action(
      async ({
        endpoint,
        insecure,
        storeId,
        variantId,
        paymentChannel,
        quantity,
        participantId,
        userCouponId,
        promotionId
      }: {
        endpoint?: string;
        insecure?: boolean;
        storeId: string;
        variantId: string;
        paymentChannel: string;
        quantity?: number;
        participantId?: string;
        userCouponId?: string;
        promotionId?: string;
      }) => {
        const gateway = await createGateway({ endpoint, insecure });
        const result = await gateway.previewOrder({
          store_id: storeId,
          variant_id: variantId,
          payment_channel: paymentChannel,
          quantity,
          participant_id: participantId,
          user_coupon_id: userCouponId,
          promotion_id: promotionId
        });
        writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  orderCommand
    .command('create')
    .description('Create a pending order after explicit user confirmation')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--insecure', 'allow using an http: endpoint explicitly')
    .requiredOption('--store-id <id>', 'purchase store id')
    .requiredOption('--variant-id <id>', 'product variant id from product list variants[].id')
    .option('--payment-channel <channel>', 'payment channel such as alipay or wechat', 'alipay')
    .option('--quantity <number>', 'purchase quantity (positive integer)', parsePositiveInteger)
    .option('--participant-id <id>', 'participant id')
    .option('--user-coupon-id <id>', 'user coupon id')
    .option('--promotion-id <id>', 'promotion id')
    .action(
      async ({
        endpoint,
        insecure,
        storeId,
        variantId,
        paymentChannel,
        quantity,
        participantId,
        userCouponId,
        promotionId
      }: {
        endpoint?: string;
        insecure?: boolean;
        storeId: string;
        variantId: string;
        paymentChannel: string;
        quantity?: number;
        participantId?: string;
        userCouponId?: string;
        promotionId?: string;
      }) => {
        const gateway = await createGateway({ endpoint, insecure });
        const result = await gateway.createOrder({
          store_id: storeId,
          variant_id: variantId,
          payment_channel: paymentChannel,
          quantity,
          participant_id: participantId,
          user_coupon_id: userCouponId,
          promotion_id: promotionId
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
