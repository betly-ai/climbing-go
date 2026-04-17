import { describe, expect, it } from 'vitest';

async function importEndpointModule() {
  return import('../src/endpoint.js').catch(() => null);
}

describe('endpoint validation', () => {
  it('accepts https: endpoints', async () => {
    const mod = await importEndpointModule();
    const validateEndpoint = mod?.validateEndpoint;

    expect(typeof validateEndpoint === 'function'
      ? () => validateEndpoint('https://example.com')
      : null
    ).not.toThrow();
  });

  it('accepts http: endpoints', async () => {
    const mod = await importEndpointModule();
    const validateEndpoint = mod?.validateEndpoint;

    expect(typeof validateEndpoint === 'function'
      ? () => validateEndpoint('http://example.com')
      : null
    ).not.toThrow();
  });

  it('rejects file: scheme', async () => {
    const mod = await importEndpointModule();
    const validateEndpoint = mod?.validateEndpoint;

    expect(typeof validateEndpoint === 'function'
      ? () => validateEndpoint('file:///etc/passwd')
      : null
    ).toThrow(/only http: and https: are allowed/);
  });

  it('rejects ftp: scheme', async () => {
    const mod = await importEndpointModule();
    const validateEndpoint = mod?.validateEndpoint;

    expect(typeof validateEndpoint === 'function'
      ? () => validateEndpoint('ftp://example.com/data')
      : null
    ).toThrow(/only http: and https: are allowed/);
  });

  it('rejects invalid URLs', async () => {
    const mod = await importEndpointModule();
    const validateEndpoint = mod?.validateEndpoint;

    expect(typeof validateEndpoint === 'function'
      ? () => validateEndpoint('not-a-url')
      : null
    ).toThrow(/Invalid endpoint URL/);
  });
});

describe('endpoint sanitization', () => {
  it('strips userinfo from URLs', async () => {
    const mod = await importEndpointModule();
    const sanitizeEndpoint = mod?.sanitizeEndpoint;

    const result = typeof sanitizeEndpoint === 'function'
      ? sanitizeEndpoint('https://user:password@example.com/path')
      : null;

    expect(result).toBe('https://example.com/path');
  });

  it('strips query parameters from URLs', async () => {
    const mod = await importEndpointModule();
    const sanitizeEndpoint = mod?.sanitizeEndpoint;

    const result = typeof sanitizeEndpoint === 'function'
      ? sanitizeEndpoint('https://example.com/path?token=secret&key=abc')
      : null;

    expect(result).toBe('https://example.com/path');
  });

  it('strips hash from URLs', async () => {
    const mod = await importEndpointModule();
    const sanitizeEndpoint = mod?.sanitizeEndpoint;

    const result = typeof sanitizeEndpoint === 'function'
      ? sanitizeEndpoint('https://example.com/path#fragment')
      : null;

    expect(result).toBe('https://example.com/path');
  });

  it('returns <invalid-url> for unparseable input', async () => {
    const mod = await importEndpointModule();
    const sanitizeEndpoint = mod?.sanitizeEndpoint;

    const result = typeof sanitizeEndpoint === 'function'
      ? sanitizeEndpoint('not-a-url')
      : null;

    expect(result).toBe('<invalid-url>');
  });
});

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
