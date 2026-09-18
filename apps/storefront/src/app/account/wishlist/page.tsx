'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart, ShoppingBag, Trash2, Loader2, Package } from 'lucide-react';
import { useWishlist } from '@/lib/use-wishlist';
import { useAddToCart } from '@/lib/use-cart';
import { formatMinor } from '@/lib/money';
import { ProductThumb } from '@/components/product-thumb';
import { api } from '@/lib/api-client';
import type { ProductResponse } from '@ems/contracts';

export default function CustomerWishlistPage() {
  const { wishlistItems, isLoading, removeFromWishlist } = useWishlist();

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">My Wishlist</h1>
        <p className="mt-1 text-sm text-ink-muted">Products you have saved for later</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : wishlistItems.length === 0 ? (
        <div className="rounded-theme border border-dashed border-line p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-base font-medium text-ink">Your wishlist is empty</p>
          <p className="mt-1 text-xs text-ink-muted">
            Tap the heart icon on any product to save it here for later.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            Explore Catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wishlistItems.map((item) => (
            <WishlistProductCard
              key={`${item.productId}-${item.variantId ?? 'none'}`}
              productId={item.productId}
              variantId={item.variantId}
              onRemove={() => removeFromWishlist(item.productId, item.variantId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WishlistProductCard({
  productId,
  variantId,
  onRemove,
}: {
  productId: string;
  variantId: string | null;
  onRemove: () => void;
}) {
  const addToCart = useAddToCart();
  const [isAdding, setIsAdding] = React.useState(false);

  const { data: product, isLoading } = useQuery<ProductResponse>({
    queryKey: ['product', productId],
    queryFn: () => api.request<ProductResponse>(`products/${productId}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-theme border border-line bg-surface">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col justify-between rounded-theme border border-line bg-surface p-4 text-xs text-ink-muted">
        <p>Product unavailable</p>
        <button onClick={onRemove} className="text-danger hover:underline mt-2 self-start">
          Remove
        </button>
      </div>
    );
  }

  async function handleAddToCart() {
    setIsAdding(true);
    try {
      await addToCart.mutateAsync({
        productId: product!.id,
        quantity: 1,
        variantId: variantId ?? undefined,
      });
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-theme border border-line bg-surface transition-shadow hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="block overflow-hidden bg-surface-alt">
        <ProductThumb name={product.name} className="h-44 w-full" textClassName="text-4xl" />
      </Link>

      <div className="p-4">
        <Link href={`/products/${product.slug}`}>
          <h3 className="line-clamp-2 text-sm font-semibold text-ink hover:text-brand">
            {product.name}
          </h3>
        </Link>
        <p className="mt-2 text-base font-bold text-ink">{formatMinor(product.priceMinor, product.currency)}</p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => void handleAddToCart()}
            disabled={isAdding}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-theme bg-brand py-2 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
            Add to Cart
          </button>
          <button
            onClick={onRemove}
            className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink-muted hover:border-danger hover:text-danger"
            title="Remove from wishlist"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
