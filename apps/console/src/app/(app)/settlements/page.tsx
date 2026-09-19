'use client';

import type { SettlementResponse } from '@ems/contracts';
import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import {
  exportSettlementCsv,
  useApproveSettlement,
  useMarkSettlementPaid,
  useMarkSettlementProcessing,
  usePendingSettlements,
  useRunSettlementBatch,
} from '@/lib/queries/settlements';

const STATUS_BADGE: Record<SettlementResponse['status'], 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  PROCESSING: 'info',
  PAID: 'success',
  FAILED: 'destructive',
  ON_HOLD: 'destructive',
};

/**
 * Marketplace settlement administration — the only place a platform admin can
 * batch commission-ledger entries into payable statements, approve them, and
 * record a payout.
 *
 * The API only ever lists settlements still `PENDING_APPROVAL` (there is no
 * "list all settlements" endpoint — see `SettlementService.pendingApprovalQueue`).
 * A settlement this page has already shown is therefore tracked in local state
 * and patched in place as its status changes, rather than re-fetched — otherwise
 * approving one would make it vanish from view before it could be paid.
 */
export default function SettlementsPage() {
  const canRun = usePermission('platform.settlement:run');
  const canApprove = usePermission('platform.settlement:approve');
  const canPay = usePermission('platform.settlement:pay');
  const canExport = usePermission('platform.settlement:export');

  const pending = usePendingSettlements();
  const runBatch = useRunSettlementBatch();
  const approve = useApproveSettlement();
  const markProcessing = useMarkSettlementProcessing();
  const markPaid = useMarkSettlementPaid();

  const [known, setKnown] = useState<Record<string, SettlementResponse>>({});
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [batchResult, setBatchResult] = useState<{ created: number; skipped: number } | null>(null);
  const [payTarget, setPayTarget] = useState<SettlementResponse | null>(null);
  const [payoutMethod, setPayoutMethod] = useState<'BANK_TRANSFER' | 'GATEWAY_PAYOUT'>('BANK_TRANSFER');
  const [payoutReference, setPayoutReference] = useState('');

  function merge(...lists: SettlementResponse[][]) {
    setKnown((prev) => {
      const next = { ...prev };
      for (const list of lists) for (const s of list) next[s.id] = s;
      return next;
    });
  }

  if (pending.data && Object.keys(known).length === 0 && pending.data.length > 0) {
    merge(pending.data);
  }

  const rows = Object.values(known).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function handleExportAllCsv() {
    if (rows.length === 0) return;
    const headers = [
      'Settlement #', 'Beneficiary', 'Status', 'Period Start', 'Period End',
      'Gross', 'Commission', 'Platform Fee', 'Tax', 'Adjustment', 'Net Payable', 'Currency',
      'Entry Count', 'Payout Method', 'Payout Reference', 'Paid At',
    ];
    const csvRows = rows.map((s) => [
      s.settlementNumber,
      s.beneficiaryBusinessName,
      s.status,
      formatDate(s.periodStart),
      formatDate(s.periodEnd),
      s.grossMinor,
      s.commissionMinor,
      s.platformFeeMinor,
      s.taxMinor,
      s.adjustmentMinor,
      s.netPayableMinor,
      s.currency,
      String(s.entryCount),
      s.payoutMethod ?? '',
      s.payoutReference ?? '',
      s.paidAt ? formatDate(s.paidAt) : '',
    ]);
    downloadCsvFile(generateCsvText(headers, csvRows), `settlements-export-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settlements</h1>
          <p className="text-sm text-muted-foreground">
            Batch marketplace commission entries into payable statements, approve them, and record payouts.
          </p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={handleExportAllCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>


      {pending.isError && (
        <Alert variant="error">Could not load pending settlements. Try refreshing the page.</Alert>
      )}

      {canRun && (
        <Card>
          <CardHeader title="Run settlement batch" description="Settles every beneficiary's unsettled commission-ledger entries for a period." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Period start" htmlFor="periodStart">
                <Input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </Field>
              <Field label="Period end" htmlFor="periodEnd">
                <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Field>
            </div>

            {runBatch.isError && <Alert variant="error">Could not run the batch. Try again.</Alert>}
            {batchResult && (
              <Alert variant="success">
                Created {batchResult.created} settlement{batchResult.created === 1 ? '' : 's'}
                {batchResult.skipped > 0 ? `, skipped ${batchResult.skipped}` : ''}.
              </Alert>
            )}

            <Button
              loading={runBatch.isPending}
              disabled={!periodStart || !periodEnd}
              onClick={() =>
                runBatch.mutate(
                  { periodStart, periodEnd },
                  {
                    onSuccess: (result) => {
                      merge(result.created);
                      setBatchResult({ created: result.created.length, skipped: result.skipped.length });
                    },
                  },
                )
              }
            >
              Run batch
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Settlements" description="Newest first. Approved and paid statements stay listed here for this session." />
        <CardBody className="p-0">
          {pending.isLoading && <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>}

          {approve.isError && <Alert variant="error" className="mx-6 mb-4">Could not approve that settlement.</Alert>}
          {markProcessing.isError && <Alert variant="error" className="mx-6 mb-4">Could not update that settlement.</Alert>}
          {markPaid.isError && <Alert variant="error" className="mx-6 mb-4">Could not mark that settlement paid.</Alert>}

          {pending.data && rows.length === 0 && (
            <EmptyState
              title="No settlements yet"
              description="Run a batch above once there are unsettled commission entries."
            />
          )}

          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>Settlement #</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Net payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.beneficiaryBusinessName}</TableCell>
                    <TableCell className="font-mono text-xs">{s.settlementNumber}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                    </TableCell>
                    <TableCell className="tabular">
                      {formatMoney({ amountMinor: s.netPayableMinor, currency: s.currency })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {canApprove && s.status === 'PENDING_APPROVAL' && (
                          <Button
                            size="sm"
                            loading={approve.isPending}
                            onClick={() => approve.mutate(s.id, { onSuccess: (updated) => merge([updated]) })}
                          >
                            Approve
                          </Button>
                        )}
                        {canApprove && s.status === 'APPROVED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={markProcessing.isPending}
                            onClick={() => markProcessing.mutate(s.id, { onSuccess: (updated) => merge([updated]) })}
                          >
                            Mark processing
                          </Button>
                        )}
                        {canPay && (s.status === 'APPROVED' || s.status === 'PROCESSING') && (
                          <Button size="sm" variant="outline" onClick={() => setPayTarget(s)}>
                            Mark paid
                          </Button>
                        )}
                        {canExport && (
                          <Button size="sm" variant="ghost" onClick={() => void exportSettlementCsv(s)}>
                            Export CSV
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableEmptyRow colSpan={6}>No settlements yet.</TableEmptyRow>}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={payTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPayTarget(null);
            setPayoutReference('');
            setPayoutMethod('BANK_TRANSFER');
          }
        }}
        title="Mark settlement paid"
        description={payTarget ? `${payTarget.beneficiaryBusinessName} · ${payTarget.settlementNumber}` : undefined}
      >
        <div className="space-y-4">
          <Field label="Payout method" htmlFor="payoutMethod">
            <Select
              id="payoutMethod"
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value as 'BANK_TRANSFER' | 'GATEWAY_PAYOUT')}
            >
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="GATEWAY_PAYOUT">Gateway payout</option>
            </Select>
          </Field>
          <Field label="Payout reference" htmlFor="payoutReference" hint="Transaction ID or reference number">
            <Input
              id="payoutReference"
              value={payoutReference}
              onChange={(e) => setPayoutReference(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Never mind
            </Button>
            <Button
              loading={markPaid.isPending}
              disabled={!payoutReference.trim()}
              onClick={() => {
                if (!payTarget) return;
                markPaid.mutate(
                  { id: payTarget.id, payoutMethod, payoutReference: payoutReference.trim() },
                  {
                    onSuccess: (updated) => {
                      merge([updated]);
                      setPayTarget(null);
                      setPayoutReference('');
                    },
                  },
                );
              }}
            >
              Mark paid
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
