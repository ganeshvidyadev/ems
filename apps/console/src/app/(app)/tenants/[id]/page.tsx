'use client';

import type { TenantStatus } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Skeleton,
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
import { formatDate, formatMoney } from '@/lib/utils';
import {
  useImpersonateTenant,
  usePlatformTenant,
  usePlatformTenantOverview,
  useReactivateTenant,
  useSuspendTenant,
} from '@/lib/queries/platform-tenants';
import { useExportTenantData } from '@/lib/queries/tenant-export';
import { usePlatformInvoices } from '@/lib/queries/platform-billing';
import { useSupportTickets } from '@/lib/queries/support-tickets';
import { usePlatformAuditLogs } from '@/lib/queries/platform-audit-log';

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

const TABS = ['overview', 'billing', 'support', 'audit'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  billing: 'Billing',
  support: 'Support',
  audit: 'Audit',
};

/**
 * Tenant 360 — the operational view a Super Admin actually needs, not just a
 * name and a status. Billing/Support/Audit tabs reuse the same list endpoints
 * their own top-level pages use, filtered to this tenant, rather than
 * duplicating that logic here.
 *
 * Not included: Stores/Users list tabs (no cross-tenant list endpoint exists
 * for either yet — the Overview tab shows their *counts*, which the same
 * aggregation already computes, but not the rows), a Logs tab (the log
 * explorer's `tenantId` filter takes the *internal* tenant id, which this
 * console never receives — wiring that would mean either leaking an internal
 * id to the frontend or giving a Mongo-only controller a new MySQL
 * dependency just to translate it, neither of which is a small change), and
 * an Integrations tab (no cross-tenant channel-connection list endpoint
 * exists). Building any of those is real, separate backend work.
 */
