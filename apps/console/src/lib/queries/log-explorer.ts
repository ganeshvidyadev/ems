import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export const LOG_COLLECTIONS = [
  'api_logs',
  'error_logs',
  'auth_logs',
  'activity_logs',
  'webhook_logs',
  'job_logs',
  'third_party_logs',
  'storefront_events',
  'search_queries',
] as const;
export type LogCollection = (typeof LOG_COLLECTIONS)[number];

export interface LogBrowseResult {
  collection: string;
  count: number;
  documents: Record<string, unknown>[];
}

export function useLogCollection(collection: LogCollection, tenantId: string, limit: number) {
  return useQuery({
    queryKey: ['platform-logs', collection, tenantId, limit],
    queryFn: () =>
      apiGet<LogBrowseResult>(`/platform/logs/${collection}`, {
        params: { tenantId: tenantId || undefined, limit },
      }),
  });
}
