import type {
  AddSupportTicketMessageRequest,
  CreateSupportTicketRequest,
  SupportTicketMessageResponse,
  SupportTicketResponse,
  SupportTicketStatus,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const TICKETS_KEY = 'support-tickets';

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSupportTicketRequest) =>
      apiPost<SupportTicketResponse>('/console/support-tickets', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TICKETS_KEY] });
    },
  });
}

export function useSupportTickets(status?: SupportTicketStatus, tenantId?: string) {
  return useQuery({
    queryKey: [TICKETS_KEY, status ?? 'all', tenantId ?? 'all-tenants'],
    queryFn: () =>
      apiGet<SupportTicketResponse[]>('/console/support-tickets', {
        params: { status, mineOnly: false, tenantId },
      }),
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: [TICKETS_KEY, id],
    queryFn: () => apiGet<SupportTicketResponse>(`/console/support-tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function useSupportTicketMessages(id: string | undefined) {
  return useQuery({
    queryKey: [TICKETS_KEY, id, 'messages'],
    queryFn: () => apiGet<SupportTicketMessageResponse[]>(`/console/support-tickets/${id}/messages`),
    enabled: Boolean(id),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: [TICKETS_KEY] });
  void queryClient.invalidateQueries({ queryKey: [TICKETS_KEY, id] });
  void queryClient.invalidateQueries({ queryKey: [TICKETS_KEY, id, 'messages'] });
}

export function useAddSupportTicketMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddSupportTicketMessageRequest) =>
      apiPost<SupportTicketResponse>(`/console/support-tickets/${id}/messages`, body),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useAssignSupportTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignedTo: string) =>
      apiPost<SupportTicketResponse>(`/console/support-tickets/${id}/assign`, { assignedTo }),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useResolveSupportTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<SupportTicketResponse>(`/console/support-tickets/${id}/resolve`),
    onSuccess: () => invalidate(queryClient, id),
  });
}

export function useCloseSupportTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<SupportTicketResponse>(`/console/support-tickets/${id}/close`, {}),
    onSuccess: () => invalidate(queryClient, id),
  });
}
