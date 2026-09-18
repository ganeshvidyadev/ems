'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Package, RotateCcw, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import type { OrderResponse, RequestReturnRequest } from '@ems/contracts';

const RETURN_REASONS = [
  { value: 'DAMAGED', label: 'Item arrived damaged' },
  { value: 'DEFECTIVE', label: 'Defective / does not work' },
  { value: 'WRONG_ITEM', label: 'Wrong item received' },
  { value: 'SIZE_ISSUE', label: 'Size / fit issue' },
  { value: 'NOT_AS_DESCRIBED', label: 'Item does not match description' },
  { value: 'CHANGED_MIND', label: 'Changed mind' },
] as const;

export default function NewReturnRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<RequestReturnRequest['reason']>('DEFECTIVE');
  const [reasonDetail, setReasonDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: order, isLoading } = useQuery<OrderResponse>({
    queryKey: ['account-order', orderId],
    queryFn: () => api.request<OrderResponse>(`account/orders/${orderId}`),
    enabled: Boolean(orderId),
  });

  if (!orderId) {
    return (
      <div className="rounded-theme border border-dashed border-line p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-ink-muted" />
        <p className="mt-2 text-sm font-medium text-ink">No order selected</p>
        <p className="text-xs text-ink-muted mt-1">Please select a delivered order to initiate a return.</p>
        <Link
          href="/account/orders"
          className="mt-4 inline-flex items-center gap-1.5 rounded-theme bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground"
        >
          Select from Orders
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-theme border border-danger/20 bg-danger/10 p-4 text-center text-sm text-danger">
        Order not found or not eligible for return.
      </div>
    );
  }

  const currentOrder = order;
  const eligibleItems = currentOrder.items?.filter((i) => i.quantity - i.quantityReturned > 0) ?? [];
  const selectedItem = eligibleItems.find((i) => i.id === selectedItemId);
  const maxReturnableQty = selectedItem ? selectedItem.quantity - selectedItem.quantityReturned : 1;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedItemId) {
      setError('Please select an item to return');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await api.request(`account/orders/${currentOrder.id}/returns`, {
        method: 'POST',
        body: {
          type: 'RETURN',
          reason,
          reasonDetail: reasonDetail.trim() || undefined,
          items: [
            {
              orderItemId: selectedItemId,
              quantity: Math.min(quantity, maxReturnableQty),
              restock: true,
            },
          ],
        },
      });
      router.push('/account/returns');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to submit return request');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <Link
          href={`/account/orders/${order.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink hover:bg-surface-alt"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink">Request Return for Order #{order.orderNumber}</h1>
          <p className="text-xs text-ink-muted">Select the item and specify the reason for return</p>
        </div>
      </div>

      {error && (
        <div className="rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {eligibleItems.length === 0 ? (
        <div className="rounded-theme border border-dashed border-line p-8 text-center">
          <p className="text-sm font-medium text-ink">All items from this order have already been returned.</p>
          <Link
            href="/account/returns"
            className="mt-3 inline-flex text-xs font-medium text-brand hover:underline"
          >
            View Return Status
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-theme border border-line bg-surface p-6 space-y-5">
          {/* Select Item */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">Select Item to Return</label>
            <div className="space-y-2">
              {eligibleItems.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center justify-between rounded-theme border p-3 cursor-pointer transition-colors ${
                    selectedItemId === item.id ? 'border-brand bg-brand/[0.03]' : 'border-line hover:bg-surface-alt'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="orderItem"
                      value={item.id}
                      checked={selectedItemId === item.id}
                      onChange={() => {
                        setSelectedItemId(item.id);
                        setQuantity(1);
                      }}
                      className="text-brand focus:ring-brand"
                    />
                    <div>
                      <p className="font-semibold text-sm text-ink">{item.name}</p>
                      {item.variantTitle && <p className="text-xs text-ink-muted">{item.variantTitle}</p>}
                      <p className="text-xs text-ink-muted mt-0.5">
                        Eligible to return: {item.quantity - item.quantityReturned} unit(s)
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-sm text-ink">
                    {formatMinor(item.unitPrice.amountMinor, item.unitPrice.currency)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Quantity Selector */}
          {selectedItemId && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-ink">
                  Quantity to Return (Max: {maxReturnableQty})
                </label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  max={maxReturnableQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxReturnableQty, Number(e.target.value) || 1)))}
                  className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>

              {/* Reason Selector */}
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-ink">
                  Reason for Return
                </label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RequestReturnRequest['reason'])}
                  className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <label htmlFor="reasonDetail" className="block text-sm font-medium text-ink">
              Additional Details / Comments
            </label>
            <textarea
              id="reasonDetail"
              rows={3}
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Describe the issue with the item..."
              className="mt-1 block w-full rounded-theme border border-line bg-surface-alt p-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !selectedItemId}
              className="inline-flex h-10 items-center justify-center rounded-theme bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Return Request'}
            </button>
            <Link
              href={`/account/orders/${order.id}`}
              className="inline-flex h-10 items-center justify-center rounded-theme border border-line px-4 text-sm font-medium text-ink hover:bg-surface-alt"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
