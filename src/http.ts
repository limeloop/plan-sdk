import { errorFromResponse, NetworkError } from './errors.js';

export interface HttpConfig {
  baseUrl: string;
  publishableKey: string;
  /** Resolves to a valid access token, refreshing first if needed. */
  getAccessToken: () => Promise<string | null>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip attaching a bearer token: only /health and /auth/config need this. */
  anonymous?: boolean;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ''), base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function request<T>(
  config: HttpConfig,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { 'x-publishable-key': config.publishableKey };
  if (!options.anonymous) {
    const token = await config.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(config.baseUrl, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
  const text = await res.text();
  const json = text.length > 0 ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw errorFromResponse(res.status, json);
  }
  return json as T;
}
