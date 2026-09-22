'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WishlistItemResponse } from '@ems/contracts';
import { api } from './api-client';
import { useCustomer } from './customer-context';

export function useWishlist() {
  const { isAuthenticated } = useCustomer();
  const queryClient = useQueryClient();

  const { data: wishlistItems = [], isLoading } = useQuery<WishlistItemResponse[]>({
    queryKey: ['wishlist'],
    queryFn: async () => {
      if (!isAuthenticated) return [];
      return api.request<WishlistItemResponse[]>('account/wishlist');
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: async ({ productId, variantId }: { productId: string; variantId?: string | null }) => {
      return api.request('account/wishlist', {
        method: 'POST',
        body: { productId, variantId: variantId ?? undefined },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ productId, variantId }: { productId: string; variantId?: string | null }) => {
      return api.request(`account/wishlist/${productId}`, {
        method: 'DELETE',
        query: variantId ? { variantId } : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const isInWishlist = (productId: string, variantId?: string | null) => {
    return wishlistItems.some(
      (item) => item.productId === productId && (!variantId || item.variantId === variantId),
    );
  };

  const toggleWishlist = async (productId: string, variantId?: string | null) => {
    if (!isAuthenticated) {
      window.location.href = `/account/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (isInWishlist(productId, variantId)) {
      await removeMutation.mutateAsync({ productId, variantId });
    } else {
      await addMutation.mutateAsync({ productId, variantId });
    }
  };

  return {
    wishlistItems,
    isLoading,
    isInWishlist,
    toggleWishlist,
    addToWishlist: (productId: string, variantId?: string | null) =>
      addMutation.mutateAsync({ productId, variantId }),
    removeFromWishlist: (productId: string, variantId?: string | null) =>
      removeMutation.mutateAsync({ productId, variantId }),
  };
}
