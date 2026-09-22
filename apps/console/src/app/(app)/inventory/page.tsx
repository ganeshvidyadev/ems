'use client';

import { Download, PackagePlus, Plus, Warehouse, Search, Layers } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { InventoryLevelResponse, ProductResponse } from '@ems/contracts';
import {
  Alert,
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { isForbidden } from '@/lib/api-client';
import { downloadCsvFile, generateCsvText } from '@/lib/csv-helper';
import { useLowStock } from '@/lib/queries/inventory';
import { useProduct, useProducts } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import { QuickRestockModal } from './quick-restock-modal';
import { InwardStockModal } from './inward-stock-modal';

export default function InventoryPage() {
  const { store, isLoading: storeLoading, isError: storeIsError, error: storeError } = useCurrentStore();
  const lowStock = useLowStock();
  const [search, setSearch] = useState('');
  const [restockItem, setRestockItem] = useState<InventoryLevelResponse | null>(null);
  const [inwardOpen, setInwardOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);

  // All catalog products
  const productsQuery = useProducts({
    page: 1,
    limit: 50,
    q: search || undefined,
    storeId: store?.id ?? '',
  });

  const catalogProducts = productsQuery.data?.data ?? [];
  const lowStockRows = lowStock.data ?? [];

  function handleOpenInward(productId?: string) {
    setSelectedProductId(productId);
    setInwardOpen(true);
  }

  function exportLowStockCsv() {
    if (lowStockRows.length === 0) return;
    const headers = [
      'Product ID',
      'Warehouse ID',
      'Warehouse Name',
      'On Hand',
      'Reserved',
      'Available',
      'Reorder Point',
      'Status',
    ];
    const rows = lowStockRows.map((r) => [
      r.productId,
      r.warehouseId,
      r.warehouseName,
      r.quantityOnHand,
      r.quantityReserved,
      r.quantityAvailable,
      r.reorderPoint ?? '—',
      r.quantityAvailable <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
    ]);
    const csv = generateCsvText(headers, rows);
    downloadCsvFile(`low-stock-inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Top Header with Primary Actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory & Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage warehouse inventory levels, inward stock, and monitor low stock alerts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <Link href="/warehouses">
              <Warehouse className="size-3.5 text-slate-600" />
              <span>Warehouses</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <Link href="/products/new">
              <Plus className="size-3.5 text-slate-600" />
              <span>New Product</span>
            </Link>
          </Button>
          <Button
            onClick={() => handleOpenInward()}
            size="sm"
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm"
          >
            <PackagePlus className="size-4" />
            <span>+ Inward / Add Stock</span>
          </Button>
        </div>
      </div>

      {/* Catalog Stock & Search Section */}
      <div className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="size-4 text-emerald-600" />
              <span>Product Inventory Catalog</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click on any product to adjust quantities, view warehouse distributions, or track movement history.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              id="product-search"
              placeholder="Search by product name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {storeLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading catalog…</p>
        ) : !store ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {storeIsError && isForbidden(storeError)
              ? 'You do not have permission to access store inventory.'
              : 'No store selected.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/75">
                <TableHead>Product Name & SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.isLoading ? (
                <TableEmptyRow colSpan={3}>Loading products…</TableEmptyRow>
              ) : catalogProducts.length === 0 ? (
                <TableEmptyRow colSpan={3}>
                  {search ? 'No products matching search.' : 'No products found in catalog. Create your first product.'}
                </TableEmptyRow>
              ) : (
                catalogProducts.map((p) => (
                  <TableRow key={p.id} className="hover:bg-slate-50/60">
                    <TableCell>
                      <Link href={`/inventory/${p.id}`} className="group flex flex-col">
                        <span className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                          {p.name}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">{p.sku}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'ACTIVE' ? 'success' : 'outline'} className="text-[11px]">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-medium gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => handleOpenInward(p.id)}
                        >
                          <PackagePlus className="size-3.5" />
                          <span>+ Inward Stock</span>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium">
                          <Link href={`/inventory/${p.id}`}>View Details →</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Low Stock & Reorder Alerts Section */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Low Stock & Reorder Alerts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Products at or below their configured reorder threshold requiring restocking.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={lowStockRows.length === 0}
            onClick={exportLowStockCsv}
            className="inline-flex items-center gap-1.5 text-xs h-8"
          >
            <Download className="size-3.5 text-slate-600" />
            Export Low Stock CSV
          </Button>
        </div>

        {lowStock.isError && (
          <Alert variant="error" className="mb-3 text-xs">
            {isForbidden(lowStock.error)
              ? 'You do not have permission to view low-stock levels.'
              : 'Could not load low-stock levels. Try refreshing the page.'}
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/75">
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Reorder point</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowStock.isLoading ? (
              <TableEmptyRow colSpan={7}>Loading…</TableEmptyRow>
            ) : lowStock.isError ? null : lowStockRows.length === 0 ? (
              <TableEmptyRow colSpan={7}>All inventory levels are healthy! Nothing is below reorder point.</TableEmptyRow>
            ) : (
              lowStockRows.map((row) => (
                <TableRow key={`${row.productId}-${row.variantId ?? ''}-${row.warehouseId}`}>
                  <TableCell>
                    <ProductCell productId={row.productId} />
                  </TableCell>
                  <TableCell className="text-sm">{row.warehouseName}</TableCell>
                  <TableCell className="tabular font-medium">{row.quantityOnHand}</TableCell>
                  <TableCell className="tabular text-slate-500">{row.quantityReserved}</TableCell>
                  <TableCell className="tabular">
                    <Badge variant={row.quantityAvailable <= 0 ? 'destructive' : 'warning'}>
                      {row.quantityAvailable <= 0
                        ? 'Out of stock'
                        : `${row.quantityAvailable} available`}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">{row.reorderPoint ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setRestockItem(row)}
                      >
                        <PackagePlus className="size-3.5" />
                        <span>Restock</span>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                        <Link href={`/inventory/${row.productId}`}>Details</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Global Inward Stock Modal */}
      <InwardStockModal
        open={inwardOpen}
        onOpenChange={(open) => {
          setInwardOpen(open);
          if (!open) setSelectedProductId(undefined);
        }}
        preselectedProductId={selectedProductId}
      />

      {/* Low Stock Quick Restock Modal */}
      <QuickRestockModal
        open={Boolean(restockItem)}
        onOpenChange={(open) => {
          if (!open) setRestockItem(null);
        }}
        item={restockItem}
      />
    </div>
  );
}

function ProductCell({ productId }: { productId: string }) {
  const { data: product } = useProduct(productId);
  return (
    <Link href={`/inventory/${productId}`} className="hover:underline">
      <p className="font-semibold text-slate-900">{product?.name ?? productId}</p>
      {product && <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>}
    </Link>
  );
}
