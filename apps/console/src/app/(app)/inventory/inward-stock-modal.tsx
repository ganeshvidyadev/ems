'use client';

import { useState, useEffect } from 'react';
import { useAdjustInventory } from '@/lib/queries/inventory';
import { useWarehouses } from '@/lib/queries/warehouses';
import { useProducts } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import {
  Dialog,
  Button,
  Input,
  Select,
  Field,
  Alert,
} from '@/components/ui/primitives';
import { PackagePlus, Loader2, CheckCircle2 } from 'lucide-react';

interface InwardStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProductId?: string;
}

export function InwardStockModal({
  open,
  onOpenChange,
  preselectedProductId,
}: InwardStockModalProps) {
  const { store } = useCurrentStore();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const productsQuery = useProducts({
    page: 1,
    limit: 100,
    storeId: store?.id ?? '',
  });

  const adjustMutation = useAdjustInventory();

  const [productId, setProductId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [quantityDelta, setQuantityDelta] = useState<number>(25);
  const [type, setType] = useState<'COUNT_CORRECTION' | 'ADJUSTMENT'>('COUNT_CORRECTION');
  const [reason, setReason] = useState<string>('Stock Inward / Opening Inventory');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const products = productsQuery.data?.data ?? [];

  useEffect(() => {
    if (open) {
      if (preselectedProductId) {
        setProductId(preselectedProductId);
      } else if (products.length > 0 && products[0]) {
        setProductId(products[0].id);
      }
      if (warehouses && warehouses.length > 0 && warehouses[0]) {
        setWarehouseId(warehouses[0].id);
      }
      setQuantityDelta(25);
      setType('COUNT_CORRECTION');
      setReason('Stock Inward / Opening Inventory');
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [open, preselectedProductId, products, warehouses]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const effectiveProductId = productId || preselectedProductId || (products.length > 0 && products[0] ? products[0].id : '');
    const effectiveWarehouseId = warehouseId || (warehouses && warehouses.length > 0 && warehouses[0] ? warehouses[0].id : '');

    if (!effectiveProductId || !effectiveWarehouseId || !quantityDelta) {
      setErrorMsg('Please select both a product, warehouse, and a valid quantity.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await adjustMutation.mutateAsync({
        warehouseId: effectiveWarehouseId,
        productId: effectiveProductId,
        quantityDelta: Number(quantityDelta),
        type,
        reason: reason.trim() ? reason.trim() : undefined,
      });

      setSuccessMsg(`Successfully added ${quantityDelta > 0 ? '+' : ''}${quantityDelta} units to inventory!`);
      setTimeout(() => {
        onOpenChange(false);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to add stock. Please check warehouse and permissions.');
    }
  }

  const PRESETS = [10, 25, 50, 100, 250];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Inward & Add Stock"
      description="Add physical stock to a warehouse for any catalog product."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {errorMsg && (
          <Alert variant="error" className="text-xs">
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Product Selection */}
        <Field label="Select Product" htmlFor="inward-product-select">
          {productsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-xs text-amber-600">No products found. Please create a product first.</p>
          ) : (
            <Select
              id="inward-product-select"
              value={productId || preselectedProductId || (products[0] ? products[0].id : '')}
              onChange={(e) => setProductId(e.target.value)}
              disabled={adjustMutation.isPending}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Warehouse Selection */}
        <Field label="Target Warehouse" htmlFor="inward-warehouse-select">
          {warehousesLoading ? (
            <p className="text-xs text-muted-foreground">Loading warehouses…</p>
          ) : !warehouses || warehouses.length === 0 ? (
            <p className="text-xs text-amber-600">No warehouses found. Please create a warehouse in Warehouses menu.</p>
          ) : (
            <Select
              id="inward-warehouse-select"
              value={warehouseId || (warehouses[0] ? warehouses[0].id : '')}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={adjustMutation.isPending}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code}) {w.isDefault ? '• [Default]' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Quantity to Inward */}
        <Field label="Quantity to Inward (Units)" htmlFor="inward-quantity-input">
          <div className="space-y-2">
            <Input
              id="inward-quantity-input"
              type="number"
              min="1"
              max="100000"
              value={quantityDelta}
              onChange={(e) => setQuantityDelta(Number(e.target.value))}
              disabled={adjustMutation.isPending}
              className="tabular font-medium"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-medium text-slate-500 mr-1">Quick Select:</span>
              {PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setQuantityDelta(amount)}
                  className={
                    quantityDelta === amount
                      ? 'rounded-md px-2.5 py-0.5 text-xs font-medium border bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'rounded-md px-2.5 py-0.5 text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }
                >
                  +{amount}
                </button>
              ))}
            </div>
          </div>
        </Field>

        {/* Adjustment Type & Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Reason Category" htmlFor="inward-type-select">
            <Select
              id="inward-type-select"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              disabled={adjustMutation.isPending}
            >
              <option value="COUNT_CORRECTION">Opening Stock / Inward</option>
              <option value="ADJUSTMENT">Inventory Adjustment</option>
            </Select>
          </Field>

          <Field label="Reference / Notes" htmlFor="inward-reason-input">
            <Input
              id="inward-reason-input"
              placeholder="e.g. Batch #2026-09"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={adjustMutation.isPending}
            />
          </Field>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={adjustMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={adjustMutation.isPending || (!productId && !preselectedProductId) || !warehouseId || quantityDelta <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
          >
            {adjustMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Inwarding Stock…</span>
              </>
            ) : (
              <>
                <PackagePlus className="size-4" />
                <span>Add {quantityDelta} Units to Stock</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
