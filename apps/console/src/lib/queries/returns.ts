import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const RETURNS_KEY = 'returns';

export interface ReturnSummary {
  id: string;
  orderId: string;
  orderNumber?: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'INSPECTED' | 'COMPLETED' | 'CANCELLED';
  reason: string;
  refundAmountMinor: number;
  currency: string;
  createdAt: string;
}

export function useReturns(orderId?: string) {
  return useQuery({
    queryKey: [RETURNS_KEY, orderId ?? 'all'],
    queryFn: () =>
      apiGet<ReturnSummary[]>('/console/returns', {
        params: orderId ? { orderId } : undefined,
      }),
  });
}

export function useApproveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ReturnSummary>(`/console/returns/${id}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RETURNS_KEY] });
    },
  });
}

export function useRejectReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<ReturnSummary>(`/console/returns/${id}/reject`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RETURNS_KEY] });
    },
  });
}

export function useReceiveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ReturnSummary>(`/console/returns/${id}/receive`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RETURNS_KEY] });
    },
  });
}

export function useCompleteReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ReturnSummary>(`/console/returns/${id}/complete`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RETURNS_KEY] });
    },
  });
}
