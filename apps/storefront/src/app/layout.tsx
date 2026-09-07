import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getStoreSummary } from '@/lib/store';
import { getTenantContext } from '@/lib/tenant';
import './globals.css';

/**
 * Metadata is generated per request because it is per tenant — the title, the
 * canonical host, and the robots policy all differ per store. A static `metadata`
 * export would give every merchant the same page title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantContext();
  // The real store name, not a title-cased slug — "Northwind Main Store" rather
  // than "Northwind". Falls back to the slug when the store is not resolvable.
  const store = await getStoreSummary();
  const storeName = store.name;

  return {
    title: { default: storeName, template: `%s · ${storeName}` },
    description: `Shop online at ${storeName}`,
    // Absolute URLs in Open Graph and canonical tags must use the tenant's own
    // hostname, not the platform's, or every store's shares point at the wrong site.
    metadataBase: tenant.hostname ? new URL(`https://${tenant.hostname}`) : undefined,
    // Unlike the console, storefronts are meant to be indexed — that is the product.
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const tenant = await getTenantContext();
  const store = await getStoreSummary();

  return (
    <html lang="en">
      {/*
        Theme variables will be injected here as an inline style once the theme
        module lands (Phase 7). Inline rather than a stylesheet because the values
        differ per request and a cached stylesheet would serve one tenant's brand
        colours to another.
      */}
      <body data-tenant={tenant.slug ?? undefined} className="flex min-h-screen flex-col">
        {/*
          The store summary is resolved once here and handed to the client tree as a
          prop. Every client component that needs the store's public id — add to
          cart, checkout — would otherwise have to fetch it itself and make the
          shopper wait on a round-trip for a value this render already had.
        */}
        <Providers
          store={{
            storeId: store.id,
            name: store.name,
            currency: store.currency,
            tenantSlug: tenant.slug ?? '',
          }}
        >
          <SiteHeader />
          <main className="flex-1">
            <div className="mx-auto max-w-content px-4 py-8">{children}</div>
          </main>
          <SiteFooter name={store.name} currency={store.currency} />
        </Providers>
      </body>
    </html>
  );
}
