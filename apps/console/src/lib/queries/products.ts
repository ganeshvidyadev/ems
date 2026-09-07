import type { CreateProductRequest, ProductListQuery, ProductResponse, UpdateProductRequest } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiGetPaginated, apiPost, apiPut } from '@/lib/api-client';

export interface ProductFilters {
  page: number;
  limit: number;
  q?: string;
  status?: ProductListQuery['status'];
  storeId: string;
}

const PRODUCTS_KEY = 'products';

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: [PRODUCTS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<ProductResponse>('/console/products', {
        params: {
          page: filters.page,
          limit: filters.limit,
          q: filters.q || undefined,
          status: filters.status || undefined,
          storeId: filters.storeId,
        },
      }),
    // Keeps the previous page's rows on screen while the next page loads,
    // instead of the table flashing empty between pages.
    placeholderData: (previous) => previous,
    enabled: Boolean(filters.storeId),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: [PRODUCTS_KEY, id],
    queryFn: () => apiGet<ProductResponse>(`/console/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductRequest) => apiPost<ProductResponse>('/console/products', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProductRequest) => apiPut<ProductResponse>(`/console/products/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/console/products/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
}

export function usePublishProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<ProductResponse>(`/console/products/${id}/publish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
}
