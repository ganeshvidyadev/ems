'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, X } from 'lucide-react';
import { ProductThumb } from '@/components/product-thumb';
import { formatMinor } from '@/lib/money';
import type { ProductResponse } from '@ems/contracts';

interface ViewedItem {
  id: string;
  slug: string;
  name: string;
  priceMinor: string;
  comparePriceMinor?: string | null;
  currency: string;
}

const STORAGE_KEY = 'ems_recently_viewed';
const MAX_ITEMS = 8;

export function RecentlyViewedTracker({ product }: { product: ProductResponse }) {
  useEffect(() => {
    if (!product || typeof window === 'undefined') return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let items: ViewedItem[] = raw ? JSON.parse(raw) : [];

      // Filter out current product if already exists
      items = items.filter((item) => item.id !== product.id && item.slug !== product.slug);

      // Prepend current product
      items.unshift({
        id: product.id,
        slug: product.slug,
        name: product.name,
        priceMinor: product.priceMinor,
        comparePriceMinor: product.comparePriceMinor,
        currency: product.currency,
      });

      // Keep only up to MAX_ITEMS
      if (items.length > MAX_ITEMS) {
        items = items.slice(0, MAX_ITEMS);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to update recently viewed items', e);
    }
  }, [product]);

  return null;
}

export function RecentlyViewedShelf({ currentProductId }: { currentProductId?: string }) {
  const [items, setItems] = useState<ViewedItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: ViewedItem[] = JSON.parse(raw);
        // Exclude current product from display
        const filtered = currentProductId
          ? parsed.filter((item) => item.id !== currentProductId)
          : parsed;
        setItems(filtered.slice(0, 4));
      }
    } catch {
      // Ignore JSON parse errors
    }
  }, [currentProductId]);

  if (!mounted || items.length === 0) return null;

  function handleClear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setItems([]);
    } catch {
      // Ignore
    }
  }

  return (
    <section className="space-y-4 border-t border-line pt-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-brand" />
          <h2 className="font-heading text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Recently Viewed
          </h2>
        </div>
        <button
          onClick={handleClear}
          className="text-xs text-ink-muted hover:text-danger hover:underline"
        >
          Clear History
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products/${item.slug}`}
            className="group flex flex-col justify-between overflow-hidden rounded-theme border border-line bg-surface p-3 transition-shadow hover:shadow-sm"
          >
            <div className="overflow-hidden rounded-theme bg-surface-alt">
              <ProductThumb name={item.name} className="aspect-square w-full" textClassName="text-3xl" />
            </div>
            <div className="mt-3">
              <p className="line-clamp-2 text-xs font-medium text-ink group-hover:text-brand">
                {item.name}
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xs font-bold text-ink">
                  {formatMinor(item.priceMinor, item.currency)}
                </span>
                {item.comparePriceMinor && Number(item.comparePriceMinor) > Number(item.priceMinor) && (
                  <span className="text-[10px] text-ink-muted line-through">
                    {formatMinor(item.comparePriceMinor, item.currency)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
