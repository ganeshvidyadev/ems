import type { ErrorBody, PaginationMeta } from '@ems/contracts';

/**
 * Browser-side access to the storefront API, through the same-origin proxy at
 * `/api/storefront/*`. Server components use `storefrontFetch()` instead.
 */

const PROXY_BASE = '/api/storefront';

/**
 * Carries the API's own error code and status, not just a message.
 *
 * The status is what the React Query retry policy branches on, and the `code` is
 * what UI copy branches on — an invalid coupon and an expired cart are both 4xx
 * but need entirely different words in front of the shopper. Branching on the
 * message text would break the moment someone rewords it.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorBody['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The first field-level validation message, if the API sent one. */
  get fieldMessage(): string | null {
    return this.details?.[0]?.message ?? null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as `Idempotency-Key`; required by `POST checkout/orders`. */
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = `${PROXY_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, query, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  // 204: `POST reviews/:id/helpful` answers with no body at all.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(response.status, 'MALFORMED_RESPONSE', 'The store API returned a response we could not read.');
  }

  const envelope = parsed as { success?: boolean; data?: T; error?: ErrorBody } | null;

  if (!response.ok || !envelope?.success) {
    const error = envelope?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  return envelope.data as T;
}

/** A list endpoint's payload, with the envelope's pagination meta lifted alongside it. */
export interface Page<T> {
  items: T[];
  pagination: PaginationMeta;
}

async function requestPage<T>(path: string, options: RequestOptions = {}): Promise<Page<T>> {
  const { method = 'GET', query, signal } = options;

  const response = await fetch(buildUrl(path, query), { method, headers: { Accept: 'application/json' }, signal });
  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(response.status, 'MALFORMED_RESPONSE', 'The store API returned a response we could not read.');
  }

  const envelope = parsed as
    | { success?: boolean; data?: T[]; error?: ErrorBody; meta?: { pagination?: PaginationMeta } }
    | null;

  if (!response.ok || !envelope?.success) {
    const error = envelope?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  return {
    items: envelope.data ?? [],
    pagination:
      envelope.meta?.pagination ??
      { page: 1, limit: envelope.data?.length ?? 0, total: envelope.data?.length ?? 0, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

export const api = { request, requestPage };
