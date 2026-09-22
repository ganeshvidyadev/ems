'use client';

import { useState, useEffect } from 'react';
import type { InventoryLevelResponse } from '@ems/contracts';
import { useAdjustInventory } from '@/lib/queries/inventory';
import {
  Dialog,
  Button,
  Input,
  Badge,
  Alert,
} from '@/components/ui/primitives';
import { PackagePlus, Loader2, CheckCircle2, Sparkles } from 'lucide-react';

interface QuickRestockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryLevelResponse | null;
  productName?: string;
  productSku?: string;
}

export function QuickRestockModal({
  open,
  onOpenChange,
  item,
  productName,
  productSku,
}: QuickRestockModalProps) {
  const adjustMutation = useAdjustInventory();
  const [quantityDelta, setQuantityDelta] = useState<number>(25);
  const [type, setType] = useState<'COUNT_CORRECTION' | 'ADJUSTMENT'>('COUNT_CORRECTION');
  const [reason, setReason] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuantityDelta(25);
      setType('COUNT_CORRECTION');
      setReason('');
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [open, item]);

  if (!item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || quantityDelta === 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await adjustMutation.mutateAsync({
        warehouseId: item.warehouseId,
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        quantityDelta: Number(quantityDelta),
        type,
        reason: reason.trim() ? reason.trim() : undefined,
      });

      setSuccessMsg(`Successfully restocked ${quantityDelta > 0 ? '+' : ''}${quantityDelta} units.`);
      setTimeout(() => {
        onOpenChange(false);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to adjust stock. Please check permissions.');
    }
  }

  const PRESETS = [10, 25, 50, 100];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick Restock & Stock Adjustment"
      description="Update stock levels directly with automated ledger movements."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product & Warehouse Summary */}
        <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-foreground text-sm">
            <span>{productName ?? item.productId}</span>
            {productSku && <Badge variant="outline">{productSku}</Badge>}
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Warehouse: {item.warehouseName}</span>
            <span>Current Available: <strong className="text-foreground">{item.quantityAvailable}</strong></span>
          </div>
        </div>

        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Preset Quick Add Buttons */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Quick Add Quantity
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((amount) => (
              <Button
                key={amount}
                type="button"
                variant={quantityDelta === amount ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setQuantityDelta(amount)}
              >
                +{amount}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Quantity Input */}
        <div>
          <label htmlFor="quantity-delta" className="mb-1 block text-xs font-medium text-foreground">
            Adjustment Quantity (Positive to Restock, Negative to Deduct)
          </label>
          <Input
            id="quantity-delta"
            type="number"
            value={quantityDelta}
            onChange={(e) => setQuantityDelta(parseInt(e.target.value, 10) || 0)}
            className="tabular"
            required
          />
        </div>

        {/* Adjustment Type */}
        <div>
          <label htmlFor="adjust-type" className="mb-1 block text-xs font-medium text-foreground">
            Adjustment Type
          </label>
          <select
            id="adjust-type"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="COUNT_CORRECTION">Count Correction (Stock Audit / Received)</option>
            <option value="ADJUSTMENT">General Adjustment</option>
          </select>
        </div>

        {/* Reason / Reference Note */}
        <div>
          <label htmlFor="adjust-reason" className="mb-1 block text-xs font-medium text-foreground">
            Note / PO Reference (Optional)
          </label>
          <Input
            id="adjust-reason"
            placeholder="e.g. Received PO-8821 or Weekly Recount"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={adjustMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={adjustMutation.isPending || quantityDelta === 0 || !!successMsg}
            className="gap-1.5"
          >
            {adjustMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Restocking…</span>
              </>
            ) : (
              <>
                <PackagePlus className="size-3.5" />
                <span>Confirm Adjustment</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
