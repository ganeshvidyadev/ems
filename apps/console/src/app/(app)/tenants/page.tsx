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
import { isForbidden } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  useDeleteTenant,
  useImpersonateTenant,
  usePlatformTenants,
  useReactivateTenant,
  useSuspendTenant,
} from '@/lib/queries/platform-tenants';

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

  const [suspendTarget, setSuspendTarget] = useState<TenantResponse | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TenantResponse | null>(null);

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    router.push(`/tenants?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground">Every company on the platform.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/tenants/new">New tenant</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TenantStatus | '')}
          className="w-auto"
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
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.data.data.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <Link href={`/tenants/${tenant.id}`} className="hover:underline">
                    {tenant.businessName}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{tenant.slug}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[tenant.status]}>{tenant.status.replace('_', ' ')}</Badge>
                  {tenant.suspensionReason && (
                    <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground" title={tenant.suspensionReason}>
                      {tenant.suspensionReason}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(tenant.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {canImpersonate && tenant.status !== 'DELETED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={impersonate.isPending}
                        onClick={() =>
                          impersonate.mutate(tenant.id, {
                            onSuccess: (result) => {
                              enterImpersonation(result.user, result.accessToken);
                              router.push('/');
                            },
                          })
                        }
                      >
                        Impersonate
                      </Button>
                    )}
                    {canSuspend && tenant.status !== 'SUSPENDED' && tenant.status !== 'DELETED' && (
                      <Button size="sm" variant="outline" onClick={() => setSuspendTarget(tenant)}>
                        Suspend
                      </Button>
                    )}
                    {canReactivate && tenant.status === 'SUSPENDED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={reactivate.isPending}
                        onClick={() => reactivate.mutate(tenant.id)}
                      >
                        Reactivate
                      </Button>
                    )}
                    {canDelete && tenant.status !== 'DELETED' && (
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(tenant)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tenants.data.data.length === 0 && <TableEmptyRow colSpan={5}>No tenants.</TableEmptyRow>}
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
