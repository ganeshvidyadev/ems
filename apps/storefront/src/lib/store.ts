import type { ProductResponse, StorefrontStoreResponse } from '@ems/contracts';
import { getTenantContext, storefrontFetch } from '@/lib/tenant';
import { titleCase } from '@/lib/utils';

/**
 * The store behind the current hostname.
 *
 * Server-only, and called from the layout on every render, so it is cached hard:
 * a store's name and currency change about never, and this sits in front of every
 * page.
 *
 * Resolution is deliberately tolerant. A hostname that resolves to no tenant, or
 * a tenant whose store is not provisioned, is a real state — a storefront can be
 * live at a URL before a merchant has finished setup — and the right answer is a
 * page that renders with a sensible name and no cart, not a 500.
 */

export interface StoreSummary {
  /** The store's public id, or null when no store could be resolved. Cart actions need it. */
  id: string | null;
  name: string;
  currency: string;
  /** False when this came from the fallback rather than the API. */
  resolved: boolean;
}

export async function getStoreSummary(): Promise<StoreSummary> {
  try {
    const store = await storefrontFetch<StorefrontStoreResponse>('/store', {
      tags: ['store'],
      revalidate: 300,
    });

    return { id: store.id, name: store.name, currency: store.currency, resolved: true };
  } catch {
    return fallbackSummary();
  }
}

/**
 * Last resort when `storefront/store` cannot answer.
 *
 * The name comes from the tenant slug, which the middleware already parsed out of
 * the hostname — recognisable enough to sit in a header. `id` stays null, which is
 * what disables the cart: firing add-to-cart against a store that does not exist
 * would only turn a clear "not open yet" message into an opaque 409.
 */
async function fallbackSummary(): Promise<StoreSummary> {
  const tenant = await getTenantContext();

  return {
    id: null,
    name: tenant.slug ? titleCase(tenant.slug) : 'Store',
    currency: 'INR',
    resolved: false,
  };
}

/**
 * The catalogue currency, read off the products themselves.
 *
 * Prices are formatted from each product's own `currency` field, so this is only
 * for chrome that has no product in hand. Kept separate from `getStoreSummary` so
 * a page never pays for a product fetch it does not need.
 */
export function currencyOf(products: ProductResponse[], fallback: string): string {
  return products[0]?.currency ?? fallback;
}
