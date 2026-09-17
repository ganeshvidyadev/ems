import type { CreatePlanRequest, PlanResponse, UpdatePlanRequest } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';

const PLANS_KEY = 'platform-plans';

export function usePlatformPlans() {
  return useQuery({
    queryKey: [PLANS_KEY],
    queryFn: () => apiGet<PlanResponse[]>('/platform/plans'),
  });
}

export function usePlatformPlan(code: string | undefined) {
  return useQuery({
    queryKey: [PLANS_KEY, code],
    queryFn: () => apiGet<PlanResponse>(`/platform/plans/${code}`),
    enabled: Boolean(code),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [PLANS_KEY] });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlanRequest) => apiPost<PlanResponse>('/platform/plans', body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdatePlan(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanRequest) => apiPut<PlanResponse>(`/platform/plans/${code}`, body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiPost<PlanResponse>(`/platform/plans/${code}/archive`),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiDelete(`/platform/plans/${code}`),
    onSuccess: () => invalidate(queryClient),
  });
}
