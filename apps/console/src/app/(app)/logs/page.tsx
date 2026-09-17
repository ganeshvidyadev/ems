'use client';

import { useState } from 'react';
import { Alert, Card, CardBody, EmptyState, Field, Input, Select } from '@/components/ui/primitives';
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
  const [limit, setLimit] = useState(50);
  const logs = useLogCollection(collection, tenantId, limit);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log explorer</h1>
        <p className="text-sm text-muted-foreground">
          Every tenant&apos;s logs, newest first — for debugging and support investigations.
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
          <Field label="Tenant id" htmlFor="tenantId" hint="Internal id — optional">
            <Input
              id="tenantId"
              inputMode="numeric"
              placeholder="All tenants"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-32"
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
        <EmptyState title="No documents" description="Nothing matches this collection and filter yet." />
      )}

      {logs.data && logs.data.documents.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{logs.data.count} most recent</p>
          <div className="space-y-2">
            {logs.data.documents.map((doc, index) => (
              <Card key={index}>
                <CardBody className="p-0">
                  <pre className="max-h-64 overflow-auto p-4 text-xs">{JSON.stringify(doc, null, 2)}</pre>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
