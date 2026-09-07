import type { SalesSummaryResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

const REPORTS_KEY = 'reports';

export interface SalesSummaryParams {
  /** Inclusive `YYYY-MM-DD`. The endpoint validates with `z.string().date()`. */
  from: string;
  to: string;
  storeId?: string;
  channel?: string;
}

/**
 * The dashboard's revenue/orders aggregate.
 *
 * `apiGet`, not `apiGetPaginated`: this returns a single summary object inside the
 * standard envelope, not a list with `meta.pagination`.
 *
 * Reads off a pre-aggregated daily rollup on the server, so the range width barely
 * affects cost — which is why the dashboard can afford to ask for the previous period
 * as well and show a real delta instead of an invented one.
 *
 * Requires `report:read`. Callers without it must pass `enabled: false` rather than
 * letting the request 403 on every mount.
 */
export function useSalesSummary(params: SalesSummaryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [REPORTS_KEY, 'sales-summary', params],
    queryFn: () =>
      apiGet<SalesSummaryResponse>('/console/reports/sales-summary', {
        params: {
          from: params.from,
          to: params.to,
          storeId: params.storeId || undefined,
          channel: params.channel || undefined,
        },
      }),
    // A daily rollup does not change minute to minute; refetching it on every window
    // focus would spend a query to redraw the same number.
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}
