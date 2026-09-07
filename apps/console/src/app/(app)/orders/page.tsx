'use client';

import type { OrderListQuery, OrderResponse } from '@ems/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Badge,
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
import { useOrders } from '@/lib/queries/orders';
import { useCurrentStore } from '@/lib/queries/stores';
import { formatDate, formatMoney } from '@/lib/utils';

const STATUS_BADGE: Record<OrderResponse['status'], 'default' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'default',
  PENDING: 'warning',
  CONFIRMED: 'success',
  PROCESSING: 'success',
  SHIPPED: 'success',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
  RETURNED: 'destructive',
  FAILED: 'destructive',
  ON_HOLD: 'warning',
};

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageShell><p className="text-sm text-muted-foreground">Loading…</p></PageShell>}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { store, isLoading: storeLoading } = useCurrentStore();

  const page = Number(searchParams.get('page') ?? '1');
  const [status, setStatus] = useState<OrderListQuery['status'] | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<OrderListQuery['paymentStatus'] | ''>('');
  const [fulfilmentStatus, setFulfilmentStatus] = useState<OrderListQuery['fulfilmentStatus'] | ''>('');

  const ordersQuery = useOrders({
    page,
    limit: 20,
    status: status || undefined,
    paymentStatus: paymentStatus || undefined,
    fulfilmentStatus: fulfilmentStatus || undefined,
    storeId: store?.id ?? '',
  });

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.push(`/orders?${params.toString()}`);
  }

  if (storeLoading) {
    return <PageShell><p className="text-sm text-muted-foreground">Loading store…</p></PageShell>;
  }
  if (!store) {
    return <PageShell><p className="text-sm text-muted-foreground">No store found for this account yet.</p></PageShell>;
  }

  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.meta.pagination;

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onChange={(e) => { setStatus(e.target.value as OrderListQuery['status'] | ''); setPage(1); }} className="w-44">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="ON_HOLD">On hold</option>
          <option value="RETURNED">Returned</option>
          <option value="FAILED">Failed</option>
        </Select>
        <Select
          value={paymentStatus}
          onChange={(e) => { setPaymentStatus(e.target.value as OrderListQuery['paymentStatus'] | ''); setPage(1); }}
          className="w-44"
        >
          <option value="">All payment statuses</option>
          <option value="PENDING">Payment pending</option>
          <option value="PAID">Paid</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="REFUNDED">Refunded</option>
          <option value="PARTIALLY_REFUNDED">Partially refunded</option>
          <option value="FAILED">Failed</option>
          <option value="VOIDED">Voided</option>
        </Select>
        <Select
          value={fulfilmentStatus}
          onChange={(e) => { setFulfilmentStatus(e.target.value as OrderListQuery['fulfilmentStatus'] | ''); setPage(1); }}
          className="w-48"
        >
          <option value="">All fulfilment statuses</option>
          <option value="UNFULFILLED">Unfulfilled</option>
          <option value="PARTIALLY_FULFILLED">Partially fulfilled</option>
          <option value="FULFILLED">Fulfilled</option>
          <option value="RETURNED">Returned</option>
          <option value="PARTIALLY_RETURNED">Partially returned</option>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Fulfilment</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Placed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordersQuery.isLoading ? (
            <TableEmptyRow colSpan={6}>Loading…</TableEmptyRow>
          ) : orders.length === 0 ? (
            <TableEmptyRow colSpan={6}>No orders match these filters.</TableEmptyRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {order.orderNumber}
                  </Link>
                  <p className="text-xs text-muted-foreground">{order.email ?? '—'}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[order.status]}>{order.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">{order.paymentStatus}</TableCell>
                <TableCell className="text-sm">{order.fulfilmentStatus}</TableCell>
                <TableCell className="tabular">{formatMoney(order.total)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(order.placedAt ?? order.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          hasNext={pagination.hasNext}
          hasPrev={pagination.hasPrev}
          onPageChange={setPage}
        />
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">Track and fulfil customer orders.</p>
      </div>
      {children}
    </div>
  );
}
