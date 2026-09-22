import type {
  DomainDiagnosticsResponse,
  DomainResponse,
  DomainVerificationInstructionsResponse,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const DOMAINS_KEY = 'tenant-domains';

export function useDomains() {
  return useQuery({
    queryKey: [DOMAINS_KEY],
    queryFn: () => apiGet<DomainResponse[]>('/console/domains'),
  });
}

export function useDomainInstructions(id: string | undefined) {
  return useQuery({
    queryKey: [DOMAINS_KEY, id, 'instructions'],
    queryFn: () =>
      apiGet<DomainVerificationInstructionsResponse>(`/console/domains/${id}/instructions`),
    enabled: Boolean(id),
  });
}

export function useDomainDiagnostics(id: string | undefined) {
  return useQuery({
    queryKey: [DOMAINS_KEY, id, 'diagnostics'],
    queryFn: () =>
      apiGet<DomainDiagnosticsResponse>(`/console/domains/${id}/diagnostics`),
    enabled: Boolean(id),
  });
}

export function useAddDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { hostname: string }) =>
      apiPost<DomainResponse>('/console/domains', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DOMAINS_KEY] });
    },
  });
}

export function useVerifyDomain(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ verified: boolean; domain: DomainResponse }>(`/console/domains/${id}/verify`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DOMAINS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [DOMAINS_KEY, id, 'diagnostics'] });
    },
  });
}

export function useDeleteDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/console/domains/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DOMAINS_KEY] });
    },
  });
}
