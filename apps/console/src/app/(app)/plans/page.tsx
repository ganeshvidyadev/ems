'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { formatMoney } from '@/lib/utils';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { useArchivePlan, useDeletePlan, usePlatformPlans } from '@/lib/queries/platform-plans';

export default function PlansPage() {
  const canCreate = usePermission('platform.plan:create');
  const canUpdate = usePermission('platform.plan:update');
  const canDelete = usePermission('platform.plan:delete');

  const plans = usePlatformPlans();
  const archive = useArchivePlan();
  const remove = useDeletePlan();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleExportPlansCsv = () => {
    if (!plans.data || plans.data.length === 0) return;
    const headers = ['Plan Name', 'Code', 'Monthly Price', 'Yearly Price', 'Currency', 'Visibility', 'Status', 'Subscribers Count'];
    const rows = plans.data.map((p) => [
      p.name,
      p.code,
      p.priceMonthlyMinor,
      p.priceYearlyMinor,
      p.currency,
      p.isPublic ? 'Public' : 'Negotiated',
      p.status,
      String(p.subscriberCount),
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `subscription-plans-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground">The subscription catalogue every tenant chooses from.</p>
        </div>
        <div className="flex items-center gap-2">
          {plans.data && plans.data.length > 0 && (
            <button
              type="button"
              onClick={handleExportPlansCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          )}
          {canCreate && (
            <Button asChild>
              <Link href="/plans/new">New plan</Link>
            </Button>
          )}
        </div>
      </div>

      {plans.isError && <Alert variant="error">Could not load plans. Try refreshing the page.</Alert>}
      {archive.isError && <Alert variant="error">Could not archive that plan.</Alert>}
      {remove.isError && <Alert variant="error">Could not delete that plan.</Alert>}

      {plans.data && plans.data.length === 0 && (
        <EmptyState title="No plans yet" description="Create the first plan to start assigning it to tenants." />
      )}

      {plans.data && plans.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>Yearly</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subscribers</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.data.map((plan) => (
              <TableRow key={plan.code}>
                <TableCell>
                  <p className="font-medium">{plan.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{plan.code}</p>
                </TableCell>
                <TableCell className="tabular">
                  {formatMoney({ amountMinor: plan.priceMonthlyMinor, currency: plan.currency })}
                </TableCell>
                <TableCell className="tabular">
                  {formatMoney({ amountMinor: plan.priceYearlyMinor, currency: plan.currency })}
                </TableCell>
                <TableCell>
                  <Badge variant={plan.isPublic ? 'info' : 'default'}>{plan.isPublic ? 'Public' : 'Negotiated'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={plan.status === 'ACTIVE' ? 'success' : 'default'}>{plan.status}</Badge>
                </TableCell>
                <TableCell className="tabular">{plan.subscriberCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {canUpdate && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/plans/${plan.code}`}>Edit</Link>
                      </Button>
                    )}
                    {canUpdate && plan.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" loading={archive.isPending} onClick={() => archive.mutate(plan.code)}>
                        Archive
                      </Button>
                    )}
                    {canDelete && plan.subscriberCount === 0 && (
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(plan.code)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {plans.data.length === 0 && <TableEmptyRow colSpan={7}>No plans.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this plan?"
        description="This cannot be undone. Only plans with no subscribers can be deleted."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              remove.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
