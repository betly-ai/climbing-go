import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

async function importConfigModule() {
  return import('../src/config.js').catch(() => null);
}

async function importCliModule() {
  return import('../src/cli.js').catch(() => null);
}

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }

    await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
  }
});

describe('config persistence', () => {
  it('saves endpoint config to disk', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'climbing-go-config-'));
    tempDirs.push(tempDir);

    const configModule = await importConfigModule();
    const saveConfig = configModule?.saveConfig;
    const getConfigPath = configModule?.getConfigPath;

    if (typeof saveConfig === 'function' && typeof getConfigPath === 'function') {
      await saveConfig({ endpoint: 'https://mcp.example.com' }, { CLIMBING_GO_CONFIG_DIR: tempDir });
      const raw = await readFile(getConfigPath({ CLIMBING_GO_CONFIG_DIR: tempDir }), 'utf8');

      expect(raw).toContain('https://mcp.example.com');
      return;
    }

    expect(null).toBe('https://mcp.example.com');
  });

  it('writes config file with restrictive permissions (0o600)', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'climbing-go-config-perm-'));
    tempDirs.push(tempDir);

    const configModule = await importConfigModule();
    const saveConfig = configModule?.saveConfig;
    const getConfigPath = configModule?.getConfigPath;

    if (typeof saveConfig === 'function' && typeof getConfigPath === 'function') {
      await saveConfig({ endpoint: 'https://mcp.example.com' }, { CLIMBING_GO_CONFIG_DIR: tempDir });
      const fileStat = await stat(getConfigPath({ CLIMBING_GO_CONFIG_DIR: tempDir }));
      const mode = fileStat.mode & 0o777;
      expect(mode).toBe(0o600);
      return;
    }

    expect(null).toBe('saveConfig or getConfigPath missing');
  });

  it('supports config set/get endpoint through cli commands', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'climbing-go-cli-config-'));
    tempDirs.push(tempDir);

    const cliModule = await importCliModule();
    const runCli = cliModule?.runCli;

    if (typeof runCli === 'function') {
      const setResult = await runCli(['config', 'set', 'endpoint', 'https://mcp.example.com'], {
        env: { CLIMBING_GO_CONFIG_DIR: tempDir }
      });
      const getResult = await runCli(['config', 'get', 'endpoint'], {
        env: { CLIMBING_GO_CONFIG_DIR: tempDir }
      });

      expect(setResult.exitCode).toBe(0);
      expect(getResult.exitCode).toBe(0);
      expect(getResult.stdout).toContain('https://mcp.example.com');
      return;
    }

    expect(null).toBe('https://mcp.example.com');
  });

  it('loads alipay config from environment variables', async () => {
    const configModule = await importConfigModule();
    const loadAlipayConfig = configModule?.loadAlipayConfig;

    if (typeof loadAlipayConfig === 'function') {
      expect(loadAlipayConfig({
        ALIPAY_APP_ID: 'fixture-app-id',
        ALIPAY_PRIVATE_KEY_PATH: '/tmp/fixture-private.pem',
        ALIPAY_PUBLIC_KEY_PATH: '/tmp/fixture-public.pem',
        ALIPAY_GATEWAY: 'https://openapi-sandbox.dl.alipaydev.com',
        ALIPAY_RETURN_URL: 'https://example.com/return',
        ALIPAY_NOTIFY_URL: 'https://example.com/notify'
      })).toEqual({
        appId: 'fixture-app-id',
        privateKeyPath: '/tmp/fixture-private.pem',
        publicKeyPath: '/tmp/fixture-public.pem',
        gateway: 'https://openapi-sandbox.dl.alipaydev.com',
        returnUrl: 'https://example.com/return',
        notifyUrl: 'https://example.com/notify'
      });
      return;
    }

    expect(null).toBe('loadAlipayConfig missing');
  });
});
