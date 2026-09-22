import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const SHIPMENTS_KEY = 'shipments';

export interface ShipmentSummary {
  id: string;
  orderId?: string;
  carrierCode: string;
  trackingNumber: string;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: [SHIPMENTS_KEY, id],
    queryFn: () => apiGet<ShipmentSummary>(`/console/shipments/${id}`),
    enabled: Boolean(id),
  });
}

export function useOrderShipments(orderId: string | undefined) {
  return useQuery({
    queryKey: [SHIPMENTS_KEY, 'order', orderId],
    queryFn: () => apiGet<ShipmentSummary[]>(`/console/orders/${orderId}/shipments`),
    enabled: Boolean(orderId),
  });
}

export function useSyncAllShipments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ synced: number }>('/console/shipments/sync-tracking', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SHIPMENTS_KEY] });
    },
  });
}

export function useSyncShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ShipmentSummary>(`/console/shipments/${id}/sync`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SHIPMENTS_KEY] });
    },
  });
}
