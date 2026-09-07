'use client';

import type { InventoryLevelResponse, NotificationResponse, OrderResponse } from '@ems/contracts';
import {
  AlertTriangle,
  Bell,
  Boxes,
  IndianRupee,
  PackageSearch,
  Plus,
  ShoppingBag,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Skeleton,
  Sparkline,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  type StatDelta,
} from '@/components/ui/primitives';
import { useAuth, usePermission } from '@/hooks/use-auth';
import { useCustomers } from '@/lib/queries/customers';
import { useLowStock } from '@/lib/queries/inventory';
import { useMarkNotificationRead, useNotifications } from '@/lib/queries/notifications';
import { useOrders } from '@/lib/queries/orders';
import { useProduct, useProducts } from '@/lib/queries/products';
import { useSalesSummary } from '@/lib/queries/reports';
import { useCurrentStore } from '@/lib/queries/stores';
import { cn, formatDate, formatMoney, formatRelative } from '@/lib/utils';

/**
 * Merchant dashboard.
 *
 * Every figure on this page comes from an endpoint that exists. That constraint decided
 * the layout as much as any visual preference: there is one revenue aggregate
 * (`reports/sales-summary`), so there are no "top products" or "conversion rate" tiles,
 * because the platform cannot answer those questions and a dashboard that invents
 * plausible numbers is worse than one that shows fewer real ones.
 *
 * The three things a merchant opens a console to learn — how trade is going, what needs
 * doing, and what changed while they were away — map to the three regions below: the
 * stat row, the recent-orders table, and the alerts/activity column.
 *
 * The Phase-1 health check that used to live here now sits at `/system`; it is still a
 * genuinely useful smoke test, it just is not what a merchant needs first.
 */

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

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

