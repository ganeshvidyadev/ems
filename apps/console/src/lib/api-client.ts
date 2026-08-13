import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiResponse, ErrorResponse, PaginatedResponse } from '@ems/contracts';

/**
 * The typed API client.
 *
 * Three responsibilities that all exist because of decisions made on the server:
 *
 *  1. **Unwrap the envelope.** Every response is `{ success, data, meta }`
 *     (docs/04 §2). Unwrapping here means components consume `Product[]`, not
 *     `SuccessResponse<Product[]>`, and no component ever forgets to check `success`.
 *
 *  2. **Silent refresh with request queueing.** Access tokens live 10 minutes and
 *     are held in memory only. When one expires mid-session, the *first* 401
 *     triggers a refresh and every concurrent request waits on that single refresh
 *     rather than firing its own. Without the queue, a dashboard that loads six
 *     widgets at once would fire six refreshes; because refresh tokens rotate with
 *     reuse detection, five of those would present a now-consumed token and the
 *     server would revoke the entire family — logging the user out for doing
 *     nothing wrong.
 *
 *  3. **Preserve `error.code`.** Errors are rethrown as `ApiError` carrying the
 *     stable code, so callers branch on `code`, never on a message string.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: { field?: string; code: string; message: string }[],
    readonly context?: Record<string, unknown>,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors keyed for react-hook-form's `setError`. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      if (detail.field) result[detail.field] = detail.message;
    }
    return result;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isValidation(): boolean {
    return this.status === 422;
  }
  /** 402 — subscription past due or plan cap hit; the UI shows an upgrade prompt. */
  get isBillingBlocked(): boolean {
    return this.status === 402;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Access token in a module variable, never `localStorage`.
 *
 * `localStorage` is readable by any script on the page, so one compromised
 * dependency exfiltrates a valid token. In memory, it dies with the tab; the
 * refresh token lives in an httpOnly cookie that JavaScript cannot read at all.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth provider so a failed refresh can redirect to login. */
export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  // Required for the refresh-token cookie to travel cross-origin in development.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// --- Single-flight refresh --------------------------------------------------
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // Every concurrent 401 awaits the same promise, so exactly one refresh request
  // is ever in flight. See reason (2) in the class comment — this is what prevents
  // reuse detection from mass-revoking a healthy session.
  refreshPromise ??= axios
    .post<ApiResponse<{ accessToken: string; expiresIn: number }>>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then((response) => {
      if (!response.data.success) throw new Error('Refresh rejected');
      const token = response.data.data.accessToken;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorResponse>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    const isRefreshable =
      status === 401 &&
      original &&
      !original._retried &&
      // Do not try to refresh the refresh call itself, or a failed login.
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login') &&
      // A revoked or reused token cannot be refreshed — that session is finished.
      code !== 'AUTH_REFRESH_TOKEN_REUSED' &&
      code !== 'AUTH_TOKEN_REVOKED';

    if (isRefreshable) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return http.request(original);
      } catch {
        setAccessToken(null);
        onUnauthenticated?.();
      }
    } else if (status === 401) {
      setAccessToken(null);
      onUnauthenticated?.();
    }

    throw toApiError(error);
  },
);

function toApiError(error: AxiosError<ErrorResponse>): ApiError {
  const body = error.response?.data;

  if (body && body.success === false) {
    return new ApiError(
      body.error.code,
      body.error.message,
      error.response?.status ?? 500,
      body.error.details,
      body.error.context,
      body.meta?.correlationId,
    );
  }

  // No envelope: a network failure, a timeout, or a proxy error page.
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('REQUEST_TIMEOUT', 'The request timed out. Please try again.', 504);
  }
  if (!error.response) {
    return new ApiError('NETWORK_ERROR', 'Cannot reach the server. Check your connection.', 0);
  }

  return new ApiError('INTERNAL_ERROR', 'Something went wrong.', error.response.status);
}

// ---------------------------------------------------------------------------
// Typed helpers — these return `data`, already unwrapped.
// ---------------------------------------------------------------------------

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<ApiResponse<T>>(url, config);
  return unwrap(response.data);
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await http.post<ApiResponse<T>>(url, body, config);
  return unwrap(response.data);
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await http.patch<ApiResponse<T>>(url, body, config);
  return unwrap(response.data);
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.delete<ApiResponse<T>>(url, config);
  // 204 has no body to unwrap.
  if (response.status === 204) return undefined as T;
  return unwrap(response.data);
}

/** Paginated variant — keeps `meta.pagination`, which callers need for controls. */
export async function apiGetPaginated<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<PaginatedResponse<T>> {
  const response = await http.get<PaginatedResponse<T>>(url, config);
  return response.data;
}

function unwrap<T>(body: ApiResponse<T>): T {
  if (body.success) return body.data;
  throw new ApiError(body.error.code, body.error.message, 500, body.error.details);
}

/**
 * Mutations that must not double-apply send an idempotency key.
 *
 * The server stores the key with the request hash, so a retry after a dropped
 * response returns the original result instead of charging a card twice.
 */
export function withIdempotency(key: string, config: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...config, headers: { ...config.headers, 'Idempotency-Key': key } };
}
