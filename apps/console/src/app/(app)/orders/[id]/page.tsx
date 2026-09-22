'use client';

import { FileText, Printer, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import {
  useCancelOrder,
  useCloseOrder,
  useFulfilOrder,
  useHoldOrder,
  useOrder,
  useResumeOrder,
} from '@/lib/queries/orders';
import { useCurrentStore } from '@/lib/queries/stores';
import { formatDate, formatMoney } from '@/lib/utils';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading, isError } = useOrder(params.id);
  const { store } = useCurrentStore();
  const [printModal, setPrintModal] = useState<'INVOICE' | 'PACKING_SLIP' | null>(null);

  const canFulfil = usePermission('order:fulfil');
  const canUpdate = usePermission('order:update');
  const canCancel = usePermission('order:cancel');

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const cancelOrder = useCancelOrder();
  const holdOrder = useHoldOrder();
  const resumeOrder = useResumeOrder();
  const closeOrder = useCloseOrder();
  const fulfilOrder = useFulfilOrder();

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (isError || !order) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Alert variant="error">This order could not be found.</Alert>
      </div>
    );
  }

  // What `fulfil` can still act on — the same arithmetic
  // `OrderService.fulfil`'s own `quantityOpen` check applies server-side.
  const openItems = order.items
    .map((item) => ({ ...item, quantityOpen: item.quantity - item.quantityFulfilled - item.quantityCancelled }))
    .filter((item) => item.quantityOpen > 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/orders')} className="mb-2 -ml-3">
            ← Back to orders
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {formatDate(order.placedAt ?? order.createdAt)} · {order.email ?? 'No email on file'}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{order.status}</Badge>
          <Badge variant="outline">{order.paymentStatus}</Badge>
          <Badge variant="outline">{order.fulfilmentStatus}</Badge>
        </div>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {canFulfil && openItems.length > 0 && order.status !== 'CANCELLED' && (
          <Button
            loading={fulfilOrder.isPending}
            onClick={() =>
              void runAction(() =>
                fulfilOrder.mutateAsync({
                  id: order.id,
                  body: {
                    items: openItems.map((item) => ({ orderItemId: item.id, quantity: item.quantityOpen })),
                    notifyCustomer: true,
                  },
                }),
              )
            }
          >
            Fulfil remaining items
          </Button>
        )}
        {canUpdate && order.status !== 'ON_HOLD' && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
          <Button
            variant="outline"
            loading={holdOrder.isPending}
            onClick={() => void runAction(() => holdOrder.mutateAsync({ id: order.id, body: {} }))}
          >
            Put on hold
          </Button>
        )}
        {canUpdate && order.status === 'ON_HOLD' && (
          <Button
            variant="outline"
            loading={resumeOrder.isPending}
            onClick={() => void runAction(() => resumeOrder.mutateAsync({ id: order.id }))}
          >
            Resume
          </Button>
        )}
        {canUpdate && order.fulfilmentStatus === 'FULFILLED' && order.status !== 'COMPLETED' && (
          <Button
            variant="outline"
            loading={closeOrder.isPending}
            onClick={() => void runAction(() => closeOrder.mutateAsync({ id: order.id }))}
          >
            Close order
          </Button>
        )}
        {canCancel && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
          <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
            Cancel order
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => setPrintModal('INVOICE')}
          className="inline-flex items-center gap-1.5"
        >
          <Printer className="size-4 text-slate-600" />
          Print Tax Invoice
        </Button>
        <Button
          variant="outline"
          onClick={() => setPrintModal('PACKING_SLIP')}
          className="inline-flex items-center gap-1.5"
        >
          <FileText className="size-4 text-slate-600" />
          Packing Slip
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Items" />
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sku} · fulfilled {item.quantityFulfilled}/{item.quantity}
                      </p>
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="tabular">{formatMoney(item.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 space-y-1 text-sm">
              <TotalRow label="Subtotal" value={order.subtotal} />
              <TotalRow label="Discount" value={order.discount} negative />
              <TotalRow label="Shipping" value={order.shipping} />
              <TotalRow label="Tax" value={order.tax} />
              {Number(order.codFee.amountMinor) > 0 && <TotalRow label="COD fee" value={order.codFee} />}
              <TotalRow label="Total" value={order.total} bold />
              <TotalRow label="Paid" value={order.amountPaid} />
              {Number(order.amountRefunded.amountMinor) > 0 && (
                <TotalRow label="Refunded" value={order.amountRefunded} negative />
              )}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Shipping address" />
            <CardBody>
              {order.shippingAddress ? (
                <address className="text-sm not-italic leading-relaxed">
                  {order.shippingAddress.recipientName}
                  <br />
                  {order.shippingAddress.addressLine1}
                  {order.shippingAddress.addressLine2 && (
                    <>
                      <br />
                      {order.shippingAddress.addressLine2}
                    </>
                  )}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.stateName ?? order.shippingAddress.stateCode}{' '}
                  {order.shippingAddress.postalCode}
                  <br />
                  {order.shippingAddress.countryCode}
                </address>
              ) : (
                <p className="text-sm text-muted-foreground">No shipping address.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              {order.timeline && order.timeline.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {order.timeline.map((event, i) => (
                    <li key={i} className="flex justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                      <span>
                        {event.statusType}: {event.fromStatus ?? '—'} → {event.toStatus}
                        {event.reason && <span className="text-muted-foreground"> ({event.reason})</span>}
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel order"
        description={`"${order.orderNumber}" will be cancelled and its inventory released. This cannot be undone.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmCancel(false)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={cancelOrder.isPending}
            onClick={() =>
              void runAction(() => cancelOrder.mutateAsync({ id: order.id, body: {} })).then(() => setConfirmCancel(false))
            }
          >
            Cancel order
          </Button>
        </div>
      </Dialog>

      {/* Tax Invoice & Packing Slip Printable Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl print:shadow-none print:border-none flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Actions Bar (hidden in print) */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="size-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">
                  {printModal === 'INVOICE' ? 'Official Tax Invoice Preview' : 'Warehouse Packing Slip Preview'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  <Printer className="size-3.5" /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModal(null)}
                  className="rounded-md p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="overflow-y-auto p-8 text-slate-800 text-xs print:p-0 print:overflow-visible">
              {/* Document Header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5 mb-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                    {store?.name ?? 'EMS Store'}
                  </h2>
                  <p className="text-slate-500 text-[11px] mt-0.5">Authorized eCommerce Merchant Platform</p>
                  <p className="text-slate-500 text-[11px]">GSTIN: 27AABCE1234F1Z5 · Contact: support@store.com</p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800 mb-1.5">
                    {printModal === 'INVOICE' ? 'TAX INVOICE' : 'PACKING SLIP'}
                  </span>
                  <p className="font-mono text-slate-900 font-semibold">
                    {printModal === 'INVOICE' ? `INV-${order.orderNumber}` : `PKG-${order.orderNumber}`}
                  </p>
                  <p className="text-[11px] text-slate-500">Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              {/* Addresses / Destination */}
              <div className="grid grid-cols-2 gap-6 mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Billed To:
                  </h4>
                  <p className="font-semibold text-slate-900 text-xs">
                    {order.billingAddress?.recipientName ?? (order.email ?? 'Valued Customer')}
                  </p>
                  <p className="text-slate-600 text-[11px] mt-0.5">{order.billingAddress?.addressLine1 ?? 'Standard Address'}</p>
                  <p className="text-slate-600 text-[11px]">
                    {[order.billingAddress?.city, order.billingAddress?.stateName ?? order.billingAddress?.stateCode, order.billingAddress?.postalCode].filter(Boolean).join(', ')}
                  </p>
                  <p className="text-slate-600 text-[11px] font-mono mt-1">Contact: {order.phone ?? order.email ?? '—'}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Shipped To:
                  </h4>
                  <p className="font-semibold text-slate-900 text-xs">
                    {order.shippingAddress?.recipientName ?? (order.email ?? 'Valued Customer')}
                  </p>
                  <p className="text-slate-600 text-[11px] mt-0.5">{order.shippingAddress?.addressLine1 ?? 'Standard Shipping Address'}</p>
                  <p className="text-slate-600 text-[11px]">
                    {[order.shippingAddress?.city, order.shippingAddress?.stateName ?? order.shippingAddress?.stateCode, order.shippingAddress?.postalCode].filter(Boolean).join(', ')}
                  </p>
                  <p className="text-slate-600 text-[11px] font-mono mt-1">Delivery Phone: {order.shippingAddress?.phone ?? order.phone ?? '—'}</p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse mb-6">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600 text-[11px] font-bold uppercase">
                    <th className="py-2.5 px-2">#</th>
                    <th className="py-2.5 px-2">Description / SKU</th>
                    <th className="py-2.5 px-2 text-center">Qty</th>
                    {printModal === 'INVOICE' && <th className="py-2.5 px-2 text-right">Unit Price</th>}
                    {printModal === 'INVOICE' && <th className="py-2.5 px-2 text-right">Total</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {order.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="py-3 px-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-2">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        {item.variantTitle && <p className="text-[10px] text-slate-500">Variant: {item.variantTitle}</p>}
                        <span className="font-mono text-[10px] text-slate-400">{item.sku}</span>
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-900">{item.quantity}</td>
                      {printModal === 'INVOICE' && (
                        <td className="py-3 px-2 text-right font-mono">{formatMoney(item.unitPrice)}</td>
                      )}
                      {printModal === 'INVOICE' && (
                        <td className="py-3 px-2 text-right font-mono font-bold text-slate-900">
                          {formatMoney({
                            amountMinor: String(BigInt(item.unitPrice.amountMinor) * BigInt(item.quantity)),
                            currency: item.unitPrice.currency,
                          })}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Totals (Only in Invoice) */}
              {printModal === 'INVOICE' ? (
                <div className="flex justify-end border-t border-slate-200 pt-4 mb-6">
                  <div className="w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-mono font-medium">{formatMoney(order.subtotal)}</span>
                    </div>
                    {Number(order.discount.amountMinor) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount:</span>
                        <span className="font-mono font-medium">− {formatMoney(order.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Shipping Fee:</span>
                      <span className="font-mono font-medium">{formatMoney(order.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>GST / Taxes:</span>
                      <span className="font-mono font-medium">{formatMoney(order.tax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-900 text-sm">
                      <span>Grand Total:</span>
                      <span className="font-mono text-base text-blue-700">{formatMoney(order.total)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right pt-1">
                      Payment Status: <strong className="uppercase text-slate-700">{order.paymentStatus}</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed border-slate-300 p-4 mb-6 bg-slate-50">
                  <h4 className="font-bold text-slate-800 text-xs mb-1">Dispatch & QC Checklist:</h4>
                  <ul className="list-disc list-inside text-slate-600 text-[11px] space-y-0.5">
                    <li>Verify all SKU barcodes and unit counts match the list above.</li>
                    <li>Ensure tamper-proof protective outer packaging is sealed.</li>
                    <li>Affix courier shipping AWB barcode on top of carton.</li>
                  </ul>
                </div>
              )}

              {/* Footer Note */}
              <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400">
                <p>Thank you for shopping with {store?.name ?? 'us'}! This is a computer generated document, signature not required.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: { amountMinor: string; currency: string };
  bold?: boolean;
  /** Prefixes the amount with "− ", matching the storefront's OrderSummary, so a
   * subtracted line (discount, refund) doesn't read as a positive addend (BUG-FE-016). */
  negative?: boolean;
}) {
  return (
    <div className={bold ? 'flex justify-between font-semibold' : 'flex justify-between text-muted-foreground'}>
      <span>{label}</span>
      <span className="tabular">
        {negative ? '− ' : ''}
        {formatMoney(value)}
      </span>
    </div>
  );
}
