'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { INVENTORY_MOVEMENT_TYPES, type InventoryLevelResponse } from '@ems/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
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
import { ApiError } from '@/lib/api-client';
import {
  useAdjustInventory,
  useInventoryLevels,
  useInventoryMovements,
  useTransferInventory,
  useUpsertInventorySettings,
} from '@/lib/queries/inventory';
import { useProduct } from '@/lib/queries/products';
import { useWarehouses } from '@/lib/queries/warehouses';
import { formatDate } from '@/lib/utils';

const ADJUST_TYPES = ['ADJUSTMENT', 'DAMAGE', 'THEFT', 'EXPIRY', 'COUNT_CORRECTION'] as const;

export default function InventoryDetailPage() {
  const params = useParams<{ productId: string }>();
  const canAdjust = usePermission('inventory:adjust');

  const { data: product } = useProduct(params.productId);
  const levelsQuery = useInventoryLevels(params.productId);
  const { data: warehouses } = useWarehouses();

  const [page, setPage] = useState(1);
  const movementsQuery = useInventoryMovements(params.productId, page);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [settingsRow, setSettingsRow] = useState<InventoryLevelResponse | null>(null);

  const levels = levelsQuery.data ?? [];
  const movements = movementsQuery.data?.data ?? [];
  const pagination = movementsQuery.data?.meta.pagination;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted-foreground hover:underline">
        ← Back to inventory
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{product?.name ?? 'Loading…'}</h1>
          {product && <p className="text-sm text-muted-foreground">{product.sku}</p>}
        </div>
        {canAdjust && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              Transfer stock
            </Button>
            <Button onClick={() => setAdjustOpen(true)}>Adjust stock</Button>
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Stock by warehouse</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Warehouse</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Reserved</TableHead>
            <TableHead>Incoming</TableHead>
            <TableHead>Available</TableHead>
            <TableHead>Reorder point</TableHead>
            <TableHead>Bin</TableHead>
            {canAdjust && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {levelsQuery.isLoading ? (
            <TableEmptyRow colSpan={canAdjust ? 8 : 7}>Loading…</TableEmptyRow>
          ) : levels.length === 0 ? (
            <TableEmptyRow colSpan={canAdjust ? 8 : 7}>No stock recorded for this product yet.</TableEmptyRow>
          ) : (
            levels.map((row) => (
              <TableRow key={row.warehouseId}>
                <TableCell className="font-medium">{row.warehouseName}</TableCell>
                <TableCell className="tabular">{row.quantityOnHand}</TableCell>
                <TableCell className="tabular">{row.quantityReserved}</TableCell>
                <TableCell className="tabular">{row.quantityIncoming}</TableCell>
                <TableCell className="tabular">{row.quantityAvailable}</TableCell>
                <TableCell className="tabular text-muted-foreground">{row.reorderPoint ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.binLocation ?? '—'}</TableCell>
                {canAdjust && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsRow(row)}>
                      Edit
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Movement history</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>After</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movementsQuery.isLoading ? (
            <TableEmptyRow colSpan={5}>Loading…</TableEmptyRow>
          ) : movements.length === 0 ? (
            <TableEmptyRow colSpan={5}>No movements recorded yet.</TableEmptyRow>
          ) : (
            movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-sm">{m.type}</TableCell>
                <TableCell className={m.quantityDelta < 0 ? 'tabular text-destructive' : 'tabular text-success'}>
                  {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                </TableCell>
                <TableCell className="tabular">{m.quantityAfter}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.reason ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
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

      {canAdjust && (
        <>
          <AdjustDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            productId={params.productId}
            warehouses={warehouses ?? []}
          />
          <TransferDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            productId={params.productId}
            warehouses={warehouses ?? []}
          />
          {settingsRow && (
            <SettingsDialog
              key={settingsRow.warehouseId}
              row={settingsRow}
              productId={params.productId}
              onOpenChange={(open) => {
                if (!open) setSettingsRow(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adjust stock
// ---------------------------------------------------------------------------

const adjustFormSchema = z.object({
  warehouseId: z.string().min(1, 'Warehouse is required'),
  quantityDelta: z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'Whole number only')
    .refine((v) => Number(v) !== 0, 'Must not be zero'),
  type: z.enum(ADJUST_TYPES),
  reason: z.string().trim().max(255).optional(),
});
type AdjustFormValues = z.input<typeof adjustFormSchema>;

function AdjustDialog({
  open,
  onOpenChange,
  productId,
  warehouses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  warehouses: { id: string; name: string }[];
}) {
  const adjust = useAdjustInventory();
  const form = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustFormSchema),
    defaultValues: { warehouseId: '', quantityDelta: '', type: 'ADJUSTMENT', reason: '' },
  });

  async function onSubmit(values: AdjustFormValues) {
    try {
      await adjust.mutateAsync({
        warehouseId: values.warehouseId,
        productId,
        quantityDelta: Number(values.quantityDelta),
        type: values.type,
        reason: values.reason || undefined,
      });
      form.reset({ warehouseId: '', quantityDelta: '', type: 'ADJUSTMENT', reason: '' });
      onOpenChange(false);
    } catch (error) {
      form.setError('root', { message: error instanceof ApiError ? error.message : 'Adjustment failed.' });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust stock"
      description="Manual recount, damage, theft, or expiry — never touches reserved stock."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

        <Field label="Warehouse" htmlFor="adj-warehouse" error={form.formState.errors.warehouseId?.message}>
          <Select id="adj-warehouse" {...form.register('warehouseId')}>
            <option value="">Select a warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Quantity change"
          htmlFor="adj-qty"
          hint="Positive to add stock, negative to remove it (e.g. -5)"
          error={form.formState.errors.quantityDelta?.message}
        >
          <Input id="adj-qty" inputMode="numeric" placeholder="-5" {...form.register('quantityDelta')} />
        </Field>

        <Field label="Reason type" htmlFor="adj-type">
          <Select id="adj-type" {...form.register('type')}>
            {ADJUST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note" htmlFor="adj-reason" hint="Optional">
          <Input id="adj-reason" {...form.register('reason')} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Apply adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Transfer stock
// ---------------------------------------------------------------------------

const transferFormSchema = z
  .object({
    fromWarehouseId: z.string().min(1, 'Required'),
    toWarehouseId: z.string().min(1, 'Required'),
    quantity: z.string().trim().regex(/^\d+$/, 'Positive whole number only'),
    reason: z.string().trim().max(255).optional(),
  })
  .refine((v) => !v.fromWarehouseId || !v.toWarehouseId || v.fromWarehouseId !== v.toWarehouseId, {
    message: 'Choose two different warehouses',
    path: ['toWarehouseId'],
  });
type TransferFormValues = z.input<typeof transferFormSchema>;

function TransferDialog({
  open,
  onOpenChange,
  productId,
  warehouses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  warehouses: { id: string; name: string }[];
}) {
  const transfer = useTransferInventory();
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: { fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '' },
  });

  async function onSubmit(values: TransferFormValues) {
    try {
      await transfer.mutateAsync({
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        productId,
        quantity: Number(values.quantity),
        reason: values.reason || undefined,
      });
      form.reset({ fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '' });
      onOpenChange(false);
    } catch (error) {
      form.setError('root', { message: error instanceof ApiError ? error.message : 'Transfer failed.' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Transfer stock" description="Moves stock between two warehouses.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="From" htmlFor="xfer-from" error={form.formState.errors.fromWarehouseId?.message}>
            <Select id="xfer-from" {...form.register('fromWarehouseId')}>
              <option value="">Select</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To" htmlFor="xfer-to" error={form.formState.errors.toWarehouseId?.message}>
            <Select id="xfer-to" {...form.register('toWarehouseId')}>
              <option value="">Select</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Quantity" htmlFor="xfer-qty" error={form.formState.errors.quantity?.message}>
          <Input id="xfer-qty" inputMode="numeric" placeholder="10" {...form.register('quantity')} />
        </Field>

        <Field label="Note" htmlFor="xfer-reason" hint="Optional">
          <Input id="xfer-reason" {...form.register('reason')} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Transfer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit reorder settings
// ---------------------------------------------------------------------------

const settingsFormSchema = z.object({
  reorderPoint: z.string().trim().optional(),
  reorderQuantity: z.string().trim().optional(),
  binLocation: z.string().trim().optional(),
});
type SettingsFormValues = z.input<typeof settingsFormSchema>;

function SettingsDialog({
  row,
  productId,
  onOpenChange,
}: {
  row: InventoryLevelResponse;
  productId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const upsert = useUpsertInventorySettings();
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      reorderPoint: row.reorderPoint?.toString() ?? '',
      reorderQuantity: row.reorderQuantity?.toString() ?? '',
      binLocation: row.binLocation ?? '',
    },
  });

  async function onSubmit(values: SettingsFormValues) {
    try {
      await upsert.mutateAsync({
        warehouseId: row.warehouseId,
        productId,
        // An emptied field means "clear it" — sent as `null`, distinct from
        // `undefined` (which the server reads as "leave unchanged").
        reorderPoint: values.reorderPoint?.trim() ? Number(values.reorderPoint) : null,
        reorderQuantity: values.reorderQuantity?.trim() ? Number(values.reorderQuantity) : null,
        binLocation: values.binLocation?.trim() ? values.binLocation.trim() : null,
      });
      onOpenChange(false);
    } catch (error) {
      form.setError('root', { message: error instanceof ApiError ? error.message : 'Could not save settings.' });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Reorder settings — ${row.warehouseName}`}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Reorder point" htmlFor="set-point" hint="Empty clears it">
            <Input id="set-point" inputMode="numeric" {...form.register('reorderPoint')} />
          </Field>
          <Field label="Reorder quantity" htmlFor="set-qty" hint="Empty clears it">
            <Input id="set-qty" inputMode="numeric" {...form.register('reorderQuantity')} />
          </Field>
        </div>

        <Field label="Bin location" htmlFor="set-bin" hint="Empty clears it">
          <Input id="set-bin" {...form.register('binLocation')} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
