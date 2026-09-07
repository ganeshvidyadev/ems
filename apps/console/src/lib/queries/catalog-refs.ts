import type { BrandResponse, CategoryResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGetPaginated } from '@/lib/api-client';

/** Brand/category pickers for the product form — a flat, generously-sized page rather than paginated search, since a merchant's own catalog reference lists are rarely huge. */
export function useBrands() {
  return useQuery({
    queryKey: ['brands', 'picker'],
    queryFn: () => apiGetPaginated<BrandResponse>('/console/brands', { params: { limit: 100 } }),
    staleTime: 5 * 60_000,
    select: (response) => response.data,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories', 'picker'],
    queryFn: () => apiGetPaginated<CategoryResponse>('/console/categories', { params: { limit: 100 } }),
    staleTime: 5 * 60_000,
    select: (response) => response.data,
  });
}
