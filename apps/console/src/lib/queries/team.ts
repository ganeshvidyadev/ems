import type { CreateInvitationRequest, InvitationResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const INVITATIONS_KEY = 'team-invitations';

export function useInvitations(status?: string) {
  return useQuery({
    queryKey: [INVITATIONS_KEY, status ?? 'all'],
    queryFn: () =>
      apiGet<InvitationResponse[]>('/console/invitations', {
        params: status ? { status } : undefined,
      }),
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvitationRequest) =>
      apiPost<InvitationResponse>('/console/invitations', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [INVITATIONS_KEY] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/console/invitations/${id}/resend`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [INVITATIONS_KEY] });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`/console/invitations/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [INVITATIONS_KEY] });
    },
  });
}
