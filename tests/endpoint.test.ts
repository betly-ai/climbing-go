import { describe, expect, it } from 'vitest';

async function importEndpointModule() {
  return import('../src/endpoint.js').catch(() => null);
}

describe('endpoint resolution', () => {
  it('prefers cli option over env and config endpoint', async () => {
    const endpointModule = await importEndpointModule();
    const resolveEndpoint = endpointModule?.resolveEndpoint;

    const endpoint =
      typeof resolveEndpoint === 'function'
        ? resolveEndpoint({
            cliEndpoint: 'https://cli.example.com',
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            configEndpoint: 'https://config.example.com'
          })
        : null;

    expect(endpoint).toBe('https://cli.example.com');
  });

  it('falls back to env endpoint and then config endpoint', async () => {
    const endpointModule = await importEndpointModule();
    const resolveEndpoint = endpointModule?.resolveEndpoint;

    const envEndpoint =
      typeof resolveEndpoint === 'function'
        ? resolveEndpoint({
            env: { CLIMBING_MCP_ENDPOINT: 'https://env.example.com' },
            configEndpoint: 'https://config.example.com'
          })
        : null;

    const configEndpoint =
      typeof resolveEndpoint === 'function'
        ? resolveEndpoint({
            env: {},
            configEndpoint: 'https://config.example.com'
          })
        : null;

    expect(envEndpoint).toBe('https://env.example.com');
    expect(configEndpoint).toBe('https://config.example.com');
  });

  it('falls back to the default climbing MCP endpoint when no override is set', async () => {
    const endpointModule = await importEndpointModule();
    const resolveEndpoint = endpointModule?.resolveEndpoint;

    const defaultEndpoint =
      typeof resolveEndpoint === 'function'
        ? resolveEndpoint({
            env: {}
          })
        : null;

    expect(defaultEndpoint).toBe('https://climbing-mcp-ezeuekpuqt.cn-shenzhen.fcapp.run');
  });
});
