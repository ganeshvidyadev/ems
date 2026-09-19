'use client';

import type { TenantResponse, TenantStatus } from '@ems/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui/primitives';
import { useAuth, usePermission } from '@/hooks/use-auth';
import { isForbidden, apiGet, apiPut } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  useDeleteTenant,
  useImpersonateTenant,
  usePlatformTenants,
  useReactivateTenant,
  useSuspendTenant,
} from '@/lib/queries/platform-tenants';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette, Check, FolderCode, Download, CheckCircle2, ArrowRight } from 'lucide-react';
import { downloadJsonFile } from '@/lib/csv-helper';

const STATUS_BADGE: Record<TenantStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  PENDING: 'default',
  PROVISIONING: 'info',
  ACTIVE: 'success',
  TRIAL: 'info',
  PAST_DUE: 'warning',
  SUSPENDED: 'destructive',
  CANCELLED: 'default',
  DELETED: 'default',
};

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
}

interface PlatformThemeSettings {
  themes: Theme[];
  companies: CompanyThemeData[];
}

const THEME_INFO: Record<string, { name: string; color: string; tag: string; font: string; desc: string }> = {
  default: {
    name: 'Default Modern',
    color: '#2563eb',
    tag: 'General Store',
    font: 'Inter / System',
    desc: 'Clean, balanced whitespace with high-converting multi-category layout.',
  },
  organic: {
    name: 'Organic Botanicals',
    color: '#6bb252',
    tag: 'Groceries & Wellness',
    font: 'Lora & Inter',
    desc: 'Earthy green palettes, circular category badges, and fresh farm aesthetics.',
  },
  famms: {
    name: 'Famms Luxury Fashion',
    color: '#f7444e',
    tag: 'Fashion & Lookbook',
    font: 'Playfair Display',
    desc: 'Editorial typography, high-impact discount ribbons, and lookbook styling.',
  },
  circuit: {
    name: 'Circuit Electronics',
    color: '#3b82f6',
    tag: 'Gadgets & High-Tech',
    font: 'Space Grotesk',
    desc: 'Dark technical accents, spec grids, and hardware badge indicators.',
  },
  harvest: {
    name: 'Harvest Supermarket',
    color: '#15803d',
    tag: 'Fast Grocery & Staples',
    font: 'Nunito',
    desc: 'High-density grocery grid with 2-hour express delivery delivery badges.',
  },
};

export default function TenantsPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading…</main>}>
      <TenantsPageContent />
    </Suspense>
  );
}

function TenantsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enterImpersonation } = useAuth();
  const queryClient = useQueryClient();

  const canCreate = usePermission('platform.tenant:create');
  const canSuspend = usePermission('platform.tenant:suspend');
  const canReactivate = usePermission('platform.tenant:reactivate');
  const canDelete = usePermission('platform.tenant:delete');
  const canImpersonate = usePermission('platform.tenant:impersonate');

  const page = Number(searchParams.get('page') ?? '1');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TenantStatus | ''>('');

  const tenants = usePlatformTenants({ page, limit: 20, q, status: status || undefined });
  const suspend = useSuspendTenant();
  const reactivate = useReactivateTenant();
  const remove = useDeleteTenant();
  const impersonate = useImpersonateTenant();

  // Platform Themes Data
  const { data: themeData } = useQuery<PlatformThemeSettings>({
    queryKey: ['platform-themes'],
    queryFn: () => apiGet<PlatformThemeSettings>('/platform/themes'),
  });

  const saveThemesMutation = useMutation({
    mutationFn: (payload: PlatformThemeSettings) => apiPut<PlatformThemeSettings>('/platform/themes', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['platform-themes'], data);
    },
  });

  const [suspendTarget, setSuspendTarget] = useState<TenantResponse | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TenantResponse | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<TenantResponse | null>(null);
  const [impersonateReason, setImpersonateReason] = useState('');

  // Quick Theme Selection Modal State
  const [themeModalTenant, setThemeModalTenant] = useState<TenantResponse | null>(null);
  const [themeSuccessMsg, setThemeSuccessMsg] = useState<string | null>(null);

  function getTenantThemeCode(tenant: TenantResponse): string {
    const matched = themeData?.companies.find((c) => c.id === tenant.id || c.slug === tenant.slug);
    return matched?.selectedTheme || 'default';
  }

  function handleSelectThemeForTenant(tenant: TenantResponse, newThemeCode: string) {
    if (!themeData) return;

    const existingIndex = themeData.companies.findIndex((c) => c.id === tenant.id || c.slug === tenant.slug);
    const updatedCompanies = [...themeData.companies];

    if (existingIndex >= 0) {
      updatedCompanies[existingIndex] = {
        ...updatedCompanies[existingIndex]!,
        selectedTheme: newThemeCode,
        allowedThemes: Array.from(new Set([...(updatedCompanies[existingIndex]!.allowedThemes || []), newThemeCode])),
      };
    } else {
      updatedCompanies.push({
        id: tenant.id,
        name: tenant.businessName,
        slug: tenant.slug,
        selectedTheme: newThemeCode,
        allowedThemes: [newThemeCode],
      });
    }

    saveThemesMutation.mutate(
      {
        themes: themeData.themes,
        companies: updatedCompanies,
      },
      {
        onSuccess: () => {
          setThemeSuccessMsg(`Storefront theme for "${tenant.businessName}" switched to ${THEME_INFO[newThemeCode]?.name || newThemeCode}!`);
          setTimeout(() => setThemeSuccessMsg(null), 3500);
        },
      }
    );
  }

  function handleExportWorkspace(tenant: TenantResponse, currentTheme: string) {
    const pkg = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      businessName: tenant.businessName,
      activeTheme: currentTheme,
      workspaceRoot: `storage/tenants/${tenant.slug}/themes/${currentTheme}/`,
      themeConfig: {
        code: currentTheme,
        name: THEME_INFO[currentTheme]?.name || currentTheme,
        tag: THEME_INFO[currentTheme]?.tag,
        exportedAt: new Date().toISOString(),
      },
      files: [
        { path: 'theme.json', description: 'Active theme parameters and design tokens' },
        { path: 'styles.css', description: 'CSS custom properties and typography variables' },
        { path: 'components/HomeHero.tsx', description: 'Homepage hero section module' },
        { path: 'components/ProductCard.tsx', description: 'Theme-specific product card component' },
      ],
    };
    downloadJsonFile(`${tenant.slug}_${currentTheme}_workspace.json`, pkg);
  }

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    router.push(`/tenants?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
            <Palette className="size-6 text-primary" />
            <span>Tenants & Company Themes</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage all registered companies, live status, and active storefront design themes.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/tenants/new">New tenant</Link>
          </Button>
        )}
      </div>

      {themeSuccessMsg && (
        <Alert variant="info" className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>{themeSuccessMsg}</span>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 text-xs"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TenantStatus | '')}
          className="w-auto text-xs"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROVISIONING">Provisioning</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="PAST_DUE">Past due</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>

      {tenants.isError && !isForbidden(tenants.error) && (
        <Alert variant="error">Could not load tenants. Try refreshing the page.</Alert>
      )}
      {impersonate.isError && <Alert variant="error">Could not start impersonation for that tenant.</Alert>}
      {suspend.isError && <Alert variant="error">Could not suspend that tenant.</Alert>}
      {reactivate.isError && <Alert variant="error">Could not reactivate that tenant.</Alert>}
      {remove.isError && <Alert variant="error">Could not delete that tenant.</Alert>}

      {tenants.data && tenants.data.data.length === 0 && (
        <EmptyState title="No tenants" description="Nothing matches this search yet." />
      )}

      {tenants.data && tenants.data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Storefront Theme</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.data.data.map((tenant) => {
              const themeCode = getTenantThemeCode(tenant);
              const themeInfo = THEME_INFO[themeCode] || THEME_INFO['default']!;

              return (
                <TableRow key={tenant.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium">
                    <Link href={`/tenants/${tenant.id}`} className="hover:underline text-foreground font-semibold">
                      {tenant.businessName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{tenant.slug}</TableCell>
                  
                  {/* Direct Storefront Theme Badge & Selector */}
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setThemeModalTenant(tenant)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-2.5 py-1 text-xs hover:border-primary/60 hover:bg-primary/5 transition-all text-left group"
                      title={`Active Theme: ${themeInfo.name} (Click to change)`}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: themeInfo.color }}
                      />
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {themeInfo.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {themeInfo.tag}
                        </span>
                      </div>
                      <Palette className="size-3 text-muted-foreground group-hover:text-primary ml-1" />
                    </button>
                  </TableCell>

                  <TableCell>
                    <Badge variant={STATUS_BADGE[tenant.status]}>{tenant.status.replace('_', ' ')}</Badge>
                    {tenant.suspensionReason && (
                      <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground" title={tenant.suspensionReason}>
                        {tenant.suspensionReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(tenant.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setThemeModalTenant(tenant)}
                      >
                        <Palette className="size-3 mr-1 text-primary" />
                        Theme
                      </Button>

                      {canImpersonate && tenant.status !== 'DELETED' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setImpersonateTarget(tenant)}>
                          Impersonate
                        </Button>
                      )}
                      {canSuspend && tenant.status !== 'SUSPENDED' && tenant.status !== 'DELETED' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSuspendTarget(tenant)}>
                          Suspend
                        </Button>
                      )}
                      {canReactivate && tenant.status === 'SUSPENDED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          loading={reactivate.isPending}
                          onClick={() => reactivate.mutate(tenant.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                      {canDelete && tenant.status !== 'DELETED' && (
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setDeleteTarget(tenant)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {tenants.data.data.length === 0 && <TableEmptyRow colSpan={6}>No tenants.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      {tenants.data && (
        <Pagination
          page={tenants.data.meta.pagination.page}
          totalPages={tenants.data.meta.pagination.totalPages}
          hasNext={tenants.data.meta.pagination.hasNext}
          hasPrev={tenants.data.meta.pagination.hasPrev}
          onPageChange={setPage}
        />
      )}

      {/* Direct Theme Selection & Workspace Exporter Modal */}
      {themeModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Palette className="size-5 text-primary" />
                  Select Storefront Theme for {themeModalTenant.businessName}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tenant Slug: <code className="font-mono text-primary font-semibold">{themeModalTenant.slug}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThemeModalTenant(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Folder storage location indicator */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-foreground font-mono">
                <FolderCode className="size-4 text-primary shrink-0" />
                <span className="truncate">
                  storage/tenants/{themeModalTenant.slug}/themes/{getTenantThemeCode(themeModalTenant)}/
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={() => handleExportWorkspace(themeModalTenant, getTenantThemeCode(themeModalTenant))}
              >
                <Download className="size-3.5 mr-1" />
                Export Workspace
              </Button>
            </div>

            {/* 5 Themes Selection Cards */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Available Standard Themes (5)
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(THEME_INFO).map(([code, info]) => {
                  const isSelected = getTenantThemeCode(themeModalTenant) === code;

                  return (
                    <div
                      key={code}
                      onClick={() => handleSelectThemeForTenant(themeModalTenant, code)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                          : 'border-border/80 bg-surface hover:border-primary/40 hover:bg-muted/10'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-3.5 rounded-full shadow-xs shrink-0"
                              style={{ backgroundColor: info.color }}
                            />
                            <span className="font-bold text-sm text-foreground">{info.name}</span>
                          </div>
                          {isSelected ? (
                            <Badge variant="outline" className="border-primary bg-primary text-primary-foreground text-[10px] font-bold">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                              {info.tag}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {info.desc}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-mono">Font: {info.font}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? 'outline' : 'default'}
                          disabled={isSelected || saveThemesMutation.isPending}
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectThemeForTenant(themeModalTenant, code);
                          }}
                        >
                          {isSelected ? (
                            <>
                              <Check className="size-3 mr-1 text-emerald-600" />
                              Selected
                            </>
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

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setThemeModalTenant(null)}>
                Close
              </Button>
              <Button asChild>
                <Link href={`/tenants/${themeModalTenant.id}`}>
                  Go to Full Tenant 360
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendTarget(null);
            setSuspendReason('');
          }
        }}
        title="Suspend this tenant?"
        description={suspendTarget ? `${suspendTarget.businessName} loses console and storefront access immediately.` : undefined}
      >
        <div className="space-y-4">
          <Field label="Reason" htmlFor="suspendReason" hint="Shown in the tenant list and audit log">
            <Textarea id="suspendReason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Never mind
            </Button>
            <Button
              variant="destructive"
              loading={suspend.isPending}
              disabled={suspendReason.trim().length < 5}
              onClick={() => {
                if (!suspendTarget) return;
                suspend.mutate(
                  { id: suspendTarget.id, reason: suspendReason.trim(), mode: 'FULL', notifyOwner: true },
                  { onSuccess: () => setSuspendTarget(null) },
                );
              }}
            >
              Suspend
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={impersonateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setImpersonateTarget(null);
            setImpersonateReason('');
          }
        }}
        title="Impersonate this tenant?"
        description={
          impersonateTarget
            ? `You'll see the console as ${impersonateTarget.businessName}'s owner for up to 15 minutes. This is recorded in the audit log.`
            : undefined
        }
      >
        <div className="space-y-4">
          <Field label="Reason" htmlFor="impersonateReason" hint="Required — shown in the audit log">
            <Textarea
              id="impersonateReason"
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImpersonateTarget(null)}>
              Never mind
            </Button>
            <Button
              loading={impersonate.isPending}
              disabled={impersonateReason.trim().length < 5}
              onClick={() => {
                if (!impersonateTarget) return;
                impersonate.mutate(
                  { id: impersonateTarget.id, reason: impersonateReason.trim() },
                  {
                    onSuccess: (result) => {
                      enterImpersonation(result.user, result.accessToken);
                      router.push('/');
                    },
                  },
                );
              }}
            >
              Impersonate
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this tenant?"
        description={
          deleteTarget
            ? `"${deleteTarget.businessName}" and its storefront go offline immediately. This cannot be undone from here.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
