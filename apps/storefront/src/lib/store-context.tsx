'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The store facts client components need, resolved once on the server.
 *
 * `storeId` is here because `POST storefront/cart` and `POST cart/:id/items` both
 * require the store's public id, and a client component has no other way to learn
 * it. Fetching it again from the browser would mean every shopper waits on a
 * round-trip for a value the server already had while rendering the shell.
 *
 * It is nullable on purpose. A tenant whose store has not been provisioned yet
 * resolves to no store at all, and the honest response to that is to disable the
 * cart with an explanation — not to fire add-to-cart requests that will 409.
 */
export interface StoreContextValue {
  /** The store's public id, or null when this tenant has no store yet. */
  storeId: string | null;
  name: string;
  currency: string;
  /** Namespaces the cart in `localStorage`, so two tenant subdomains sharing a browser profile do not collide. */
  tenantSlug: string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ value, children }: { value: StoreContextValue; children: ReactNode }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <Providers>');
  return value;
}
