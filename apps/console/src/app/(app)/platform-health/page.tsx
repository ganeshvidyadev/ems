'use client';

import type { HealthStatus } from '@ems/contracts';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePlatformHealth } from '@/lib/queries/platform-health';

const STATUS_VARIANT: Record<HealthStatus, 'success' | 'warning' | 'destructive' | 'default'> = {
  HEALTHY: 'success',
  DEGRADED: 'warning',
  DOWN: 'destructive',
  UNKNOWN: 'default',
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  DOWN: 'Down',
  UNKNOWN: 'Unknown',
};

function StatusBadge({ status }: { status: HealthStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

const INFRA_LABEL: Record<string, string> = {
  mysql: 'MySQL',
  'redis-cache': 'Redis (cache)',
  'redis-queue': 'Redis (queue)',
  mongo: 'MongoDB',
};

const CATEGORY_LABEL: Record<string, string> = {
  payment: 'Payment gateways',
  shipping: 'Shipping carriers',
  dns: 'DNS providers',
  marketplace: 'Marketplace channels',
  email: 'Email (SMTP)',
};

export default function PlatformHealthPage() {
  const health = usePlatformHealth();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform health</h1>
        <p className="text-sm text-muted-foreground">
          Infra reachability, integration configuration, and recent-failure signals — refreshes every 30s.
        </p>
      </div>

      {health.isError && <Alert variant="error">Could not load platform health.</Alert>}

      <Card>
        <CardHeader title="Infrastructure" description="MySQL, MongoDB and both Redis instances." />
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dependency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.data?.infra.map((dep) => (
                <TableRow key={dep.name}>
                  <TableCell>{INFRA_LABEL[dep.name] ?? dep.name}</TableCell>
                  <TableCell><StatusBadge status={dep.status} /></TableCell>
                  <TableCell className="tabular">{dep.latencyMs != null ? `${dep.latencyMs}ms` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{dep.detail ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Integrations"
          description="Configuration presence + recent job-failure counts, not a live third-party ping."
        />
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Configured</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.data?.integrations.map((integration) => (
                <TableRow key={integration.category}>
                  <TableCell>{CATEGORY_LABEL[integration.category] ?? integration.category}</TableCell>
                  <TableCell><StatusBadge status={integration.status} /></TableCell>
                  <TableCell className="text-muted-foreground">
                    {integration.configuredProviders.length ? integration.configuredProviders.join(', ') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{integration.detail ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent indicators" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Failed jobs (retained)</p>
            <p className="text-2xl font-semibold tabular">{health.data?.recent.failedJobsTotal ?? '—'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Error logs (last hour)</p>
            <p className="text-2xl font-semibold tabular">{health.data?.recent.errorLogsLastHour ?? '—'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Log pipeline dropped</p>
            <p className="text-2xl font-semibold tabular">{health.data?.recent.logPipeline.dropped ?? '—'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Log pipeline failed flushes</p>
            <p className="text-2xl font-semibold tabular">{health.data?.recent.logPipeline.failedFlushes ?? '—'}</p>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
