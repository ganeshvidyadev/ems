'use client';

import Link from 'next/link';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { formatMoney } from '@/lib/utils';
import { usePlatformAnalytics } from '@/lib/queries/platform-analytics';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  PROVISIONING: 'Provisioning',
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  PAST_DUE: 'Past due',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};

export default function PlatformAnalyticsPage() {
  const analytics = usePlatformAnalytics();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Platform-wide tenant, revenue and operational metrics.</p>
      </div>

      {analytics.isError && <Alert variant="error">Could not load analytics. Try refreshing the page.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tenants" value={analytics.data?.totalTenants ?? '—'} loading={analytics.isLoading} />
        <StatCard
          label="New tenants (30d)"
          value={analytics.data?.newTenantsLast30Days ?? '—'}
          loading={analytics.isLoading}
        />
        <StatCard
          label="Active subscriptions"
          value={analytics.data?.activeSubscriptions ?? '—'}
          loading={analytics.isLoading}
        />
        {analytics.data?.mrr.length ? (
          analytics.data.mrr.map((m) => (
            <StatCard
              key={m.currency}
              label={`MRR (${m.currency})`}
              value={formatMoney({ amountMinor: m.mrrMinor, currency: m.currency })}
              hint="Yearly plans normalized to a monthly figure"
            />
          ))
        ) : (
          <StatCard label="MRR" value={analytics.isLoading ? '—' : '₹0.00'} loading={analytics.isLoading} />
        )}
        <StatCard
          label="Open support tickets"
          value={analytics.data?.openSupportTickets ?? '—'}
          loading={analytics.isLoading}
          hint={analytics.data && analytics.data.openSupportTickets > 0 ? 'Needs attention' : undefined}
        />
        <StatCard
          label="Pending settlements"
          value={analytics.data?.pendingSettlements ?? '—'}
          loading={analytics.isLoading}
          hint={analytics.data && analytics.data.pendingSettlements > 0 ? 'Awaiting approval' : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tenants by status" />
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.data?.tenantsByStatus.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>{STATUS_LABEL[row.status] ?? row.status}</TableCell>
                    <TableCell className="tabular">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Plan distribution" action={<Link href="/plans" className="text-xs text-primary hover:underline">Manage plans</Link>} />
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Subscribers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.data?.planDistribution.map((row) => (
                  <TableRow key={row.planCode}>
                    <TableCell>{row.planName}</TableCell>
                    <TableCell className="tabular">{row.subscriberCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
