'use client';

import { useState } from 'react';
import { Building2, Check, ExternalLink, Globe, Mail, Phone, Save, ShieldCheck, Store } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useCurrentStore } from '@/lib/queries/stores';

export default function StoreSettingsPage() {
  const { user } = useAuth();
  const { store } = useCurrentStore();

  const [storeName, setStoreName] = useState(store?.name ?? 'My Flagship Store');
  const [currency, setCurrency] = useState(store?.currency ?? 'INR');
  const [supportEmail, setSupportEmail] = useState(user?.email ?? 'support@store.com');
  const [supportPhone, setSupportPhone] = useState('+91 98765 43210');
  const [orderPrefix, setOrderPrefix] = useState('ORD-');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Settings</h1>
          <p className="text-sm text-slate-500">
            Configure your brand identity, business defaults, and storefront parameters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/domains"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Globe className="size-3.5" /> Manage Custom Domains
          </Link>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="size-3.5" /> View Storefront
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Store Profile */}
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={handleSave} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Store className="size-4 text-blue-600" /> Store Profile & Identity
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Your store name and public branding shown to customers on checkout and invoices
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Store Public Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. Northwind Apparel"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Store Slug / Identifier
                  </label>
                  <input
                    type="text"
                    value={store?.slug ?? 'flagship'}
                    disabled
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                  />
                  <span className="text-[11px] text-slate-400">Used for URL paths and system routing</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Base Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="INR">INR (₹) — Indian Rupee</option>
                    <option value="USD">USD ($) — US Dollar</option>
                    <option value="EUR">EUR (€) — Euro</option>
                    <option value="GBP">GBP (£) — British Pound</option>
                    <option value="AED">AED (د.إ) — UAE Dirham</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Customer Support Email
                  </label>
                  <div className="relative">
                    <Mail className="size-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Support Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="size-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      value={supportPhone}
                      onChange={(e) => setSupportPhone(e.target.value)}
                      className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Order & Inventory Rules</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Order Sequence Prefix
                    </label>
                    <input
                      type="text"
                      value={orderPrefix}
                      onChange={(e) => setOrderPrefix(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Example: {orderPrefix}1001</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Trigger warnings when variant inventory falls below this</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                {saved && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="size-4" /> Settings updated successfully
                  </span>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  <Save className="size-4" /> Save Store Settings
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Tenant Overview */}
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <Building2 className="size-4 text-slate-500" /> Tenant Information
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Business Legal Name</span>
                <span className="font-semibold text-slate-800">{user?.tenant?.businessName ?? 'EMS Merchant'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tenant Status</span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {user?.tenant?.status ?? 'ACTIVE'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Primary Domain</span>
                <span className="font-mono text-slate-700">{user?.tenant?.slug ?? 'demo'}.ems.localhost</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Store ID</span>
                <span className="font-mono text-slate-500 text-[11px]">{store?.id ?? 'str_main_01'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-900 flex items-center gap-1.5 mb-2">
              <ShieldCheck className="size-4 text-blue-600" /> Quick Configuration
            </h4>
            <p className="text-xs text-blue-700 mb-4 leading-relaxed">
              Complete your store setup by pointing your custom brand domain and verifying tax rates.
            </p>
            <div className="space-y-2">
              <Link
                href="/domains"
                className="block w-full rounded-md bg-white border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50 text-center"
              >
                Setup Custom Domain →
              </Link>
              <Link
                href="/taxes"
                className="block w-full rounded-md bg-white border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-50 text-center"
              >
                Configure GST / Tax Rates →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
