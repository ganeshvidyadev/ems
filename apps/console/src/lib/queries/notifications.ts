import type { NotificationResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api-client';

const NOTIFICATIONS_KEY = 'notifications';

export interface NotificationFilters {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

/**
 * The signed-in user's own notification feed.
 *
 * `apiGet` and a plain array, despite the endpoint accepting `page`/`limit`: the
 * controller's return type is `NotificationResponse[]`, so there is no
 * `meta.pagination` to read and `apiGetPaginated` would hand back `data: undefined`.
 * `limit` still works as a cap — it just does not come with pagination controls.
 *
 * Scoped to the caller by the server from the request context, not by a parameter, so
 * there is nothing here that could be pointed at another user's feed. Still gated on
 * `notification:read` — pass `enabled: false` when the role lacks it.
 */
export function useNotifications(filters: NotificationFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, filters],
    queryFn: () =>
      apiGet<NotificationResponse[]>('/console/notifications', {
        params: {
          unreadOnly: filters.unreadOnly ?? undefined,
          page: filters.page ?? undefined,
          limit: filters.limit ?? undefined,
        },
      }),
    enabled: options?.enabled ?? true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<NotificationResponse>(`/console/notifications/${id}/read`),
    // Invalidate the whole key rather than one entry: the unread-count query and the
    // full feed are separate cache entries built from the same rows, and leaving the
    // count stale after a read is exactly the bug a user notices.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });
}
