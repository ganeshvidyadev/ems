import type { CouponListQuery, CouponResponse, CreateCouponRequest, UpdateCouponRequest } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiGetPaginated, apiPost, apiPut } from '@/lib/api-client';

export interface CouponFilters {
  page: number;
  limit: number;
  status?: CouponListQuery['status'];
}

const COUPONS_KEY = 'coupons';

export function useCoupons(filters: CouponFilters) {
  return useQuery({
    queryKey: [COUPONS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<CouponResponse>('/console/coupons', {
        params: { page: filters.page, limit: filters.limit, status: filters.status || undefined },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: [COUPONS_KEY, id],
    queryFn: () => apiGet<CouponResponse>(`/console/coupons/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCouponRequest) => apiPost<CouponResponse>('/console/coupons', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COUPONS_KEY] });
    },
  });
}

export function useUpdateCoupon(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCouponRequest) => apiPut<CouponResponse>(`/console/coupons/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COUPONS_KEY] });
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/console/coupons/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COUPONS_KEY] });
    },
  });
}
