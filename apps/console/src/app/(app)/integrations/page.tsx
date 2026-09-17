'use client';

import type { PlatformChannelConnection } from '@ems/contracts';
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
import { formatDate } from '@/lib/utils';
import { usePlatformIntegrations } from '@/lib/queries/platform-integrations';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'default'> = {
  CONNECTED: 'success',
  CONNECTING: 'info',
  DISCONNECTED: 'default',
  ERROR: 'destructive',
  TOKEN_EXPIRED: 'warning',
  SUSPENDED: 'destructive',
};

export default function PlatformIntegrationsPage() {
  const integrations = usePlatformIntegrations();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);

  const connections = useMemo(
    () => integrations.data?.channelConnections ?? [],
    [integrations.data?.channelConnections],
  );

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const c of connections) {
      if (c.type) types.add(c.type);
    }
    return Array.from(types).sort();
  }, [connections]);

  const filtered = useMemo(() => {
    return connections.filter((item: PlatformChannelConnection) => {
      if (onlyErrors && item.status !== 'ERROR' && !item.lastError) {
        return false;
      }
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (typeFilter && item.type !== typeFilter) {
        return false;
      }
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesTenant = item.tenantName.toLowerCase().includes(query) || item.tenantId.toLowerCase().includes(query);
        const matchesType = item.type.toLowerCase().includes(query);
        if (!matchesTenant && !matchesType) {
          return false;
        }
      }
      return true;
    });
  }, [connections, onlyErrors, statusFilter, typeFilter, search]);

  const totalCount = connections.length;
  const connectedCount = connections.filter((c) => c.status === 'CONNECTED').length;
  const errorCount = connections.filter((c) => c.status === 'ERROR' || c.lastError).length;
  const expiringCount = connections.filter((c) => {
    if (!c.tokenExpiresAt) return false;
    const expires = new Date(c.tokenExpiresAt).getTime();
    return expires <= Date.now() + 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations &amp; channels</h1>
          <p className="text-sm text-muted-foreground">
            Cross-tenant visibility into marketplace connections, sync health, and token status.
          </p>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader title="Total connections" />
          <CardBody>
            <p className="text-2xl font-semibold tabular">{totalCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Healthy" />
          <CardBody>
            <p className="text-2xl font-semibold tabular text-success">{connectedCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Errors / issues" />
          <CardBody>
            <p className="text-2xl font-semibold tabular text-destructive">{errorCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tokens expiring (7d)" />
          <CardBody>
            <p className="text-2xl font-semibold tabular text-warning">{expiringCount}</p>
          </CardBody>
        </Card>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search tenant or channel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="CONNECTED">Connected</option>
            <option value="CONNECTING">Connecting</option>
            <option value="DISCONNECTED">Disconnected</option>
            <option value="ERROR">Error</option>
            <option value="TOKEN_EXPIRED">Token Expired</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
          {availableTypes.length > 0 && (
            <Select
              aria-label="Filter by channel type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-auto"
            >
              <option value="">All channels</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyErrors}
            onChange={(e) => setOnlyErrors(e.target.checked)}
          />
          Only show errors
        </label>
      </div>

      {integrations.isError && <Alert variant="error">Could not load platform integrations.</Alert>}

      {integrations.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {integrations.data && connections.length === 0 && (
        <EmptyState
          title="No marketplace channel connections"
          description="None of the tenants have configured marketplace channels yet."
        />
      )}

      {integrations.data && connections.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No matching connections"
          description="No marketplace channel connection matches your filter criteria."
        />
      )}

      {filtered.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Channel type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead>Token expiry</TableHead>
                  <TableHead>Error / detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.tenantName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.tenantId}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[item.status] ?? 'default'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(item.lastSyncAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(item.tokenExpiresAt)}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs">
                      {item.lastError ? (
                        <span className="text-destructive font-mono break-all">{item.lastError}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableEmptyRow colSpan={6}>No connections found.</TableEmptyRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
