import { Command, CommanderError } from 'commander';

import { getConfigPath, loadConfig, saveConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import { createStoreGateway, StoreGatewayError, type StoreGateway } from './store-gateway.js';

export interface RunCliOptions {
  env?: EnvMap;
  gatewayFactory?: (endpoint: string) => StoreGateway;
  writeOut?: (value: string) => void;
  writeErr?: (value: string) => void;
}

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function serializeCliError(error: unknown) {
  if (error instanceof StoreGatewayError) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          endpoint: error.endpoint,
          status: error.status
        }
      },
      null,
      2
    );
  }

  if (error instanceof Error && 'code' in error) {
    const code = typeof error.code === 'string' ? error.code : 'unknown_error';
    const endpoint = 'endpoint' in error && typeof error.endpoint === 'string' ? error.endpoint : undefined;
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
    .version('0.1.0');

  const configCommand = program.command('config').description('Manage local CLI configuration');

  configCommand
    .command('set')
    .description('Set config values')
    .command('endpoint <url>')
    .description('Set the climbing MCP endpoint')
    .action(async (url: string) => {
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

  storeCommand
    .command('list')
    .description('List public climbing stores')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .option('--city <city>', 'filter stores by city')
    .option('--search <keyword>', 'search stores by name keyword')
    .option('--limit <number>', 'limit returned stores', value => Number.parseInt(value, 10))
    .option('--offset <number>', 'offset returned stores', value => Number.parseInt(value, 10))
    .action(
      async ({
        endpoint,
        city,
        search,
        limit,
        offset
      }: {
        endpoint?: string;
        city?: string;
        search?: string;
        limit?: number;
        offset?: number;
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

      const gateway = gatewayFactory(resolvedEndpoint);
      const result = await gateway.listStores({ city, search, limit, offset });
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
      }
    );

  storeCommand
    .command('get <storeId>')
    .description('Get a public climbing store by id')
    .option('-e, --endpoint <url>', 'override climbing MCP endpoint')
    .action(async (storeId: string, { endpoint }: { endpoint?: string }) => {
      const config = await loadConfig(env);
      const resolvedEndpoint = resolveEndpoint({
        cliEndpoint: endpoint,
        configEndpoint: config.endpoint,
        env
      });

      if (!resolvedEndpoint) {
        throw new Error('No climbing MCP endpoint configured. Use --endpoint, CLIMBING_MCP_ENDPOINT, or "climbing-go config set endpoint <url>".');
      }

      const gateway = gatewayFactory(resolvedEndpoint);
      const result = await gateway.getStore(storeId);
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
    });

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
