import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const BANNERS_KEY = 'store-banners';

export interface BannerSummary {
  id: string;
  storeId: string;
  placement: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  clickCount: number;
  createdAt: string;
}

export function useBanners(storeId?: string, placement = 'HOMEPAGE_HERO') {
  return useQuery({
    queryKey: [BANNERS_KEY, storeId ?? 'all', placement],
    queryFn: () =>
      apiGet<BannerSummary[]>('/console/banners', {
        params: { storeId: storeId ?? '', placement },
      }).catch(() => []),
    enabled: Boolean(storeId),
  });
}

export function useCreateBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      storeId: string;
      placement: string;
      title: string;
      imageUrl: string;
      linkUrl?: string;
    }) => apiPost<BannerSummary>('/console/banners', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BANNERS_KEY] });
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/console/banners/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BANNERS_KEY] });
    },
  });
}
