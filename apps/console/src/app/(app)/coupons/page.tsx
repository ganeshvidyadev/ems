'use client';

import type { CouponListQuery, CouponResponse } from '@ems/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
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
import { usePermission } from '@/hooks/use-auth';
import { useCoupons, useDeleteCoupon } from '@/lib/queries/coupons';
import { formatDate, formatMoney } from '@/lib/utils';

/** A one-line human summary of what a coupon actually knocks off. */
function describeDiscount(coupon: CouponResponse): string {
  switch (coupon.discountType) {
    case 'PERCENTAGE':
      return `${coupon.discountValue}% off`;
    case 'FIXED_AMOUNT':
      return `${formatMoney({ amountMinor: coupon.discountValue.split('.')[0] ?? '0', currency: 'INR' })} off`;
    case 'FREE_SHIPPING':
      return 'Free shipping';
    case 'BUY_X_GET_Y':
      return 'Buy X, get Y';
    default:
      return coupon.discountType;
  }
}

export default function CouponsPage() {
  return (
    <Suspense fallback={<PageShell><p className="text-sm text-muted-foreground">Loading…</p></PageShell>}>
      <CouponsPageContent />
    </Suspense>
  );
}

function CouponsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreate = usePermission('coupon:create');
  const canDelete = usePermission('coupon:delete');

  const page = Number(searchParams.get('page') ?? '1');
  const [status, setStatus] = useState<CouponListQuery['status'] | ''>('');
  const [deleteTarget, setDeleteTarget] = useState<CouponResponse | null>(null);

  const couponsQuery = useCoupons({ page, limit: 20, status: status || undefined });
  const deleteCoupon = useDeleteCoupon();

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.push(`/coupons?${params.toString()}`);
  }

  const coupons = couponsQuery.data?.data ?? [];
  const pagination = couponsQuery.data?.meta.pagination;

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value as CouponListQuery['status'] | ''); setPage(1); }}
          className="w-44"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        {canCreate && (
          <Link href="/coupons/new">
            <Button>New coupon</Button>
          </Link>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ends</TableHead>
            {canDelete && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {couponsQuery.isLoading ? (
            <TableEmptyRow colSpan={canDelete ? 6 : 5}>Loading…</TableEmptyRow>
          ) : coupons.length === 0 ? (
            <TableEmptyRow colSpan={canDelete ? 6 : 5}>No coupons match these filters.</TableEmptyRow>
          ) : (
            coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell>
                  <Link href={`/coupons/${coupon.id}`} className="font-medium hover:underline">
                    {coupon.code}
                  </Link>
                  {coupon.name && <p className="text-xs text-muted-foreground">{coupon.name}</p>}
                </TableCell>
                <TableCell className="text-sm">{describeDiscount(coupon)}</TableCell>
                <TableCell className="tabular text-sm">
                  {coupon.usageCount}
                  {coupon.usageLimitTotal ? ` / ${coupon.usageLimitTotal}` : ''}
                </TableCell>
                <TableCell>
                  <Badge variant={coupon.status === 'ACTIVE' ? 'success' : 'default'}>{coupon.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {coupon.endsAt ? formatDate(coupon.endsAt) : 'No end date'}
                </TableCell>
                {canDelete && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(coupon)}>
                      Delete
                    </Button>
                  </TableCell>
                )}
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete coupon"
        description={deleteTarget ? `"${deleteTarget.code}" will no longer be redeemable. This cannot be undone.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={deleteCoupon.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              deleteCoupon.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Coupons</h1>
        <p className="text-sm text-muted-foreground">Discount codes for the storefront.</p>
      </div>
      {children}
    </div>
  );
}
