import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout-view';

export const metadata: Metadata = {
  title: 'Checkout',
  // Per-shopper and single-use; indexing it would publish an empty checkout form.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
