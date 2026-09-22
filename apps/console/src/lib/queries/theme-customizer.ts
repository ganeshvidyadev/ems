import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';

const THEMES_KEY = 'store-themes';

export interface GalleryTemplate {
  code: string;
  name: string;
  description: string;
  category: string;
  previewUrl: string;
  isLocked: boolean;
  lockReason?: string;
}

export interface StoreTheme {
  id: string;
  storeId: string;
  templateCode: string;
  name: string;
  isPublished: boolean;
  config: {
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    borderRadius?: string;
  };
  createdAt: string;
}

export function useThemeGallery() {
  return useQuery({
    queryKey: [THEMES_KEY, 'gallery'],
    queryFn: () => apiGet<GalleryTemplate[]>('/console/theme/gallery'),
  });
}

export function useStoreThemes(storeId: string | undefined) {
  return useQuery({
    queryKey: [THEMES_KEY, 'store', storeId],
    queryFn: () => apiGet<StoreTheme[]>(`/console/theme/store/${storeId}`),
    enabled: Boolean(storeId),
  });
}

export function usePublishTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<StoreTheme>(`/console/theme/${id}/publish`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [THEMES_KEY] });
    },
  });
}

export function useUpdateThemeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
      apiPut<StoreTheme>(`/console/theme/${id}/config`, config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [THEMES_KEY] });
    },
  });
}
