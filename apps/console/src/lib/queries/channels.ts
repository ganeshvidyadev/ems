import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const CHANNELS_KEY = 'sales-channels';

export interface ChannelSummary {
  id: string;
  type: string;
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastSyncAt: string | null;
  listingsCount?: number;
}

export function useChannels() {
  return useQuery({
    queryKey: [CHANNELS_KEY],
    queryFn: () => apiGet<ChannelSummary[]>('/console/channels').catch(() => []),
  });
}

export function useSyncChannelInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/console/channels/${id}/sync-inventory`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHANNELS_KEY] });
    },
  });
}

export function useImportChannelOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/console/channels/${id}/import-orders`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHANNELS_KEY] });
    },
  });
}
