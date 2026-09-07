import type { WarehouseResponse } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiGet<WarehouseResponse[]>('/console/warehouses'),
    // Warehouses essentially never change mid-session — same reasoning as `useStores`.
    staleTime: 5 * 60_000,
  });
}
