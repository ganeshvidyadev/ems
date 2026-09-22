'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Eye, Layout, Paintbrush, Palette } from 'lucide-react';
import { useCurrentStore } from '@/lib/queries/stores';
import { useStoreThemes, useThemeGallery, useUpdateThemeConfig } from '@/lib/queries/theme-customizer';

export default function ThemeEditorPage() {
  const { store } = useCurrentStore();
  const { data: gallery, isLoading: loadingGallery } = useThemeGallery();
  const { data: storeThemes } = useStoreThemes(store?.id);
  const updateConfig = useUpdateThemeConfig();

  const [primaryColor, setPrimaryColor] = useState('#096dd9');
  const [accentColor, setAccentColor] = useState('#1890ff');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [saved, setSaved] = useState(false);

  const activeTheme = storeThemes?.find((t) => t.isPublished) ?? storeThemes?.[0];

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTheme) return;
    try {
      await updateConfig.mutateAsync({
        id: activeTheme.id,
        config: { primaryColor, accentColor, fontFamily },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Theme Studio & Customizer</h1>
          <p className="text-sm text-slate-500">
            Customize storefront brand styling, typography, colors, and layout templates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Eye className="size-4 text-blue-600" /> Preview Live Storefront
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Active Customizer */}
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={handleSaveConfig} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Palette className="size-4 text-blue-600" /> Visual Styling & Tokens
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Colors and typography applied dynamically to your storefront header, buttons, badges and cards
              </p>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Brand Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="size-9 rounded border border-slate-300 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono uppercase focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Accent / Highlight Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="size-9 rounded border border-slate-300 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono uppercase focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Typography / Font Family
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="Inter">Inter (Clean modern sans-serif)</option>
                  <option value="Roboto">Roboto (Google modern)</option>
                  <option value="Playfair Display">Playfair Display (Luxury serif)</option>
                  <option value="Poppins">Poppins (Geometric display)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans (Corporate sleek)</option>
                </select>
              </div>

              {/* Live Preview Box */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5 mt-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Live Component Preview</span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    style={{ backgroundColor: primaryColor }}
                    className="rounded px-4 py-2 text-xs font-semibold text-white shadow-sm"
                  >
                    Add to Cart Button
                  </button>
                  <button
                    type="button"
                    style={{ borderColor: primaryColor, color: primaryColor }}
                    className="rounded border bg-white px-4 py-2 text-xs font-semibold"
                  >
                    Secondary Button
                  </button>
                  <span
                    style={{ backgroundColor: accentColor + '20', color: accentColor }}
                    className="rounded-full px-2.5 py-1 text-xs font-bold"
                  >
                    Special Offer 20% OFF
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                {saved && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="size-4" /> Theme style published!
                  </span>
                )}
                <button
                  type="submit"
                  disabled={updateConfig.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateConfig.isPending ? 'Saving...' : 'Save & Apply Styling'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Col: Active Template Card */}
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <Layout className="size-4 text-blue-600" /> Active Storefront Template
            </h3>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Theme Engine:</span>
                <span className="font-bold text-slate-900">Modern D2C Fashion</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="size-3.5" /> Published
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Version:</span>
                <span className="font-mono text-slate-700">v2.4.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Templates */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Paintbrush className="size-4 text-blue-600" /> Storefront Template Gallery
        </h2>
        <p className="text-xs text-slate-500 mb-5">
          Choose from professionally designed high-converting responsive store templates
        </p>

        {loadingGallery ? (
          <div className="text-xs text-slate-400">Loading gallery...</div>
        ) : !gallery || gallery.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-blue-600 bg-blue-50/20 p-4">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">ACTIVE</span>
              <h4 className="font-bold text-slate-900 text-sm mt-2">D2C Minimal</h4>
              <p className="text-xs text-slate-500 mt-1">High conversion layout optimized for clothing and lifestyle brands.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">TEMPLATE</span>
              <h4 className="font-bold text-slate-900 text-sm mt-2">Electronics & Tech</h4>
              <p className="text-xs text-slate-500 mt-1">Feature-rich grid layout with technical specs and comparison tables.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">TEMPLATE</span>
              <h4 className="font-bold text-slate-900 text-sm mt-2">Luxury & Jewelry</h4>
              <p className="text-xs text-slate-500 mt-1">Editorial serif typography with immersive full-width lookbooks.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {gallery.map((t) => (
              <div key={t.code} className="rounded-lg border border-slate-200 p-4 hover:border-blue-400 transition-all">
                <h4 className="font-bold text-slate-900 text-sm">{t.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{t.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
