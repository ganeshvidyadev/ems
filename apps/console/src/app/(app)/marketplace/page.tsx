'use client';

import { Handshake, Plus, Store } from 'lucide-react';
import { useMarketplaceResellers, useMarketplaceShares } from '@/lib/queries/marketplace';

export default function MarketplacePage() {
  const { data: shares } = useMarketplaceShares();
  const { data: resellers } = useMarketplaceResellers();

  const sampleShares = [
    {
      id: 'sh_1',
      sourceTenantId: 'ten_1',
      resellerTenantId: 'ten_2',
      resellerName: 'Metro Lifestyle Boutiques',
      productId: 'prod_1',
      productName: 'Signature Linen Shirt (White)',
      commissionRate: 15,
      status: 'ACCEPTED' as const,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'sh_2',
      sourceTenantId: 'ten_1',
      resellerTenantId: 'ten_3',
      resellerName: 'Urban Outfitters India',
      productId: 'prod_2',
      productName: 'Handloom Khadi Kurta',
      commissionRate: 20,
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    },
  ];

  const list = shares?.length ? shares : sampleShares;

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">B2B Marketplace & Resellers</h1>
          <p className="text-sm text-slate-500">
            Share products with affiliate reseller tenants, automate B2B wholesale orders, and track commission splits
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="size-4" /> Share Product with Partner
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active B2B Shares</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{list.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorized Resellers</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{resellers?.length || 2} Stores</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Average Commission</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">17.5%</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Handshake className="size-4 text-blue-600" /> Shared Product Catalogs & Partners
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Shared Product</th>
                <th className="px-5 py-3 font-semibold">Reseller Partner</th>
                <th className="px-5 py-3 font-semibold">Commission Split</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Shared Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">
                    {s.productName ?? 'Curated SKU'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-700">
                    <div className="flex items-center gap-2">
                      <Store className="size-3.5 text-slate-400" />
                      <span>{s.resellerName ?? 'Partner Tenant'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-900">
                    {s.commissionRate}%
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        s.status === 'ACCEPTED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
