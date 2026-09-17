'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { usePlatformCompanies, useExportTenantData, useJob } from '@/lib/queries/tenant-export';

/**
 * Data-portability export — a downloadable archive of every row one tenant
 * owns, for a data-portability request or a support investigation.
 *
 * Runs on the same async job queue as bulk import/export (`GET console/jobs/:id`),
 * so this page enqueues, then polls, one job per company at a time.
 */
export default function TenantExportPage() {
  const canExport = usePermission('platform.tenant:export');
  const companies = usePlatformCompanies();
  const exportTenant = useExportTenantData();
  const [jobByCompany, setJobByCompany] = useState<Record<string, string>>({});

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenant data export</h1>
        <p className="text-sm text-muted-foreground">
          Export every row a company owns as a downloadable archive — for a data-portability request or a support investigation.
        </p>
      </div>

      {!canExport && <Alert variant="warning">You don&apos;t have permission to export tenant data.</Alert>}
      {companies.isError && <Alert variant="error">Could not load companies. Try refreshing the page.</Alert>}
      {exportTenant.isError && <Alert variant="error">Could not start that export. Try again.</Alert>}

      {companies.data && companies.data.length === 0 && (
        <EmptyState title="No companies yet" description="Nothing to export until a company exists." />
      )}

      {canExport && (
        <div className="space-y-3">
          {companies.data?.map((company) => (
            <Card key={company.id}>
              <CardHeader title={company.name} description={company.slug} />
              <CardBody>
                <ExportRow
                  jobId={jobByCompany[company.id]}
                  onExport={() =>
                    exportTenant.mutate(company.id, {
                      onSuccess: (result) => setJobByCompany((prev) => ({ ...prev, [company.id]: result.jobId })),
                    })
                  }
                  pending={exportTenant.isPending}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function ExportRow({
  jobId,
  onExport,
  pending,
}: {
  jobId: string | undefined;
  onExport: () => void;
  pending: boolean;
}) {
  const job = useJob(jobId);

  if (!jobId) {
    return (
      <Button size="sm" variant="outline" loading={pending} onClick={onExport}>
        Export data
      </Button>
    );
  }

  if (!job.data || job.data.status === 'QUEUED' || job.data.status === 'RUNNING') {
    return (
      <p className="text-sm text-muted-foreground">
        Exporting… {job.data ? `${job.data.progressPercent}%` : ''}
      </p>
    );
  }

  if (job.data.status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-3">
        <Badge variant="success">Ready</Badge>
        <a href={job.data.outputUrl ?? '#'} className="text-sm text-primary hover:underline">
          Download export
        </a>
      </div>
    );
  }

  if (job.data.status === 'COMPLETED_WITH_ERRORS') {
    return (
      <div className="flex items-center gap-3">
        <Badge variant="warning">Completed with errors</Badge>
        {job.data.outputUrl && (
          <a href={job.data.outputUrl} className="text-sm text-primary hover:underline">
            Download export
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Badge variant="destructive">{job.data.status}</Badge>
      <span className="text-sm text-muted-foreground">{job.data.errorMessage ?? 'The export did not complete.'}</span>
      <Button size="sm" variant="outline" onClick={onExport}>
        Try again
      </Button>
    </div>
  );
}
