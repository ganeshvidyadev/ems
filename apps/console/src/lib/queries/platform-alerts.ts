import type { PlatformAlertResponse, PlatformAlertSeverity, PlatformAlertStatus, PlatformAlertType } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGetPaginated, apiPost } from '@/lib/api-client';

const ALERTS_KEY = 'platform-alerts';

export interface AlertFilters {
  page: number;
  limit: number;
  status?: PlatformAlertStatus;
  severity?: PlatformAlertSeverity;
  type?: PlatformAlertType;
}

export function usePlatformAlerts(filters: AlertFilters) {
  return useQuery({
    queryKey: [ALERTS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<PlatformAlertResponse>('/platform/alerts', {
        params: {
          page: filters.page,
          limit: filters.limit,
          status: filters.status || undefined,
          severity: filters.severity || undefined,
          type: filters.type || undefined,
        },
      }),
    placeholderData: (previous) => previous,
    // Alerts are reconciled against live conditions on every read — worth a
    // refresh interval so an admin watching this page sees a resolved alert
    // clear without having to reload.
    refetchInterval: 30_000,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [ALERTS_KEY] });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/platform/alerts/${id}/acknowledge`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useInvestigateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/platform/alerts/${id}/investigate`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/platform/alerts/${id}/resolve`),
    onSuccess: () => invalidate(queryClient),
  });
}
