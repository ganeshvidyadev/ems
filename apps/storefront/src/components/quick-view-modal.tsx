'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Eye, X, Star, ShoppingCart, Truck, ShieldCheck, ArrowRight } from 'lucide-react';
import type { ProductResponse } from '@ems/contracts';
import { ProductThumb } from '@/components/product-thumb';
import { StarRating } from '@/components/star-rating';
import { Badge, Button } from '@/components/ui';
import { discountPercent, formatMinor } from '@/lib/money';
import { AddToCart } from '@/components/add-to-cart';

export function QuickViewButton({ product }: { product: ProductResponse }) {
  const [open, setOpen] = useState(false);

  const saving = discountPercent(product.priceMinor, product.comparePriceMinor);
  const rating = Number(product.ratingAverage);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Quick view product details"
        aria-label="Quick view product details"
        className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-fast z-10 inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1 text-[11px] font-semibold text-ink shadow-md hover:bg-surface border border-line backdrop-blur-sm"
      >
        <Eye className="h-3 w-3 text-brand" /> Quick View
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-fade-up"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-ink-muted hover:text-ink hover:bg-surface-alt transition-colors"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Product Thumbnail / Image */}
              <div className="relative">
                <ProductThumb name={product.name} className="aspect-square w-full rounded-xl" textClassName="text-6xl" />
                {saving !== null && (
                  <Badge tone="sale" className="absolute left-3 top-3 text-xs">
                    {saving}% off
                  </Badge>
                )}
                {product.isFeatured && (
                  <Badge tone="neutral" className="absolute right-3 top-3 text-xs">
                    Featured
                  </Badge>
                )}
              </div>

              {/* Product Details & Actions */}
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-ink line-clamp-2">
                    {product.name}
                  </h2>
                  {product.sku && (
                    <p className="mt-0.5 font-mono text-xs text-ink-muted">SKU: {product.sku}</p>
                  )}
                </div>

                {product.ratingCount > 0 ? (
                  <StarRating rating={rating} count={product.ratingCount} size="sm" />
                ) : (
                  <p className="text-xs text-ink-muted">No reviews yet</p>
                )}

                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-bold text-ink">
                    {formatMinor(product.priceMinor, product.currency)}
                  </span>
                  {product.comparePriceMinor && saving !== null && (
                    <span className="text-sm text-ink-muted line-through">
                      {formatMinor(product.comparePriceMinor, product.currency)}
                    </span>
                  )}
                </div>

                {product.shortDescription && (
                  <p className="text-xs text-ink-muted leading-relaxed line-clamp-3">
                    {product.shortDescription}
                  </p>
                )}

                {/* Add to Cart component */}
                <div className="pt-2">
                  <AddToCart product={product} />
                </div>

                {/* Trust mini banner */}
                <div className="flex items-center justify-between gap-2 rounded-theme border border-line bg-surface-alt/40 p-2.5 text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-brand" /> Express Delivery
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand" /> 100% Genuine
                  </span>
                </div>

                {/* Full Details link */}
                <Link
                  href={'/products/' + product.slug}
                  onClick={() => setOpen(false)}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-brand hover:underline pt-2 border-t border-line"
                >
                  View Full Product Details <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
