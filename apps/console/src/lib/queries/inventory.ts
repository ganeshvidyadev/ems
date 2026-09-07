import type {
  AdjustInventoryRequest,
  InventoryLevelResponse,
  InventoryMovementResponse,
  TransferInventoryRequest,
  UpsertInventorySettingsRequest,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api-client';

const INVENTORY_KEY = 'inventory';

/** Slots at or below their reorder point — the console's main inventory landing view. */
export function useLowStock() {
  return useQuery({
    queryKey: [INVENTORY_KEY, 'low-stock'],
    queryFn: () => apiGet<InventoryLevelResponse[]>('/console/inventory/low-stock'),
  });
}

export function useInventoryLevels(productId: string | undefined, variantId?: string) {
  return useQuery({
    queryKey: [INVENTORY_KEY, 'levels', productId, variantId],
    queryFn: () =>
      apiGet<InventoryLevelResponse[]>('/console/inventory/levels', {
        params: { productId, variantId },
      }),
    enabled: Boolean(productId),
  });
}

export function useInventoryMovements(productId: string | undefined, page: number, limit = 20) {
  return useQuery({
    queryKey: [INVENTORY_KEY, 'movements', productId, page, limit],
    queryFn: () =>
      apiGetPaginated<InventoryMovementResponse>(`/console/inventory/movements/${productId}`, {
        params: { page, limit },
      }),
    enabled: Boolean(productId),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
  };
}

export function useUpsertInventorySettings() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (body: UpsertInventorySettingsRequest) =>
      apiPost<InventoryLevelResponse>('/console/inventory/settings', body),
    onSuccess: invalidate,
  });
}

export function useAdjustInventory() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (body: AdjustInventoryRequest) => apiPost<InventoryLevelResponse>('/console/inventory/adjust', body),
    onSuccess: invalidate,
  });
}

export function useTransferInventory() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (body: TransferInventoryRequest) => apiPost<{ message: string }>('/console/inventory/transfer', body),
    onSuccess: invalidate,
  });
}
