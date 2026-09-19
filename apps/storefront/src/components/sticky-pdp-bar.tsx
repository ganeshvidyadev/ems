'use client';

import type { ProductResponse } from '@ems/contracts';
import { ShoppingBag, Zap, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { ProductThumb } from '@/components/product-thumb';
import { formatMinor } from '@/lib/money';
import { useAddToCart } from '@/lib/use-cart';

/**
 * Sticky Floating Bottom Bar for Product Detail Pages.
 * Appears when the shopper scrolls past the hero product section,
 * allowing instant purchase or add-to-cart from anywhere down the page.
 */
export function StickyPdpBar({ product }: { product: ProductResponse }) {
  const [visible, setVisible] = useState(false);
  const [added, setAdded] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const addToCart = useAddToCart();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      // Show when scrolled down past main CTA
      setVisible(window.scrollY > 450);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAdd = async () => {
    try {
      await addToCart.mutateAsync({
        productId: product.id,
        variantId: product.variants?.[0]?.id,
        quantity: 1,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    } catch {
      // Ignore mutation error
    }
  };

  const handleBuyNow = async () => {
    setBuyingNow(true);
    try {
      await addToCart.mutateAsync({
        productId: product.id,
        variantId: product.variants?.[0]?.id,
        quantity: 1,
      });
      router.push('/checkout');
    } catch {
      setBuyingNow(false);
    }
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Sticky product action bar"
      className="fixed bottom-16 sm:bottom-0 left-0 right-0 z-30 border-t border-line bg-surface/95 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom print:hidden"
    >
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-2.5">
        {/* Product preview */}
        <div className="flex items-center gap-3 min-w-0">
          <ProductThumb name={product.name} className="h-10 w-10 shrink-0 rounded-lg" textClassName="text-sm" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink sm:text-sm">{product.name}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading text-sm font-bold text-ink sm:text-base">
                {formatMinor(product.priceMinor, product.currency)}
              </span>
              {product.comparePriceMinor && Number(product.comparePriceMinor) > Number(product.priceMinor) && (
                <span className="text-[11px] text-ink-muted line-through">
                  {formatMinor(product.comparePriceMinor, product.currency)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAdd}
            loading={addToCart.isPending}
            className="hidden sm:inline-flex text-xs h-9 px-3"
          >
            {added ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
            {added ? 'Added' : 'Add to Cart'}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleBuyNow}
            loading={buyingNow}
            className="text-xs h-9 px-4 font-semibold shadow-sm"
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            Buy Now
          </Button>
        </div>
      </div>
    </aside>
  );
}
