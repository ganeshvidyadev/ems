'use client';

import type { CartResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError, api } from '@/lib/api-client';
import { useCartIdStore } from '@/lib/cart-id';
import { useStore } from '@/lib/store-context';

/** One key for the whole cart: every mutation returns the full cart, so there is nothing finer to invalidate. */
export const cartQueryKey = (cartId: string | null) => ['cart', cartId] as const;

/**
 * The current cart, or null when there is not one yet.
 *
 * Every mutation below writes the API's returned cart straight into this query's
 * cache rather than invalidating it. The cart endpoints all answer with the
 * complete recalculated cart — totals, discount, tax — so a refetch would ask for
 * something already in hand, and the quantity stepper would visibly flicker back
 * to its old value in between.
 */
export function useCart() {
  const cartId = useCartIdStore((state) => state.cartId);
  const hydrated = useCartIdStore((state) => state.hydrated);
  const setCartId = useCartIdStore((state) => state.setCartId);

  const query = useQuery<CartResponse | null>({
    queryKey: cartQueryKey(cartId),
    enabled: hydrated && Boolean(cartId),
    queryFn: async () => {
      try {
        return await api.request<CartResponse>(`/cart/${cartId}`);
      } catch (error) {
        // A Redis cart expires. The stored id is then permanently dead, so drop it
        // and present an empty cart — retrying it forever would leave the shopper
        // staring at an error they cannot act on.
        if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
          setCartId(null);
          return null;
        }
        throw error;
      }
    },
  });

  return {
    cart: query.data ?? null,
    // Before hydration there is no way to know whether a cart exists, so the
    // header renders its count as pending rather than confidently showing zero.
    isLoading: !hydrated || query.isLoading,
    isError: query.isError,
    error: query.error,
    itemCount: query.data?.itemCount ?? 0,
  };
}

/**
 * Returns a function that guarantees a cart id, creating one on first use.
 *
 * Carts are created lazily — on the first add-to-cart, not on page load — so a
 * shopper who only browses never causes a Redis write.
 */
function useEnsureCart() {
  const { storeId } = useStore();
  const cartId = useCartIdStore((state) => state.cartId);
  const setCartId = useCartIdStore((state) => state.setCartId);

  return useCallback(async (): Promise<string> => {
    if (cartId) return cartId;
    if (!storeId) throw new ApiError(409, 'STORE_UNAVAILABLE', 'This store is not open for orders yet.');

    const cart = await api.request<CartResponse>('/cart', { method: 'POST', query: { storeId } });
    setCartId(cart.id);
    return cart.id;
  }, [cartId, setCartId, storeId]);
}

/**
 * Shared plumbing for every cart mutation: run it, then seat the returned cart in
 * the cache under its own id.
 *
 * Keying on `cart.id` from the *response* rather than the id we sent matters for
 * the first add-to-cart, where the cart was created inside the same mutation and
 * the store's `cartId` has not re-rendered this hook yet.
 */
function useCartMutation<TVariables>(
  mutationFn: (variables: TVariables, cartId: string) => Promise<CartResponse>,
): UseMutationResult<CartResponse, Error, TVariables> {
  const queryClient = useQueryClient();
  const ensureCart = useEnsureCart();

  return useMutation<CartResponse, Error, TVariables>({
    mutationFn: async (variables) => mutationFn(variables, await ensureCart()),
    onSuccess: (cart) => {
      queryClient.setQueryData(cartQueryKey(cart.id), cart);
    },
  });
}

export function useAddToCart() {
  const { storeId } = useStore();

  return useCartMutation<{ productId: string; variantId?: string; quantity: number }>((variables, cartId) =>
    api.request<CartResponse>(`/cart/${cartId}/items`, {
      method: 'POST',
      query: { storeId },
      body: variables,
    }),
  );
}

export function useUpdateCartItem() {
  return useCartMutation<{ productId: string; variantId?: string | null; quantity: number }>(
    ({ productId, variantId, quantity }, cartId) =>
      api.request<CartResponse>(`/cart/${cartId}/items/${productId}`, {
        method: 'PUT',
        query: { variantId: variantId ?? undefined },
        // Quantity 0 is the documented way to remove a line, so the stepper's
        // decrement needs no special case at the bottom of its range.
        body: { quantity },
      }),
  );
}

export function useRemoveCartItem() {
  return useCartMutation<{ productId: string; variantId?: string | null }>(({ productId, variantId }, cartId) =>
    api.request<CartResponse>(`/cart/${cartId}/items/${productId}`, {
      method: 'DELETE',
      query: { variantId: variantId ?? undefined },
    }),
  );
}

export function useApplyCoupon() {
  return useCartMutation<{ code: string }>(({ code }, cartId) =>
    api.request<CartResponse>(`/cart/${cartId}/coupon`, { method: 'POST', body: { code } }),
  );
}

export function useRemoveCoupon() {
  return useCartMutation<void>((_variables, cartId) =>
    api.request<CartResponse>(`/cart/${cartId}/coupon`, { method: 'DELETE' }),
  );
}

/** Called once an order is placed: the cart is consumed server-side, so the stored id is spent. */
export function useClearCartId() {
  const setCartId = useCartIdStore((state) => state.setCartId);
  const queryClient = useQueryClient();

  return useCallback(() => {
    setCartId(null);
    queryClient.removeQueries({ queryKey: ['cart'] });
  }, [queryClient, setCartId]);
}
