'use client';

import type { PlatformAlertSeverity, PlatformAlertStatus } from '@ems/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { usePermission } from '@/hooks/use-auth';
import {
  useAcknowledgeAlert,
  useInvestigateAlert,
  usePlatformAlerts,
  useResolveAlert,
} from '@/lib/queries/platform-alerts';

const SEVERITY_BADGE: Record<PlatformAlertSeverity, 'destructive' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'info',
};

const STATUS_BADGE: Record<PlatformAlertStatus, 'warning' | 'info' | 'default' | 'success'> = {
  OPEN: 'warning',
  ACKNOWLEDGED: 'info',
  INVESTIGATING: 'info',
  RESOLVED: 'success',
};

const TYPE_LABEL: Record<string, string> = {
  INFRA_DOWN: 'Infra down',
  QUEUE_FAILURE_SPIKE: 'Queue failure spike',
  PAYMENT_FAILURE: 'Payment failure',
  QUOTA_THRESHOLD: 'Quota threshold',
  SUPPORT_SLA_BREACH: 'SLA breach',
  TRIAL_EXPIRING: 'Trial expiring',
};

export default function AlertCenterPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading…</main>}>
      <AlertCenterPageContent />
    </Suspense>
  );
}

function AlertCenterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');

  const canUpdate = usePermission('platform.alert:update');
  const [status, setStatus] = useState<PlatformAlertStatus | ''>('OPEN');
  const [severity, setSeverity] = useState<PlatformAlertSeverity | ''>('');

  const alerts = usePlatformAlerts({ page, limit: 20, status: status || undefined, severity: severity || undefined });
  const acknowledge = useAcknowledgeAlert();
  const investigate = useInvestigateAlert();
  const resolve = useResolveAlert();

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    router.push(`/alerts?${params.toString()}`);
  }

  const handleExportAlertsCsv = () => {
    if (!alerts.data || alerts.data.data.length === 0) return;
    const headers = [
      'Alert ID',
      'Title',
      'Description',
      'Type',
      'Tenant ID',
      'Tenant Name',
      'Severity',
      'Status',
      'Last Seen At',
      'Created At',
    ];
    const rows = alerts.data.data.map((a) => [
      a.id,
      a.title,
      a.description || '—',
      TYPE_LABEL[a.type] ?? a.type,
      a.tenantId || '—',
      a.tenantName || 'Platform',
      a.severity,
      a.status,
      formatDate(a.lastSeenAt),
      formatDate(a.createdAt),
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `platform-alerts-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert center</h1>
          <p className="text-sm text-muted-foreground">
            Reconciled against live conditions on every load — infra, queues, payments, quotas, SLA, trials.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alerts.data && alerts.data.data.length > 0 && (
            <Button variant="secondary" onClick={handleExportAlertsCsv} className="gap-2">
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PlatformAlertStatus | '')}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
          </Select>
          <Select
            aria-label="Filter by severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as PlatformAlertSeverity | '')}
            className="w-auto"
          >
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </div>
      </div>

      {alerts.isError && <Alert variant="error">Could not load alerts.</Alert>}
      {(acknowledge.isError || investigate.isError || resolve.isError) && (
        <Alert variant="error">Could not update that alert.</Alert>
      )}

      {alerts.data && alerts.data.data.length === 0 && (
        <EmptyState title="No alerts" description="Nothing matches this filter right now." />
      )}

      {alerts.data && alerts.data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alert</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.data.data.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="max-w-xs">
                  <p className="font-medium">{a.title}</p>
                  {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{TYPE_LABEL[a.type] ?? a.type}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.tenantName ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={SEVERITY_BADGE[a.severity]}>{a.severity}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[a.status]}>{a.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(a.lastSeenAt)}</TableCell>
                <TableCell>
                  {canUpdate && a.status !== 'RESOLVED' && (
                    <div className="flex flex-wrap gap-2">
                      {a.status === 'OPEN' && (
                        <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(a.id)}>
                          Acknowledge
                        </Button>
                      )}
                      {a.status !== 'INVESTIGATING' && (
                        <Button size="sm" variant="outline" onClick={() => investigate.mutate(a.id)}>
                          Investigate
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => resolve.mutate(a.id)}>
                        Resolve
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {alerts.data.data.length === 0 && <TableEmptyRow colSpan={7}>No alerts.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      {alerts.data && (
        <Pagination
          page={alerts.data.meta.pagination.page}
          totalPages={alerts.data.meta.pagination.totalPages}
          hasNext={alerts.data.meta.pagination.hasNext}
          hasPrev={alerts.data.meta.pagination.hasPrev}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}
