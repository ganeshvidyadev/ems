'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package, ArrowRight, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { api, type Page } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import type { OrderResponse } from '@ems/contracts';

export default function CustomerOrdersPage() {
  const [page, setPage] = useState(1);

  const { data: ordersPage, isLoading, error } = useQuery<Page<OrderResponse>>({
    queryKey: ['account-orders', page],
    queryFn: () => api.requestPage<OrderResponse>('account/orders', { query: { page, limit: 10 } }),
  });

  const orders = ordersPage?.items ?? [];
  const pagination = ordersPage?.pagination;

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">My Orders</h1>
        <p className="mt-1 text-sm text-ink-muted">View past purchases and track ongoing deliveries</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : error ? (
        <div className="rounded-theme border border-danger/20 bg-danger/10 p-4 text-sm text-danger flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load orders. Please try again.</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-theme border border-dashed border-line p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-base font-medium text-ink">No orders found</p>
          <p className="mt-1 text-xs text-ink-muted">You have not placed any orders with this account yet.</p>
          <Link
            href="/products"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-theme border border-line bg-surface p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-ink">Order #{order.orderNumber}</span>
                  <span className="text-xs text-ink-muted">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      order.status === 'DELIVERED'
                        ? 'bg-success/15 text-success'
                        : order.status === 'CANCELLED'
                          ? 'bg-danger/15 text-danger'
                          : order.status === 'CONFIRMED'
                            ? 'bg-brand/15 text-brand'
                            : 'bg-surface-alt text-ink'
                    }`}
                  >
                    {order.status}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      order.paymentStatus === 'PAID'
                        ? 'bg-success/10 text-success'
                        : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    {order.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-ink-muted">Total Amount</p>
                  <p className="text-lg font-bold text-ink">
                    {formatMinor(order.total.amountMinor, order.total.currency)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
                  >
                    View Details & Tracking <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line pt-4">
              <span className="text-xs text-ink-muted">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} orders)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrev}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink hover:bg-surface-alt disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pagination.hasNext}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-theme border border-line text-ink hover:bg-surface-alt disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
