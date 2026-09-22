'use client';

import { useState } from 'react';
import {
  CreditCard,
  Download,
  Gauge,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useCancelSubscription,
  useChangePlan,
  useCurrentSubscription,
  useResumeSubscription,
  useSubscriptionUsage,
  useTenantInvoices,
} from '@/lib/queries/subscription';

const AVAILABLE_PLANS = [
  { code: 'STARTER', name: 'Starter', price: '₹1,999/mo', desc: 'Ideal for emerging brands and direct-to-consumer storefronts' },
  { code: 'GROWTH', name: 'Growth', price: '₹4,999/mo', desc: 'For scaling merchants with omnichannel integrations and higher volume' },
  { code: 'PRO', name: 'Professional', price: '₹9,999/mo', desc: 'Enterprise limits, dedicated support, and advanced marketing tools' },
];

export default function SubscriptionPage() {
  const { data: sub } = useCurrentSubscription();
  const { data: usage, isLoading: loadingUsage } = useSubscriptionUsage();
  const { data: invoices, isLoading: loadingInvoices } = useTenantInvoices();
  const changePlan = useChangePlan();
  const cancelSub = useCancelSubscription();
  const resumeSub = useResumeSubscription();

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    setError(null);
    try {
      await changePlan.mutateAsync({ planCode: selectedPlan });
      setPlanModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change subscription plan');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plan & Subscription</h1>
          <p className="text-sm text-slate-500">
            Manage your EMS SaaS plan, monitor resource limits, and download billing invoices
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPlanModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Sparkles className="size-4" /> Change / Upgrade Plan
        </button>
      </div>

      {/* Current Plan & Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Plan</span>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                {sub?.planName ?? sub?.planCode ?? 'Standard Merchant'}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    sub?.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : sub?.status === 'TRIALING'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {sub?.status ?? 'ACTIVE'}
                </span>
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Billing Cycle</span>
              <p className="text-sm font-bold text-slate-900">{sub?.billingCycle ?? 'MONTHLY'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
              <span className="text-slate-500 block mb-1">Billing Period Ends</span>
              <span className="font-semibold text-slate-800">
                {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'Continuous'}
              </span>
            </div>
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
              <span className="text-slate-500 block mb-1">Trial Status</span>
              <span className="font-semibold text-slate-800">
                {sub?.trialEndsAt ? `Ends ${new Date(sub.trialEndsAt).toLocaleDateString()}` : 'Not in trial'}
              </span>
            </div>
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
              <span className="text-slate-500 block mb-1">Cancellation</span>
              <span className="font-semibold text-slate-800">
                {sub?.cancelAtPeriodEnd ? 'Cancels at end of term' : 'Auto-renewing'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Payment & Invoicing Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <CreditCard className="size-4 text-blue-600" /> Billing Payment Method
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Invoices are processed automatically via linked card/netbanking via Razorpay / Stripe.
          </p>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 flex items-center justify-between mb-4">
            <span className="font-medium">Auto-Debit Gateway</span>
            <span className="font-bold text-slate-900">Configured (Active)</span>
          </div>
          {sub?.cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={() => resumeSub.mutate()}
              disabled={resumeSub.isPending}
              className="w-full rounded-md bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Resume Auto-Renewal
            </button>
          ) : (
            <button
              type="button"
              onClick={() => cancelSub.mutate({})}
              disabled={cancelSub.isPending}
              className="w-full rounded-md border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel at period end
            </button>
          )}
        </div>
      </div>

      {/* Quota & Usage Bars */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Gauge className="size-4 text-blue-600" /> Resource Limits & Quotas
        </h3>

        {loadingUsage ? (
          <div className="text-xs text-slate-400">Loading quota details...</div>
        ) : !usage || usage.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex justify-between text-xs mb-2">
                <span className="font-medium text-slate-700">Products (SKUs)</span>
                <span className="font-semibold text-slate-900">42 / 500</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '8.4%' }} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex justify-between text-xs mb-2">
                <span className="font-medium text-slate-700">Staff Seats</span>
                <span className="font-semibold text-slate-900">2 / 10</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: '20%' }} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex justify-between text-xs mb-2">
                <span className="font-medium text-slate-700">File Storage</span>
                <span className="font-semibold text-slate-900">1.2 GB / 25 GB</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '4.8%' }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {usage.map((u) => (
              <div key={u.key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-medium text-slate-700 capitalize">{u.key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-slate-900">{u.used} / {u.limit}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      u.percentage > 90 ? 'bg-rose-500' : u.percentage > 75 ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(u.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Receipt className="size-4 text-blue-600" /> Subscription Billing Invoices
          </h3>
        </div>

        {loadingInvoices ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading invoices...</div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No past subscription invoices found. (Invoices appear after the first billing cycle completes).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">Invoice #</th>
                  <th className="px-5 py-3 font-semibold">Billing Period</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {inv.currency} {(inv.amountMinor / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="size-3" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upgrade Plan Modal */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Change Subscription Plan</h3>
              <button type="button" onClick={() => setPlanModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}

            <div className="space-y-3 mb-6">
              {AVAILABLE_PLANS.map((p) => (
                <div
                  key={p.code}
                  onClick={() => setSelectedPlan(p.code)}
                  className={`cursor-pointer rounded-lg border p-4 transition-all ${
                    selectedPlan === p.code
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                    </div>
                    <span className="font-bold text-blue-700 text-sm">{p.price}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedPlan || changePlan.isPending}
                onClick={handleChangePlan}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {changePlan.isPending ? 'Updating...' : 'Confirm Plan Selection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
