import type { AuditActorType, AuditSeverity, PlatformAuditLogResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGetPaginated } from '@/lib/api-client';

export interface AuditLogFilters {
  page: number;
  limit: number;
  severity?: AuditSeverity;
  actorType?: AuditActorType;
  q?: string;
}

export function usePlatformAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['platform-audit-logs', filters],
    queryFn: () =>
      apiGetPaginated<PlatformAuditLogResponse>('/platform/audit-logs', {
        params: {
          page: filters.page,
          limit: filters.limit,
          severity: filters.severity || undefined,
          actorType: filters.actorType || undefined,
          q: filters.q || undefined,
        },
      }),
    placeholderData: (previous) => previous,
  });
}
