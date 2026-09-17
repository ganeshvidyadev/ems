import type {
  AdjustInvoiceRequest,
  InvoiceStatus,
  PlatformInvoiceResponse,
  RefundPaymentRequest,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api-client';

const INVOICES_KEY = 'platform-invoices';

export interface InvoiceFilters {
  page: number;
  limit: number;
  status?: InvoiceStatus;
}

export function usePlatformInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: [INVOICES_KEY, filters],
    queryFn: () =>
      apiGetPaginated<PlatformInvoiceResponse>('/platform/billing/invoices', {
        params: { page: filters.page, limit: filters.limit, status: filters.status || undefined },
      }),
    placeholderData: (previous) => previous,
  });
}

export function usePlatformInvoice(id: string | undefined) {
  return useQuery({
    queryKey: [INVOICES_KEY, id],
    queryFn: () => apiGet<PlatformInvoiceResponse>(`/platform/billing/invoices/${id}`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: [INVOICES_KEY] });
  void queryClient.invalidateQueries({ queryKey: [INVOICES_KEY, id] });
}

export function useAdjustInvoice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustInvoiceRequest) =>
      apiPost<PlatformInvoiceResponse>(`/platform/billing/invoices/${id}/adjust`, body),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useRefundPayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, ...body }: { paymentId: string } & RefundPaymentRequest) =>
      apiPost<PlatformInvoiceResponse>(`/platform/billing/invoices/${invoiceId}/payments/${paymentId}/refund`, body),
    onSuccess: () => invalidate(queryClient, invoiceId),
  });
}
