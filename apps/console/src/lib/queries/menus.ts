import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const MENUS_KEY = 'store-menus';

export interface MenuItemSummary {
  id: string;
  label: string;
  url: string;
  target: string;
  sortOrder: number;
}

export interface MenuSummary {
  id: string;
  code: string;
  title: string;
  items: MenuItemSummary[];
}

export function useMenu(code = 'MAIN') {
  return useQuery({
    queryKey: [MENUS_KEY, code],
    queryFn: () => apiGet<MenuSummary>(`/console/menus/${code}`).catch(() => null),
  });
}

export function useAddMenuItem(menuCode = 'MAIN') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; url: string }) =>
      apiPost<MenuItemSummary>(`/console/menus/${menuCode}/items`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MENUS_KEY, menuCode] });
    },
  });
}

export function useDeleteMenuItem(menuCode = 'MAIN') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiDelete(`/console/menus/items/${itemId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MENUS_KEY, menuCode] });
    },
  });
}
