import type { ProductResponse } from '@ems/contracts';
import { ChevronRight, Package, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/add-to-cart';
import { ProductReviews } from '@/components/product-reviews';
import { ProductThumb } from '@/components/product-thumb';
import { StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui';
import { discountPercent, formatMinor } from '@/lib/money';
import { storefrontFetch } from '@/lib/tenant';

type Params = { slug: string };

/**
 * One product.
 *
 * The product itself is fetched on the server so the price, description and
 * rating are in the first HTML — this is the page that gets shared and indexed,
 * and a client-side fetch would leave a crawler looking at a skeleton. Only the
 * two genuinely interactive regions (add-to-cart, reviews) are client components.
 */
async function loadProduct(slug: string): Promise<ProductResponse | null> {
  try {
    return await storefrontFetch<ProductResponse>(`/products/${encodeURIComponent(slug)}`, {
      // Tagged per product as well as globally, so approving a review or changing
      // one price does not have to invalidate the entire catalogue.
      tags: ['products', `product:${slug}`],
      revalidate: 60,
    });
  } catch {
    // The API answers 404 for a product that is missing, archived or hidden. All
    // three are "not found" to a shopper, and `storefrontFetch` throws on each.
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);

  if (!product) return { title: 'Product not found' };

  return {
    // `metaTitle`/`metaDescription` are the merchant's own SEO overrides; the
    // product name is only the fallback.
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.shortDescription ?? `Buy ${product.name}`,
    keywords: product.metaKeywords ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const product = await loadProduct(slug);

  if (!product) notFound();

  const saving = discountPercent(product.priceMinor, product.comparePriceMinor);
  const rating = Number(product.ratingAverage);

  return (
    <div className="space-y-12">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <Link href="/products" className="hover:text-ink">
          Products
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate text-ink" aria-current="page">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="relative">
          <ProductThumb name={product.name} className="aspect-square w-full" textClassName="text-7xl" />
          {saving !== null && (
            <Badge tone="sale" className="absolute left-3 top-3 text-sm">
              {saving}% off
            </Badge>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            {product.isFeatured && <Badge tone="neutral">Featured</Badge>}

            <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {product.name}
            </h1>

            {product.ratingCount > 0 ? (
              <a href="#reviews" className="inline-block hover:opacity-80">
                <StarRating rating={rating} count={product.ratingCount} />
              </a>
            ) : (
              <p className="text-sm text-ink-muted">No reviews yet</p>
            )}

            {product.shortDescription && (
              <p className="text-base leading-relaxed text-ink-muted">{product.shortDescription}</p>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-heading text-3xl font-semibold text-ink">
              {formatMinor(product.priceMinor, product.currency)}
            </span>
            {product.comparePriceMinor && saving !== null && (
              <>
                <span className="text-lg text-ink-muted line-through">
                  {formatMinor(product.comparePriceMinor, product.currency)}
                </span>
                <span className="text-sm font-medium text-sale">
                  Save {formatMinor(String(Number(product.comparePriceMinor) - Number(product.priceMinor)), product.currency)}
                </span>
              </>
            )}
          </div>

          <AddToCart product={product} />

          <dl className="space-y-2 border-t border-line pt-5 text-sm">
            {product.sku && (
              <div className="flex gap-2">
                <dt className="text-ink-muted">SKU</dt>
                <dd className="font-mono text-ink">{product.sku}</dd>
              </div>
            )}
            {product.requiresShipping && (
              <div className="flex items-center gap-2 text-ink-muted">
                <Truck className="h-4 w-4" aria-hidden />
                <span>Shipping calculated at checkout</span>
              </div>
            )}
            {!product.requiresShipping && (
              <div className="flex items-center gap-2 text-ink-muted">
                <Package className="h-4 w-4" aria-hidden />
                <span>No shipping required</span>
              </div>
            )}
          </dl>
        </div>
      </div>

      {product.description && (
        <section className="space-y-3 border-t border-line pt-10">
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Description</h2>
          <div className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-ink-muted">
            {product.description}
          </div>
        </section>
      )}

      {product.attributes && Object.keys(product.attributes).length > 0 && (
        <section className="space-y-3 border-t border-line pt-10">
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Specifications</h2>
          <dl className="max-w-2xl divide-y divide-line rounded-theme border border-line">
            {Object.entries(product.attributes).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-ink-muted">{key}</dt>
                <dd className="text-right text-ink">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <ProductReviews productId={product.id} />
    </div>
  );
}
