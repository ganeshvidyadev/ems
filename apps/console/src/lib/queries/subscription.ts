import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const SUB_KEY = 'tenant-subscription';
const USAGE_KEY = 'tenant-usage';
const INVOICES_KEY = 'tenant-invoices';

export interface TenantSubscriptionInfo {
  id: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID';
  planCode: string | null;
  planName: string | null;
  billingCycle: 'MONTHLY' | 'YEARLY';
  unitAmountMinor: number | string;
  currency: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEndsAt: string | null;
}

/** Raw shape of `GET /console/subscription/usage`. */
interface ApiQuotaUsage {
  limitKey: string;
  current: number;
  max: number;
  unlimited: boolean;
  remaining: number;
}

export interface QuotaLimitSummary {
  key: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
}

export interface TenantInvoiceInfo {
  id: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
}

export function useCurrentSubscription() {
  return useQuery({
    queryKey: [SUB_KEY],
    queryFn: () => apiGet<TenantSubscriptionInfo>('/console/subscription'),
  });
}

export function useSubscriptionUsage() {
  return useQuery({
    queryKey: [USAGE_KEY],
    queryFn: async (): Promise<QuotaLimitSummary[]> => {
      // The API reports `{ limitKey, current, max, unlimited, remaining }`; the page renders
      // `{ key, used, limit, percentage }`. Mapping here (instead of trusting the shape) is what
      // stops the page crashing on `undefined.replace` when it reads `key`.
      const rows = await apiGet<ApiQuotaUsage[]>('/console/subscription/usage');
      return rows.map((r) => ({
        key: r.limitKey,
        used: r.current,
        limit: r.unlimited ? -1 : r.max,
        remaining: r.unlimited ? -1 : r.remaining,
        percentage: r.unlimited || r.max <= 0 ? 0 : Math.round((r.current / r.max) * 100),
      }));
    },
  });
}

export function useTenantInvoices() {
  return useQuery({
    queryKey: [INVOICES_KEY],
    queryFn: () => apiGet<TenantInvoiceInfo[]>('/console/billing/invoices'),
  });
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { planCode: string; billingCycle?: 'MONTHLY' | 'YEARLY' }) =>
      apiPost('/console/subscription/change-plan', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SUB_KEY] });
      void queryClient.invalidateQueries({ queryKey: [USAGE_KEY] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { immediate?: boolean } | void) =>
      apiPost('/console/subscription/cancel', body ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SUB_KEY] });
    },
  });
}

export function useResumeSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/console/subscription/resume', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SUB_KEY] });
    },
  });
}
