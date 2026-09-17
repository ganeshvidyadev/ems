'use client';

import { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import {
  useApproveReturn,
  useCompleteReturn,
  useReceiveReturn,
  useRejectReturn,
  useReturns,
} from '@/lib/queries/returns';

export default function ReturnsPage() {
  const { data: returns, isLoading } = useReturns();
  const approveReturn = useApproveReturn();
  const rejectReturn = useRejectReturn();
  const receiveReturn = useReceiveReturn();
  const completeReturn = useCompleteReturn();

  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalId) return;
    try {
      await rejectReturn.mutateAsync({ id: rejectModalId, reason: rejectReason });
      setRejectModalId(null);
      setRejectReason('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Returns & RMA Management</h1>
          <p className="text-sm text-slate-500">
            Process customer return merchandise authorizations (RMA), warehouse inspections, and refunds
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <RotateCcw className="size-4 text-blue-600" /> Return Requests & History
          </h2>
          <span className="text-xs text-slate-500">{returns?.length ?? 0} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading returns...</div>
        ) : !returns || returns.length === 0 ? (
          <div className="p-8 text-center">
            <RotateCcw className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No return requests found</p>
            <p className="text-xs text-slate-400 mt-1">Customer RMA requests will appear here for review and inspection.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">RMA ID</th>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Refund Est.</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Fulfillment Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">{r.id.slice(0, 10)}</td>
                    <td className="px-5 py-3.5">
                      <Link href={`/orders/${r.orderId}`} className="font-semibold text-blue-600 hover:underline">
                        {r.orderNumber ?? r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 max-w-xs truncate">{r.reason}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {r.currency} {(r.refundAmountMinor / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700'
                            : r.status === 'REQUESTED'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      {r.status === 'REQUESTED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => approveReturn.mutate(r.id)}
                            disabled={approveReturn.isPending}
                            className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                          >
                            <Check className="size-3" /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectModalId(r.id)}
                            className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <X className="size-3" /> Reject
                          </button>
                        </>
                      )}

                      {r.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => receiveReturn.mutate(r.id)}
                          disabled={receiveReturn.isPending}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Mark Received
                        </button>
                      )}

                      {r.status === 'RECEIVED' && (
                        <button
                          type="button"
                          onClick={() => completeReturn.mutate(r.id)}
                          disabled={completeReturn.isPending}
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Complete & Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Reject Return Request</h3>
              <button type="button" onClick={() => setRejectModalId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Rejection *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="Explain why the return cannot be accepted..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setRejectModalId(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={rejectReturn.isPending} className="rounded-md bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">Confirm Rejection</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
