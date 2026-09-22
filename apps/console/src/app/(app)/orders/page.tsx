'use client';

import type { OrderListQuery, OrderResponse } from '@ems/contracts';
import { Download, Loader2, CheckSquare, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
import { apiGetPaginated, isForbidden } from '@/lib/api-client';
import { downloadCsvFile, generateCsvText } from '@/lib/csv-helper';
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

  const [isExporting, setIsExporting] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const allSelected = orders.length > 0 && orders.every((o) => selectedOrderIds.has(o.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map((o) => o.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOrderIds(next);
  }

  function exportSelectedOrdersCsv() {
    if (selectedOrderIds.size === 0) return;
    const selectedOrders = orders.filter((o) => selectedOrderIds.has(o.id));
    const headers = [
      'Order Number',
      'Date',
      'Customer Email',
      'Customer Phone',
      'Recipient Name',
      'Status',
      'Payment Status',
      'Fulfilment Status',
      'Items Count',
      'Currency',
      'Subtotal',
      'Discount',
      'Shipping',
      'Tax',
      'COD Fee',
      'Total',
      'City',
      'State',
      'Postal Code',
      'Channel',
    ];

    const rows = selectedOrders.map((o) => {
      const itemCount = o.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      return [
        o.orderNumber,
        formatDate(o.placedAt ?? o.createdAt),
        o.email ?? '',
        o.phone ?? o.shippingAddress?.phone ?? '',
        o.shippingAddress?.recipientName ?? '',
        o.status,
        o.paymentStatus,
        o.fulfilmentStatus,
        itemCount,
        o.currency,
        (Number(o.subtotal?.amountMinor || 0) / 100).toFixed(2),
        (Number(o.discount?.amountMinor || 0) / 100).toFixed(2),
        (Number(o.shipping?.amountMinor || 0) / 100).toFixed(2),
        (Number(o.tax?.amountMinor || 0) / 100).toFixed(2),
        (Number(o.codFee?.amountMinor || 0) / 100).toFixed(2),
        (Number(o.total?.amountMinor || 0) / 100).toFixed(2),
        o.shippingAddress?.city ?? '',
        o.shippingAddress?.stateName ?? o.shippingAddress?.stateCode ?? '',
        o.shippingAddress?.postalCode ?? '',
        o.channel ?? 'STOREFRONT',
      ];
    });

    const csvContent = generateCsvText(headers, rows);
    const filename = `selected-orders-batch-${store?.slug ?? 'store'}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsvFile(filename, csvContent);
  }

  async function exportOrdersCsv() {
    if (!store?.id) return;
    setIsExporting(true);
    try {
      const res = await apiGetPaginated<OrderResponse>('/console/orders', {
        params: {
          page: 1,
          limit: 500,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
          fulfilmentStatus: fulfilmentStatus || undefined,
          storeId: store.id,
        },
      });

      const exportRows = res.data ?? [];
      const headers = [
        'Order Number',
        'Date',
        'Customer Email',
        'Customer Phone',
        'Recipient Name',
        'Status',
        'Payment Status',
        'Fulfilment Status',
        'Items Count',
        'Currency',
        'Subtotal',
        'Discount',
        'Shipping',
        'Tax',
        'COD Fee',
        'Total',
        'City',
        'State',
        'Postal Code',
        'Channel',
      ];

      const rows = exportRows.map((o) => {
        const itemCount = o.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
        return [
          o.orderNumber,
          formatDate(o.placedAt ?? o.createdAt),
          o.email ?? '',
          o.phone ?? o.shippingAddress?.phone ?? '',
          o.shippingAddress?.recipientName ?? '',
          o.status,
          o.paymentStatus,
          o.fulfilmentStatus,
          itemCount,
          o.currency,
          (Number(o.subtotal?.amountMinor || 0) / 100).toFixed(2),
          (Number(o.discount?.amountMinor || 0) / 100).toFixed(2),
          (Number(o.shipping?.amountMinor || 0) / 100).toFixed(2),
          (Number(o.tax?.amountMinor || 0) / 100).toFixed(2),
          (Number(o.codFee?.amountMinor || 0) / 100).toFixed(2),
          (Number(o.total?.amountMinor || 0) / 100).toFixed(2),
          o.shippingAddress?.city ?? '',
          o.shippingAddress?.stateName ?? o.shippingAddress?.stateCode ?? '',
          o.shippingAddress?.postalCode ?? '',
          o.channel ?? 'STOREFRONT',
        ];
      });

      const csvContent = generateCsvText(headers, rows);
      const filename = `orders-export-${store.slug ?? 'store'}-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsvFile(filename, csvContent);
    } catch (err) {
      console.error('Failed to export orders CSV:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
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

        <Button
          variant="outline"
          size="sm"
          disabled={orders.length === 0 || isExporting}
          onClick={() => void exportOrdersCsv()}
          className="inline-flex items-center gap-1.5"
        >
          {isExporting ? (
            <Loader2 className="size-3.5 animate-spin text-slate-600" />
          ) : (
            <Download className="size-3.5 text-slate-600" />
          )}
          {isExporting ? 'Exporting…' : 'Export Orders CSV'}
        </Button>
      </div>

      {ordersQuery.isError && (
        <Alert variant="error" className="mb-4">
          {isForbidden(ordersQuery.error)
            ? 'You do not have permission to view orders.'
            : 'Could not load orders. Try refreshing the page.'}
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                aria-label="Select all orders"
              />
            </TableHead>
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
            <TableEmptyRow colSpan={7}>Loading…</TableEmptyRow>
          ) : ordersQuery.isError ? null : orders.length === 0 ? (
            <TableEmptyRow colSpan={7}>No orders match these filters.</TableEmptyRow>
          ) : (
            orders.map((order) => {
              const isSelected = selectedOrderIds.has(order.id);
              return (
                <TableRow key={order.id} className={isSelected ? 'bg-muted/40' : undefined}>
                  <TableCell className="w-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(order.id)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                      aria-label={`Select order ${order.orderNumber}`}
                    />
                  </TableCell>
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
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Floating Bottom Batch Actions Toolbar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900 px-5 py-2.5 text-xs text-white shadow-2xl animate-fade-up">
          <span className="flex items-center gap-1.5 font-semibold text-slate-200">
            <CheckSquare className="size-4 text-emerald-400" />
            <span>{selectedOrderIds.size} {selectedOrderIds.size === 1 ? 'order' : 'orders'} selected</span>
          </span>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <Button
            size="sm"
            variant="default"
            onClick={exportSelectedOrdersCsv}
            className="h-7 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Download className="size-3.5" />
            <span>Export Selected CSV</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedOrderIds(new Set())}
            className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white gap-1"
          >
            <X className="size-3.5" />
            <span>Clear</span>
          </Button>
        </div>
      )}

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
