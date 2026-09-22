'use client';

import type { CartLineItem, CartResponse } from '@ems/contracts';
import { Minus, Plus, ShoppingBag, Tag, Trash2, X, Truck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { OrderSummary } from '@/components/order-summary';
import { ProductThumb } from '@/components/product-thumb';
import { Alert, Button, Card, EmptyState, Input, Spinner } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import { CouponBox } from '@/components/coupon-box';
import { CartReservationTimer } from '@/components/cart-reservation-timer';
import {
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/lib/use-cart';

/**
 * The cart.
 *
 * Entirely client-side, and it has to be: the cart id lives in `localStorage`, so
 * the server has no way to know which cart to render. That also means the empty
 * state is the correct first render for a new visitor rather than a failure.
 */
export function CartView() {
  const { cart, isLoading, isError } = useCart();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-muted">
        <Spinner label="Loading your cart" />
        Loading your cart…
      </div>
    );
  }

  if (isError) {
    return <Alert>We could not load your cart just now. Please refresh in a moment.</Alert>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Your cart is empty"
        description="Once you add something, it will show up here."
        action={
          <Link
            href="/products"
            className="inline-flex h-10 items-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Browse products
          </Link>
        }
      />
    );
  }

  const FREE_SHIPPING_THRESHOLD_MINOR = 99900; // ₹999.00
  const subtotalAmount = Number(cart.subtotal.amountMinor || 0);
  const isFreeShipping = subtotalAmount >= FREE_SHIPPING_THRESHOLD_MINOR || cart.shippingEstimate.amountMinor === '0';
  const remainingMinor = Math.max(0, FREE_SHIPPING_THRESHOLD_MINOR - subtotalAmount);
  const progressPercent = Math.min(100, Math.round((subtotalAmount / FREE_SHIPPING_THRESHOLD_MINOR) * 100));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-4">
        {/* Free Shipping Progress Indicator */}
        <div className="rounded-theme border border-line bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                  isFreeShipping ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand'
                }`}
              >
                {isFreeShipping ? <CheckCircle2 className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
              </div>
              {isFreeShipping ? (
                <span className="font-semibold text-success">
                  🎉 Congratulations! Your order qualifies for FREE Delivery!
                </span>
              ) : (
                <span className="text-ink">
                  Add <span className="font-bold text-brand">{formatMinor(String(remainingMinor), cart.currency)}</span> more to unlock <span className="font-semibold">FREE Delivery</span>!
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-ink-muted hidden sm:inline">
              Free at ₹999
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-alt">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isFreeShipping ? 'bg-success' : 'bg-brand'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <CartReservationTimer />

        <ul className="divide-y divide-line rounded-theme border border-line">
          {cart.items.map((item) => (
            <CartLine key={`${item.productId}:${item.variantId ?? ''}`} item={item} currency={cart.currency} />
          ))}
        </ul>
      </div>

      <Card className="space-y-5 p-5 lg:sticky lg:top-24">
        <h2 className="font-heading text-base font-semibold text-ink">Order summary</h2>

        <CouponBox cart={cart} />

        <OrderSummary
          figures={{
            subtotal: cart.subtotal,
            discount: cart.discount,
            // The cart's figures are estimates until an address is entered — tax
            // and shipping both depend on where it is going — which the note below
            // says out loud rather than presenting them as final.
            shipping: cart.shippingEstimate,
            tax: cart.taxEstimate,
            total: cart.total,
          }}
          couponCode={cart.couponCode}
        />

        <p className="text-xs text-ink-muted">
          Shipping and tax are estimates. Final amounts are confirmed at checkout once you enter a delivery
          address.
        </p>

        <Link
          href="/checkout"
          className="inline-flex h-12 w-full items-center justify-center rounded-theme bg-brand px-6 text-base font-medium text-brand-foreground transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Proceed to checkout
        </Link>

        <Link href="/products" className="block text-center text-sm text-ink-muted hover:text-ink">
          Continue shopping
        </Link>
      </Card>
    </div>
  );
}

function CartLine({ item, currency }: { item: CartLineItem; currency: string }) {
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const busy = updateItem.isPending || removeItem.isPending;
  const error = updateItem.error ?? removeItem.error;

  function setQuantity(quantity: number) {
    // Quantity 0 is the API's documented remove, so the decrement button needs no
    // separate case when it reaches the bottom of its range.
    updateItem.mutate({ productId: item.productId, variantId: item.variantId, quantity });
  }

  return (
    <li className="flex gap-4 p-4">
      <ProductThumb name={item.name} className="h-20 w-20 shrink-0" textClassName="text-xl" />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{item.name}</p>
            {item.variantTitle && <p className="text-xs text-ink-muted">{item.variantTitle}</p>}
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{item.sku}</p>
          </div>

          <button
            type="button"
            onClick={() => removeItem.mutate({ productId: item.productId, variantId: item.variantId })}
            disabled={busy}
            aria-label={`Remove ${item.name} from cart`}
            // `min-h-11 min-w-11` (44px) meets the WCAG 2.5.5 / Apple minimum
            // touch-target size — a destructive control is the last one that
            // should be hard to tap accurately (BUG-FE-020).
            className="grid h-11 w-11 shrink-0 place-items-center rounded text-ink-muted transition hover:text-sale disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-theme border border-line">
            <button
              type="button"
              onClick={() => setQuantity(item.quantity - 1)}
              disabled={busy}
              aria-label="Decrease quantity"
              // `min-h-11` directly on the button rather than `h-full` off the
              // bordered container: `h-full` would compute against the
              // container's content-box height (its own height minus its
              // 1px top/bottom border), landing at 42px instead of the
              // 44px WCAG 2.5.5 minimum (BUG-FE-020).
              className="grid min-h-11 w-11 place-items-center text-ink-muted transition hover:text-ink disabled:opacity-40"
            >
              {item.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <span className="grid min-h-11 w-10 place-items-center border-x border-line text-sm tabular-nums text-ink">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : item.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(item.quantity + 1)}
              disabled={busy || item.quantity >= 999}
              aria-label="Increase quantity"
              className="grid min-h-11 w-11 place-items-center text-ink-muted transition hover:text-ink disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-ink">{formatMinor(item.lineSubtotalMinor, currency)}</p>
            {item.quantity > 1 && (
              <p className="text-xs text-ink-muted">{formatMinor(item.unitPriceMinor, currency)} each</p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-sale" role="alert">
            {error instanceof ApiError ? error.message : 'We could not update that line.'}
          </p>
        )}
      </div>
    </li>
  );
}
