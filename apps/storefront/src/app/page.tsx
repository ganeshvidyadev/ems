import type { ProductResponse } from '@ems/contracts';
import { PackageOpen } from 'lucide-react';
import Link from 'next/link';
import { ProductGrid } from '@/components/product-card';
import { Alert, EmptyState } from '@/components/ui';
import { getStoreSummary } from '@/lib/store';
import { storefrontFetchPage } from '@/lib/tenant';

/**
 * The shop front.
 *
 * A server component, so the first paint is real HTML with real prices and works
 * with JavaScript disabled — which matters more here than anywhere else in the
 * app, because this is the page search engines and first-time visitors land on.
 * The catalogue reads are cache-tagged, so a price change can be pushed live with
 * `revalidateTag('products')` instead of waiting out a TTL.
 */

/** Two requests, in parallel: the featured shelf and the newest arrivals. */
async function loadHome(): Promise<{
  featured: ProductResponse[];
  latest: ProductResponse[];
  failed: boolean;
}> {
  try {
    const [featured, latest] = await Promise.all([
      storefrontFetchPage<ProductResponse>('/products?isFeatured=true&limit=4', {
        tags: ['products'],
        revalidate: 60,
      }),
      storefrontFetchPage<ProductResponse>('/products?limit=8', {
        tags: ['products'],
        revalidate: 60,
      }),
    ]);

    return { featured: featured.items, latest: latest.items, failed: false };
  } catch {
    return { featured: [], latest: [], failed: true };
  }
}

export default async function HomePage() {
  const [store, { featured, latest, failed }] = await Promise.all([getStoreSummary(), loadHome()]);

  // Featured products already appear in the featured shelf; repeating them
  // immediately below under a different heading makes a small catalogue look
  // padded out.
  const featuredIds = new Set(featured.map((product) => product.id));
  const rest = latest.filter((product) => !featuredIds.has(product.id));

  if (failed) {
    return (
      <div className="py-8">
        <Alert>
          We could not load the catalogue just now. Please refresh in a moment.
        </Alert>
      </div>
    );
  }

  if (latest.length === 0 && featured.length === 0) {
    return (
      <div className="py-8">
        <EmptyState
          icon={<PackageOpen className="h-8 w-8" />}
          title="Nothing here yet"
          description={`${store.name} hasn't published any products yet. Do check back soon.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-14">
      <section className="rounded-theme border border-line bg-surface-alt px-6 py-12 text-center sm:px-12 sm:py-16">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {store.name}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-ink-muted">
          Desk setups, seating and accessories — picked to actually last, and priced in {store.currency}.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/products"
            className="inline-flex h-12 items-center justify-center rounded-theme bg-brand px-6 text-base font-medium text-brand-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Browse all products
          </Link>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Featured</h2>
              <p className="mt-1 text-sm text-ink-muted">Hand-picked by {store.name}.</p>
            </div>
          </div>
          <ProductGrid products={featured} />
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">
              {featured.length > 0 ? 'More from the shop' : 'Latest products'}
            </h2>
            <Link href="/products" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          <ProductGrid products={rest} />
        </section>
      )}
    </div>
  );
}
