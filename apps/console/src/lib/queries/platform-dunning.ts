import type { PlatformDunningResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function usePlatformDunning() {
  return useQuery({
    queryKey: ['platform-dunning'],
    queryFn: () => apiGet<PlatformDunningResponse>('/platform/billing/dunning'),
    refetchInterval: 30_000,
  });
}
