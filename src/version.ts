import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadPackageVersion() {
  const packageJsonPath = path.resolve(import.meta.dirname, '..', 'package.json');

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };

    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const CLIMBING_GO_VERSION = loadPackageVersion();