export default function DashboardPage() {
  const { user } = useAuth();
  const { store, isLoading: storeLoading } = useCurrentStore();
  const [rangeDays, setRangeDays] = useState<'7' | '30' | '90'>('30');

  const canReadReports = usePermission('report:read');
  const canReadNotifications = usePermission('notification:read');
  const canCreateProduct = usePermission('product:create');

  const days = Number(rangeDays);
  // Recomputed only when the range changes, so the query keys stay stable across
  // renders — a `from` derived inline from `new Date()` would produce a new key on
  // every render once the clock ticked past midnight mid-session.
  const { current, previous } = useMemo(() => periodsFor(days), [days]);

  const storeId = store?.id ?? '';
  const storeReady = Boolean(storeId);

  const summary = useSalesSummary(
    { from: current.from, to: current.to, storeId },
    { enabled: canReadReports && storeReady },
  );
  // The same endpoint over the preceding window of equal length. Two cheap reads off a
  // daily rollup buy a real "vs previous period" delta; without it the only honest
  // options are no delta at all or a fabricated one.
  const baseline = useSalesSummary(
    { from: previous.from, to: previous.to, storeId },
    { enabled: canReadReports && storeReady },
  );

  const recentOrders = useOrders({ page: 1, limit: 5, storeId });
  // `limit: 1` on purpose: the row is discarded and only `meta.pagination.total` is
  // read, which is the cheapest way to put a real count on a tile.
  const customerCount = useCustomers({ page: 1, limit: 1 });
  const productCount = useProducts({ page: 1, limit: 1, storeId });
  const lowStock = useLowStock();
  const notifications = useNotifications({ limit: 6 }, { enabled: canReadNotifications });

  if (storeLoading) return <DashboardSkeleton />;

  if (!store) {
    return (
      <PageShell title="Dashboard">
        <Card variant="elevated">
          <EmptyState
            icon={PackageSearch}
            title="No store on this account yet"
            description="A store is created when your tenant is provisioned. If that has not happened, the system status page will show whether the API is healthy."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/system">Check system status</Link>
              </Button>
            }
          />
        </Card>
      </PageShell>
    );
  }

  const totalProducts = productCount.data?.meta.pagination.total ?? 0;
  const totalCustomers = customerCount.data?.meta.pagination.total ?? 0;
  const totalOrders = recentOrders.data?.meta.pagination.total ?? 0;
  const lowStockRows = lowStock.data ?? [];
  const notificationRows = notifications.data ?? [];
  const unreadCount = notificationRows.filter((row) => row.isUnread).length;

  // A tenant that has never added a product has nothing for any of the panels below to
  // show. Four zeros and three empty tables would technically be accurate and would
  // still leave the merchant unable to tell "nothing has happened" from "nothing works".
  const isFirstRun =
    productCount.isSuccess && recentOrders.isSuccess && totalProducts === 0 && totalOrders === 0;

  const revenueDelta = deltaFor(
    summary.data ? Number(summary.data.netMinor) : undefined,
    baseline.data ? Number(baseline.data.netMinor) : undefined,
    `vs prev ${days}d`,
  );
  const ordersDelta = deltaFor(
    summary.data?.ordersCount,
    baseline.data?.ordersCount,
    `vs prev ${days}d`,
  );

  return (
    <PageShell
      title="Dashboard"
      description={
        user?.firstName
          ? `Welcome back, ${user.firstName}. Here is ${store.name}.`
          : `An overview of ${store.name}.`
      }
      actions={
        <>
          <label className="sr-only" htmlFor="dashboard-range">
            Reporting period
          </label>
          <Select
            id="dashboard-range"
            value={rangeDays}
            onChange={(event) => setRangeDays(event.target.value as '7' | '30' | '90')}
            className="h-9 w-40"
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>
          {canCreateProduct && (
            <Button size="sm" asChild>
              <Link href="/products/new">
                <Plus aria-hidden className="size-4" />
                Add product
              </Link>
            </Button>
          )}
        </>
      }
    >
      {isFirstRun ? (
        <FirstRunPanel canCreateProduct={canCreateProduct} />
      ) : (
        <>
          <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net revenue"
              icon={IndianRupee}
              loading={canReadReports && summary.isLoading}
              value={
                canReadReports
                  ? formatMoney(
                      summary.data
                        ? { amountMinor: summary.data.netMinor, currency: summary.data.currency }
                        : null,
                    )
                  : '—'
              }
              delta={canReadReports ? revenueDelta : undefined}
              hint={canReadReports ? undefined : 'Reporting access required'}
              chart={
                summary.data && (
                  <Sparkline values={summary.data.byDay.map((day) => Number(day.netMinor))} />
                )
              }
              className="animate-fade-up"
            />
            <StatCard
              label="Orders"
              icon={ShoppingBag}
              loading={canReadReports && summary.isLoading}
              value={canReadReports ? (summary.data?.ordersCount ?? '—') : '—'}
              delta={canReadReports ? ordersDelta : undefined}
              hint={
                canReadReports
                  ? summary.data
                    ? `${summary.data.itemsCount} items sold`
                    : undefined
                  : 'Reporting access required'
              }
              chart={
                summary.data && (
                  <Sparkline
                    values={summary.data.byDay.map((day) => day.ordersCount)}
                    tone="success"
                  />
                )
              }
              className="animate-fade-up [animation-delay:40ms]"
            />
            <StatCard
              label="Customers"
              icon={Users}
              loading={customerCount.isLoading}
              value={totalCustomers}
              hint={
                summary.data
                  ? `${summary.data.newCustomers} new, ${summary.data.returningCustomers} returning`
                  : 'All time'
              }
              className="animate-fade-up [animation-delay:80ms]"
            />
            <StatCard
              label="Products"
              icon={Boxes}
              loading={productCount.isLoading}
              value={totalProducts}
              hint={
                lowStockRows.length > 0
                  ? `${lowStockRows.length} low on stock`
                  : 'All stocked above reorder point'
              }
              className="animate-fade-up [animation-delay:120ms]"
            />
          </section>

          {/*
            `items-start`, so each card sizes to its own content. Grid's default
            `stretch` made the orders card match the height of the two stacked panels
            beside it, which on a store with one order left ~200px of empty card.
          */}
          <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
            <RecentOrders
              orders={recentOrders.data?.data ?? []}
              loading={recentOrders.isLoading}
              className="lg:col-span-2"
            />

            <div className="space-y-4">
              <LowStockPanel rows={lowStockRows} loading={lowStock.isLoading} />
              {canReadNotifications && (
                <ActivityPanel
                  rows={notificationRows}
                  unreadCount={unreadCount}
                  loading={notifications.isLoading}
                />
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/*
        The header wraps rather than shrinking: on a narrow viewport the range picker and
        the primary action drop onto their own line at full size, instead of the CTA being
        squeezed until its label truncates.
      */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-2xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

function FirstRunPanel({ canCreateProduct }: { canCreateProduct: boolean }) {
  const steps = [
    {
      title: 'Add your first product',
      body: 'Name, SKU and price are enough to start. Variants and images can come later.',
      href: '/products/new',
      cta: 'Add product',
      enabled: canCreateProduct,
    },
    {
      title: 'Set stock levels',
      body: 'Give each product a reorder point so this dashboard can warn you before you sell out.',
      href: '/inventory',
      cta: 'Open inventory',
      enabled: true,
    },
    {
      title: 'Watch orders arrive',
      body: 'Revenue, order counts and customer activity all appear here once the first order lands.',
      href: '/orders',
      cta: 'View orders',
      enabled: true,
    },
  ];

  return (
    <Card variant="elevated" className="animate-fade-up">
      <CardHeader
        as="h2"
        title="Set up your store"
        description="There are no products or orders yet, so there is nothing to report on. Three steps and this page fills in."
      />
      <CardBody>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
              </div>
              {step.enabled && (
                <Button variant="outline" size="sm" className="shrink-0 self-start" asChild>
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent orders
// ---------------------------------------------------------------------------

function RecentOrders({
  orders,
  loading,
  className,
}: {
  orders: OrderResponse[];
  loading: boolean;
  className?: string;
}) {
  return (
    <Card variant="elevated" className={className}>
      <CardHeader
        as="h2"
        title="Recent orders"
        action={
          <Link
            href="/orders"
            className="rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View all
          </Link>
        }
      />
      <CardBody className="px-0 pb-0">
        {/* `border-0` on the table: the Card already draws the boundary. */}
        <Table className="rounded-none border-0">
          <TableHeader className="bg-transparent">
            <TableRow>
              <TableHead className="pl-6">Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {/* nowrap: a wrapped timestamp turns a 5-row table into a 12-row one.
                  The Table primitive already scrolls horizontally when it must. */}
              <TableHead className="whitespace-nowrap pr-6">Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell className="pl-6">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="pr-6">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableEmptyRow colSpan={4}>
                No orders in this store yet. They appear here the moment one is placed.
              </TableEmptyRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="pl-6">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{order.email ?? '—'}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[order.status]}>{order.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatMoney(order.total)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap pr-6 text-sm text-muted-foreground">
                    {formatDate(order.placedAt ?? order.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Low stock
// ---------------------------------------------------------------------------

function LowStockPanel({
  rows,
  loading,
}: {
  rows: InventoryLevelResponse[];
  loading: boolean;
}) {
  // Narrow column, so a list rather than a table: five columns of numbers at ~300px
  // would either scroll sideways or truncate the product name, which is the one field
  // the merchant is scanning for.
  const visible = rows.slice(0, 4);

  return (
    <Card variant="elevated">
      <CardHeader
        as="h2"
        title="Low stock"
        action={
          rows.length > 0 ? (
            <Badge variant={rows.some((row) => row.quantityAvailable <= 0) ? 'destructive' : 'warning'}>
              {rows.length}
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everything is above its reorder point.
          </p>
        ) : (
          <>
            <ul className="divide-y">
              {visible.map((row) => (
                <li key={`${row.productId}-${row.variantId ?? ''}-${row.warehouseId}`}>
                  <LowStockRow row={row} />
                </li>
              ))}
            </ul>
            {rows.length > visible.length && (
              <Link
                href="/inventory"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                {rows.length - visible.length} more
              </Link>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** `InventoryLevelResponse` carries only `productId`; this resolves it to a name. */
function LowStockRow({ row }: { row: InventoryLevelResponse }) {
  const { data: product } = useProduct(row.productId);

  return (
    <Link
      href={`/inventory/${row.productId}`}
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {product?.name ?? row.productId}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{row.warehouseName}</span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={cn(
            'tabular block text-sm font-semibold',
            // Out of stock is a different problem from "getting low", so it gets a
            // different colour — but the number itself is always shown, so colour is
            // never the only carrier of the distinction.
            row.quantityAvailable <= 0 ? 'text-destructive' : 'text-foreground',
          )}
        >
          {row.quantityAvailable}
        </span>
        <span className="block text-xs text-muted-foreground">of {row.reorderPoint ?? '—'}</span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityPanel({
  rows,
  unreadCount,
  loading,
}: {
  rows: NotificationResponse[];
  unreadCount: number;
  loading: boolean;
}) {
  const markRead = useMarkNotificationRead();

  return (
    <Card variant="elevated" id="activity">
      <CardHeader
        as="h2"
        title="Activity"
        action={unreadCount > 0 ? <Badge variant="info">{unreadCount} new</Badge> : undefined}
      />
      <CardBody className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing new"
            description="Order, payment and stock notifications land here."
            className="px-0 py-4"
          />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex gap-2.5 py-2.5 first:pt-0">
                <span
                  aria-hidden
                  className={
                    row.isUnread
                      ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-primary'
                      : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-transparent'
                  }
                />
                <div className="min-w-0 flex-1">
                  {/* The dot is colour-only, so unread is also stated in text for AT. */}
                  {row.isUnread && <span className="sr-only">Unread. </span>}
                  <p className="truncate text-sm font-medium">
                    {/* Only internal paths are linked: `actionUrl` may hold an absolute
                        storefront URL, which does not belong in console navigation. */}
                    {row.actionUrl?.startsWith('/') ? (
                      <Link href={row.actionUrl} className="hover:underline">
                        {row.title ?? row.templateCode ?? 'Notification'}
                      </Link>
                    ) : (
                      (row.title ?? row.templateCode ?? 'Notification')
                    )}
                  </p>
                  {row.body && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{row.body}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelative(row.createdAt)}
                  </p>
                </div>
                {row.isUnread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    loading={markRead.isPending && markRead.variables === row.id}
                    onClick={() => markRead.mutate(row.id)}
                  >
                    Mark read
                    <span className="sr-only">: {row.title ?? 'notification'}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading shell
// ---------------------------------------------------------------------------

/**
 * Shown while the store resolves, which every query below it depends on.
 *
 * Mirrors the real layout's boxes so the page does not visibly rearrange when data
 * arrives — the previous behaviour was a line of text reading "Loading store…", after
 * which the entire page appeared at once.
 */
function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8" aria-busy>
      <span className="sr-only" role="status">
        Loading dashboard
      </span>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-lg bg-card p-5 shadow-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-24" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Period arithmetic
// ---------------------------------------------------------------------------

/**
 * The selected window and the equal-length window immediately before it.
 *
 * Both ends are inclusive, matching the report endpoint, so a 7-day range is
 * today and the six days before it — and the baseline is the seven days before
 * that, with no overlap and no gap.
 */
function periodsFor(days: number): {
  current: { from: string; to: string };
  previous: { from: string; to: string };
} {
  const today = startOfToday();
  const from = addDays(today, -(days - 1));
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));

  return {
    current: { from: toDateParam(from), to: toDateParam(today) },
    previous: { from: toDateParam(previousFrom), to: toDateParam(previousTo) },
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * `YYYY-MM-DD` from the *local* calendar date.
 *
 * Not `toISOString().slice(0, 10)`: that converts to UTC first, so anywhere east of
 * Greenwich an early-morning "today" is reported as yesterday, and the merchant sees a
 * range that quietly excludes the current day's trade.
 */
function toDateParam(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Percentage change, or `null` where the baseline was zero and a percentage is undefined. */
function deltaFor(
  currentValue: number | undefined,
  previousValue: number | undefined,
  comparedTo: string,
): StatDelta | undefined {
  if (currentValue === undefined || previousValue === undefined) return undefined;
  if (previousValue === 0) return { percent: null, comparedTo };
  return { percent: ((currentValue - previousValue) / previousValue) * 100, comparedTo };
}
