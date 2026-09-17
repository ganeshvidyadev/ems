import type { PlatformQuotaOverviewResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function usePlatformQuota() {
  return useQuery({
    queryKey: ['platform-quota'],
    queryFn: () => apiGet<PlatformQuotaOverviewResponse>('/platform/quota'),
  });
}
