import type { PlatformAnalyticsResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function usePlatformAnalytics() {
  return useQuery({
    queryKey: ['platform-analytics'],
    queryFn: () => apiGet<PlatformAnalyticsResponse>('/platform/analytics/summary'),
  });
}
