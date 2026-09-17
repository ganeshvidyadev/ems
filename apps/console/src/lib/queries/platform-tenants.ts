import type {
  CreateTenantRequest,
  ImpersonateTenantRequest,
  SuspendTenantRequest,
  TenantOverviewResponse,
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

export function usePlatformTenantOverview(id: string | undefined) {
  return useQuery({
    queryKey: [TENANTS_KEY, id, 'overview'],
    queryFn: () => apiGet<TenantOverviewResponse>(`/platform/tenants/${id}/overview`),
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
    mutationFn: ({ id, ...body }: { id: string } & ImpersonateTenantRequest) =>
      apiPost<ImpersonateResult>(`/platform/tenants/${id}/impersonate`, body),
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

export function useChangeTenantPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & import('@ems/contracts').ChangeTenantPlanRequest) =>
      apiPost<TenantOverviewResponse>(`/platform/tenants/${id}/subscription/change-plan`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useExtendTenantTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & import('@ems/contracts').ExtendTenantTrialRequest) =>
      apiPost<TenantOverviewResponse>(`/platform/tenants/${id}/subscription/extend-trial`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCancelTenantSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & import('@ems/contracts').CancelTenantSubscriptionRequest) =>
      apiPost<TenantOverviewResponse>(`/platform/tenants/${id}/subscription/cancel`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useResumeTenantSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<TenantOverviewResponse>(`/platform/tenants/${id}/subscription/resume`),
    onSuccess: () => invalidate(queryClient),
  });
}

