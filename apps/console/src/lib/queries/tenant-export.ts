import type { JobResponse, JobStatus } from '@ems/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
}

const JOB_TERMINAL_STATUSES: JobStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];

/**
 * There is no dedicated "list tenants" endpoint yet (see `platform.tenant`'s
 * unimplemented create/suspend/reactivate/delete actions) — `platform/themes`
 * is, today, the only platform endpoint that returns every company, so it
 * doubles as the tenant picker here. Once a real tenant list page exists,
 * this should read from that instead.
 */
export function usePlatformCompanies() {
  return useQuery({
    queryKey: ['platform-companies'],
    queryFn: () => apiGet<{ companies: PlatformCompany[] }>('/platform/themes'),
    select: (data) => data.companies,
  });
}

export function useExportTenantData() {
  return useMutation({
    mutationFn: (tenantId: string) =>
      apiPost<{ jobId: string; status: string }>(`/platform/tenants/${tenantId}/export`),
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiGet<JobResponse>(`/console/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && JOB_TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });
}
