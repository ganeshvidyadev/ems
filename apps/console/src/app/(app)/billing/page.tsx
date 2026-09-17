'use client';

import type { InvoiceStatus } from '@ems/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Alert,
  Badge,
  EmptyState,
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
import { formatDate, formatMoney } from '@/lib/utils';
import { usePlatformInvoices } from '@/lib/queries/platform-billing';

const STATUS_BADGE: Record<InvoiceStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  DRAFT: 'default',
  OPEN: 'warning',
  PAID: 'success',
  PARTIALLY_PAID: 'info',
  UNCOLLECTIBLE: 'destructive',
  VOID: 'default',
  REFUNDED: 'destructive',
};

export default function BillingPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading…</main>}>
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get('page') ?? '1');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');

  const invoices = usePlatformInvoices({ page, limit: 20, status: status || undefined });

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    router.push(`/billing?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Every tenant&apos;s subscription invoices.</p>
        </div>
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}
          className="w-auto"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="OPEN">Open</option>
          <option value="PAID">Paid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="UNCOLLECTIBLE">Uncollectible</option>
          <option value="VOID">Void</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
      </div>

      {invoices.isError && <Alert variant="error">Could not load invoices. Try refreshing the page.</Alert>}

      {invoices.data && invoices.data.data.length === 0 && (
        <EmptyState title="No invoices" description="Nothing matches this filter yet." />
      )}

      {invoices.data && invoices.data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.data.data.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/billing/${inv.id}`} className="hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{inv.tenantName}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                </TableCell>
                <TableCell className="tabular">{formatMoney({ amountMinor: inv.totalMinor, currency: inv.currency })}</TableCell>
                <TableCell className="tabular">{formatMoney({ amountMinor: inv.amountDueMinor, currency: inv.currency })}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[inv.status]}>{inv.status.replace('_', ' ')}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {invoices.data.data.length === 0 && <TableEmptyRow colSpan={6}>No invoices.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      {invoices.data && (
        <Pagination
          page={invoices.data.meta.pagination.page}
          totalPages={invoices.data.meta.pagination.totalPages}
          hasNext={invoices.data.meta.pagination.hasNext}
          hasPrev={invoices.data.meta.pagination.hasPrev}
          onPageChange={setPage}
        />
      )}
    </main>
  );
}
