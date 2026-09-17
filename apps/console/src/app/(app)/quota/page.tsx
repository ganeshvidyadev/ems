'use client';

import type { PlanLimitKey } from '@ems/contracts';
import { useState } from 'react';
import { Alert, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/primitives';
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

/**
 * Central visibility into tenant consumption against their plan's own limits — the
 * console-wide "which tenants are approaching quota" view the master brief asks for.
 * `used / limit / percentage` only; plan limits themselves stay entirely server-driven
 * (`PlatformQuotaService.overview()`), nothing here is hardcoded.
 *
 * Quota *overrides* (temporary limit, reason, expiry, createdBy, audited) are
 * deliberately not built in this pass — this page is read-only visibility, which is
 * the more clearly-scoped half of the ask; a write path that changes what a tenant is
 * actually allowed to do is real, separate work.
 */
export default function PlatformQuotaPage() {
  const quota = usePlatformQuota();
  const [onlyNearLimit, setOnlyNearLimit] = useState(false);

  const tenants = quota.data?.tenants ?? [];
  const visible = onlyNearLimit
    ? tenants.filter((t) => t.quotas.some((q) => q.percentage !== null && q.percentage >= WARNING_THRESHOLD))
    : tenants;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage &amp; quotas</h1>
          <p className="text-sm text-muted-foreground">
            Every tenant with a live plan, against their own plan&apos;s limits.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyNearLimit}
            onChange={(e) => setOnlyNearLimit(e.target.checked)}
          />
          Only show tenants near a limit (≥{WARNING_THRESHOLD}%)
        </label>
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
