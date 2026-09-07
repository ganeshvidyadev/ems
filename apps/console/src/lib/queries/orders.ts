import type { FulfilOrderRequest, OrderListQuery, OrderResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api-client';

export interface OrderFilters {
  page: number;
  limit: number;
  status?: OrderListQuery['status'];
  paymentStatus?: OrderListQuery['paymentStatus'];
  fulfilmentStatus?: OrderListQuery['fulfilmentStatus'];
  storeId: string;
}

const ORDERS_KEY = 'orders';

export function useOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: [ORDERS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<OrderResponse>('/console/orders', {
        params: {
          page: filters.page,
          limit: filters.limit,
          status: filters.status || undefined,
          paymentStatus: filters.paymentStatus || undefined,
          fulfilmentStatus: filters.fulfilmentStatus || undefined,
          storeId: filters.storeId,
        },
      }),
    placeholderData: (previous) => previous,
    enabled: Boolean(filters.storeId),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: [ORDERS_KEY, id],
    queryFn: () => apiGet<OrderResponse>(`/console/orders/${id}`),
    enabled: Boolean(id),
  });
}

function useOrderAction<TBody = void>(action: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: TBody }) =>
      apiPost<OrderResponse>(`/console/orders/${id}/${action}`, body ?? {}),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [ORDERS_KEY, id] });
    },
  });
}

export function useCancelOrder() {
  return useOrderAction<{ reason?: string }>('cancel');
}

export function useHoldOrder() {
  return useOrderAction<{ reason?: string }>('hold');
}

export function useResumeOrder() {
  return useOrderAction('resume');
}

export function useCloseOrder() {
  return useOrderAction('close');
}

export function useFulfilOrder() {
  return useOrderAction<FulfilOrderRequest>('fulfil');
}
