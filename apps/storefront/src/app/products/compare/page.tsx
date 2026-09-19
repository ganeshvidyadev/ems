'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Scale, Trash2, ShoppingCart, Check, X, Star } from 'lucide-react';
import { useCompareStore } from '@/lib/use-compare';
import { useAddToCart } from '@/lib/use-cart';
import { ProductThumb } from '@/components/product-thumb';
import { formatMinor } from '@/lib/money';
import { Button } from '@/components/ui';

export default function ProductComparePage() {
  const { items, removeItem, clear } = useCompareStore();
  const addToCart = useAddToCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-content space-y-6 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Scale className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">No Products to Compare</h1>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Browse our store and click the scale icon on any product to add it to this side-by-side comparison matrix.
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 rounded-theme bg-brand px-5 py-2.5 text-xs font-semibold text-brand-foreground hover:bg-brand/90 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Explore Catalog
        </Link>
      </div>
    );
  }

  // Aggregate all unique specification keys
  const allSpecKeys = Array.from(
    new Set(
      items.flatMap((item) => (item.attributes ? Object.keys(item.attributes) : [])),
    ),
  );

  return (
    <div className="mx-auto max-w-content space-y-8 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/products" className="text-xs text-ink-muted hover:text-ink">
              Products
            </Link>
            <span className="text-xs text-ink-muted">/</span>
            <span className="text-xs font-medium text-ink">Compare</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Product Comparison</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Comparing {items.length} of max 4 selected items
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => clear()}
            className="inline-flex items-center gap-1.5 rounded-theme border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-danger hover:text-danger transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </button>
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 rounded-theme bg-surface-alt px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface border border-line transition-colors"
          >
            + Add More Products
          </Link>
        </div>
      </div>

      {/* Comparison Grid Table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <tbody>
            {/* 1. Product Preview & Actions */}
            <tr className="border-b border-line">
              <td className="w-44 p-4 font-semibold text-ink-muted bg-surface-alt/40 align-top">
                Product
              </td>
              {items.map((item) => (
                <td key={item.id} className="p-4 min-w-[200px] max-w-[260px] align-top">
                  <div className="space-y-3">
                    <div className="relative">
                      <ProductThumb name={item.name} className="aspect-square w-full rounded-xl" textClassName="text-3xl" />
                      <button
                        onClick={() => removeItem(item.id)}
                        className="absolute right-2 top-2 rounded-full bg-surface/80 p-1 text-ink-muted hover:text-danger backdrop-blur-sm shadow-sm"
                        title="Remove from comparison"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Link
                      href={'/products/' + item.slug}
                      className="block font-semibold text-ink hover:text-brand transition-colors line-clamp-2"
                    >
                      {item.name}
                    </Link>

                    <Button
                      size="sm"
                      className="w-full text-xs h-8"
                      onClick={() => addToCart.mutate({ productId: item.id, quantity: 1 })}
                      loading={addToCart.isPending && addToCart.variables?.productId === item.id}
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                    </Button>
                  </div>
                </td>
              ))}
            </tr>

            {/* 2. Price */}
            <tr className="border-b border-line">
              <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40">Price</td>
              {items.map((item) => (
                <td key={item.id} className="p-4 font-bold text-ink text-base">
                  {formatMinor(item.priceMinor, item.currency)}
                  {item.comparePriceMinor && (
                    <span className="ml-2 text-xs font-normal text-ink-muted line-through">
                      {formatMinor(item.comparePriceMinor, item.currency)}
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* 3. Stock Status */}
            <tr className="border-b border-line">
              <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40">Availability</td>
              {items.map((item) => (
                <td key={item.id} className="p-4">
                  <span
                    className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ' +
                      (item.status === 'OUT_OF_STOCK'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700')}
                  >
                    {item.status === 'OUT_OF_STOCK' ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {item.status === 'OUT_OF_STOCK' ? 'Out of Stock' : 'In Stock'}
                  </span>
                </td>
              ))}
            </tr>

            {/* 4. Rating */}
            <tr className="border-b border-line">
              <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40">Customer Rating</td>
              {items.map((item) => (
                <td key={item.id} className="p-4">
                  {Number(item.ratingAverage || 0) > 0 ? (
                    <div className="flex items-center gap-1 text-ink">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold">{Number(item.ratingAverage).toFixed(1)}</span>
                      <span className="text-ink-muted text-xs">({item.ratingCount})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-muted">No reviews yet</span>
                  )}
                </td>
              ))}
            </tr>

            {/* 5. SKU */}
            <tr className="border-b border-line">
              <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40">SKU Code</td>
              {items.map((item) => (
                <td key={item.id} className="p-4 font-mono text-xs text-ink">
                  {item.sku || '—'}
                </td>
              ))}
            </tr>

            {/* 6. Shipping Required */}
            <tr className="border-b border-line">
              <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40">Shipping</td>
              {items.map((item) => (
                <td key={item.id} className="p-4 text-ink">
                  {item.requiresShipping !== false ? 'Standard Delivery' : 'Digital / Instant'}
                </td>
              ))}
            </tr>

            {/* 7. Dynamic Specifications */}
            {allSpecKeys.map((specKey) => (
              <tr key={specKey} className="border-b border-line">
                <td className="p-4 font-semibold text-ink-muted bg-surface-alt/40 capitalize">
                  {specKey}
                </td>
                {items.map((item) => (
                  <td key={item.id} className="p-4 text-ink">
                    {item.attributes && item.attributes[specKey] !== undefined
                      ? String(item.attributes[specKey])
                      : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
