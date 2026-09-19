'use client';

import type { PlanLimitKey } from '@ems/contracts';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Alert, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/primitives';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { usePlatformQuota } from '@/lib/queries/platform-quota';
import { cn } from '@/lib/utils';

const LIMIT_LABEL: Record<PlanLimitKey, string> = {
  max_products: 'Products',
  max_orders_per_month: 'Orders (this month)',
  max_staff_users: 'Staff users',
  max_storage_mb: 'Storage (MB)',
  max_stores: 'Stores',
  max_warehouses: 'Warehouses',
  max_channels: 'Channels',
  max_custom_domains: 'Custom domains',
};

const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 100;

function barColor(percentage: number | null): string {
  if (percentage === null) return 'bg-muted-foreground/30';
  if (percentage >= CRITICAL_THRESHOLD) return 'bg-destructive';
  if (percentage >= WARNING_THRESHOLD) return 'bg-warning';
  return 'bg-success';
}

export default function PlatformQuotaPage() {
  const quota = usePlatformQuota();
  const [onlyNearLimit, setOnlyNearLimit] = useState(false);

  const tenants = quota.data?.tenants ?? [];
  const visible = onlyNearLimit
    ? tenants.filter((t) => t.quotas.some((q) => q.percentage !== null && q.percentage >= WARNING_THRESHOLD))
    : tenants;

  const handleExportQuotaCsv = () => {
    if (visible.length === 0) return;
    const headers = ['Tenant Name', 'Tenant ID', 'Plan Code', 'Resource', 'Used', 'Limit', 'Usage (%)'];
    const rows = visible.flatMap((t) =>
      t.quotas.map((q) => [
        t.tenantName,
        t.tenantId,
        t.planCode,
        LIMIT_LABEL[q.limitKey] ?? q.limitKey,
        String(q.current),
        q.max === -1 ? 'Unlimited' : String(q.max),
        q.percentage !== null ? `${q.percentage}%` : 'N/A',
      ]),
    );
    downloadCsvFile(generateCsvText(headers, rows), `quota-usage-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage &amp; quotas</h1>
          <p className="text-sm text-muted-foreground">
            Every tenant with a live plan, against their own plan&apos;s limits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tenants.length > 0 && (
            <button
              type="button"
              onClick={handleExportQuotaCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={onlyNearLimit}
              onChange={(e) => setOnlyNearLimit(e.target.checked)}
            />
            Only show near limit (≥{WARNING_THRESHOLD}%)
          </label>
        </div>
      </div>

      {quota.isError && <Alert variant="error">Could not load quota usage.</Alert>}

      {quota.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {quota.data && tenants.length === 0 && (
        <EmptyState
          title="No tenants have a live plan"
          description="Quota usage only applies to a tenant with an active subscription."
        />
      )}

      {quota.data && tenants.length > 0 && visible.length === 0 && (
        <EmptyState title="No tenants near a limit" description="Nobody is at or above 80% of any quota right now." />
      )}

      <div className="space-y-4">
        {visible.map((tenant) => (
          <Card key={tenant.tenantId}>
            <CardHeader title={tenant.tenantName} description={`Plan: ${tenant.planCode}`} />
            <CardBody className="space-y-3">
              {tenant.quotas.map((row) => (
                <div key={row.limitKey}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{LIMIT_LABEL[row.limitKey]}</span>
                    <span className="tabular text-muted-foreground">
                      {row.max === -1 ? `${row.current} / Unlimited` : `${row.current} / ${row.max}`}
                      {row.percentage !== null && ` (${row.percentage}%)`}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all', barColor(row.percentage))}
                      style={{ width: `${Math.min(100, row.percentage ?? 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </main>
  );
}
