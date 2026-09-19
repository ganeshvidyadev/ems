'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Copy, Check, Sparkles, RefreshCw, ShoppingBag, Sliders, Eye, Code, Download } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface Theme {
  code: string;
  name: string;
  description: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  selectedTheme: string;
  allowedThemes: string[];
}

interface ThemeSettings {
  themes: Theme[];
  companies: Company[];
}

const PRESET_PALETTES = [
  { name: 'Emerald Organic', brand: '#10b981', accent: '#059669', bg: '#f0fdf4', radius: '8px', font: 'Inter' },
  { name: 'Indigo Modern', brand: '#6366f1', accent: '#4f46e5', bg: '#f8fafc', radius: '12px', font: 'Plus Jakarta Sans' },
  { name: 'Crimson Velvet', brand: '#f43f5e', accent: '#e11d48', bg: '#fff1f2', radius: '6px', font: 'Outfit' },
  { name: 'Luxury Amber', brand: '#d97706', accent: '#b45309', bg: '#fffbeb', radius: '4px', font: 'Playfair Display' },
  { name: 'Slate Minimal', brand: '#0f172a', accent: '#334155', bg: '#f1f5f9', radius: '0px', font: 'Space Grotesk' },
];

export default function CompanyThemesPage() {
  const { user } = useAuth();
  const allowed = user?.userType === 'PLATFORM' && user.roles.includes('PLATFORM_SUPER_ADMIN');

  // Interactive Live Theme Customizer State
  const [brandColor, setBrandColor] = useState('#10b981');
  const [accentColor, setAccentColor] = useState('#059669');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [radius, setRadius] = useState('8px');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [copiedCss, setCopiedCss] = useState(false);

  const query = useQuery({
    queryKey: ['platform-themes'],
    queryFn: () => apiGet<ThemeSettings>('/platform/themes'),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Company themes</h1>
        <p className="mt-4">Only the platform super admin can manage company themes.</p>
      </main>
    );
  }

  function applyPreset(p: typeof PRESET_PALETTES[0]) {
    setBrandColor(p.brand);
    setAccentColor(p.accent);
    setBgColor(p.bg);
    setRadius(p.radius);
    setFontFamily(p.font);
  }

  const generatedCss = `:root {
  --color-brand: ${brandColor};
  --color-brand-accent: ${accentColor};
  --color-surface-bg: ${bgColor};
  --theme-radius: ${radius};
  --font-family: '${fontFamily}', sans-serif;
}`;

  function copyCss() {
    navigator.clipboard.writeText(generatedCss);
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 2000);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Theme & Visual Customizer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure available storefront themes, assign company design templates, and test live CSS custom properties.
        </p>
      </div>

      {/* Live Visual Theme Styler & Preview */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <Palette className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold text-foreground">Interactive Theme Styler & Live Preview</h2>
              <p className="text-xs text-muted-foreground">Customize colors, corner radius, and typography with real-time visual sandbox</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyCss}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
            >
              {copiedCss ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCss ? 'Copied CSS!' : 'Copy CSS Tokens'}</span>
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color Presets</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_PALETTES.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary transition"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.brand }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Controls and Live Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls */}
          <div className="lg:col-span-5 space-y-4 rounded-xl border bg-muted/20 p-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>Primary Brand Color</span>
                <span className="font-mono text-muted-foreground">{brandColor}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-8 w-12 rounded cursor-pointer border p-0.5"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-8 flex-1 rounded border bg-background px-2.5 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>Accent Color</span>
                <span className="font-mono text-muted-foreground">{accentColor}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-8 w-12 rounded cursor-pointer border p-0.5"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-8 flex-1 rounded border bg-background px-2.5 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>Border Radius</span>
                <span className="font-mono text-muted-foreground">{radius}</span>
              </label>
              <div className="flex gap-2">
                {['0px', '4px', '8px', '12px', '16px'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadius(r)}
                    className={`flex-1 rounded border py-1 font-mono ${radius === r ? 'bg-primary text-primary-foreground font-bold' : 'bg-background text-muted-foreground'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center justify-between">
                <span>Typography</span>
                <span className="text-muted-foreground">{fontFamily}</span>
              </label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              >
                <option value="Inter">Inter (Clean & Standard)</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern & Geometric)</option>
                <option value="Outfit">Outfit (Fashion & Lifestyle)</option>
                <option value="Playfair Display">Playfair Display (Luxury & Editorial)</option>
                <option value="Space Grotesk">Space Grotesk (Tech & Minimal)</option>
              </select>
            </div>
          </div>

          {/* Live Preview Stage */}
          <div className="lg:col-span-7 rounded-xl border bg-muted/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Live Storefront Component Preview
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{fontFamily} • {radius}</span>
            </div>

            <div
              className="rounded-xl border p-5 space-y-4 shadow-sm transition-all"
              style={{
                borderRadius: radius,
                fontFamily: `'${fontFamily}', sans-serif`,
                backgroundColor: bgColor,
              }}
            >
              {/* Header Preview Bar */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: brandColor }}
                  >
                    E
                  </div>
                  <span className="font-bold text-sm text-foreground">Aura Botanics</span>
                </div>
                <div
                  className="rounded-full px-2.5 py-0.5 text-xs text-white font-medium shadow-sm"
                  style={{ backgroundColor: brandColor, borderRadius: radius }}
                >
                  Cart (2)
                </div>
              </div>

              {/* Sample Product Showcase */}
              <div className="flex gap-4 items-center">
                <div
                  className="h-20 w-20 shrink-0 flex items-center justify-center text-white font-bold text-xl shadow-inner"
                  style={{ backgroundColor: accentColor, borderRadius: radius }}
                >
                  🌿
                </div>

                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 text-white"
                      style={{ backgroundColor: brandColor, borderRadius: radius }}
                    >
                      20% OFF
                    </span>
                    <span className="text-xs text-muted-foreground">Organic Skincare</span>
                  </div>
                  <p className="font-bold text-sm text-foreground truncate">Pure Cold-Pressed Almond Oil</p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-base text-foreground">₹499.00</span>
                    <span className="text-xs text-muted-foreground line-through">₹599.00</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="flex-1 py-2 text-xs font-semibold text-white shadow transition hover:opacity-90"
                  style={{ backgroundColor: brandColor, borderRadius: radius }}
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-xs font-semibold border hover:bg-muted/50 transition"
                  style={{ borderRadius: radius }}
                >
                  Quick View
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Platform Template Themes */}
      <div>
        <h2 className="text-lg font-bold text-foreground">Available Storefront Templates</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Core layouts shipped with the multi-tenant engine</p>

        {query.isPending && (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            Loading themes...
          </p>
        )}

        {query.isError && (
          <div className="mt-4 text-sm text-destructive" role="alert">
            <p>Could not load theme settings. {query.error.message}</p>
            <button className="mt-2 underline font-medium" onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        )}

        {query.data && (
          <div className="my-4 grid gap-4 sm:grid-cols-3">
            {query.data.themes.map((theme) => (
              <div key={theme.code} className="rounded-xl border bg-card p-5 shadow-sm">
                <div
                  className="mb-4 h-3 rounded-full"
                  style={{
                    background:
                      theme.code === 'organic'
                        ? '#6bb252'
                        : theme.code === 'famms'
                          ? '#f7444e'
                          : '#334155',
                  }}
                />
                <h3 className="font-semibold text-foreground">{theme.name}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{theme.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Company Theme Permissions & Active Selection */}
      {query.data && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Company Storefront Assignments</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Control which themes are activated and accessible per merchant company</p>
          </div>

          <div className="space-y-4">
            {query.data.companies.map((company) => (
              <CompanyRow key={company.id} company={company} themes={query.data.themes} />
            ))}
          </div>

          {query.data.companies.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No companies have been created yet.
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function CompanyRow({ company, themes }: { company: Company; themes: Theme[] }) {
  const client = useQueryClient();
  const [allowed, setAllowed] = useState(company.allowedThemes);
  const [selected, setSelected] = useState(company.selectedTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const dirty =
    selected !== company.selectedTheme ||
    [...allowed].sort().join() !== [...company.allowedThemes].sort().join();

  function toggle(code: string) {
    setMessage('');
    setError('');
    const next = allowed.includes(code)
      ? allowed.filter((item) => item !== code)
      : [...allowed, code];
    setAllowed(next);
    if (!next.includes(selected)) setSelected('default');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiPut(`/platform/themes/${company.id}`, {
        selectedTheme: selected,
        allowedThemes: allowed,
      });
      setMessage('Theme configuration saved successfully.');
      client.invalidateQueries({ queryKey: ['platform-themes'] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save theme configuration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="font-semibold text-foreground text-sm">{company.name}</h3>
          <p className="text-xs text-muted-foreground font-mono">slug: {company.slug}</p>
        </div>

        {dirty && (
          <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full w-fit">
            Unsaved Changes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Allowed Designs
          </label>
          <div className="space-y-1.5">
            {themes.map((theme) => {
              const isDefault = theme.code === 'default';
              const checked = allowed.includes(theme.code) || isDefault;
              return (
                <label
                  key={theme.code}
                  className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isDefault}
                    onChange={() => toggle(theme.code)}
                    className="rounded border-line text-primary focus:ring-primary"
                  />
                  <span>
                    {theme.name} {isDefault && <span className="text-muted-foreground">(always allowed)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Shopper Design
          </label>
          <select
            value={selected}
            onChange={(e) => {
              setMessage('');
              setError('');
              setSelected(e.target.value);
            }}
            className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground"
          >
            {themes
              .filter((t) => t.code === 'default' || allowed.includes(t.code))
              .map((theme) => (
                <option key={theme.code} value={theme.code}>
                  {theme.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t text-xs">
        <div>
          {message && <span className="text-emerald-600 font-medium">{message}</span>}
          {error && <span className="text-destructive font-medium">{error}</span>}
        </div>

        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-40 transition"
        >
          {saving ? 'Saving...' : 'Save Theme'}
        </button>
      </div>
    </div>
  );
}
