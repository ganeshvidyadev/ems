'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ShoppingBag, ArrowRight, Trash2, Plus, Minus, ShieldCheck, Truck, Sparkles } from 'lucide-react';
import { useCart, useUpdateCartItem, useRemoveCartItem } from '@/lib/use-cart';
import { useCartDrawer } from '@/lib/use-cart-drawer';
import { formatMinor } from '@/lib/money';
import { ProductThumb } from '@/components/product-thumb';

const FREE_SHIPPING_THRESHOLD_MINOR = 99900; // ₹999.00

export function CartDrawer() {
  const pathname = usePathname();
  const { isOpen, closeDrawer } = useCartDrawer();
  const { cart, itemCount, isLoading } = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  // Automatically close drawer when navigating to checkout or cart
  useEffect(() => {
    if (pathname.startsWith('/checkout') || pathname === '/cart') {
      closeDrawer();
    }
  }, [pathname, closeDrawer]);

  // Lock background body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const subtotalMinor = Number(cart?.subtotal?.amountMinor || 0);
  const currency = cart?.currency ?? 'INR';
  const progressPercent = Math.min(100, Math.round((subtotalMinor / FREE_SHIPPING_THRESHOLD_MINOR) * 100));
  const remainingMinor = Math.max(0, FREE_SHIPPING_THRESHOLD_MINOR - subtotalMinor);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="flex w-screen max-w-md flex-col bg-surface shadow-2xl transition duration-300 border-l border-line">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-brand" />
              <h2 className="text-base font-semibold text-ink">
                Your Shopping Cart <span className="text-xs font-normal text-ink-muted">({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
              </h2>
            </div>
            <button
              onClick={closeDrawer}
              className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink-muted hover:text-ink hover:bg-surface-alt transition-colors"
              aria-label="Close cart"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Free Shipping Milestone */}
          {cart && cart.items.length > 0 && (
            <div className="border-b border-line bg-surface-alt/70 px-5 py-3">
              <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                {subtotalMinor >= FREE_SHIPPING_THRESHOLD_MINOR ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <Sparkles className="h-3.5 w-3.5" /> FREE All-India Shipping Unlocked!
                  </span>
                ) : (
                  <span className="text-ink">
                    Add <strong className="text-brand">{formatMinor(String(remainingMinor), currency)}</strong> more for <strong>FREE Delivery</strong>
                  </span>
                )}
                <span className="text-ink-muted">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={'h-full transition-all duration-500 rounded-full ' + (subtotalMinor >= FREE_SHIPPING_THRESHOLD_MINOR ? 'bg-success' : 'bg-brand')}
                  style={{ width: progressPercent + '%' }}
                />
              </div>
            </div>
          )}

          {/* Items Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
                Loading cart items...
              </div>
            ) : !cart || cart.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-ink-muted border border-line mb-3">
                  <ShoppingBag className="h-8 w-8" />
                </div>
                <h3 className="text-base font-semibold text-ink">Your cart is empty</h3>
                <p className="mt-1 text-xs text-ink-muted max-w-xs">
                  Looks like you haven&apos;t added any items to your bag yet.
                </p>
                <button
                  onClick={closeDrawer}
                  className="mt-5 inline-flex items-center justify-center rounded-theme bg-brand px-5 py-2 text-xs font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
                >
                  Explore Products
                </button>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {cart.items.map((item) => (
                  <div key={item.productId + (item.variantId ?? '')} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-theme border border-line bg-surface-alt">
                      <ProductThumb name={item.name} />
                    </div>

                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-ink line-clamp-1 leading-snug">
                            {item.name}
                          </h4>
                          <button
                            onClick={() => removeItem.mutate({ productId: item.productId, variantId: item.variantId })}
                            disabled={removeItem.isPending}
                            className="text-ink-muted hover:text-danger transition-colors p-0.5"
                            title="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {item.variantTitle && (
                          <p className="text-[11px] text-ink-muted mt-0.5">{item.variantTitle}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {/* Stepper */}
                        <div className="flex items-center rounded-theme border border-line bg-surface">
                          <button
                            type="button"
                            onClick={() =>
                              updateItem.mutate({
                                productId: item.productId,
                                variantId: item.variantId,
                                quantity: Math.max(0, item.quantity - 1),
                              })
                            }
                            disabled={updateItem.isPending}
                            className="inline-flex h-6 w-6 items-center justify-center text-ink hover:bg-surface-alt transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-medium text-ink">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateItem.mutate({
                                productId: item.productId,
                                variantId: item.variantId,
                                quantity: item.quantity + 1,
                              })
                            }
                            disabled={updateItem.isPending}
                            className="inline-flex h-6 w-6 items-center justify-center text-ink hover:bg-surface-alt transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Price */}
                        <span className="text-xs font-bold text-ink">
                          {formatMinor(item.lineSubtotalMinor, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer & Checkout Action */}
          {cart && cart.items.length > 0 && (
            <div className="border-t border-line bg-surface p-5 space-y-4">
              {/* Summary Breakdown */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink">{formatMinor(cart.subtotal.amountMinor, currency)}</span>
                </div>
                {Number(cart.discount.amountMinor) > 0 && (
                  <div className="flex items-center justify-between text-success">
                    <span>Discount</span>
                    <span>-{formatMinor(cart.discount.amountMinor, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-ink-muted">
                  <span>Shipping</span>
                  <span className="font-medium text-ink">
                    {cart.shippingEstimate.amountMinor === '0' ? (
                      <span className="text-success font-semibold">FREE</span>
                    ) : (
                      formatMinor(cart.shippingEstimate.amountMinor, currency)
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2 text-sm font-bold text-ink">
                  <span>Estimated Total</span>
                  <span className="text-base text-brand">{formatMinor(cart.total.amountMinor, currency)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Link
                  href="/checkout"
                  onClick={closeDrawer}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-theme bg-brand px-4 text-sm font-semibold text-brand-foreground shadow-sm hover:bg-brand/90 transition-colors"
                >
                  Proceed to Checkout <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/cart"
                  onClick={closeDrawer}
                  className="flex h-9 w-full items-center justify-center rounded-theme border border-line bg-surface-alt text-xs font-medium text-ink hover:bg-surface-alt/80 transition-colors"
                >
                  View Full Cart & Apply Coupons
                </Link>
              </div>

              {/* Trust Micro-bar */}
              <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-ink-muted border-t border-line">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" /> 100% Secure Checkout
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-brand" /> Express Dispatch
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
