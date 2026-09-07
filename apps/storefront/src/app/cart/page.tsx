import type { Metadata } from 'next';
import { CartView } from '@/components/cart-view';

export const metadata: Metadata = {
  title: 'Your cart',
  // A cart page is per-shopper and has no shareable content; letting a crawler
  // index it would only publish an empty cart under the store's name.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">Your cart</h1>
      <CartView />
    </div>
  );
}
