import type { EnvMap } from './config.js';

export const DEFAULT_CLIMBING_MCP_ENDPOINT =
  'https://climbing-mcp-ezeuekpuqt.cn-shenzhen.fcapp.run';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export interface ValidateEndpointOptions {
  allowInsecure?: boolean;
}

export class EndpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EndpointValidationError';
  }
}

/**
 * Validate that an endpoint URL uses only http: or https: scheme.
 * Throws EndpointValidationError for invalid URLs, disallowed schemes, or
 * insecure http: endpoints when allowInsecure is not explicitly enabled.
 */
export function validateEndpoint(endpoint: string, options: ValidateEndpointOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new EndpointValidationError(
      `Invalid endpoint URL: unable to parse "${sanitizeEndpoint(endpoint)}"`
    );
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new EndpointValidationError(
      `Unsupported endpoint scheme "${url.protocol}" — only http: and https: are allowed`
    );
  }

  if (url.protocol === 'http:' && !options.allowInsecure) {
    throw new EndpointValidationError(
      'Insecure http: endpoints require the explicit --insecure flag'
    );
  }

  return url;
}

/**
 * Remove userinfo (username:password) and query/hash from an endpoint URL
 * for safe display in logs and error messages.
 */
export function sanitizeEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return '<invalid-url>';
  }

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  return url.toString();
}

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

  return DEFAULT_CLIMBING_MCP_ENDPOINT;
}
