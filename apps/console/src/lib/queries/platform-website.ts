import type { UpdateWebsiteContentRequest, WebsiteContentResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api-client';

const WEBSITE_KEY = 'platform-website';

export function usePlatformWebsite() {
  return useQuery({
    queryKey: [WEBSITE_KEY],
    queryFn: () => apiGet<WebsiteContentResponse>('/platform/website'),
  });
}

export function useUpdateWebsiteContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWebsiteContentRequest) => apiPut<WebsiteContentResponse>('/platform/website', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [WEBSITE_KEY] });
    },
  });
}
