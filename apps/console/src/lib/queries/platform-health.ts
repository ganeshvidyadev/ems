import type { PlatformHealthResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function usePlatformHealth() {
  return useQuery({
    queryKey: ['platform-health'],
    queryFn: () => apiGet<PlatformHealthResponse>('/platform/health'),
    // A health page that goes stale silently defeats its own purpose — refetch
    // on an interval rather than only on navigation.
    refetchInterval: 30_000,
  });
}
