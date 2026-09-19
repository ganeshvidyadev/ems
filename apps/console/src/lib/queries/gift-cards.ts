import type { GiftCardResponse, IssueGiftCardRequest, IssueGiftCardResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGetPaginated, apiPost } from '@/lib/api-client';

export interface GiftCardFilters {
  page: number;
  limit: number;
  status?: string;
}

const GIFT_CARDS_KEY = 'gift-cards';

export function useGiftCards(filters: GiftCardFilters) {
  return useQuery({
    queryKey: [GIFT_CARDS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<GiftCardResponse>('/console/gift-cards', {
        params: { page: filters.page, limit: filters.limit },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useIssueGiftCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueGiftCardRequest) =>
      apiPost<IssueGiftCardResponse>('/console/gift-cards', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [GIFT_CARDS_KEY] });
    },
  });
}