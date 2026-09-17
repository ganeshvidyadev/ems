import type { PlatformIntegrationOverviewResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function usePlatformIntegrations() {
  return useQuery({
    queryKey: ['platform-integrations'],
    queryFn: () => apiGet<PlatformIntegrationOverviewResponse>('/platform/integrations'),
    refetchInterval: 30_000,
  });
}
