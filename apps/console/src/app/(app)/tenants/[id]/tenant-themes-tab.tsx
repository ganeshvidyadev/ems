'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Palette,
  Check,
  Download,
  CheckCircle2,
  Loader2,
  FolderCode,
  DollarSign,
  FileCode,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { Button, Badge, Alert, Input, Textarea, Card, CardHeader, CardBody } from '@/components/ui/primitives';
import { downloadJsonFile } from '@/lib/csv-helper';

interface Theme {
  code: string;
  name: string;
  description: string;
}

interface CompanyThemeData {
  id: string;
  name: string;
  slug: string;
  selectedTheme: string;
  allowedThemes: string[];
  isCustomized?: boolean;
  customizationFeeINR?: number;
  customizationStatus?: 'STANDARD_FREE' | 'MODIFIED_PAID' | 'BESPOKE_CUSTOM';
  customNotes?: string | null;
  workspacePath?: string;
}

interface PlatformThemeSettings {
  themes: Theme[];
  companies: CompanyThemeData[];
}

interface ThemeMeta {
  tag: string;
  tagColor: string;
  brandColor: string;
  accentColor: string;
  font: string;
  previewFeatures: string[];
}

const DEFAULT_META: ThemeMeta = {
  tag: 'General E-Commerce',
  tagColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brandColor: '#2563eb',
  accentColor: '#1d4ed8',
  font: 'Inter / System',
  previewFeatures: ['Utility product grids', 'Clean whitespace', 'Standard cart & checkout'],
};

const THEME_METADATA: Record<string, ThemeMeta> = {
  default: DEFAULT_META,
  organic: {
    tag: 'Wellness & Botanicals',
    tagColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    brandColor: '#6bb252',
    accentColor: '#4d8a39',
    font: 'Lora & Inter',
    previewFeatures: ['Full-width nature hero', 'Category thumbnail circles', 'Farm-fresh badges'],
  },
  famms: {
    tag: 'Fashion & Luxury',
    tagColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    brandColor: '#f7444e',
    accentColor: '#d63031',
    font: 'Playfair Display & Montserrat',
    previewFeatures: ['Editorial lookbook banners', 'Bold discount ribbons', 'Lifestyle photography'],
  },
  circuit: {
    tag: 'Tech & Electronics',
    tagColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    brandColor: '#2563eb',
    accentColor: '#3b82f6',
    font: 'Roboto & Space Grotesk',
    previewFeatures: ['Dark accent tech hero', 'OEM warranty badges', 'Technical specification grids'],
  },
  harvest: {
    tag: 'Grocery & Supermarket',
    tagColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    brandColor: '#15803d',
    accentColor: '#f59e0b',
    font: 'Nunito & Open Sans',
    previewFeatures: ['2-Hour fast delivery timer', 'Daily flash deals', 'Instant doorstep returns'],
  },
};

function getThemeMeta(code: string): ThemeMeta {
  return THEME_METADATA[code] ?? DEFAULT_META;
}

