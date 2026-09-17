'use client';

import type { PlatformDunningItem } from '@ems/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { formatDate, formatMoney } from '@/lib/utils';
import { usePlatformDunning } from '@/lib/queries/platform-dunning';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'default'> = {
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  SUSPENDED: 'destructive',
  TRIALING: 'info',
  EXPIRED: 'default',
  CANCELLED: 'default',
};

export default function PlatformDunningPage() {
  const dunning = usePlatformDunning();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState(false);

  const items = useMemo(() => dunning.data?.items ?? [], [dunning.data?.items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    return items.filter((item: PlatformDunningItem) => {
      if (onlyExpiringSoon) {
        if (!item.gracePeriodEndsAt) return false;
        const diff = new Date(item.gracePeriodEndsAt).getTime() - now;
        if (diff < 0 || diff > fortyEightHoursMs) return false;
      }
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesTenant =
          item.tenantName.toLowerCase().includes(query) || item.tenantId.toLowerCase().includes(query);
        const matchesPlan = item.planName.toLowerCase().includes(query) || item.planCode.toLowerCase().includes(query);
        const matchesInvoice = item.overdueInvoiceNumber?.toLowerCase().includes(query) ?? false;
        if (!matchesTenant && !matchesPlan && !matchesInvoice) {
          return false;
        }
      }
      return true;
    });
  }, [items, onlyExpiringSoon, statusFilter, search]);

  const totalAtRisk = dunning.data?.totalAtRiskCount ?? 0;
  const expiringSoon = dunning.data?.expiringGracePeriodSoon ?? 0;
  const totalItems = dunning.data?.total ?? 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dunning &amp; collections</h1>
          <p className="text-sm text-muted-foreground">
            Subscriptions with failed collections, retry progressions, and impending grace period expirations.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader title="Past due subscriptions" />
          <CardBody>
            <p className="text-2xl font-semibold tabular text-warning">{totalAtRisk}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Grace period expiring (≤ 48h)" />
          <CardBody>
            <p className="text-2xl font-semibold tabular text-destructive">{expiringSoon}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Total at risk" />
          <CardBody>
            <p className="text-2xl font-semibold tabular">{totalItems}</p>
          </CardBody>
        </Card>
      </div>

      {/* Filters and search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search tenant, plan, or invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72"
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="PAST_DUE">Past Due</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ACTIVE">Active (With Open Invoice)</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyExpiringSoon}
            onChange={(e) => setOnlyExpiringSoon(e.target.checked)}
          />
          Grace period expiring within 48h
        </label>
      </div>

      {dunning.isError && <Alert variant="error">Could not load dunning overview.</Alert>}

      {dunning.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {dunning.data && items.length === 0 && (
        <EmptyState
          title="No subscriptions in dunning"
          description="All tenant subscriptions are in good standing with no overdue collection issues."
        />
      )}

      {dunning.data && items.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No matching subscriptions"
          description="No dunning record matches the applied filter criteria."
        />
      )}

      {filtered.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dunning retries</TableHead>
                  <TableHead>Grace period ends</TableHead>
                  <TableHead>Overdue invoice</TableHead>
                  <TableHead>Last failure</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/tenants/${item.tenantId}`}
                        className="font-medium hover:underline text-primary"
                      >
                        {item.tenantName}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{item.tenantId}</p>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-xs">{item.planName}</span>
                      <p className="text-xs text-muted-foreground font-mono">{item.planCode}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[item.status] ?? 'default'}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="tabular text-xs">
                      <span className={item.dunningAttempts >= 3 ? 'text-destructive font-semibold' : ''}>
                        {item.dunningAttempts} / 4
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.gracePeriodEndsAt ? (
                        <span className="text-destructive font-medium">{formatDate(item.gracePeriodEndsAt)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.overdueInvoiceNumber ? (
                        <div>
                          <Link href="/billing" className="font-mono text-primary hover:underline">
                            {item.overdueInvoiceNumber}
                          </Link>
                          {item.amountDueMinor && item.currency && (
                            <p className="tabular font-medium text-destructive">
                              {formatMoney({ amountMinor: item.amountDueMinor, currency: item.currency })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(item.lastPaymentFailedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/tenants/${item.tenantId}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Tenant 360 &rarr;
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableEmptyRow colSpan={8}>No dunning records found.</TableEmptyRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
