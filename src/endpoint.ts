import type { EnvMap } from './config.js';

export interface ResolveEndpointInput {
  cliEndpoint?: string;
  configEndpoint?: string;
  env?: EnvMap;
}

export function resolveEndpoint(input: ResolveEndpointInput) {
  const cliEndpoint = input.cliEndpoint?.trim();
  if (cliEndpoint) {
    return cliEndpoint;
  }

  const envEndpoint = input.env?.CLIMBING_MCP_ENDPOINT?.trim();
  if (envEndpoint) {
    return envEndpoint;
  }

  const configEndpoint = input.configEndpoint?.trim();
  if (configEndpoint) {
    return configEndpoint;
  }

  return null;
}
