'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductResponse } from '@ems/contracts';

interface CompareItem {
  id: string;
  slug: string;
  name: string;
  priceMinor: string;
  comparePriceMinor?: string | null;
  currency: string;
  status: string;
  sku?: string | null;
  requiresShipping?: boolean;
  ratingAverage?: string;
  ratingCount?: number;
  attributes?: Record<string, unknown> | null;
}

interface CompareStore {
  items: CompareItem[];
  addItem: (product: ProductResponse) => boolean;
  removeItem: (id: string) => void;
  clear: () => void;
  isInCompare: (id: string) => boolean;
}

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product: ProductResponse) => {
        const { items } = get();
        if (items.some((i) => i.id === product.id)) return false;
        if (items.length >= 4) return false;
        set({
          items: [
            ...items,
            {
              id: product.id,
              slug: product.slug,
              name: product.name,
              priceMinor: product.priceMinor,
              comparePriceMinor: product.comparePriceMinor,
              currency: product.currency,
              status: product.status,
              sku: product.sku,
              requiresShipping: product.requiresShipping,
              ratingAverage: product.ratingAverage,
              ratingCount: product.ratingCount,
              attributes: product.attributes,
            },
          ],
        });
        return true;
      },
      removeItem: (id: string) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },
      clear: () => set({ items: [] }),
      isInCompare: (id: string) => get().items.some((i) => i.id === id),
    }),
    {
      name: 'ems_compare_items',
    },
  ),
);
