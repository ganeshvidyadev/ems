'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  XCircle,
  Loader2,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAddToCart } from '@/lib/use-cart';
import { formatMinor } from '@/lib/money';
import type { OrderResponse } from '@ems/contracts';

export default function CustomerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();

  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const { data: order, isLoading, error } = useQuery<OrderResponse>({
    queryKey: ['account-order', id],
    queryFn: () => api.request<OrderResponse>(`account/orders/${id}`),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) =>
      api.request<OrderResponse>(`account/orders/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      setIsCancelling(false);
      void queryClient.invalidateQueries({ queryKey: ['account-order', id] });
      void queryClient.invalidateQueries({ queryKey: ['account-orders'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to cancel order');
      }
    },
  });

  async function handleBuyAgain() {
    if (!order?.items) return;
    setIsReordering(true);
    try {
      for (const item of order.items) {
        if (item.productId) {
          await addToCart.mutateAsync({
            productId: item.productId,
            quantity: item.quantity,
            variantId: item.variantId ?? undefined,
          });
        }
      }
      router.push('/cart');
    } catch {
      setActionError('Could not add some items to cart.');
    } finally {
      setIsReordering(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-theme border border-danger/20 bg-danger/10 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-danger" />
        <h2 className="mt-2 text-base font-semibold text-ink">Order Not Found</h2>
        <p className="mt-1 text-xs text-ink-muted">
          This order does not exist or you do not have permission to view it.
        </p>
        <Link
          href="/account/orders"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to My Orders
        </Link>
      </div>
    );
  }

  const isCancellable = order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'ON_HOLD';
  const isEligibleForReturn = order.status === 'DELIVERED';

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/account/orders"
            className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink hover:bg-surface-alt"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-ink">Order #{order.orderNumber}</h1>
            <p className="text-xs text-ink-muted">
              Placed on {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-theme border border-line px-3 text-xs font-medium text-ink hover:bg-surface-alt"
          >
            <Printer className="h-3.5 w-3.5" /> Print Invoice
          </button>

          {isEligibleForReturn && (
            <Link
              href={`/account/returns/new?orderId=${order.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-theme border border-brand bg-brand/5 px-3 text-xs font-medium text-brand hover:bg-brand/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Request Return
            </Link>
          )}

          {isCancellable && !isCancelling && (
            <button
              onClick={() => {
                setActionError(null);
                setIsCancelling(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-theme border border-danger/30 text-xs font-medium text-danger hover:bg-danger/10 px-3"
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel Order
            </button>
          )}

          <button
            onClick={() => void handleBuyAgain()}
            disabled={isReordering}
            className="inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {isReordering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
            Buy Again
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {actionError}
        </div>
      )}

      {/* Cancel Order Prompt Form */}
      {isCancelling && (
        <div className="rounded-theme border border-danger/30 bg-surface p-5">
          <h3 className="font-semibold text-ink text-sm">Confirm Order Cancellation</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Are you sure you want to cancel Order #{order.orderNumber}? Any reservations will be released.
          </p>
          <div className="mt-3">
            <input
              type="text"
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => cancelMutation.mutate(cancelReason || 'Cancelled by customer')}
              disabled={cancelMutation.isPending}
              className="inline-flex h-8 items-center justify-center rounded-theme bg-danger px-3 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
            >
              {cancelMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Cancellation'}
            </button>
            <button
              onClick={() => setIsCancelling(false)}
              className="inline-flex h-8 items-center justify-center rounded-theme border border-line px-3 text-xs font-medium text-ink hover:bg-surface-alt"
            >
              Nevermind
            </button>
          </div>
        </div>
      )}

      {/* Status Badges & Timeline */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Order Status</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              order.status === 'DELIVERED'
                ? 'bg-success/15 text-success'
                : order.status === 'CANCELLED'
                  ? 'bg-danger/15 text-danger'
                  : 'bg-brand/15 text-brand'
            }`}
          >
            Status: {order.status}
          </span>
          <span className="rounded-full bg-surface-alt px-3 py-1 text-xs font-medium text-ink">
            Payment: {order.paymentStatus}
          </span>
          <span className="rounded-full bg-surface-alt px-3 py-1 text-xs font-medium text-ink">
            Fulfillment: {order.fulfilmentStatus}
          </span>
        </div>

        {/* Timeline Events */}
        {order.timeline && order.timeline.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-3">Order History Timeline</h3>
            <div className="space-y-3">
              {order.timeline.map((event, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Clock className="h-2.5 w-2.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-ink">{event.toStatus}</span>
                    {event.reason && <span className="text-ink-muted"> — {event.reason}</span>}
                    <p className="text-[11px] text-ink-muted">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Order Items Table */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted mb-4">Purchased Items</h2>
        <div className="divide-y divide-line">
          {order.items?.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-4">
                {item.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-16 w-16 rounded-theme object-cover border border-line"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-theme bg-surface-alt text-ink-muted">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-ink text-sm">{item.name}</p>
                  {item.variantTitle && <p className="text-xs text-ink-muted">{item.variantTitle}</p>}
                  <p className="text-xs text-ink-muted mt-1">
                    Qty: {item.quantity} × {formatMinor(item.unitPrice.amountMinor, item.unitPrice.currency)}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-bold text-ink">{formatMinor(item.lineTotal.amountMinor, item.lineTotal.currency)}</p>
                {item.quantityReturned > 0 && (
                  <p className="text-xs text-amber-600">Returned: {item.quantityReturned}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Address & Payment Breakdown Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Shipping Address */}
        <div className="rounded-theme border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted mb-3">Delivery Address</h2>
          {order.shippingAddress ? (
            <div className="text-sm">
              <p className="font-semibold text-ink">{order.shippingAddress.recipientName}</p>
              <p className="text-ink-muted">{order.shippingAddress.addressLine1}</p>
              {order.shippingAddress.addressLine2 && (
                <p className="text-ink-muted">{order.shippingAddress.addressLine2}</p>
              )}
              <p className="text-ink-muted">
                {order.shippingAddress.city}, {order.shippingAddress.stateName || order.shippingAddress.stateCode}{' '}
                {order.shippingAddress.postalCode}
              </p>
              {order.shippingAddress.phone && (
                <p className="text-xs text-ink-muted mt-2">Phone: {order.shippingAddress.phone}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No address snapshot recorded.</p>
          )}
        </div>

        {/* Financial Summary */}
        <div className="rounded-theme border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted mb-3">Payment Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Subtotal</span>
              <span>{formatMinor(order.subtotal.amountMinor, order.subtotal.currency)}</span>
            </div>
            {order.discount.amountMinor !== '0' && (
              <div className="flex justify-between text-success">
                <span>Discount</span>
                <span>-{formatMinor(order.discount.amountMinor, order.discount.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-ink-muted">
              <span>Shipping</span>
              <span>
                {order.shipping.amountMinor === '0'
                  ? 'FREE'
                  : formatMinor(order.shipping.amountMinor, order.shipping.currency)}
              </span>
            </div>
            {order.tax.amountMinor !== '0' && (
              <div className="flex justify-between text-ink-muted">
                <span>Estimated Tax (GST)</span>
                <span>{formatMinor(order.tax.amountMinor, order.tax.currency)}</span>
              </div>
            )}
            {order.codFee.amountMinor !== '0' && (
              <div className="flex justify-between text-ink-muted">
                <span>COD Handling Fee</span>
                <span>{formatMinor(order.codFee.amountMinor, order.codFee.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
              <span>Total Paid</span>
              <span>{formatMinor(order.total.amountMinor, order.total.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
