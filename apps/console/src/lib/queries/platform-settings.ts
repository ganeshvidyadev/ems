import type { PlatformSettingsResponse, UpdatePlatformSettingsRequest } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api-client';

const SETTINGS_KEY = 'platform-settings';

export function usePlatformSettings() {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: () => apiGet<PlatformSettingsResponse>('/platform/settings'),
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlatformSettingsRequest) => apiPut<PlatformSettingsResponse>('/platform/settings', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SETTINGS_KEY] });
    },
  });
}
