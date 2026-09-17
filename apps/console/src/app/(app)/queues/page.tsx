'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { formatRelative } from '@/lib/utils';
import { useFailedJobs, useQueueDepths, useRetryJob } from '@/lib/queries/queue-admin';

/**
 * Background queue administration — depth per queue, and retry for anything
 * that landed in `failed`. Directly the missing half of Phase 11's exit
 * criterion ("failed jobs are replayable from the admin UI") — the API side
 * shipped with an explicit note that the UI was out of scope; this is it.
 */
export default function QueueAdminPage() {
  const depths = useQueueDepths();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queues</h1>
        <p className="text-sm text-muted-foreground">Depth per background queue. Refreshes every 10 seconds.</p>
      </div>

      {depths.isError && <Alert variant="error">Could not load queue depths. Try refreshing the page.</Alert>}

      {depths.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Delayed</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(depths.data).map(([name, depth]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-xs">{name}</TableCell>
                <TableCell className="tabular">{depth.waiting}</TableCell>
                <TableCell className="tabular">{depth.active}</TableCell>
                <TableCell className="tabular">
                  {depth.failed > 0 ? <Badge variant="destructive">{depth.failed}</Badge> : depth.failed}
                </TableCell>
                <TableCell className="tabular">{depth.delayed}</TableCell>
                <TableCell>
                  {depth.failed > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setSelected(name)}>
                      View failed
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {Object.keys(depths.data).length === 0 && <TableEmptyRow colSpan={6}>No queues registered.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      {selected && <FailedJobsPanel queueName={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function FailedJobsPanel({ queueName, onClose }: { queueName: string; onClose: () => void }) {
  const failed = useFailedJobs(queueName);
  const retry = useRetryJob(queueName);

  return (
    <Card>
      <CardHeader
        title={`Failed — ${queueName}`}
        action={
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      />
      <CardBody className="p-0">
        {failed.isError && <Alert variant="error" className="m-6">Could not load failed jobs.</Alert>}
        {retry.isError && <Alert variant="error" className="mx-6 mb-4">Could not retry that job.</Alert>}

        {failed.data && failed.data.length === 0 && (
          <EmptyState title="Nothing failed" description="This queue currently has no failed jobs." />
        )}

        {failed.data && failed.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Failed reason</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>When</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failed.data.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">{job.name ?? job.id}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-destructive" title={job.failedReason}>
                    {job.failedReason ?? '—'}
                  </TableCell>
                  <TableCell className="tabular">{job.attemptsMade ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelative(job.timestamp)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      loading={retry.isPending}
                      disabled={!job.id}
                      onClick={() => job.id && retry.mutate(job.id)}
                    >
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
