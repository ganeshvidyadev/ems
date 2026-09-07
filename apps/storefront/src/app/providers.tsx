'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { StoreProvider, type StoreContextValue } from '@/lib/store-context';

/**
 * The retry policy mirrors the console's, for the same reason it has one: a
 * blanket retry against this API is actively harmful. Retrying a 404 product will
 * never find it, a 422 re-sends a payload the server already rejected, and a 429
 * ignores the `Retry-After` the server just sent and makes the rate limit worse.
 *
 * One storefront-specific difference: `staleTime` is short. A shopper's cart is
 * the one thing on the page that must never look stale — a coupon they just
 * applied has to show up — and the cart is small enough that refetching it is
 * cheap. Catalogue data comes from server components instead, which is where the
 * real caching happens (`storefrontFetch` tags it for `revalidateTag`).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (error instanceof ApiError) {
            if ([400, 401, 402, 403, 404, 409, 410, 422, 423, 429].includes(error.status)) return false;
          }
          return true;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Never automatically. An add-to-cart retry duplicates a line; a checkout
        // retry is only safe because it carries an `Idempotency-Key`, and that key
        // is generated per attempt by the checkout page itself.
        retry: false,
      },
    },
  });
}

export function Providers({ children, store }: { children: ReactNode; store: StoreContextValue }) {
  // useState, not a module singleton: during SSR a shared client would leak one
  // shopper's cart into the next request's render.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider value={store}>{children}</StoreProvider>
    </QueryClientProvider>
  );
}
