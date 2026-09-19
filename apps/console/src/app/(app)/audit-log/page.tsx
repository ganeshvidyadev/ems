'use client';

import type { AuditActorType, AuditSeverity } from '@ems/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  Badge,
  EmptyState,
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
} from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { usePlatformAuditLogs } from '@/lib/queries/platform-audit-log';

const SEVERITY_BADGE: Record<AuditSeverity, 'default' | 'warning' | 'destructive'> = {
  INFO: 'default',
  WARNING: 'warning',
  CRITICAL: 'destructive',
};

export default function AuditLogPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading…</main>}>
      <AuditLogPageContent />
    </Suspense>
  );
}

function AuditLogPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');

  const [severity, setSeverity] = useState<AuditSeverity | ''>('');
  const [actorType, setActorType] = useState<AuditActorType | ''>('');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = usePlatformAuditLogs({
    page,
    limit: 30,
    severity: severity || undefined,
    actorType: actorType || undefined,
    q,
  });

  const handleExportAuditCsv = () => {
    const list = logs.data?.data ?? [];
    if (list.length === 0) return;
    const headers = ['Action', 'Actor Type', 'Actor Email', 'Severity', 'Entity Type', 'Entity ID', 'Correlation ID', 'Timestamp'];
    const rows = list.map((l) => [
      l.action,
      l.actorType,
      l.actorEmail ?? '',
      l.severity,
      l.entityType,
      l.entityId ?? '',
      l.correlationId ?? '',
      formatDate(l.createdAt),
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `audit-log-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    router.push(`/audit-log?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Every privileged mutation across the platform, newest first.</p>
        </div>
        {logs.data && logs.data.data.length > 0 && (
          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="size-4" /> Export CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search action or actor email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as AuditSeverity | '')} className="w-auto">
          <option value="">All severities</option>
          <option value="INFO">Info</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </Select>
        <Select value={actorType} onChange={(e) => setActorType(e.target.value as AuditActorType | '')} className="w-auto">
          <option value="">All actor types</option>
          <option value="PLATFORM_ADMIN">Platform admin</option>
          <option value="USER">User</option>
          <option value="CUSTOMER">Customer</option>
          <option value="SYSTEM">System</option>
          <option value="API_KEY">API key</option>
        </Select>
      </div>

      {logs.isError && <Alert variant="error">Could not load the audit log. Try refreshing the page.</Alert>}

      {logs.data && logs.data.data.length === 0 && (
        <EmptyState title="No entries" description="Nothing matches this filter yet." />
      )}

      {logs.data && logs.data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.data.data.map((log) => (
              <>
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{log.actorType.replace('_', ' ')}</span>
                    {log.actorEmail && <span className="ml-1 text-muted-foreground">{log.actorEmail}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs">
                    {log.entityType}
                    {log.entityId && <span className="ml-1 text-muted-foreground">#{log.entityId}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_BADGE[log.severity]}>{log.severity}</Badge>
                  </TableCell>
                </TableRow>
                {expanded === log.id && (
                  <TableRow key={`${log.id}-detail`}>
                    <TableCell colSpan={5} className="bg-muted/40">
                      <div className="grid gap-3 p-2 text-xs sm:grid-cols-2">
                        {log.beforeState && (
                          <div>
                            <p className="mb-1 font-medium">Before</p>
                            <pre className="max-h-48 overflow-auto rounded border bg-background p-2">
                              {JSON.stringify(log.beforeState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.afterState && (
                          <div>
                            <p className="mb-1 font-medium">After</p>
                            <pre className="max-h-48 overflow-auto rounded border bg-background p-2">
                              {JSON.stringify(log.afterState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!log.beforeState && !log.afterState && (
                          <p className="text-muted-foreground">No before/after state recorded for this entry.</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {logs.data.data.length === 0 && <TableEmptyRow colSpan={5}>No entries.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      {logs.data && (
        <Pagination
          page={logs.data.meta.pagination.page}
          totalPages={logs.data.meta.pagination.totalPages}
          hasNext={logs.data.meta.pagination.hasNext}
          hasPrev={logs.data.meta.pagination.hasPrev}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}
