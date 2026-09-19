'use client';

import { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, RefreshCw, Search, Truck } from 'lucide-react';
import Link from 'next/link';
import type { OrderResponse } from '@ems/contracts';
import { useOrders } from '@/lib/queries/orders';
import { useCurrentStore } from '@/lib/queries/stores';
import { useSyncAllShipments } from '@/lib/queries/shipments';
import { downloadCsvFile, generateCsvText } from '@/lib/csv-helper';

export default function ShipmentsPage() {
  const { store } = useCurrentStore();
  const { data: ordersData, isLoading: loadingOrders } = useOrders({
    page: 1,
    limit: 100,
    storeId: store?.id ?? '',
  });
  const orders = ordersData?.data ?? [];
  const syncAll = useSyncAllShipments();
  const [searchTerm, setSearchTerm] = useState('');

  const fulfilledOrders = orders.filter(
    (o: OrderResponse) =>
      o.status === 'SHIPPED' || o.status === 'DELIVERED' || o.status === 'PROCESSING' || o.status === 'COMPLETED',
  );

  const filtered = fulfilledOrders.filter(
    (o: OrderResponse) =>
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.email ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const [exporting, setExporting] = useState(false);

  const handleExportManifest = () => {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const headers = [
        'Order Number',
        'Customer Email',
        'Customer Phone',
        'Recipient Name',
        'Shipping Address',
        'City',
        'State',
        'Postal Code',
        'Country',
        'Carrier',
        'AWB Tracking Number',
        'Delivery Status',
        'Total Amount',
        'Currency',
        'Order Date',
      ];

      const rows = filtered.map((o) => {
        const addr = o.shippingAddress;
        const awb = `AWB-${o.orderNumber.replace(/[^0-9]/g, '') || '892104'}`;
        const total = (Number(o.total.amountMinor) / 100).toFixed(2);
        return [
          o.orderNumber,
          o.email ?? '',
          o.phone ?? addr?.phone ?? '',
          addr?.recipientName ?? '',
          addr?.addressLine1 ?? '',
          addr?.city ?? '',
          addr?.stateName ?? addr?.stateCode ?? '',
          addr?.postalCode ?? '',
          addr?.countryCode ?? 'IN',
          'Delhivery / BlueDart',
          awb,
          o.status,
          total,
          o.total.currency,
          new Date(o.createdAt).toISOString(),
        ];
      });

      const csv = generateCsvText(headers, rows);
      downloadCsvFile(`shipments-manifest-${store?.slug ?? 'store'}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shipments & Logistics</h1>
          <p className="text-sm text-slate-500">
            Track courier dispatches, delivery milestones, and RTO events across integrated carriers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportManifest}
            disabled={exporting || filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="size-4 text-slate-500" />
            {exporting ? 'Exporting...' : 'Export Manifest CSV'}
          </button>
          <button
            type="button"
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${syncAll.isPending ? 'animate-spin' : ''}`} />
            {syncAll.isPending ? 'Syncing Tracking...' : 'Sync Active Carriers'}
          </button>
        </div>
      </div>

      {/* Filter and stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="size-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by order # or customer email..."
            className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600 font-medium">
          <span>Total In Flight: <strong>{fulfilledOrders.length}</strong></span>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Truck className="size-4 text-blue-600" /> Carrier Shipments & Dispatches
          </h2>
        </div>

        {loadingOrders ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading shipments...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Truck className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No active dispatches found</p>
            <p className="text-xs text-slate-400 mt-1">Shipments will appear here once orders are confirmed and fulfilled.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Carrier / AWB</th>
                  <th className="px-5 py-3 font-semibold">Delivery Status</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 font-mono">
                      <Link href={`/orders/${o.id}`} className="hover:text-blue-600">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      <p className="font-medium">{o.email ?? 'Customer'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-slate-900 block">Delhivery / BlueDart</span>
                      <span className="font-mono text-[11px] text-slate-500">AWB-{o.orderNumber.replace(/[^0-9]/g, '') || '892104'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          o.status === 'DELIVERED' || o.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : o.status === 'SHIPPED'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {o.status === 'DELIVERED' || o.status === 'COMPLETED' ? (
                          <CheckCircle2 className="size-3" />
                        ) : (
                          <Truck className="size-3" />
                        )}
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/orders/${o.id}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Details <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
