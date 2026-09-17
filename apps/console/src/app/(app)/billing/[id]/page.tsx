'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { rupeesToMinorString } from '@/lib/money';
import { formatDate, formatMoney } from '@/lib/utils';
import { useAdjustInvoice, usePlatformInvoice, useRefundPayment } from '@/lib/queries/platform-billing';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const canAdjust = usePermission('platform.billing:adjust');
  const canRefund = usePermission('platform.billing:refund');

  const invoice = usePlatformInvoice(params.id);
  const adjust = useAdjustInvoice(params.id);
  const refund = useRefundPayment(params.id);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDescription, setAdjustDescription] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [refundTarget, setRefundTarget] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');

  if (invoice.isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Alert variant="error">Could not load this invoice.</Alert>
      </main>
    );
  }
  if (!invoice.data) {
    return <main className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  const inv = invoice.data;
  const canModify = inv.status === 'DRAFT' || inv.status === 'OPEN' || inv.status === 'PARTIALLY_PAID';

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/billing" className="text-sm text-muted-foreground hover:underline">
          &larr; Billing
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{inv.invoiceNumber}</h1>
          <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'REFUNDED' ? 'destructive' : 'default'}>
            {inv.status.replace('_', ' ')}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {inv.tenantName} · {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
        </p>
      </div>

      {adjust.isError && <Alert variant="error">Could not apply that adjustment.</Alert>}
      {refund.isError && <Alert variant="error">Could not refund that payment.</Alert>}

      <Card>
        <CardHeader
          title="Line items"
          action={
            canAdjust &&
            canModify && (
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                Add adjustment
              </Button>
            )
          }
        />
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lineItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {item.description}
                    {item.proration && (
                      <Badge variant="info" className="ml-2">
                        Adjustment
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular">{item.quantity}</TableCell>
                  <TableCell className="tabular">
                    {formatMoney({ amountMinor: item.amountMinor, currency: inv.currency })}
                  </TableCell>
                </TableRow>
              ))}
              {inv.lineItems.length === 0 && <TableEmptyRow colSpan={3}>No line items.</TableEmptyRow>}
            </TableBody>
          </Table>
          <div className="space-y-1 border-t p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{formatMoney({ amountMinor: inv.subtotalMinor, currency: inv.currency })}</span>
            </div>
            {inv.discountMinor !== '0' && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular">-{formatMoney({ amountMinor: inv.discountMinor, currency: inv.currency })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular">{formatMoney({ amountMinor: inv.taxMinor, currency: inv.currency })}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular">{formatMoney({ amountMinor: inv.totalMinor, currency: inv.currency })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular">{formatMoney({ amountMinor: inv.amountPaidMinor, currency: inv.currency })}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Due</span>
              <span className="tabular">{formatMoney({ amountMinor: inv.amountDueMinor, currency: inv.currency })}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payments" />
        <CardBody className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Captured</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{p.gateway}</TableCell>
                  <TableCell className="text-xs">{p.method ?? '—'}</TableCell>
                  <TableCell className="tabular">{formatMoney({ amountMinor: p.amountMinor, currency: p.currency })}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'CAPTURED' ? 'success' : p.status === 'REFUNDED' ? 'destructive' : 'default'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.capturedAt ? formatDate(p.capturedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    {canRefund && p.status === 'CAPTURED' && (
                      <Button size="sm" variant="destructive" onClick={() => setRefundTarget(p.id)}>
                        Refund
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {inv.payments.length === 0 && <TableEmptyRow colSpan={6}>No payments recorded.</TableEmptyRow>}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Dialog
        open={adjustOpen}
        onOpenChange={(open) => {
          setAdjustOpen(open);
          if (!open) {
            setAdjustDescription('');
            setAdjustAmount('');
          }
        }}
        title="Add adjustment"
        description="A negative amount credits the tenant; a positive amount adds a charge."
      >
        <div className="space-y-4">
          <Field label="Description" htmlFor="adjustDescription">
            <Input id="adjustDescription" value={adjustDescription} onChange={(e) => setAdjustDescription(e.target.value)} />
          </Field>
          <Field label="Amount (₹)" htmlFor="adjustAmount" hint="Negative for a credit, e.g. -50">
            <Input id="adjustAmount" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={adjust.isPending}
              disabled={adjustDescription.trim().length < 3 || !adjustAmount}
              onClick={() =>
                adjust.mutate(
                  { description: adjustDescription.trim(), amountMinor: rupeesToMinorString(adjustAmount) },
                  { onSuccess: () => setAdjustOpen(false) },
                )
              }
            >
              Apply
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={refundTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRefundTarget(null);
            setRefundReason('');
          }
        }}
        title="Refund this payment?"
        description="Marks the payment refunded on our own records. No payment gateway is called — send the money back separately."
      >
        <div className="space-y-4">
          <Field label="Reason" htmlFor="refundReason">
            <Input id="refundReason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRefundTarget(null)}>
              Never mind
            </Button>
            <Button
              variant="destructive"
              loading={refund.isPending}
              disabled={refundReason.trim().length < 5}
              onClick={() => {
                if (!refundTarget) return;
                refund.mutate(
                  { paymentId: refundTarget, reason: refundReason.trim() },
                  { onSuccess: () => setRefundTarget(null) },
                );
              }}
            >
              Refund
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
