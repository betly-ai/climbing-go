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
    expect(helpText).toContain('config');
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

  it('runs store list with resolved endpoint output', async () => {
    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    const result =
      typeof runCli === 'function'
        ? await runCli(['store', 'list'], {
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' }
          })
        : { exitCode: 1, stdout: '', stderr: 'missing runCli' };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"command": "store.list"');
    expect(result.stdout).toContain('"endpoint": "https://env.example.com"');
  });
});
