'use client';

import { useState, useEffect } from 'react';
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
  Image as ImageIcon,
  Upload,
  Plus,
  Trash2,
  Eye,
  Globe,
  Tag,
  Link as LinkIcon,
  ArrowRight,
  Sliders,
  Type,
  Code2,
  Sun,
  Moon,
} from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import { Button, Badge, Alert, Input, Textarea, Card, CardHeader, CardBody } from '@/components/ui/primitives';
import { downloadJsonFile } from '@/lib/csv-helper';

interface Theme {
  code: string;
  name: string;
  description: string;
}

interface BannerSlide {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  ctaLabel?: string;
  linkUrl?: string;
  badgeTag?: string;
  isActive: boolean;
}

interface BrandingSettings {
  logoUrl: string | null;
  faviconUrl: string | null;
  banners: BannerSlide[];
}

interface CustomizerSettings {
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  customCss: string;
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
  logoUrl?: string | null;
  faviconUrl?: string | null;
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

const FONT_OPTIONS = [
  'Inter',
  'Playfair Display',
  'Lora',
  'Roboto',
  'Montserrat',
  'Nunito',
  'Space Grotesk',
  'Poppins',
  'Outfit',
  'Plus Jakarta Sans',
];

const PALETTE_PRESETS = [
  { name: 'Emerald Nature', primary: '#16a34a', accent: '#15803d', surface: '#f0fdf4', text: '#052e16' },
  { name: 'Cyber Indigo', primary: '#4f46e5', accent: '#4338ca', surface: '#eef2ff', text: '#1e1b4b' },
  { name: 'Luxury Rose', primary: '#f43f5e', accent: '#e11d48', surface: '#fff1f2', text: '#881337' },
  { name: 'Sunset Amber', primary: '#f59e0b', accent: '#d97706', surface: '#fffbeb', text: '#451a03' },
  { name: 'Electric Cyan', primary: '#0ea5e9', accent: '#0284c7', surface: '#f0f9ff', text: '#082f49' },
  { name: 'Obsidian Modern', primary: '#0f172a', accent: '#334155', surface: '#f8fafc', text: '#020617' },
];

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

  const { data: brandingData } = useQuery<BrandingSettings>({
    queryKey: ['platform-theme-branding', company?.id ?? tenantId],
    queryFn: () => apiGet<BrandingSettings>(`/platform/themes/${company?.id ?? tenantId}/branding`),
    enabled: !!(company?.id ?? tenantId),
  });

  const { data: customizerData } = useQuery<CustomizerSettings>({
    queryKey: ['platform-theme-customizer', company?.id ?? tenantId],
    queryFn: () => apiGet<CustomizerSettings>(`/platform/themes/${company?.id ?? tenantId}/customizer`),
    enabled: !!(company?.id ?? tenantId),
  });

  const [selectedTheme, setSelectedTheme] = useState<string>('');
  const [allowedThemes, setAllowedThemes] = useState<string[]>([]);
  
  // Customization & Monetization local states
  const [isCustomized, setIsCustomized] = useState<boolean>(false);
  const [customizationFee, setCustomizationFee] = useState<string>('0');
  const [customizationStatus, setCustomizationStatus] = useState<'STANDARD_FREE' | 'MODIFIED_PAID' | 'BESPOKE_CUSTOM'>('STANDARD_FREE');
  const [customNotes, setCustomNotes] = useState<string>('');

  // Branding local states
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [faviconUrl, setFaviconUrl] = useState<string>('');
  const [banners, setBanners] = useState<BannerSlide[]>([]);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  // Visual Customizer local states
  const [primaryColor, setPrimaryColor] = useState<string>('#2563eb');
  const [accentColor, setAccentColor] = useState<string>('#1d4ed8');
  const [surfaceColor, setSurfaceColor] = useState<string>('#ffffff');
  const [textColor, setTextColor] = useState<string>('#0f172a');
  const [headingFont, setHeadingFont] = useState<string>('Inter');
  const [bodyFont, setBodyFont] = useState<string>('Inter');
  const [customCss, setCustomCss] = useState<string>('');

  useEffect(() => {
    if (company) {
      setIsCustomized(company.isCustomized ?? false);
      setCustomizationFee(String(company.customizationFeeINR ?? '0'));
      setCustomizationStatus(company.customizationStatus ?? 'STANDARD_FREE');
      setCustomNotes(company.customNotes ?? '');
      if (company.logoUrl && !logoUrl) setLogoUrl(company.logoUrl);
      if (company.faviconUrl && !faviconUrl) setFaviconUrl(company.faviconUrl);
    }
  }, [company]);

