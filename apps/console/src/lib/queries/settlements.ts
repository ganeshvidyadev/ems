import type {
  MarkSettlementPaidRequest,
  RunSettlementBatchRequest,
  SettlementResponse,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDownload, apiGet, apiPost } from '@/lib/api-client';

const SETTLEMENTS_KEY = 'platform-settlements';

export function usePendingSettlements() {
  return useQuery({
    queryKey: [SETTLEMENTS_KEY, 'pending-approval'],
    queryFn: () => apiGet<SettlementResponse[]>('/platform/settlements/pending-approval'),
  });
}

export function useRunSettlementBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RunSettlementBatchRequest) =>
      apiPost<{ created: SettlementResponse[]; skipped: string[] }>('/platform/settlements/run', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SETTLEMENTS_KEY] });
    },
  });
}

export function useApproveSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<SettlementResponse>(`/platform/settlements/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SETTLEMENTS_KEY] });
    },
  });
}

export function useMarkSettlementProcessing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<SettlementResponse>(`/platform/settlements/${id}/processing`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SETTLEMENTS_KEY] });
    },
  });
}

export function useMarkSettlementPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & MarkSettlementPaidRequest) =>
      apiPost<SettlementResponse>(`/platform/settlements/${id}/paid`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SETTLEMENTS_KEY] });
    },
  });
}

export function exportSettlementCsv(settlement: SettlementResponse): Promise<void> {
  return apiDownload(
    `/platform/settlements/${settlement.id}/export`,
    `settlement-${settlement.settlementNumber}.csv`,
  );
}
