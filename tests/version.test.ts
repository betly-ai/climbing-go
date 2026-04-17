import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

async function importVersionModule() {
  return import('../src/version.js').catch(() => null);
}

describe('runtime version', () => {
  it('matches package.json version', async () => {
    const versionModule = await importVersionModule();
    const packageJsonText = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonText) as { version?: string };

    expect(versionModule?.CLIMBING_GO_VERSION).toBe(packageJson.version);
  });
});
