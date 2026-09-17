import type { CreatePlatformUserRequest, PlatformUserResponse, UpdatePlatformUserRequest } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';

const USERS_KEY = 'platform-users';

export function usePlatformUsers() {
  return useQuery({
    queryKey: [USERS_KEY],
    queryFn: () => apiGet<PlatformUserResponse[]>('/platform/users'),
  });
}

export function usePlatformUser(id: string | undefined) {
  return useQuery({
    queryKey: [USERS_KEY, id],
    queryFn: () => apiGet<PlatformUserResponse>(`/platform/users/${id}`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [USERS_KEY] });
}

export function useCreatePlatformUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlatformUserRequest) => apiPost<PlatformUserResponse>('/platform/users', body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdatePlatformUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlatformUserRequest) => apiPut<PlatformUserResponse>(`/platform/users/${id}`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useSuspendPlatformUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<PlatformUserResponse>(`/platform/users/${id}/suspend`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useReactivatePlatformUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<PlatformUserResponse>(`/platform/users/${id}/reactivate`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useRevokePlatformUserSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ revokedCount: number }>(`/platform/users/${id}/revoke-sessions`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeletePlatformUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/users/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

