import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

export interface QueueDepth {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface FailedQueueJob {
  id: string | undefined;
  name: string | undefined;
  data: unknown;
  failedReason: string | undefined;
  attemptsMade: number | undefined;
  timestamp: string;
}

const QUEUES_KEY = 'platform-queues';

export function useQueueDepths() {
  return useQuery({
    queryKey: [QUEUES_KEY, 'depths'],
    queryFn: () => apiGet<Record<string, QueueDepth>>('/platform/queues'),
    refetchInterval: 10_000,
  });
}

export function useFailedJobs(queueName: string | null) {
  return useQuery({
    queryKey: [QUEUES_KEY, queueName, 'failed'],
    queryFn: () => apiGet<FailedQueueJob[]>(`/platform/queues/${queueName}/failed`),
    enabled: Boolean(queueName),
  });
}

export function useRetryJob(queueName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiPost(`/platform/queues/${queueName}/jobs/${jobId}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QUEUES_KEY] });
    },
  });
}
