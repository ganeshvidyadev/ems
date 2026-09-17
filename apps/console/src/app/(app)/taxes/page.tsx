'use client';

import { useState } from 'react';
import { Check, Percent, Plus, Trash2, X } from 'lucide-react';
import {
  useCreateTaxClass,
  useCreateTaxRate,
  useDeleteTaxClass,
  useDeleteTaxRate,
  useTaxClasses,
  useTaxRates,
} from '@/lib/queries/taxes';

export default function TaxesPage() {
  const { data: taxClasses, isLoading: loadingClasses } = useTaxClasses();
  const { data: taxRates, isLoading: loadingRates } = useTaxRates();
  const createTaxClass = useCreateTaxClass();
  const createTaxRate = useCreateTaxRate();
  const deleteTaxClass = useDeleteTaxClass();
  const deleteTaxRate = useDeleteTaxRate();

  const [activeTab, setActiveTab] = useState<'classes' | 'rates'>('rates');
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);

  // Form states for class
  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [classIsDefault, setClassIsDefault] = useState(false);

  // Form states for rate
  const [rateTaxClassId, setRateTaxClassId] = useState('');
  const [rateName, setRateName] = useState('');
  const [rateCountry, setRateCountry] = useState('IN');
  const [rateState, setRateState] = useState('');
  const [ratePercent, setRatePercent] = useState('18');
  const [rateInclusive, setRateInclusive] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createTaxClass.mutateAsync({
        code: classCode,
        name: className,
        isDefault: classIsDefault,
      });
      setClassModalOpen(false);
      setClassCode('');
      setClassName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tax class');
    }
  };

  const handleCreateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createTaxRate.mutateAsync({
        taxClassId: rateTaxClassId || (taxClasses?.[0]?.id ?? ''),
        name: rateName,
        countryCode: rateCountry,
        stateCode: rateState || undefined,
        rate: Number(ratePercent),
        compound: false,
        priority: 0,
        isInclusive: rateInclusive,
      });
      setRateModalOpen(false);
      setRateName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tax rate');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tax & GST Configuration</h1>
          <p className="text-sm text-slate-500">
            Configure goods & services tax (GST), VAT, and localized sales tax rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'classes' ? (
            <button
              type="button"
              onClick={() => setClassModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-4" /> Add Tax Class
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="size-4" /> Add Tax Rate
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('rates')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'rates'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Tax Rates & Rules ({taxRates?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'classes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Tax Categories / Classes ({taxClasses?.length ?? 0})
          </button>
        </div>
      </div>

      {/* Tax Rates Table */}
      {activeTab === 'rates' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {loadingRates ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading tax rates...</div>
          ) : !taxRates || taxRates.length === 0 ? (
            <div className="p-8 text-center">
              <Percent className="mx-auto size-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">No tax rates defined</p>
              <p className="text-xs text-slate-400 mt-1">Add a standard GST or sales tax rate to collect tax on orders.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Rate Name</th>
                    <th className="px-5 py-3 font-semibold">Location</th>
                    <th className="px-5 py-3 font-semibold">Rate (%)</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxRates.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{r.name}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">
                        {r.countryCode} {r.stateCode ? `· ${r.stateCode}` : '(All regions)'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">{r.rate}%</td>
                      <td className="px-5 py-3.5">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {r.isInclusive ? 'Inclusive' : 'Exclusive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => deleteTaxRate.mutate(r.id)}
                          disabled={deleteTaxRate.isPending}
                          className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tax Classes Table */}
      {activeTab === 'classes' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {loadingClasses ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading tax classes...</div>
          ) : !taxClasses || taxClasses.length === 0 ? (
            <div className="p-8 text-center">
              <Percent className="mx-auto size-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">No tax classes defined</p>
              <p className="text-xs text-slate-400 mt-1">Create classes like Standard, Zero-Rated, or Reduced.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Class Name</th>
                    <th className="px-5 py-3 font-semibold">Code</th>
                    <th className="px-5 py-3 font-semibold">Default</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxClasses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-500">{c.code}</td>
                      <td className="px-5 py-3.5">
                        {c.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <Check className="size-3" /> Default
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {!c.isDefault && (
                          <button
                            type="button"
                            onClick={() => deleteTaxClass.mutate(c.id)}
                            disabled={deleteTaxClass.isPending}
                            className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="size-3.5" />
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
      )}

      {/* Class Modal */}
      {classModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Create Tax Class</h3>
              <button type="button" onClick={() => setClassModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
                <input
                  type="text"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  required
                  placeholder="e.g. STANDARD"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none uppercase font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  required
                  placeholder="e.g. Standard Goods (GST 18%)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={classIsDefault}
                  onChange={(e) => setClassIsDefault(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Set as default tax class for new products
              </label>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setClassModalOpen(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={createTaxClass.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Modal */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Add Tax Rate</h3>
              <button type="button" onClick={() => setRateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}
            <form onSubmit={handleCreateRate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Class *</label>
                <select
                  value={rateTaxClassId || (taxClasses?.[0]?.id ?? '')}
                  onChange={(e) => setRateTaxClassId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  {taxClasses?.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rate Name *</label>
                <input
                  type="text"
                  value={rateName}
                  onChange={(e) => setRateName(e.target.value)}
                  required
                  placeholder="e.g. IGST 18% or CGST+SGST"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country *</label>
                  <input
                    type="text"
                    value={rateCountry}
                    onChange={(e) => setRateCountry(e.target.value)}
                    required
                    placeholder="IN"
                    maxLength={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State Code (Optional)</label>
                  <input
                    type="text"
                    value={rateState}
                    onChange={(e) => setRateState(e.target.value)}
                    placeholder="e.g. MH or DL"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs uppercase font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tax Percentage (%) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={ratePercent}
                  onChange={(e) => setRatePercent(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-bold"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={rateInclusive}
                  onChange={(e) => setRateInclusive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Product prices already include this tax (Inclusive)
              </label>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setRateModalOpen(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={createTaxRate.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save Tax Rate</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
