import Link from 'next/link';
import { Lock, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { NewsletterSignup } from '@/components/newsletter-signup';

/**
 * Enhanced multi-column storefront footer.
 */
export function SiteFooter({ name, currency }: { name: string; currency: string }) {
  return (
    <footer className="mt-20 border-t border-line bg-surface-alt">
      {/* Top Banner: Newsletter and Brand Intro */}
      <div className="border-b border-line">
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h3 className="font-heading text-lg font-bold text-ink">Stay in the loop</h3>
              <p className="mt-1 text-xs text-ink-muted">
                Subscribe to our newsletter for exclusive discounts, new product arrivals, and member perks.
              </p>
            </div>
            <div className="max-w-md lg:ml-auto lg:w-full">
              <NewsletterSignup />
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links Navigation */}
      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Col 1: Brand & About */}
          <div className="space-y-3">
            <h4 className="font-heading text-sm font-semibold text-ink">{name}</h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              Your destination for premium products with trusted quality, fast shipping across India, and seamless customer service.
            </p>
          </div>

          {/* Col 2: Shop Catalog */}
          <div className="space-y-3">
            <h4 className="font-heading text-sm font-semibold text-ink">Shop</h4>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li>
                <Link href="/products" className="hover:text-brand transition-colors">
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-brand transition-colors">
                  Shopping Cart
                </Link>
              </li>
              <li>
                <Link href="/account/wishlist" className="hover:text-brand transition-colors">
                  My Wishlist
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Customer Care */}
          <div className="space-y-3">
            <h4 className="font-heading text-sm font-semibold text-ink">Customer Care</h4>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li>
                <Link href="/account" className="hover:text-brand transition-colors">
                  My Account
                </Link>
              </li>
              <li>
                <Link href="/account/orders" className="hover:text-brand transition-colors">
                  Order Tracking & History
                </Link>
              </li>
              <li>
                <Link href="/account/addresses" className="hover:text-brand transition-colors">
                  Address Book
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Trust & Policies */}
          <div className="space-y-3">
            <h4 className="font-heading text-sm font-semibold text-ink">Security & Policies</h4>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li className="flex items-center gap-1.5 text-ink">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                <span>100% Genuine Guaranteed</span>
              </li>
              <li className="flex items-center gap-1.5 text-ink">
                <Truck className="h-3.5 w-3.5 text-brand" />
                <span>Free Delivery ₹999+</span>
              </li>
              <li className="flex items-center gap-1.5 text-ink">
                <Lock className="h-3.5 w-3.5 text-brand" />
                <span>256-Bit SSL Encryption</span>
              </li>
              <li className="flex items-center gap-1.5 text-ink">
                <RotateCcw className="h-3.5 w-3.5 text-brand" />
                <span>7-Day Return Assistance</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Payment Icons Notice */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-xs text-ink-muted sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} {name}. All prices in {currency}.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
            <span className="rounded border border-line bg-surface px-2 py-0.5 font-medium">UPI</span>
            <span className="rounded border border-line bg-surface px-2 py-0.5 font-medium">Cards</span>
            <span className="rounded border border-line bg-surface px-2 py-0.5 font-medium">NetBanking</span>
            <span className="rounded border border-line bg-surface px-2 py-0.5 font-medium">COD</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
