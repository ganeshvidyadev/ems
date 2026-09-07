import type { ProductResponse } from '@ems/contracts';
import Link from 'next/link';
import { ProductThumb } from '@/components/product-thumb';
import { StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui';
import { discountPercent, formatMinor } from '@/lib/money';

/**
 * One product in a grid.
 *
 * A server component: a card has no interactivity of its own — add-to-cart lives
 * on the detail page, where variant and quantity are actually decidable — so
 * shipping this to the browser would buy nothing.
 */
export function ProductCard({ product }: { product: ProductResponse }) {
  const saving = discountPercent(product.priceMinor, product.comparePriceMinor);
  const rating = Number(product.ratingAverage);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col gap-3 rounded-theme border border-line bg-surface p-3 transition hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="relative">
        <ProductThumb name={product.name} className="aspect-square w-full" textClassName="text-4xl" />
        {saving !== null && (
          <Badge tone="sale" className="absolute left-2 top-2">
            {saving}% off
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink group-hover:text-brand">
          {product.name}
        </h3>

        {/* Only shown once there is a real rating. Five empty stars on every new
            product reads as "rated badly", not "not yet rated". */}
        {product.ratingCount > 0 && <StarRating rating={rating} count={product.ratingCount} size="sm" />}

        <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-1">
          <span className="font-heading text-base font-semibold text-ink">
            {formatMinor(product.priceMinor, product.currency)}
          </span>
          {product.comparePriceMinor && saving !== null && (
            <span className="text-sm text-ink-muted line-through">
              {formatMinor(product.comparePriceMinor, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** The grid itself, so every page that shows products agrees on the breakpoints. */
export function ProductGrid({ products }: { products: ProductResponse[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
