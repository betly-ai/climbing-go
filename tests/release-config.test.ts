import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

async function importReleaseConfig() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'release.config.mjs')).href;
  return import(moduleUrl).catch(() => null);
}

async function importReleaseReadiness() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts', 'verify-release-readiness.mjs')
  ).href;
  return import(moduleUrl).catch(() => null);
}

describe('semantic-release config', () => {
  it('publishes from main with npm and github plugins', async () => {
    const releaseConfigModule = await importReleaseConfig();
    const config = releaseConfigModule?.default;

    expect(config?.branches).toEqual(['main']);
    expect(config?.plugins).toEqual(
      expect.arrayContaining([
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        '@semantic-release/changelog',
        '@semantic-release/npm',
        '@semantic-release/github'
      ])
    );
  });

  it('checks betly release identity before publishing', async () => {
    const releaseReadinessModule = await importReleaseReadiness();
    const evaluateReleaseReadiness = releaseReadinessModule?.evaluateReleaseReadiness;

    const result =
      typeof evaluateReleaseReadiness === 'function'
        ? evaluateReleaseReadiness({
            gitUserName: 'betlysaas',
            gitUserEmail: 'betly@mx5.cn',
            npmUserName: 'betlysaas',
            npmTokenPresent: true,
            expectedGitUserName: 'betlysaas',
            expectedGitUserEmail: 'betly@mx5.cn',
            expectedNpmUserName: 'betlysaas'
          })
        : null;

    expect(result).toEqual({
      ok: true,
      checks: [
        { name: 'git-user-name', ok: true, actual: 'betlysaas', expected: 'betlysaas' },
        { name: 'git-user-email', ok: true, actual: 'betly@mx5.cn', expected: 'betly@mx5.cn' },
        { name: 'npm-token', ok: true, actual: 'present', expected: 'present' },
        { name: 'npm-user-name', ok: true, actual: 'betlysaas', expected: 'betlysaas' }
      ]
    });
  });

  it('reports mismatched release identity clearly', async () => {
    const releaseReadinessModule = await importReleaseReadiness();
    const evaluateReleaseReadiness = releaseReadinessModule?.evaluateReleaseReadiness;

    const result =
      typeof evaluateReleaseReadiness === 'function'
        ? evaluateReleaseReadiness({
            gitUserName: 'twinh',
            gitUserEmail: 'twinhuang@qq.com',
            npmUserName: 'twinh',
            npmTokenPresent: false,
            expectedGitUserName: 'betlysaas',
            expectedGitUserEmail: 'betly@mx5.cn',
            expectedNpmUserName: 'betlysaas'
          })
        : null;

    expect(result?.ok).toBe(false);
    expect(result?.checks.filter((check: { ok: boolean }) => !check.ok)).toHaveLength(4);
  });
});

describe('release workflow', () => {
  it('supports push to main and manual dispatch', async () => {
    const workflowPath = path.join(
      process.cwd(),
      '.github',
      'workflows',
      'release-climbing-go.yml'
    );

    const workflowText = await readFile(workflowPath, 'utf8').catch(() => '');

    expect(workflowText).toContain('workflow_dispatch:');
    expect(workflowText).toContain('push:');
    expect(workflowText).toContain('- main');
    expect(workflowText).toContain('pnpm exec semantic-release');
  });

  it('publishes a bin entry that points to the built CLI entry file', async () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJsonText = await readFile(packageJsonPath, 'utf8').catch(() => '');
    const packageJson = packageJsonText ? JSON.parse(packageJsonText) : {};

    expect(packageJson.bin).toEqual({
      'climbing-go': './dist/index.js'
    });
  });
});