export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { enterImpersonation } = useAuth();

  const canSuspend = usePermission('platform.tenant:suspend');
  const canReactivate = usePermission('platform.tenant:reactivate');
  const canImpersonate = usePermission('platform.tenant:impersonate');
  const canExport = usePermission('platform.tenant:export');

  const tenant = usePlatformTenant(id);
  const overview = usePlatformTenantOverview(id);
  const suspend = useSuspendTenant();
  const reactivate = useReactivateTenant();
  const impersonate = useImpersonateTenant();
  const exportData = useExportTenantData();

  const [tab, setTab] = useState<Tab>('overview');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');

  if (tenant.isError) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <Alert variant="error">Could not load this tenant.</Alert>
      </main>
    );
  }
  if (!tenant.data) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  const t = tenant.data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t.businessName}</h1>
            <Badge variant={STATUS_BADGE[t.status]}>{t.status.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t.slug} · Created {formatDate(t.createdAt)}
            {overview.data?.planName && ` · ${overview.data.planName} plan`}
            {overview.data?.subscriptionStatus && ` (${overview.data.subscriptionStatus.replace('_', ' ')})`}
          </p>
          {overview.data && (overview.data.ownerName || overview.data.ownerEmail) && (
            <p className="text-sm text-muted-foreground">
              Owner: {overview.data.ownerName} {overview.data.ownerEmail && `<${overview.data.ownerEmail}>`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canImpersonate && t.status !== 'DELETED' && (
            <Button variant="outline" onClick={() => setImpersonateOpen(true)}>
              Impersonate
            </Button>
          )}
          {canExport && (
            <Button variant="outline" loading={exportData.isPending} onClick={() => exportData.mutate(t.id)}>
              Export data
            </Button>
          )}
          {canSuspend && t.status !== 'SUSPENDED' && t.status !== 'DELETED' && (
            <Button variant="outline" onClick={() => setSuspendOpen(true)}>
              Suspend
            </Button>
          )}
          {canReactivate && t.status === 'SUSPENDED' && (
            <Button variant="outline" loading={reactivate.isPending} onClick={() => reactivate.mutate(t.id)}>
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {exportData.isSuccess && <Alert variant="success">Export job started — check Tenant data export for status.</Alert>}
      {exportData.isError && <Alert variant="error">Could not start the export job.</Alert>}
      {impersonate.isError && <Alert variant="error">Could not start impersonation.</Alert>}
      {suspend.isError && <Alert variant="error">Could not suspend this tenant.</Alert>}
      {reactivate.isError && <Alert variant="error">Could not reactivate this tenant.</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Stores" value={overview.data?.storesCount} loading={overview.isLoading} />
        <Metric label="Users" value={overview.data?.usersCount} loading={overview.isLoading} />
        <Metric label="Orders (30d)" value={overview.data?.ordersLast30Days} loading={overview.isLoading} />
        <Metric
          label="Open tickets"
          value={overview.data?.openSupportTickets}
          loading={overview.isLoading}
          warn={Boolean(overview.data && overview.data.openSupportTickets > 0)}
        />
        <Metric
          label="Failed payments (30d)"
          value={overview.data?.failedPaymentsLast30Days}
          loading={overview.isLoading}
          warn={Boolean(overview.data && overview.data.failedPaymentsLast30Days > 0)}
        />
        <Metric
          label="Last order"
          value={overview.data?.lastOrderAt ? formatDate(overview.data.lastOrderAt) : 'None yet'}
          loading={overview.isLoading}
        />
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab tenantId={t.id} />}
      {tab === 'billing' && <BillingTab tenantId={t.id} />}
      {tab === 'support' && <SupportTab tenantId={t.id} />}
      {tab === 'audit' && <AuditTab tenantId={t.id} />}

      <Dialog
        open={suspendOpen}
        onOpenChange={(open) => {
          setSuspendOpen(open);
          if (!open) setSuspendReason('');
        }}
        title="Suspend this tenant?"
        description={`${t.businessName} loses console and storefront access immediately.`}
      >
        <div className="space-y-4">
          <Field label="Reason" htmlFor="suspendReason" hint="Shown in the tenant list and audit log">
            <Textarea id="suspendReason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>
              Never mind
            </Button>
            <Button
              variant="destructive"
              loading={suspend.isPending}
              disabled={suspendReason.trim().length < 5}
              onClick={() =>
                suspend.mutate(
                  { id: t.id, reason: suspendReason.trim(), mode: 'FULL', notifyOwner: true },
                  { onSuccess: () => setSuspendOpen(false) },
                )
              }
            >
              Suspend
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={impersonateOpen}
        onOpenChange={(open) => {
          setImpersonateOpen(open);
          if (!open) setImpersonateReason('');
        }}
        title="Impersonate this tenant?"
        description={`You'll see the console as ${t.businessName}'s owner for up to 15 minutes. This is recorded in the audit log.`}
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
            <Button variant="outline" onClick={() => setImpersonateOpen(false)}>
              Never mind
            </Button>
            <Button
              loading={impersonate.isPending}
              disabled={impersonateReason.trim().length < 5}
              onClick={() =>
                impersonate.mutate(
                  { id: t.id, reason: impersonateReason.trim() },
                  {
                    onSuccess: (result) => {
                      enterImpersonation(result.user, result.accessToken);
                      router.push('/');
                    },
                  },
                )
              }
            >
              Impersonate
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}

function Metric({
  label,
  value,
  loading,
  warn,
}: {
  label: string;
  value: string | number | undefined;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardBody className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <p className={`text-xl font-semibold tabular ${warn ? 'text-warning-foreground' : ''}`}>{value ?? '—'}</p>
        )}
      </CardBody>
    </Card>
  );
}

function OverviewTab({ tenantId }: { tenantId: string }) {
  const overview = usePlatformTenantOverview(tenantId);
  if (overview.isError) return <Alert variant="error">Could not load the operational snapshot.</Alert>;
  if (!overview.data) return <Skeleton className="h-40 w-full" />;

  const rows: [string, string][] = [
    ['Plan', overview.data.planName ? `${overview.data.planName} (${overview.data.planCode})` : '—'],
    ['Subscription status', overview.data.subscriptionStatus ?? '—'],
    ['Billing cycle', overview.data.billingCycle ?? '—'],
    ['Owner', overview.data.ownerEmail ?? '—'],
  ];

  return (
    <Card>
      <CardHeader title="Subscription" />
      <CardBody className="p-0">
        <Table>
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="w-48 text-muted-foreground">{label}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function BillingTab({ tenantId }: { tenantId: string }) {
  const invoices = usePlatformInvoices({ page: 1, limit: 10, tenantId });
  if (invoices.isError) return <Alert variant="error">Could not load invoices.</Alert>;

  return (
    <Card>
      <CardHeader title="Recent invoices" />
      <CardBody className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.data?.data.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                </TableCell>
                <TableCell className="tabular">{formatMoney({ amountMinor: inv.totalMinor, currency: inv.currency })}</TableCell>
                <TableCell>
                  <Badge>{inv.status.replace('_', ' ')}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {invoices.data?.data.length === 0 && <TableEmptyRow colSpan={4}>No invoices yet.</TableEmptyRow>}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function SupportTab({ tenantId }: { tenantId: string }) {
  const tickets = useSupportTickets(undefined, tenantId);
  if (tickets.isError) return <Alert variant="error">Could not load support tickets.</Alert>;

  return (
    <Card>
      <CardHeader title="Support tickets" />
      <CardBody className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.data?.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>{ticket.subject}</TableCell>
                <TableCell>{ticket.priority}</TableCell>
                <TableCell>
                  <Badge variant={ticket.isOverdue ? 'destructive' : 'default'}>
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</TableCell>
              </TableRow>
            ))}
            {tickets.data?.length === 0 && <TableEmptyRow colSpan={4}>No tickets yet.</TableEmptyRow>}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function AuditTab({ tenantId }: { tenantId: string }) {
  const logs = usePlatformAuditLogs({ page: 1, limit: 20, tenantId });
  if (logs.isError) return <Alert variant="error">Could not load the audit trail.</Alert>;

  return (
    <Card>
      <CardHeader title="Recent audit events" description="Actions a platform admin took on this tenant." />
      <CardBody className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.data?.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.action}</TableCell>
                <TableCell>{row.actorEmail ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={row.severity === 'CRITICAL' ? 'destructive' : row.severity === 'WARNING' ? 'warning' : 'default'}>
                    {row.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
              </TableRow>
            ))}
            {logs.data?.data.length === 0 && <TableEmptyRow colSpan={4}>No audit events for this tenant yet.</TableEmptyRow>}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
