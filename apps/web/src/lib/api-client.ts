import type { ApiResponse, PaginationMeta } from '@restaurant-os/types';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

/**
 * Error thrown for any non-successful API envelope. Carries the machine
 * readable code so callers can branch on it, and field-level details so forms
 * can highlight the offending inputs.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return (
      this.code === 'UNAUTHENTICATED' ||
      this.code === 'TOKEN_EXPIRED' ||
      this.code === 'TOKEN_INVALID'
    );
  }
}

/**
 * Query values are serialised with String(); undefined, null and empty strings
 * are dropped so optional filters simply disappear from the URL. Typed as a
 * plain object so purpose-built param interfaces are assignable without each
 * needing an index signature.
 */
export type QueryParams = object;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: QueryParams;
  /** Set false to skip the automatic refresh-and-retry on an expired token. */
  retryOnAuthFailure?: boolean;
}

export interface ListResult<T> {
  items: T[];
  meta: PaginationMeta & Record<string, unknown>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(
    path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`,
  );
  if (query) {
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'object') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refreshes the session using the httpOnly refresh cookie.
 *
 * Concurrent 401s share a single refresh call, so a page that fires six
 * queries at once does not rotate the refresh token six times (which would
 * invalidate all but one of them).
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as ApiResponse<{ accessToken: string }>;
      if (payload.success) {
        onTokenRefreshed?.(payload.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      // Release the shared promise so the next 401 can refresh again.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

/** Set by the auth provider so the websocket can pick up a rotated token. */
let onTokenRefreshed: ((token: string) => void) | null = null;
export function setTokenRefreshHandler(handler: ((token: string) => void) | null): void {
  onTokenRefreshed = handler;
}

let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, retryOnAuthFailure = true, headers, ...rest } = options;

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    // Access and refresh tokens live in httpOnly cookies; nothing is kept in
    // localStorage where an XSS could read it.
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (response.ok && payload?.success) {
    const meta = (payload as { meta?: PaginationMeta }).meta;
    if (meta) {
      return { items: payload.data, meta } as unknown as T;
    }
    return payload.data;
  }

  const code = payload && !payload.success ? payload.error.code : 'INTERNAL_ERROR';
  const message =
    payload && !payload.success
      ? payload.error.message
      : 'ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.';
  const details = payload && !payload.success ? payload.error.details : undefined;

  // One transparent retry after refreshing an expired access token.
  if (
    response.status === 401 &&
    retryOnAuthFailure &&
    (code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED')
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retryOnAuthFailure: false });
    }
    onSessionLost?.();
  }

  throw new ApiError(code, message, response.status, details);
}

/**
 * Multipart upload.
 *
 * Kept separate from `apiRequest` because the browser must set its own
 * `Content-Type` with the multipart boundary - overriding it breaks the parse
 * on the server.
 */
export async function uploadFile<T>(
  path: string,
  file: File,
  query?: QueryParams,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(buildUrl(path, query), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (response.ok && payload?.success) return payload.data;

  const code = payload && !payload.success ? payload.error.code : 'STORAGE_ERROR';
  const message =
    payload && !payload.success ? payload.error.message : 'بارگذاری تصویر انجام نشد.';
  throw new ApiError(code, message, response.status);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
