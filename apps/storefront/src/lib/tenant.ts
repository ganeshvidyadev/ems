import { headers } from 'next/headers';

/**
 * Server-side tenant context, read from the headers `middleware.ts` set.
 *
 * Reading from headers rather than a module-level variable is essential in the App
 * Router: server components render concurrently for different requests in the same
 * process, so any shared mutable "current tenant" would leak one shopper's store
 * into another's page. Headers are per-request by construction.
 */

export interface TenantContext {
  hostname: string;
  slug: string | null;
  domainType: 'SUBDOMAIN' | 'CUSTOM';
}

export async function getTenantContext(): Promise<TenantContext> {
  const headerList = await headers();

  return {
    hostname: headerList.get('x-ems-hostname') ?? '',
    slug: headerList.get('x-ems-tenant-slug'),
    domainType: (headerList.get('x-ems-domain-type') as TenantContext['domainType']) ?? 'CUSTOM',
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Fetches from the storefront API on the tenant's behalf.
 *
 * Two things this handles that a bare `fetch` would not:
 *
 *  1. **Forwards the resolved host.** The API resolves the tenant from it, so
 *     omitting it produces a tenant-less request that returns nothing.
 *
 *  2. **Tags the cache entry.** `next: { tags }` is what makes a price change go
 *     live in seconds via `revalidateTag()` instead of waiting out a TTL — the whole
 *     reason ISR is viable for a commerce catalogue where stock and price move.
 */
export async function storefrontFetch<T>(
  path: string,
  options: { tags?: string[]; revalidate?: number | false } = {},
): Promise<T> {
  const tenant = await getTenantContext();

  const response = await fetch(`${API_BASE}/storefront${path}`, {
    headers: {
      // Forwarded explicitly: the internal rewrite does not preserve `Host`, and
      // proxies rewrite it freely.
      'x-ems-hostname': tenant.hostname,
      Accept: 'application/json',
    },
    next: {
      tags: options.tags,
      revalidate: options.revalidate ?? 60,
    },
  });

  if (!response.ok) {
    throw new Error(`Storefront API ${response.status} for ${path}`);
  }

  const body = (await response.json()) as { success: boolean; data: T };
  if (!body.success) throw new Error(`Storefront API returned an error for ${path}`);

  return body.data;
}

/**
 * Turns a tenant theme into inline CSS custom properties.
 *
 * Applied as a `style` attribute on the layout's root element, which is what lets
 * one deployment render every tenant's branding without a per-tenant build.
 */
export function themeToCssVars(theme: Record<string, string | undefined>): Record<string, string> {
  const vars: Record<string, string> = {};
  const allowed = [
    'brand',
    'brand-foreground',
    'brand-muted',
    'surface',
    'surface-alt',
    'ink',
    'ink-muted',
    'line',
    'sale',
    'radius',
    'content-width',
    'font-heading',
    'font-body',
  ];

  for (const key of allowed) {
    const value = theme[key];
    // Values are merchant-supplied, so they are validated on write and filtered
    // again here. An unsanitised value in a style attribute is a CSS injection
    // vector — `}` followed by arbitrary rules.
    if (value && /^[a-zA-Z0-9\s,.#()%'"-]+$/.test(value)) {
      vars[`--${key}`] = value;
    }
  }

  return vars;
}
