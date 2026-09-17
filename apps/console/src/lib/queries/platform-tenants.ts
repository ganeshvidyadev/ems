import type {
  CreateTenantRequest,
  SuspendTenantRequest,
  TenantResponse,
  TenantStatus,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiGetPaginated, apiPost } from '@/lib/api-client';

const TENANTS_KEY = 'platform-tenants';

export interface TenantFilters {
  page: number;
  limit: number;
  q?: string;
  status?: TenantStatus;
}

export function usePlatformTenants(filters: TenantFilters) {
  return useQuery({
    queryKey: [TENANTS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<TenantResponse>('/platform/tenants', {
        params: { page: filters.page, limit: filters.limit, q: filters.q || undefined, status: filters.status || undefined },
      }),
    placeholderData: (previous) => previous,
  });
}

export function usePlatformTenant(id: string | undefined) {
  return useQuery({
    queryKey: [TENANTS_KEY, id],
    queryFn: () => apiGet<TenantResponse>(`/platform/tenants/${id}`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [TENANTS_KEY] });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTenantRequest) => apiPost<TenantResponse>('/platform/tenants', body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & SuspendTenantRequest) =>
      apiPost<TenantResponse>(`/platform/tenants/${id}/suspend`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useReactivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<TenantResponse>(`/platform/tenants/${id}/reactivate`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/tenants/${id}`),
    onSuccess: () => invalidate(queryClient),
  });
}

export interface ImpersonateResult {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: import('@ems/contracts').UserSummary;
}

export function useImpersonateTenant() {
  return useMutation({
    mutationFn: (id: string) => apiPost<ImpersonateResult>(`/platform/tenants/${id}/impersonate`),
  });
}

export interface PlanSummary {
  code: string;
  name: string;
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => apiGet<PlanSummary[]>('/plans'),
  });
}
