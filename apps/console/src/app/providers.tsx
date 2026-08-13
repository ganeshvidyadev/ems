'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { AuthProvider } from '@/hooks/use-auth';

/**
 * React Query configuration.
 *
 * The retry policy is the part worth reading. Blanket retries are actively harmful
 * against this API: retrying a 403 will never succeed, retrying a 422 re-sends a
 * payload the server already rejected, and retrying a 402 hammers a billing-blocked
 * tenant. Only genuinely transient conditions are retried.
 *
 * 429 is excluded too — the server sends `Retry-After`, and ignoring it to retry
 * immediately makes rate limiting worse for everyone on that tenant.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30s: merchant dashboards tolerate slightly stale reads, and this
        // collapses the refetch storm from navigating between list and detail.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;

          if (error instanceof ApiError) {
            // Permanent for this request — retrying cannot change the outcome.
            if ([400, 401, 402, 403, 404, 409, 410, 422, 423, 429].includes(error.status)) {
              return false;
            }
          }
          return true;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        // The API is not real-time; refetching every window focus is wasted load.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations are never retried automatically. Without an idempotency key a
        // retry can double-charge or duplicate an order; the ones that are safe to
        // retry send `Idempotency-Key` and opt in explicitly.
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // useState, not a module-level singleton: a shared client would leak one user's
  // cached data into the next request during SSR.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        AuthProvider sits inside QueryClientProvider because its silent-refresh call goes
        through the same Axios client that React Query uses, and a failed refresh must be
        able to clear cached queries.
      */}
      <AuthProvider>{children}</AuthProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
