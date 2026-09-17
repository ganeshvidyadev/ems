'use client';

import { useState } from 'react';
import { ExternalLink, Image as ImageIcon, MousePointerClick, Plus, Trash2, X } from 'lucide-react';
import { useBanners, useCreateBanner, useDeleteBanner } from '@/lib/queries/banners';
import { useCurrentStore } from '@/lib/queries/stores';

export default function BannersPage() {
  const { store } = useCurrentStore();
  const [placement, setPlacement] = useState('HOMEPAGE_HERO');
  const { data: banners, isLoading } = useBanners(store?.id, placement);
  const createBanner = useCreateBanner();
  const deleteBanner = useDeleteBanner();

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?.id) return;
    setError(null);
    try {
      await createBanner.mutateAsync({
        storeId: store.id,
        placement,
        title,
        imageUrl,
        linkUrl: linkUrl || undefined,
      });
      setModalOpen(false);
      setTitle('');
      setImageUrl('');
      setLinkUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create banner');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Promotional Banners</h1>
          <p className="text-sm text-slate-500">
            Design and schedule homepage hero sliders, category banners, and flash sale announcements
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="size-4" /> Add Banner
        </button>
      </div>

      <div className="flex gap-2">
        {['HOMEPAGE_HERO', 'CATEGORY_TOP', 'ANNOUNCEMENT_BAR'].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlacement(p)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              placement === p
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {p.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ImageIcon className="size-4 text-blue-600" /> Banners for {placement.replace(/_/g, ' ')}
          </h2>
          <span className="text-xs text-slate-500">{banners?.length ?? 0} active</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading banners...</div>
        ) : !banners || banners.length === 0 ? (
          <div className="p-8 text-center">
            <ImageIcon className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No banners configured for this placement</p>
            <p className="text-xs text-slate-400 mt-1">Upload a hero image or promotional poster to attract shoppers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {banners.map((b) => (
              <div key={b.id} className="rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:border-slate-300 transition-all">
                <div className="h-36 bg-slate-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{b.title}</h4>
                  {b.linkUrl && (
                    <p className="text-[11px] text-blue-600 truncate mt-0.5 flex items-center gap-1 font-mono">
                      <ExternalLink className="size-3" /> {b.linkUrl}
                    </p>
                  )}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                      <MousePointerClick className="size-3.5 text-blue-600" /> {b.clickCount} clicks
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteBanner.mutate(b.id)}
                      className="text-rose-600 hover:text-rose-700 font-semibold inline-flex items-center gap-1"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Add Banner</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Banner Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Summer Collection Launch 50% Off"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Image URL *</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  required
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Link (Optional)</label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="/products or https://..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={createBanner.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save Banner</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
