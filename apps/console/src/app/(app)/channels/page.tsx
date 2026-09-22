'use client';

import { useState } from 'react';
import { Cable, Download, Plus, RefreshCw, X } from 'lucide-react';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { formatDate } from '@/lib/utils';
import { useChannels, useImportChannelOrders, useSyncChannelInventory } from '@/lib/queries/channels';

export default function ChannelsPage() {
  const { data: channels } = useChannels();
  const syncInventory = useSyncChannelInventory();
  const importOrders = useImportChannelOrders();

  const [modalOpen, setModalOpen] = useState(false);
  const [channelType, setChannelType] = useState('AMAZON');
  const [channelName, setChannelName] = useState('');

  const sampleChannels = [
    {
      id: 'ch_amz',
      type: 'AMAZON',
      name: 'Amazon India (Seller Central)',
      status: 'CONNECTED' as const,
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      listingsCount: 28,
    },
    {
      id: 'ch_fk',
      type: 'FLIPKART',
      name: 'Flipkart Marketplace',
      status: 'CONNECTED' as const,
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      listingsCount: 24,
    },
    {
      id: 'ch_myn',
      type: 'MYNTRA',
      name: 'Myntra Fashion Partner',
      status: 'DISCONNECTED' as const,
      lastSyncAt: null,
      listingsCount: 0,
    },
  ];

  const list = channels?.length ? channels : sampleChannels;

  const handleExportChannelsCsv = () => {
    if (list.length === 0) return;
    const headers = ['Channel ID', 'Channel Name', 'Type', 'Status', 'Listings Count', 'Last Synced At'];
    const rows = list.map((c) => [
      c.id,
      c.name,
      c.type,
      c.status,
      String(c.listingsCount ?? 0),
      c.lastSyncAt ? formatDate(c.lastSyncAt) : 'Never',
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `sales-channels-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales Channels & Marketplaces</h1>
          <p className="text-sm text-slate-500">
            Sync catalog inventory and import orders automatically from Amazon, Flipkart, and external channels
          </p>
        </div>
        <div className="flex items-center gap-2">
          {list.length > 0 && (
            <button
              type="button"
              onClick={handleExportChannelsCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="size-4" /> Connect New Channel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Cable className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{c.name}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">{c.type}</span>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  c.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {c.status}
              </span>
            </div>

            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Published Listings:</span>
                <span className="font-semibold text-slate-900">{c.listingsCount ?? 0} SKUs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Synced:</span>
                <span className="text-slate-700 font-mono text-[11px]">
                  {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => syncInventory.mutate(c.id)}
                disabled={syncInventory.isPending}
                className="flex-1 rounded border border-slate-200 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1"
              >
                <RefreshCw className="size-3" /> Sync Stock
              </button>
              <button
                type="button"
                onClick={() => importOrders.mutate(c.id)}
                disabled={importOrders.isPending}
                className="flex-1 rounded bg-blue-50 py-1.5 font-semibold text-blue-700 hover:bg-blue-100 inline-flex items-center justify-center gap-1"
              >
                <Download className="size-3" /> Import Orders
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
