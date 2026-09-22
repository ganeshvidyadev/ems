'use client';

import React from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/lib/use-wishlist';

export function WishlistButton({
  productId,
  variantId,
  className = '',
}: {
  productId: string;
  variantId?: string | null;
  className?: string;
}) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const inWishlist = isInWishlist(productId, variantId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleWishlist(productId, variantId);
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur-sm transition hover:scale-110 hover:text-brand ${
        inWishlist ? 'text-danger fill-danger' : 'text-ink-muted'
      } ${className}`}
      aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      <Heart className={`h-4 w-4 ${inWishlist ? 'fill-danger text-danger' : ''}`} />
    </button>
  );
}
