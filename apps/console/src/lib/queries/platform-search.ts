import type { PlatformSearchResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ['platform-search', q],
    queryFn: () => apiGet<PlatformSearchResponse>('/platform/search', { params: { q } }),
    enabled: q.trim().length > 0,
    placeholderData: (previous) => previous,
  });
}