export function TenantThemesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: themeData, isLoading, isError } = useQuery<PlatformThemeSettings>({
    queryKey: ['platform-themes'],
    queryFn: () => apiGet<PlatformThemeSettings>('/platform/themes'),
  });

  const company = themeData?.companies.find(
    (c) => c.id === tenantId || c.slug === tenantId,
  );

  const [selectedTheme, setSelectedTheme] = useState<string>('');
  const [allowedThemes, setAllowedThemes] = useState<string[]>([]);
  
  // Customization & Monetization local states
  const [isCustomized, setIsCustomized] = useState<boolean>(company?.isCustomized ?? false);
  const [customizationFee, setCustomizationFee] = useState<string>(String(company?.customizationFeeINR ?? '0'));
  const [customizationStatus, setCustomizationStatus] = useState<'STANDARD_FREE' | 'MODIFIED_PAID' | 'BESPOKE_CUSTOM'>(
    company?.customizationStatus ?? 'STANDARD_FREE'
  );
  const [customNotes, setCustomNotes] = useState<string>(company?.customNotes ?? '');

  const currentTheme = company?.selectedTheme || 'default';
  const effectiveSelected = selectedTheme || currentTheme;
  const effectiveAllowed = allowedThemes.length > 0 ? allowedThemes : (company?.allowedThemes || ['default']);

  const updateMutation = useMutation({
    mutationFn: (payload: { selectedTheme: string; allowedThemes: string[] }) =>
      apiPut<{ selectedTheme: string; allowedThemes: string[] }>(
        `/platform/themes/${company?.id ?? tenantId}`,
        payload,
      ),
    onSuccess: (result) => {
      setSuccessMessage(`Theme successfully updated to "${result.selectedTheme}". Storefront reflects changes immediately.`);
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-themes'] });
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? 'Failed to update theme assignment.');
    },
  });

  const syncWorkspaceMutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string; workspacePath: string }>(
        `/platform/themes/${company?.id ?? tenantId}/provision-workspace`,
        { themeCode: effectiveSelected },
      ),
    onSuccess: (result) => {
      setSuccessMessage(`Workspace folder successfully initialized/synchronized on server at "${result.workspacePath}".`);
      setErrorMessage(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? 'Failed to synchronize workspace folder.');
    },
  });

  const saveCustomizationMutation = useMutation({
    mutationFn: () =>
      apiPut(`/platform/themes/${company?.id ?? tenantId}/customization`, {
        isCustomized,
        customizationFeeINR: Number(customizationFee) || 0,
        customizationStatus,
        notes: customNotes.trim() || undefined,
      }),
    onSuccess: () => {
      setSuccessMessage('Customization monetization & fee details saved successfully. Dedicated folder updated.');
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-themes'] });
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? 'Failed to save customization details.');
    },
  });

  function handleActivate(themeCode: string) {
    const updatedAllowed = Array.from(new Set([...effectiveAllowed, themeCode]));
    setSelectedTheme(themeCode);
    setAllowedThemes(updatedAllowed);
    updateMutation.mutate({
      selectedTheme: themeCode,
      allowedThemes: updatedAllowed,
    });
  }

  function toggleAllowed(themeCode: string) {
    if (themeCode === 'default') return; // Default is always allowed
    let next: string[];
    if (effectiveAllowed.includes(themeCode)) {
      next = effectiveAllowed.filter((c) => c !== themeCode);
    } else {
      next = [...effectiveAllowed, themeCode];
    }
    setAllowedThemes(next);
    updateMutation.mutate({
      selectedTheme: effectiveSelected === themeCode && !next.includes(themeCode) ? 'default' : effectiveSelected,
      allowedThemes: next,
    });
  }

  function handleExportThemeFolder() {
    if (!company) return;
    const meta = getThemeMeta(effectiveSelected);

    const workspaceData = {
      tenant: {
        id: company.id,
        businessName: company.name,
        slug: company.slug,
        exportedAt: new Date().toISOString(),
      },
      activeTheme: {
        code: effectiveSelected,
        meta,
        themeTier: isCustomized ? 'CUSTOM_PAID' : 'STANDARD_FREE',
        customizationFeeINR: Number(customizationFee) || 0,
        customizationStatus,
        folderPath: `storage/tenants/${company.slug}/themes/${effectiveSelected}/`,
      },
      fileStructure: {
        'manifest.json': {
          version: '1.0.0',
          themeCode: effectiveSelected,
          tenantSlug: company.slug,
          allowedThemes: effectiveAllowed,
          isCustomized,
          customizationFeeINR: Number(customizationFee) || 0,
          customizationStatus,
        },
        'config.json': {
          colors: {
            primary: meta.brandColor,
            accent: meta.accentColor,
          },
          typography: {
            headingFont: meta.font,
          },
          sections: meta.previewFeatures,
        },
        'theme.css': `:root { --brand-primary: ${meta.brandColor}; --brand-accent: ${meta.accentColor}; --font-heading: '${meta.font}'; }`,
      },
      previousThemeBackups: effectiveAllowed
        .filter((c) => c !== effectiveSelected)
        .map((c) => ({
          themeCode: c,
          backupPath: `storage/tenants/${company.slug}/themes/${c}/`,
        })),
    };

    downloadJsonFile(
      `tenant-${company.slug}-theme-${effectiveSelected}-workspace.json`,
      workspaceData,
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading theme settings…</div>;
  }

  if (isError || !themeData) {
    return (
      <Alert variant="error">
        Could not load platform theme settings. Please refresh or verify permissions.
      </Alert>
    );
  }

  const themes = themeData.themes || [];

  return (
    <div className="space-y-6">
      {/* Header & Status Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> Storefront Themes & Design System
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage 5 free standard templates, configure custom paid modifications, and sync dedicated company folders for {company?.name ?? 'this tenant'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncWorkspaceMutation.mutate()}
            disabled={syncWorkspaceMutation.isPending}
            className="gap-1.5 text-xs font-semibold"
          >
            {syncWorkspaceMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5 text-primary" />
            )}
            <span>Sync Server Folder</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportThemeFolder}
            className="gap-1.5 text-xs font-semibold"
          >
            <Download className="size-3.5" />
            <span>Export Workspace (JSON)</span>
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      {/* Active Theme Highlight Card */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Currently Live On Storefront</span>
              {company?.isCustomized ? (
                <Badge variant="warning" className="text-[10px] font-semibold">
                  Custom / Bespoke Theme (Paid)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40">
                  Standard Free Tier
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-foreground">
                {themes.find((t) => t.code === currentTheme)?.name ?? currentTheme}
              </h3>
              <Badge variant="default" className="text-xs">Active Engine</Badge>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              {themes.find((t) => t.code === currentTheme)?.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs shadow-xs space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-semibold uppercase">
                <FolderCode className="size-3.5 text-primary" /> Dedicated Company Folder:
              </div>
              <div className="font-mono text-xs font-semibold text-foreground">
                storage/tenants/{company?.slug ?? 'tenant'}/themes/{currentTheme}/
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Customization & Monetization Fee Manager */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-600" />
              Theme Customization & Monetization Billing
            </h3>
            <p className="text-xs text-muted-foreground">
              Standard 5 themes are 100% free. If this company requested custom code, bespoke sections, or modifications, bill them here.
            </p>
          </div>
          <Badge variant={isCustomized ? 'warning' : 'outline'} className="text-xs">
            {isCustomized ? 'Custom Paid Theme' : 'Standard Free Theme'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Customization Status</label>
            <select
              value={customizationStatus}
              onChange={(e) => {
                const val = e.target.value as any;
                setCustomizationStatus(val);
                setIsCustomized(val !== 'STANDARD_FREE');
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
            >
              <option value="STANDARD_FREE">Standard Free (No custom charge)</option>
              <option value="MODIFIED_PAID">Modified Standard (Paid custom edits)</option>
              <option value="BESPOKE_CUSTOM">Bespoke Custom Theme (Full custom design)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Custom Modification Fee (INR ₹)</label>
            <Input
              type="number"
              placeholder="0"
              value={customizationFee}
              onChange={(e) => setCustomizationFee(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Customization Notes / Invoice Ref</label>
            <Input
              placeholder="e.g. Added custom banner slider & brand fonts"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Saves monetization metadata to tenant profile and updates <code className="font-mono text-foreground">manifest.json</code> in company folder.
          </span>
          <Button
            size="sm"
            onClick={() => saveCustomizationMutation.mutate()}
            loading={saveCustomizationMutation.isPending}
            className="text-xs font-semibold"
          >
            Save Monetization & Fee Settings
          </Button>
        </div>
      </div>

      {/* 5 Standard Themes Catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Available Standard Themes Catalog (5 Free Standard Engines)</h3>
            <span className="text-xs text-muted-foreground">Any company can switch between all 5 standard themes freely at zero cost</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((theme) => {
            const isLive = theme.code === currentTheme;
            const isAllowed = effectiveAllowed.includes(theme.code);
            const meta = getThemeMeta(theme.code);

            return (
              <div
                key={theme.code}
                className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                  isLive
                    ? 'border-primary ring-2 ring-primary/20 bg-card shadow-md'
                    : 'border-border bg-card/60 hover:border-muted-foreground/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.tagColor}`}>
                      {meta.tag}
                    </span>
                    {isLive ? (
                      <Badge variant="default" className="gap-1 text-[10px] h-5">
                        <Check className="size-3" /> Live
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        100% Free Standard
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-foreground">{theme.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{theme.description}</p>
                  </div>

                  {/* Color Palettes & Specs preview */}
                  <div className="space-y-2 pt-2 border-t border-border text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Typography:</span>
                      <span className="font-medium text-foreground">{meta.font}</span>
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Palette:</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-4 w-4 rounded-full border shadow-xs"
                          style={{ backgroundColor: meta.brandColor }}
                          title="Primary Brand"
                        />
                        <span
                          className="h-4 w-4 rounded-full border shadow-xs"
                          style={{ backgroundColor: meta.accentColor }}
                          title="Accent"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Included Features:</span>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {meta.previewFeatures.map((feat, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-primary" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 mt-4 border-t border-border flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      disabled={theme.code === 'default' || updateMutation.isPending}
                      onChange={() => toggleAllowed(theme.code)}
                      className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span>Allowed</span>
                  </label>

                  <Button
                    size="sm"
                    variant={isLive ? 'outline' : 'default'}
                    disabled={isLive || updateMutation.isPending}
                    onClick={() => handleActivate(theme.code)}
                    className="h-8 text-xs font-semibold"
                  >
                    {updateMutation.isPending && selectedTheme === theme.code ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : isLive ? (
                      'Currently Active'
                    ) : (
                      'Activate Theme'
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
