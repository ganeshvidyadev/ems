'use client';

import type { CustomerListQuery, CustomerResponse } from '@ems/contracts';
import { Download, Loader2 } from 'lucide-react';
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
import { usePermission } from '@/hooks/use-auth';
import { apiGetPaginated, isForbidden } from '@/lib/api-client';
import { downloadCsvFile, generateCsvText } from '@/lib/csv-helper';
import { useCustomers } from '@/lib/queries/customers';
import { formatDate, formatMoney } from '@/lib/utils';

export default function CustomersPage() {
  return (
    <Suspense fallback={<PageShell><p className="text-sm text-muted-foreground">Loading…</p></PageShell>}>
      <CustomersPageContent />
    </Suspense>
  );
}

function CustomersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreate = usePermission('customer:create');

  const page = Number(searchParams.get('page') ?? '1');
  const [status, setStatus] = useState<CustomerListQuery['status'] | ''>('');

  const customersQuery = useCustomers({ page, limit: 20, status: status || undefined });

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.push(`/customers?${params.toString()}`);
  }

  const customers = customersQuery.data?.data ?? [];
  const pagination = customersQuery.data?.meta.pagination;

  const [isExporting, setIsExporting] = useState(false);

  async function exportCustomersCsv() {
    setIsExporting(true);
    try {
      const res = await apiGetPaginated<CustomerResponse>('/console/customers', {
        params: {
          page: 1,
          limit: 500,
          status: status || undefined,
        },
      });

      const exportList = res.data?.length ? res.data : customers;
      if (!exportList || exportList.length === 0) return;

      const headers = [
        'Customer ID',
        'Name',
        'Email',
        'Phone',
        'Status',
        'Accepts Marketing',
        'Is Guest',
        'Total Orders',
        'Total Spent (INR)',
        'Average Order Value (INR)',
        'Joined Date',
      ];

      const rows = exportList.map((c) => [
        c.id,
        c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Customer',
        c.email ?? '',
        c.phone ?? '',
        c.status,
        c.acceptsMarketing ? 'YES' : 'NO',
        c.isGuest ? 'YES' : 'NO',
        c.totalOrders ?? 0,
        (Number(c.totalSpentMinor || 0) / 100).toFixed(2),
        (Number(c.averageOrderMinor || 0) / 100).toFixed(2),
        formatDate(c.createdAt),
      ]);

      const csvContent = generateCsvText(headers, rows);
      const filename = `customers-export-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsvFile(filename, csvContent);
    } catch (err) {
      console.error('Failed to export customers CSV:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value as CustomerListQuery['status'] | ''); setPage(1); }}
          className="w-44"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            disabled={customers.length === 0 || isExporting}
            onClick={() => void exportCustomersCsv()}
            className="inline-flex items-center gap-1.5"
          >
            {isExporting ? (
              <Loader2 className="size-3.5 animate-spin text-slate-600" />
            ) : (
              <Download className="size-3.5 text-slate-600" />
            )}
            {isExporting ? 'Exporting…' : 'Export Customers CSV'}
          </Button>

          {canCreate && (
            <Link href="/customers/new">
              <Button>New customer</Button>
            </Link>
          )}
        </div>
      </div>

      {customersQuery.isError && (
        <Alert variant="error" className="mb-4">
          {isForbidden(customersQuery.error)
            ? 'You do not have permission to view customers.'
            : 'Could not load customers. Try refreshing the page.'}
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Total spent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customersQuery.isLoading ? (
            <TableEmptyRow colSpan={6}>Loading…</TableEmptyRow>
          ) : customersQuery.isError ? null : customers.length === 0 ? (
            <TableEmptyRow colSpan={6}>No customers match these filters.</TableEmptyRow>
          ) : (
            customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.displayName}
                  </Link>
                  {customer.isGuest && <span className="ml-2 text-xs text-muted-foreground">Guest</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{customer.email ?? customer.phone ?? '—'}</TableCell>
                <TableCell className="tabular">{customer.totalOrders}</TableCell>
                <TableCell className="tabular">
                  {formatMoney({ amountMinor: customer.totalSpentMinor, currency: customer.currency ?? 'INR' })}
                </TableCell>
                <TableCell>
                  <Badge variant={customer.status === 'ACTIVE' ? 'success' : customer.status === 'BLOCKED' ? 'destructive' : 'default'}>
                    {customer.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(customer.createdAt)}</TableCell>
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
        <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">Everyone who has an account or has ordered from your store.</p>
      </div>
      {children}
    </div>
  );
}
