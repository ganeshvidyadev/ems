import type {
  CreateThemeTemplateRequest,
  PlatformThemeTemplateResponse,
  UpdateThemeTemplateRequest,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';

const TEMPLATES_KEY = 'platform-theme-templates';

export function usePlatformThemeTemplates() {
  return useQuery({
    queryKey: [TEMPLATES_KEY],
    queryFn: () => apiGet<PlatformThemeTemplateResponse[]>('/platform/theme-templates'),
  });
}

export function usePlatformThemeTemplate(code: string | undefined) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, code],
    queryFn: () => apiGet<PlatformThemeTemplateResponse>(`/platform/theme-templates/${code}`),
    enabled: Boolean(code),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
}

export function useCreateThemeTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThemeTemplateRequest) =>
      apiPost<PlatformThemeTemplateResponse>('/platform/theme-templates', body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateThemeTemplate(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateThemeTemplateRequest) =>
      apiPut<PlatformThemeTemplateResponse>(`/platform/theme-templates/${code}`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useArchiveThemeTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiPost<PlatformThemeTemplateResponse>(`/platform/theme-templates/${code}/archive`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteThemeTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiDelete(`/platform/theme-templates/${code}`),
    onSuccess: () => invalidate(queryClient),
  });
}
