'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Input,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { useLowStock } from '@/lib/queries/inventory';
import { useProduct, useProducts } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';

export default function InventoryPage() {
  const { store, isLoading: storeLoading } = useCurrentStore();
  const lowStock = useLowStock();
  const [search, setSearch] = useState('');

  const searchQuery = useProducts({
    page: 1,
    limit: 5,
    q: search,
    storeId: store?.id ?? '',
  });

  if (storeLoading) {
    return <PageShell><p className="text-sm text-muted-foreground">Loading store…</p></PageShell>;
  }
  if (!store) {
    return <PageShell><p className="text-sm text-muted-foreground">No store found for this account yet.</p></PageShell>;
  }

  const results = search.trim().length > 0 ? searchQuery.data?.data ?? [] : [];
  const lowStockRows = lowStock.data ?? [];

  return (
    <PageShell>
      <div className="mb-6">
        <label htmlFor="product-search" className="mb-1.5 block text-sm font-medium">
          Find a product
        </label>
        <Input
          id="product-search"
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        {results.length > 0 && (
          <div className="mt-2 max-w-md overflow-hidden rounded-md border">
            {results.map((product) => (
              <Link
                key={product.id}
                href={`/inventory/${product.id}`}
                className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/50"
              >
                <span>{product.name}</span>
                <span className="text-xs text-muted-foreground">{product.sku}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Low stock</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Reserved</TableHead>
            <TableHead>Available</TableHead>
            <TableHead>Reorder point</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lowStock.isLoading ? (
            <TableEmptyRow colSpan={6}>Loading…</TableEmptyRow>
          ) : lowStockRows.length === 0 ? (
            <TableEmptyRow colSpan={6}>Nothing is at or below its reorder point.</TableEmptyRow>
          ) : (
            lowStockRows.map((row) => (
              <TableRow key={`${row.productId}-${row.variantId ?? ''}-${row.warehouseId}`}>
                <TableCell>
                  <ProductCell productId={row.productId} />
                </TableCell>
                <TableCell className="text-sm">{row.warehouseName}</TableCell>
                <TableCell className="tabular">{row.quantityOnHand}</TableCell>
                <TableCell className="tabular">{row.quantityReserved}</TableCell>
                <TableCell className="tabular">
                  <Badge variant={row.quantityAvailable <= 0 ? 'destructive' : 'warning'}>
                    {row.quantityAvailable}
                  </Badge>
                </TableCell>
                <TableCell className="tabular text-muted-foreground">{row.reorderPoint ?? '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </PageShell>
  );
}

/** `InventoryLevelResponse` carries only `productId` — this resolves it to a name/SKU for display. */
function ProductCell({ productId }: { productId: string }) {
  const { data: product } = useProduct(productId);
  return (
    <Link href={`/inventory/${productId}`} className="hover:underline">
      <p className="font-medium">{product?.name ?? productId}</p>
      {product && <p className="text-xs text-muted-foreground">{product.sku}</p>}
    </Link>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Stock levels, reorder alerts, and adjustments.</p>
      </div>
      {children}
    </div>
  );
}
