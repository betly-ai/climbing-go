import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ClimbingGoConfig {
  endpoint?: string;
}

export type EnvMap = Record<string, string | undefined>;

function getConfigDir(env: EnvMap = process.env) {
  if (env.CLIMBING_GO_CONFIG_DIR) {
    return env.CLIMBING_GO_CONFIG_DIR;
  }

  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, 'climbing-go');
  }

  return path.join(os.homedir(), '.config', 'climbing-go');
}

export function getConfigPath(env: EnvMap = process.env) {
  return path.join(getConfigDir(env), 'config.json');
}

export async function loadConfig(env: EnvMap = process.env): Promise<ClimbingGoConfig> {
  try {
    const raw = await readFile(getConfigPath(env), 'utf8');
    return JSON.parse(raw) as ClimbingGoConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

export async function saveConfig(config: ClimbingGoConfig, env: EnvMap = process.env) {
  const configPath = getConfigPath(env);
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(configPath, 0o600);
}
