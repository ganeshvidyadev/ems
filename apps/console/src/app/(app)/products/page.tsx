'use client';

import type { ProductListQuery, ProductResponse } from '@ems/contracts';
import { Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ProductImportModal } from '@/components/products/product-import-modal';
import { downloadCsvFile, generateCsvText } from '@/lib/csv-helper';
import { apiGetPaginated, isForbidden } from '@/lib/api-client';
import {
  Alert,
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
import { useDeleteProduct, useProducts, usePublishProduct } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const STATUS_BADGE: Record<ProductResponse['status'], 'default' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  ARCHIVED: 'default',
  OUT_OF_STOCK: 'warning',
};

export default function ProductsPage() {
  // useSearchParams() suspends during prerender (see the login page's own
  // comment on the same tradeoff) — this page's data is entirely client-side
  // and paginated anyway, so a brief fallback here costs nothing a list page
  // wasn't already going to show while its first query loads.
  return (
    <Suspense fallback={<PageShell><p className="text-sm text-muted-foreground">Loading…</p></PageShell>}>
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { store, isLoading: storeLoading } = useCurrentStore();

  const page = Number(searchParams.get('page') ?? '1');
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState<ProductListQuery['status'] | ''>('');
  const [deleteTarget, setDeleteTarget] = useState<ProductResponse | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const canCreate = usePermission('product:create');
  const canUpdate = usePermission('product:update');
  const canDelete = usePermission('product:delete');
  const canPublish = usePermission('product:publish');

  const productsQuery = useProducts({
    page,
    limit: 20,
    q: q || undefined,
    status: status || undefined,
    storeId: store?.id ?? '',
  });
  const deleteProduct = useDeleteProduct();
  const publishProduct = usePublishProduct();

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.push(`/products?${params.toString()}`);
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteProduct.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  if (storeLoading) {
    return <PageShell><p className="text-sm text-muted-foreground">Loading store…</p></PageShell>;
  }

  if (!store) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">
          No store found for this account yet — products need a store to belong to.
        </p>
      </PageShell>
    );
  }

  const products = productsQuery.data?.data ?? [];
  const pagination = productsQuery.data?.meta.pagination;
  const canShowActions = canUpdate || canDelete || canPublish;
  const colSpan = canShowActions ? 5 : 4;

  async function exportProductsCsv() {
    if (!store?.id) return;
    setIsExporting(true);
    try {
      const res = await apiGetPaginated<ProductResponse>('/console/products', {
        params: {
          page: 1,
          limit: 500,
          storeId: store.id,
        },
      });
      const allProducts = res.data ?? products;
      if (!allProducts || allProducts.length === 0) return;

      const headers = [
        'Product Name',
        'SKU',
        'Slug',
        'Status',
        'Type',
        'Price (INR)',
        'Compare Price (INR)',
        'Barcode',
        'Variants Count',
        'Created At',
      ];

      const rows = allProducts.map((p) => [
        p.name,
        p.sku ?? '',
        p.slug,
        p.status,
        p.type,
        (Number(p.priceMinor) / 100).toFixed(2),
        p.comparePriceMinor ? (Number(p.comparePriceMinor) / 100).toFixed(2) : '',
        p.barcode ?? '',
        p.variants?.length ?? 0,
        formatDate(p.createdAt),
      ]);

      const csvContent = generateCsvText(headers, rows);
      const safeStoreName = store.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      downloadCsvFile(`products-catalog-${safeStoreName}-${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    } catch (err) {
      console.error('Failed to export catalog:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <PageShell
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting || (products.length === 0 && !productsQuery.isLoading)}
            onClick={() => void exportProductsCsv()}
            className="inline-flex items-center gap-1.5"
          >
            <Download className="size-3.5 text-slate-600" />
            {isExporting ? 'Exporting...' : 'Export Catalog CSV'}
          </Button>
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5"
            >
              <Upload className="size-3.5 text-slate-600" />
              Import CSV
            </Button>
          )}
          {canCreate && <Button onClick={() => router.push('/products/new')}>New product</Button>}
        </div>
      }
    >
      <form onSubmit={onSearchSubmit} className="mb-4 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or SKU…"
          className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ProductListQuery['status'] | '');
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
        </Select>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {productsQuery.isError && (
        <Alert variant="error" className="mb-4">
          {isForbidden(productsQuery.error)
            ? 'You do not have permission to view products.'
            : 'Could not load products. Try refreshing the page.'}
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Updated</TableHead>
            {canShowActions && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {productsQuery.isLoading ? (
            <TableEmptyRow colSpan={colSpan}>Loading…</TableEmptyRow>
          ) : productsQuery.isError ? null : products.length === 0 ? (
            <TableEmptyRow colSpan={colSpan}>No products match these filters.</TableEmptyRow>
          ) : (
            products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                    {product.type === 'VARIABLE' && (
                      <Badge variant="outline" className="text-[10px] py-0 font-normal">
                        Variable {product.variants?.length ? `(${product.variants.length})` : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{product.sku ?? '—'}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[product.status]}>{product.status}</Badge>
                </TableCell>
                <TableCell className="tabular">
                  {formatMoney({ amountMinor: product.priceMinor, currency: product.currency })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(product.updatedAt)}</TableCell>
                {canShowActions && (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {canPublish && product.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={publishProduct.isPending && publishProduct.variables === product.id}
                          onClick={() => publishProduct.mutate(product.id)}
                        >
                          Publish
                        </Button>
                      )}
                      {canUpdate && (
                        <Button size="sm" variant="outline" onClick={() => router.push(`/products/${product.id}`)}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(product)}>
                          Delete
                        </Button>
                      )}
                    </div>
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
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product"
        description={`"${deleteTarget?.name}" will be permanently removed. This cannot be undone.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={deleteProduct.isPending} onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </Dialog>

      {store && (
        <ProductImportModal
          open={importOpen}
          onOpenChange={setImportOpen}
          storeId={store.id}
          onSuccess={() => {
            void productsQuery.refetch();
          }}
        />
      )}
    </PageShell>
  );
}

function PageShell({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn('mx-auto max-w-5xl px-6 py-8')}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your store&apos;s catalog.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
