'use client';

import { useState } from 'react';
import { Download, FileJson } from 'lucide-react';
import { Alert, Button, Card, CardBody, EmptyState, Field, Input, Select } from '@/components/ui/primitives';
import { downloadJsonFile, generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { LOG_COLLECTIONS, useLogCollection, type LogCollection } from '@/lib/queries/log-explorer';

const COLLECTION_LABEL: Record<LogCollection, string> = {
  api_logs: 'API requests',
  error_logs: 'Errors',
  auth_logs: 'Authentication',
  activity_logs: 'Activity',
  webhook_logs: 'Webhooks',
  job_logs: 'Background jobs',
  third_party_logs: 'Third-party calls',
  storefront_events: 'Storefront events',
  search_queries: 'Search queries',
};

/**
 * Cross-tenant log browser over the Mongo collections `LogBufferService`
 * writes to. Documents vary in shape by collection, so each is rendered as
 * raw JSON rather than a typed table — a generic reader over nine different
 * schemas has nothing else in common to build columns from.
 */
export default function LogExplorerPage() {
  const [collection, setCollection] = useState<LogCollection>('error_logs');
  const [tenantId, setTenantId] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const logs = useLogCollection(collection, tenantId, limit, q);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log explorer</h1>
        <p className="text-sm text-muted-foreground">
          Platform and tenant event streams, error logs, and activity telemetry — for diagnostics and audits.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="Collection" htmlFor="collection">
            <Select
              id="collection"
              value={collection}
              onChange={(e) => setCollection(e.target.value as LogCollection)}
            >
              {LOG_COLLECTIONS.map((c) => (
                <option key={c} value={c}>
                  {COLLECTION_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tenant ID or Slug" htmlFor="tenantId" hint="Public ID, slug or internal ID">
            <Input
              id="tenantId"
              placeholder="All tenants"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-44"
            />
          </Field>
          <Field label="Search" htmlFor="searchQuery" hint="Path, error message, ip, etc.">
            <Input
              id="searchQuery"
              placeholder="Filter logs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-48"
            />
          </Field>
          <Field label="Limit" htmlFor="limit">
            <Select id="limit" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} className="w-24">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      {logs.isError && <Alert variant="error">Could not load that collection. Try refreshing the page.</Alert>}

      {logs.data && logs.data.documents.length === 0 && (
        <EmptyState title="No documents found" description="Nothing matches this collection, tenant, and search filter." />
      )}

      {logs.data && logs.data.documents.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Showing {logs.data.count} recent documents</span>
              <span>Collection: <strong className="text-foreground">{COLLECTION_LABEL[collection]}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  downloadJsonFile(
                    `logs-${collection}-${tenantId || 'all'}-${new Date().toISOString().slice(0, 10)}.json`,
                    logs.data?.documents ?? []
                  );
                }}
              >
                <FileJson className="size-3.5" />
                Download JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const docs = logs.data?.documents ?? [];
                  if (docs.length === 0) return;
                  const keys = Array.from(new Set(docs.flatMap((d) => Object.keys(d))));
                  const rows = docs.map((d) =>
                    keys.map((k) => {
                      const val = d[k];
                      return typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                    })
                  );
                  downloadCsvFile(
                    generateCsvText(keys, rows),
                    `logs-${collection}-${tenantId || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
                  );
                }}
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {logs.data.documents.map((doc, index) => {
              const timestamp = (doc['timestamp'] || doc['createdAt'] || doc['time']) as string | undefined;
              const status = doc['status'] || doc['statusCode'] || doc['event'] || doc['level'];
              const pathOrAction = doc['path'] || doc['action'] || doc['method'] || doc['error'] || doc['name'];

              return (
                <Card key={index}>
                  <CardBody className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        {Boolean(status) && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                            {String(status)}
                          </span>
                        )}
                        {Boolean(pathOrAction) && (
                          <span className="font-semibold text-foreground">{String(pathOrAction)}</span>
                        )}
                        {Boolean(doc['tenantId']) && (
                          <span className="text-muted-foreground">Tenant #{String(doc['tenantId'])}</span>
                        )}
                      </div>
                      {Boolean(timestamp) && (
                        <span className="text-muted-foreground">{new Date(String(timestamp)).toLocaleString()}</span>
                      )}

                    </div>
                    <pre className="max-h-64 overflow-auto p-2 text-xs text-muted-foreground font-mono">
                      {JSON.stringify(doc, null, 2)}
                    </pre>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

