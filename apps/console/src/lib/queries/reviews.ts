import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const REVIEWS_KEY = 'product-reviews';

export interface ReviewSummary {
  id: string;
  productId: string;
  customerId: string;
  customerName?: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
  merchantReply: string | null;
  createdAt: string;
}

export function useReviews(status?: string) {
  return useQuery({
    queryKey: [REVIEWS_KEY, status ?? 'all'],
    queryFn: () =>
      apiGet<ReviewSummary[]>('/console/reviews', {
        params: status ? { status } : undefined,
      }).catch(() => []),
  });
}

export function useModerateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' | 'HIDDEN' }) =>
      apiPost<ReviewSummary>(`/console/reviews/${id}/moderate`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REVIEWS_KEY] });
    },
  });
}

export function useReplyToReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      apiPost<ReviewSummary>(`/console/reviews/${id}/reply`, { reply }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REVIEWS_KEY] });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/console/reviews/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REVIEWS_KEY] });
    },
  });
}