  useEffect(() => {
    if (brandingData) {
      if (brandingData.logoUrl !== undefined) setLogoUrl(brandingData.logoUrl || '');
      if (brandingData.faviconUrl !== undefined) setFaviconUrl(brandingData.faviconUrl || '');
      if (brandingData.banners) setBanners(brandingData.banners);
    }
  }, [brandingData]);

  useEffect(() => {
    if (customizerData) {
      if (customizerData.primaryColor) setPrimaryColor(customizerData.primaryColor);
      if (customizerData.accentColor) setAccentColor(customizerData.accentColor);
      if (customizerData.surfaceColor) setSurfaceColor(customizerData.surfaceColor);
      if (customizerData.textColor) setTextColor(customizerData.textColor);
      if (customizerData.headingFont) setHeadingFont(customizerData.headingFont);
      if (customizerData.bodyFont) setBodyFont(customizerData.bodyFont);
      if (customizerData.customCss) setCustomCss(customizerData.customCss);
    }
  }, [customizerData]);

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

  const saveBrandingMutation = useMutation({
    mutationFn: (payload: { logoUrl?: string | null; faviconUrl?: string | null; banners?: BannerSlide[] }) =>
      apiPut<BrandingSettings>(`/platform/themes/${company?.id ?? tenantId}/branding`, payload),
    onSuccess: () => {
      setSuccessMessage('Custom brand logo, favicon, and promotional hero banners saved & deployed to storefront.');
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-theme-branding'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-themes'] });
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? 'Failed to save branding assets.');
    },
  });

  const saveCustomizerMutation = useMutation({
    mutationFn: (payload: Partial<CustomizerSettings>) =>
      apiPut<{ message: string; customizer: CustomizerSettings }>(
        `/platform/themes/${company?.id ?? tenantId}/customizer`,
        payload,
      ),
    onSuccess: () => {
      setSuccessMessage('Visual styling tokens & compiled theme.css published to storefront successfully!');
      setErrorMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-theme-customizer'] });
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setErrorMessage(err?.message ?? 'Failed to save visual customizer settings.');
    },
  });

  async function handleFileUpload(file: File, assetType: 'logo' | 'favicon' | 'banner', targetBannerIndex?: number) {
    try {
      setUploadingType(assetType + (targetBannerIndex !== undefined ? `-${targetBannerIndex}` : ''));
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const uploadRes = await apiPost<{ url: string; assetType: string; fileName: string }>(
            `/platform/themes/${company?.id ?? tenantId}/assets/upload`,
            {
              assetType,
              fileName: file.name,
              fileData: base64Data,
              mimeType: file.type || 'image/png',
            },
          );
          if (uploadRes?.url) {
            if (assetType === 'logo') {
              setLogoUrl(uploadRes.url);
            } else if (assetType === 'favicon') {
              setFaviconUrl(uploadRes.url);
            } else if (assetType === 'banner' && targetBannerIndex !== undefined) {
              const next = [...banners];
              if (next[targetBannerIndex]) {
                next[targetBannerIndex] = {
                  ...next[targetBannerIndex],
                  imageUrl: uploadRes.url,
                };
                setBanners(next);
              }
            }
            setSuccessMessage(`Asset "${file.name}" uploaded to company isolated folder storage/tenants/${company?.slug}/assets/ successfully.`);
            setTimeout(() => setSuccessMessage(null), 4000);
          }
        } catch (err: any) {
          setErrorMessage(err?.message ?? 'Failed to upload asset file.');
        } finally {
          setUploadingType(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Error reading file.');
      setUploadingType(null);
    }
  }

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
    if (themeCode === 'default') return;
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

  function addBannerSlide() {
    const newSlide: BannerSlide = {
      id: 'banner-' + Date.now(),
      title: 'Exciting Seasonal Sale',
      subtitle: 'Exclusive discounts on handpicked bestsellers for a limited time',
      imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
      ctaLabel: 'Shop Collection',
      linkUrl: '/products',
      badgeTag: 'Limited Offer',
      isActive: true,
    };
    setBanners([...banners, newSlide]);
  }

  function removeBannerSlide(index: number) {
    setBanners(banners.filter((_, i) => i !== index));
  }

  function updateBannerField<K extends keyof BannerSlide>(index: number, field: K, value: BannerSlide[K]) {
    const next = [...banners];
    if (next[index]) {
      next[index] = {
        ...next[index],
        [field]: value,
      };
      setBanners(next);
    }
  }

  function applyPreset(preset: typeof PALETTE_PRESETS[0]) {
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
    setSurfaceColor(preset.surface);
    setTextColor(preset.text);
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
      branding: {
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        banners: banners,
        customizer: {
          primaryColor,
          accentColor,
          surfaceColor,
          textColor,
          headingFont,
          bodyFont,
          customCss,
        },
        assetsFolderPath: `storage/tenants/${company.slug}/assets/`,
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
            primary: primaryColor || meta.brandColor,
            accent: accentColor || meta.accentColor,
          },
          typography: {
            headingFont: headingFont || meta.font,
          },
          sections: meta.previewFeatures,
        },
        'overrides.json': {
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          banners: banners,
          customizer: {
            primaryColor,
            accentColor,
            surfaceColor,
            textColor,
            headingFont,
            bodyFont,
            customCss,
          },
        },
        'theme.css': `:root { --brand-primary: ${primaryColor}; --brand-accent: ${accentColor}; --brand-surface: ${surfaceColor}; --brand-text: ${textColor}; --font-heading: '${headingFont}'; --font-body: '${bodyFont}'; }\n${customCss}`,
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
            Manage 5 free standard templates, live customize color palettes & fonts, and isolate company files for {company?.name ?? 'this tenant'}.
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

      {/* Live Visual Theme Customizer Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sliders className="size-4 text-primary" />
              Live Visual Theme Customizer (Color Palettes & Typography)
            </h3>
            <p className="text-xs text-muted-foreground">
              Customize colors, fonts, and CSS tokens. Variables are compiled into <code className="font-mono text-foreground">storage/tenants/{company?.slug}/themes/{currentTheme}/theme.css</code> and injected automatically into the storefront.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            CSS :root Injection
          </Badge>
        </div>

        {/* 1-Click Palette Presets */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Instant Color Presets</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background hover:bg-muted/60 text-left transition-all shadow-xs cursor-pointer"
              >
                <div className="size-4 rounded-full border shadow-xs shrink-0" style={{ backgroundColor: preset.primary }} />
                <span className="text-xs font-medium text-foreground truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Controls Column */}
          <div className="space-y-4">
            {/* Colors */}
            <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/10">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Palette className="size-3.5 text-primary" /> Color Palette Tokens
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Primary Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer p-0 bg-transparent"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer p-0 bg-transparent"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Surface / Card Background</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={surfaceColor}
                      onChange={(e) => setSurfaceColor(e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer p-0 bg-transparent"
                    />
                    <Input
                      value={surfaceColor}
                      onChange={(e) => setSurfaceColor(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Text & Headings Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="size-8 rounded border border-input cursor-pointer p-0 bg-transparent"
                    />
                    <Input
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/10">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Type className="size-3.5 text-primary" /> Typography Hierarchy
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Heading Font Family</label>
                  <select
                    value={headingFont}
                    onChange={(e) => setHeadingFont(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Body Font Family</label>
                  <select
                    value={bodyFont}
                    onChange={(e) => setBodyFont(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Custom CSS */}
            <div className="space-y-2 rounded-lg border border-border p-4 bg-muted/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Code2 className="size-3.5 text-primary" /> Custom CSS Rules
                </span>
                <span className="text-[10px] text-muted-foreground">Applied globally</span>
              </div>
              <Textarea
                rows={3}
                placeholder="/* Custom tenant styles, e.g. .site-header { backdrop-filter: blur(8px); } */"
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Real-time Live Preview Swatch */}
          <div className="space-y-3 rounded-lg border border-border p-5 bg-card flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between border-b border-border pb-2.5 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Eye className="size-3.5 text-primary" /> Live Storefront Component Swatch
                </span>
                <Badge variant="outline" className="text-[10px]">Real-time Render</Badge>
              </div>

              <div
                className="rounded-xl border p-4 space-y-4 shadow-sm transition-all"
                style={{
                  backgroundColor: surfaceColor,
                  color: textColor,
                  fontFamily: `${bodyFont}, sans-serif`,
                }}
              >
                {/* Header Swatch */}
                <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {company?.name ? company.name[0]?.toUpperCase() : 'S'}
                    </div>
                    <span
                      className="font-bold text-sm tracking-tight"
                      style={{ fontFamily: `${headingFont}, serif` }}
                    >
                      {company?.name ?? 'Storefront'}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    Special Offer
                  </span>
                </div>

                {/* Hero Pitch Banner */}
                <div
                  className="rounded-lg p-3 text-white space-y-1 shadow-xs"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                  }}
                >
                  <h4
                    className="font-bold text-sm"
                    style={{ fontFamily: `${headingFont}, serif` }}
                  >
                    Summer Collection 2026
                  </h4>
                  <p className="text-[11px] opacity-90">Discover our handcrafted catalog with express delivery.</p>
                </div>

                {/* Product Card Mockup */}
                <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 bg-white/70 dark:bg-black/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5
                        className="font-bold text-xs"
                        style={{ fontFamily: `${headingFont}, serif` }}
                      >
                        Premium Artisan Roast
                      </h5>
                      <span className="text-[11px] opacity-75">100% Organic certified blend</span>
                    </div>
                    <span className="font-bold text-sm" style={{ color: primaryColor }}>
                      ₹899
                    </span>
                  </div>

                  {/* Buttons Swatch */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="flex-1 text-xs font-semibold py-1.5 px-3 rounded-md text-white shadow-xs transition-all cursor-pointer"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold py-1.5 px-3 rounded-md border shadow-xs transition-all cursor-pointer"
                      style={{
                        borderColor: primaryColor,
                        color: primaryColor,
                        backgroundColor: 'transparent',
                      }}
                    >
                      Quick View
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Publish Button */}
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Compiles CSS tokens to <code className="font-mono text-foreground">theme.css</code>
              </span>
              <Button
                size="sm"
                onClick={() =>
                  saveCustomizerMutation.mutate({
                    primaryColor,
                    accentColor,
                    surfaceColor,
                    textColor,
                    headingFont,
                    bodyFont,
                    customCss,
                  })
                }
                loading={saveCustomizerMutation.isPending}
                className="text-xs font-semibold gap-1.5"
              >
                <Sparkles className="size-3.5" />
                <span>Publish Custom Styling to Storefront</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Assets & Media Uploader Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              Company Brand Logo, Favicon & Media Assets
            </h3>
            <p className="text-xs text-muted-foreground">
              Upload custom brand visuals. Files are saved directly in this company's isolated folder: <code className="font-mono text-foreground">storage/tenants/{company?.slug ?? 'tenant'}/assets/</code>.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            storage/tenants/{company?.slug ?? 'tenant'}/assets/
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logo Section */}
          <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Globe className="size-3.5 text-primary" /> Store Brand Logo
              </span>
              <span className="text-[11px] text-muted-foreground">PNG, SVG, JPG, WebP</span>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="https://example.com/logo.png or /storage/tenants/..."
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="h-8 text-xs font-mono"
              />

              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted text-xs font-semibold shadow-xs">
                  <Upload className="size-3 text-muted-foreground" />
                  <span>{uploadingType === 'logo' ? 'Uploading…' : 'Upload Logo File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingType === 'logo'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file, 'logo');
                    }}
                  />
                </label>
                {logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogoUrl('')}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Live Preview on Light & Dark */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Live Header Preview:</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-white p-3 flex flex-col items-center justify-center min-h-[70px]">
                  <span className="text-[9px] text-slate-400 mb-1">Light Header</span>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo Light" className="max-h-8 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-slate-900">{company?.name ?? 'Storefront'}</span>
                  )}
                </div>
                <div className="rounded-lg border bg-slate-950 p-3 flex flex-col items-center justify-center min-h-[70px]">
                  <span className="text-[9px] text-slate-400 mb-1">Dark Header</span>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo Dark" className="max-h-8 max-w-full object-contain filter brightness-110" />
                  ) : (
                    <span className="text-xs font-bold text-white">{company?.name ?? 'Storefront'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Favicon Section */}
          <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" /> Browser Favicon Icon
              </span>
              <span className="text-[11px] text-muted-foreground">ICO, PNG, SVG (32x32)</span>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="https://example.com/favicon.ico or /storage/tenants/..."
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                className="h-8 text-xs font-mono"
              />

              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted text-xs font-semibold shadow-xs">
                  <Upload className="size-3 text-muted-foreground" />
                  <span>{uploadingType === 'favicon' ? 'Uploading…' : 'Upload Favicon File'}</span>
                  <input
                    type="file"
                    accept="image/*,.ico"
                    className="hidden"
                    disabled={uploadingType === 'favicon'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file, 'favicon');
                    }}
                  />
                </label>
                {faviconUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFaviconUrl('')}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Browser Tab Mockup */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Browser Tab Mockup:</span>
              <div className="rounded-t-lg border border-b-0 bg-slate-200 dark:bg-slate-800 p-2 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-md text-xs font-medium text-foreground shadow-xs max-w-[200px] truncate border border-border">
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="Favicon" className="size-3.5 object-contain" />
                  ) : (
                    <div className="size-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">S</div>
                  )}
                  <span className="truncate">{company?.name ?? 'Store'} | Official Store</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Promotional Hero Banners Manager */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Layers className="size-4 text-primary" /> Storefront Hero Banner Slides ({banners.length})
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Display high-impact marketing banners with custom CTA links on your active theme homepage.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={addBannerSlide}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5" />
              <span>Add Banner Slide</span>
            </Button>
          </div>

          {banners.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2 bg-muted/10">
              <ImageIcon className="size-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs text-muted-foreground">No custom hero banner slides created yet.</p>
              <Button size="sm" variant="outline" onClick={addBannerSlide} className="text-xs font-semibold">
                Create First Hero Banner
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {banners.map((banner, index) => (
                <div
                  key={banner.id || index}
                  className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-foreground">Slide #{index + 1}: {banner.title || 'Untitled Banner'}</span>
                      <Badge variant={banner.isActive ? 'default' : 'outline'} className="text-[10px]">
                        {banner.isActive ? 'Active' : 'Hidden'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={banner.isActive}
                          onChange={(e) => updateBannerField(index, 'isActive', e.target.checked)}
                          className="rounded border-input text-primary h-3.5 w-3.5"
                        />
                        <span>Active</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBannerSlide(index)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-foreground">Headline Title</label>
                      <Input
                        value={banner.title}
                        onChange={(e) => updateBannerField(index, 'title', e.target.value)}
                        placeholder="e.g. Organic Herbal Collection"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-foreground">Subtitle / Pitch</label>
                      <Input
                        value={banner.subtitle || ''}
                        onChange={(e) => updateBannerField(index, 'subtitle', e.target.value)}
                        placeholder="e.g. 100% natural certified wellness ingredients"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-foreground">Badge Tag</label>
                      <Input
                        value={banner.badgeTag || ''}
                        onChange={(e) => updateBannerField(index, 'badgeTag', e.target.value)}
                        placeholder="e.g. 30% OFF • NEW ARRIVAL"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[11px] font-medium text-foreground">Banner Background Image URL</label>
                      <div className="flex gap-2">
                        <Input
                          value={banner.imageUrl}
                          onChange={(e) => updateBannerField(index, 'imageUrl', e.target.value)}
                          placeholder="https://... or /storage/tenants/..."
                          className="h-8 text-xs font-mono"
                        />
                        <label className="cursor-pointer shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted text-xs font-semibold shadow-xs">
                          <Upload className="size-3 text-muted-foreground" />
                          <span>{uploadingType === `banner-${index}` ? 'Uploading…' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingType === `banner-${index}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleFileUpload(file, 'banner', index);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-foreground">CTA Label</label>
                        <Input
                          value={banner.ctaLabel || ''}
                          onChange={(e) => updateBannerField(index, 'ctaLabel', e.target.value)}
                          placeholder="Shop Now"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-foreground">CTA Target URL</label>
                        <Input
                          value={banner.linkUrl || ''}
                          onChange={(e) => updateBannerField(index, 'linkUrl', e.target.value)}
                          placeholder="/products"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rendered Live Banner Preview */}
                  {banner.imageUrl && (
                    <div className="relative rounded-lg overflow-hidden h-28 border border-border shadow-inner mt-2">
                      <img
                        src={banner.imageUrl}
                        alt={banner.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-transparent p-4 flex flex-col justify-center text-white">
                        {banner.badgeTag && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 w-fit">
                            {banner.badgeTag}
                          </span>
                        )}
                        <h5 className="text-sm font-bold truncate max-w-sm">{banner.title}</h5>
                        {banner.subtitle && (
                          <p className="text-[11px] text-slate-200 truncate max-w-xs">{banner.subtitle}</p>
                        )}
                        {banner.ctaLabel && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white text-slate-900 px-2 py-0.5 rounded shadow-xs">
                              {banner.ctaLabel} <ArrowRight className="size-2.5" />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save & Deploy Branding Assets Button */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Saves logo & favicon to store database and writes branding overrides to <code className="font-mono text-foreground">storage/tenants/{company?.slug}/themes/{currentTheme}/overrides.json</code>.
          </span>
          <Button
            size="sm"
            onClick={() =>
              saveBrandingMutation.mutate({
                logoUrl: logoUrl.trim() || null,
                faviconUrl: faviconUrl.trim() || null,
                banners,
              })
            }
            loading={saveBrandingMutation.isPending}
            className="text-xs font-semibold gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span>Save & Deploy Branding Assets</span>
          </Button>
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
