'use client';

import { useState } from 'react';
import type { ProductResponse } from '@ems/contracts';
import { Plus, Check, ShoppingBag, Loader2, Sparkles } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import { ProductThumb } from '@/components/product-thumb';
import { formatMinor } from '@/lib/money';
import { useAddToCart } from '@/lib/use-cart';
import { useCartDrawer } from '@/lib/use-cart-drawer';

interface ProductBundleProps {
  mainProduct: ProductResponse;
  relatedProducts?: ProductResponse[];
}

export function ProductBundle({ mainProduct, relatedProducts = [] }: ProductBundleProps) {
  const addToCart = useAddToCart();
  const { openDrawer } = useCartDrawer();
  const [selectedIds, setSelectedIds] = useState<string[]>([
    mainProduct.id,
    ...(relatedProducts.slice(0, 2).map((p) => p.id)),
  ]);
  const [isAdding, setIsAdding] = useState(false);
  const [bundleAdded, setBundleAdded] = useState(false);

  const bundleItems = [mainProduct, ...relatedProducts.slice(0, 2)];
  if (bundleItems.length < 2) return null;

  function toggleItem(id: string) {
    if (id === mainProduct.id) return; // Main product always selected
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  const activeItems = bundleItems.filter((item) => selectedIds.includes(item.id));
  const rawTotalMinor = activeItems.reduce((acc, item) => acc + Number(item.priceMinor), 0);
  // Give a 10% bundle discount if 2 or more items selected
  const bundleDiscountPercent = activeItems.length >= 2 ? 10 : 0;
  const discountedTotalMinor = Math.round(rawTotalMinor * (1 - bundleDiscountPercent / 100));
  const savingsMinor = rawTotalMinor - discountedTotalMinor;

  async function handleAddBundle() {
    setIsAdding(true);
    try {
      for (const item of activeItems) {
        await addToCart.mutateAsync({
          productId: item.id,
          quantity: 1,
        });
      }
      setBundleAdded(true);
      openDrawer();
      setTimeout(() => setBundleAdded(false), 2500);
    } catch {
      // Ignore
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-line pt-10">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand" />
        <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">
          Frequently Bought Together
        </h2>
      </div>

      <Card className="p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Bundle Images visual showcase */}
          <div className="flex flex-wrap items-center gap-3">
            {bundleItems.map((item, idx) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    onClick={() => toggleItem(item.id)}
                    className={`relative h-20 w-20 rounded-lg overflow-hidden border-2 cursor-pointer transition ${
                      isSelected ? 'border-brand ring-1 ring-brand' : 'border-line opacity-40 hover:opacity-75'
                    }`}
                  >
                    <ProductThumb name={item.name} className="h-full w-full" textClassName="text-xl" />
                    {isSelected && (
                      <div className="absolute top-1 right-1 rounded-full bg-brand text-brand-foreground p-0.5 shadow">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </div>

                  {idx < bundleItems.length - 1 && (
                    <Plus className="h-4 w-4 text-ink-muted shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Price breakdown & CTA */}
          <div className="lg:border-l lg:border-line lg:pl-6 space-y-3 lg:w-72 shrink-0">
            <div>
              <p className="text-xs text-ink-muted">
                Bundle Price ({activeItems.length} items):
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-heading text-2xl font-bold text-ink">
                  {formatMinor(String(discountedTotalMinor), mainProduct.currency)}
                </span>
                {savingsMinor > 0 && (
                  <span className="text-sm text-ink-muted line-through">
                    {formatMinor(String(rawTotalMinor), mainProduct.currency)}
                  </span>
                )}
              </div>
              {savingsMinor > 0 && (
                <Badge tone="sale" className="text-[10px] mt-1">
                  Save {formatMinor(String(savingsMinor), mainProduct.currency)} ({bundleDiscountPercent}% Bundle Off)
                </Badge>
              )}
            </div>

            <Button
              onClick={handleAddBundle}
              disabled={isAdding || activeItems.length === 0}
              className="w-full inline-flex items-center justify-center gap-2"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : bundleAdded ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              <span>{bundleAdded ? 'Bundle Added!' : 'Add Bundle to Cart'}</span>
            </Button>
          </div>
        </div>

        {/* Checkbox item list */}
        <div className="space-y-2 border-t border-line pt-4">
          {bundleItems.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id);
            const isMain = item.id === mainProduct.id;
            return (
              <label
                key={item.id}
                className={`flex items-center gap-3 text-xs cursor-pointer select-none ${
                  isMain ? 'cursor-default font-medium text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isMain}
                  onChange={() => toggleItem(item.id)}
                  className="rounded border-line text-brand focus:ring-brand"
                />
                <span className="truncate">
                  {isMain ? <strong>This item: {item.name}</strong> : item.name}
                </span>
                <span className="font-semibold text-ink ml-auto shrink-0">
                  {formatMinor(item.priceMinor, item.currency)}
                </span>
              </label>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
