'use client';

import { useState } from 'react';
import { Navigation, Plus, Trash2, X } from 'lucide-react';
import { useAddMenuItem, useDeleteMenuItem, useMenu } from '@/lib/queries/menus';

export default function MenusPage() {
  const [menuCode, setMenuCode] = useState<'MAIN' | 'FOOTER'>('MAIN');
  const { data: menu } = useMenu(menuCode);
  const addMenuItem = useAddMenuItem(menuCode);
  const deleteMenuItem = useDeleteMenuItem(menuCode);

  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await addMenuItem.mutateAsync({ label, url });
      setModalOpen(false);
      setLabel('');
      setUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add menu link');
    }
  };

  const defaultItems = [
    { id: '1', label: 'Home', url: '/' },
    { id: '2', label: 'All Products', url: '/products' },
    { id: '3', label: 'About Us', url: '/pages/about' },
    { id: '4', label: 'Contact', url: '/pages/contact' },
  ];

  const items = menu?.items?.length ? menu.items : defaultItems;

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Navigation Menus</h1>
          <p className="text-sm text-slate-500">
            Structure your storefront header navbar, dropdown links, and footer navigation columns
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="size-4" /> Add Menu Item
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMenuCode('MAIN')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            menuCode === 'MAIN'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Header Main Menu
        </button>
        <button
          type="button"
          onClick={() => setMenuCode('FOOTER')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            menuCode === 'FOOTER'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Footer Column Links
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Navigation className="size-4 text-blue-600" /> Active Menu Links
          </h2>
          <span className="text-xs text-slate-500">{items.length} items</span>
        </div>

        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="size-6 rounded bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <div>
                  <h4 className="font-semibold text-slate-900 text-xs">{item.label}</h4>
                  <span className="font-mono text-[11px] text-slate-500">{item.url}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteMenuItem.mutate(item.id)}
                className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Add Menu Link</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Display Label *</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  placeholder="e.g. New Arrivals"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link Destination URL *</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder="/products or /pages/faq"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={addMenuItem.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
