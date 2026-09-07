'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Where the cart id lives.
 *
 * The API's cart is Redis-backed and identified only by an opaque id it hands
 * back on creation — there is no cookie, and no customer account to hang it off,
 * because storefront checkout is guest-only. So the client owns persistence, and
 * `localStorage` is the only option that survives a reload.
 *
 * The key is namespaced by tenant slug because one browser profile can hold carts
 * for several tenants at once in development (`northwind.ems.localhost` and
 * `lakeside.ems.localhost` are different stores but, to a shopper flipping between
 * them, the same browser). An unnamespaced key would hand one store's cart id to
 * another store's API, which answers with a 404 and looks like a lost cart.
 *
 * A store, not a bare `localStorage` read, because the header's item count and
 * the cart page must agree the instant either changes.
 */

interface CartIdState {
  cartId: string | null;
  /** False until the first client-side read completes; the server render cannot know the id. */
  hydrated: boolean;
  setCartId: (cartId: string | null) => void;
  hydrateFrom: (tenantSlug: string) => void;
}

function storageKey(tenantSlug: string): string {
  return `ems-cart-${tenantSlug || 'default'}`;
}

/** Reads and writes are wrapped: `localStorage` throws outright in a browser set to block site data. */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // A shopper with storage blocked still gets a working cart for this page view;
    // it just will not survive a reload. That is a better outcome than a crash.
  }
}

let activeKey = storageKey('');

export const useCartIdStore = create<CartIdState>((set) => ({
  cartId: null,
  hydrated: false,
  setCartId: (cartId) => {
    safeWrite(activeKey, cartId);
    set({ cartId });
  },
  hydrateFrom: (tenantSlug) => {
    activeKey = storageKey(tenantSlug);
    set({ cartId: safeRead(activeKey), hydrated: true });
  },
}));

/**
 * Loads the stored cart id on mount.
 *
 * In an effect rather than the store's initialiser because the store is created
 * during the server render too, where `window` does not exist — and because a
 * value read before hydration would mismatch the server's HTML and be discarded.
 */
export function useHydrateCartId(tenantSlug: string): void {
  const hydrateFrom = useCartIdStore((state) => state.hydrateFrom);

  useEffect(() => {
    hydrateFrom(tenantSlug);
  }, [hydrateFrom, tenantSlug]);
}
