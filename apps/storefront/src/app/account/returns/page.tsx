'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, Package, Loader2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import type { ReturnResponse } from '@ems/contracts';

export default function CustomerReturnsPage() {
  const { data: returns = [], isLoading } = useQuery<ReturnResponse[]>({
    queryKey: ['account-returns'],
    queryFn: () => api.request<ReturnResponse[]>('account/returns'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Returns & Replacements</h1>
          <p className="mt-1 text-sm text-ink-muted">Track status of your return and refund requests</p>
        </div>
        <Link
          href="/account/orders"
          className="inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
        >
          <RotateCcw className="h-4 w-4" /> Request Return from Orders
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : returns.length === 0 ? (
        <div className="rounded-theme border border-dashed border-line p-12 text-center">
          <RotateCcw className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-base font-medium text-ink">No return requests</p>
          <p className="mt-1 text-xs text-ink-muted">
            You do not have any open or previous return requests.
          </p>
          <Link
            href="/account/orders"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            View Delivered Orders
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((rma) => (
            <div
              key={rma.id}
              className="rounded-theme border border-line bg-surface p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-ink">{rma.rmaNumber}</span>
                  <span className="text-xs text-ink-muted">
                    Requested on {new Date(rma.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink">
                    {rma.type}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      rma.status === 'COMPLETED'
                        ? 'bg-success/15 text-success'
                        : rma.status === 'REJECTED'
                          ? 'bg-danger/15 text-danger'
                          : 'bg-brand/15 text-brand'
                    }`}
                  >
                    {rma.status}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-ink-muted">Reason: <span className="font-medium text-ink">{rma.reason}</span></p>
                  {rma.reasonDetail && (
                    <p className="text-xs text-ink-muted mt-0.5">&quot;{rma.reasonDetail}&quot;</p>
                  )}
                  <p className="text-xs text-ink-muted mt-1">
                    Items: {rma.items.reduce((acc, i) => acc + i.quantity, 0)} units
                  </p>
                </div>

                {rma.refundAmount && (
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Refund Amount</p>
                    <p className="text-base font-bold text-success">
                      {formatMinor(rma.refundAmount.amountMinor, rma.refundAmount.currency)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
