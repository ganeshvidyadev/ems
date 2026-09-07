import type { StoreResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: () => apiGet<StoreResponse[]>('/console/stores'),
    // A tenant's stores essentially never change mid-session — no reason to
    // treat this like the frequently-changing data the default staleTime assumes.
    staleTime: 5 * 60_000,
  });
}

/**
 * The store the rest of the console operates on.
 *
 * No multi-store switcher exists yet (every tenant this session has seen has
 * exactly one store) — this is deliberately the first one returned, not a
 * choice persisted anywhere, so it is the one seam to revisit once a tenant
 * with multiple stores needs to pick between them.
 */
export function useCurrentStore() {
  const query = useStores();
  return { ...query, store: query.data?.[0] ?? null };
}
