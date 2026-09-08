'use client';

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
import { formatDate, formatMoney } from '@/lib/utils';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading, isError } = useOrder(params.id);

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
