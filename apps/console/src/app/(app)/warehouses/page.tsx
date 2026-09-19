'use client';

import { Boxes, Building, CheckCircle2, Download, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { useWarehouses } from '@/lib/queries/warehouses';

export default function WarehousesPage() {
  const { data: warehouses, isLoading } = useWarehouses();

  const handleExportWarehousesCsv = () => {
    if (!warehouses || warehouses.length === 0) return;
    const headers = ['Warehouse ID', 'Code', 'Name', 'Type', 'Is Default', 'Status'];
    const rows = warehouses.map((w) => [
      w.id,
      w.code,
      w.name,
      w.type,
      w.isDefault ? 'Yes' : 'No',
      w.isActive ? 'Active' : 'Inactive',
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `warehouses-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fulfillment Warehouses</h1>
          <p className="text-sm text-slate-500">
            Storage locations and fulfillment centers where your store inventory is managed and dispatched
          </p>
        </div>
        <div className="flex items-center gap-2">
          {warehouses && warehouses.length > 0 && (
            <button
              type="button"
              onClick={handleExportWarehousesCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          )}
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Boxes className="size-4 text-blue-600" /> View Inventory Levels
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Warehouse className="size-4 text-blue-600" /> Active Warehouses & Dispatch Hubs
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading warehouses...</div>
        ) : !warehouses || warehouses.length === 0 ? (
          <div className="p-8 text-center">
            <Warehouse className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">Default primary fulfillment location active</p>
            <p className="text-xs text-slate-400 mt-1">Stock is tracked across your primary warehouse facility.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-slate-200 p-5 hover:border-slate-300 transition-colors shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{w.name}</h3>
                      {w.isDefault && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">{w.code}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      w.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {w.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Building className="size-3.5 text-slate-400 shrink-0" />
                    <span>Facility Type: <strong className="text-slate-700">{w.type}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <span>Status: {w.isActive ? 'Available for fulfillment' : 'Offline / Inactive'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Link
                    href="/inventory"
                    className="font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                  >
                    Manage Stock →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
