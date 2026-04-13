import { Command, CommanderError } from 'commander';

import { getConfigPath, loadConfig, saveConfig, type EnvMap } from './config.js';
import { resolveEndpoint } from './endpoint.js';
import { createStoreGateway, type StoreGateway } from './store-gateway.js';

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
    .action(async ({ endpoint }: { endpoint?: string }) => {
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
      const result = await gateway.listStores();
      writeOut(`${JSON.stringify(result, null, 2)}\n`);
    });

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

    if (error instanceof Error) {
      stderr += `${error.message}\n`;

      return {
        exitCode: 1,
        stdout,
        stderr
      };
    }

    throw error;
  }
}
