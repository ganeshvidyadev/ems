import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

const MP_KEY = 'marketplace-shares';

export interface ProductShareSummary {
  id: string;
  sourceTenantId: string;
  resellerTenantId: string;
  resellerName?: string;
  productId: string;
  productName?: string;
  commissionRate: number;
  status: 'PENDING' | 'ACCEPTED' | 'PAUSED' | 'REVOKED';
  createdAt: string;
}

export function useMarketplaceShares() {
  return useQuery({
    queryKey: [MP_KEY],
    queryFn: () => apiGet<ProductShareSummary[]>('/console/marketplace/shares').catch(() => []),
  });
}

export function useMarketplaceCatalog() {
  return useQuery({
    queryKey: [MP_KEY, 'catalog'],
    queryFn: () => apiGet<Record<string, unknown>[]>('/console/marketplace/catalog').catch(() => []),
  });
}

export function useMarketplaceResellers() {
  return useQuery({
    queryKey: [MP_KEY, 'resellers'],
    queryFn: () => apiGet<Record<string, unknown>[]>('/console/marketplace/resellers').catch(() => []),
  });
}
