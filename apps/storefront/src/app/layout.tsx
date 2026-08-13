import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTenantContext } from '@/lib/tenant';
import './globals.css';

/**
 * Metadata is generated per request because it is per tenant — the title, the
 * canonical host, and the robots policy all differ per store. A static `metadata`
 * export would give every merchant the same page title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantContext();
  const storeName = tenant.slug ? titleCase(tenant.slug) : 'Store';

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

  return (
    <html lang="en">
      {/*
        Theme variables will be injected here as an inline style once the theme
        module lands (Phase 7). Inline rather than a stylesheet because the values
        differ per request and a cached stylesheet would serve one tenant's brand
        colours to another.
      */}
      <body data-tenant={tenant.slug ?? undefined}>
        <div className="mx-auto max-w-content px-4">{children}</div>
      </body>
    </html>
  );
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
