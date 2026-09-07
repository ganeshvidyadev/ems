'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  addressRequestSchema,
  CUSTOMER_STATUSES,
  updateCustomerRequestSchema,
  type AddressRequest,
  type AddressResponse,
} from '@ems/contracts';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import {
  useAddAddress,
  useAddWishlistItem,
  useCustomer,
  useCustomerAddresses,
  useCustomerWishlist,
  useRemoveAddress,
  useRemoveWishlistItem,
  useUpdateAddress,
  useUpdateCustomer,
} from '@/lib/queries/customers';
import { useProduct, useProducts } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import { formatDate, formatMoney } from '@/lib/utils';

const profileFormSchema = updateCustomerRequestSchema.extend({
  tags: z.string().trim().optional(), // comma-separated in the form, an array on the wire
});
type ProfileFormValues = z.input<typeof profileFormSchema>;

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = usePermission('customer:update');

  const { data: customer, isLoading, isError } = useCustomer(params.id);
  const updateCustomer = useUpdateCustomer(params.id);

  const addressesQuery = useCustomerAddresses(params.id);
  const addAddress = useAddAddress(params.id);
  const updateAddress = useUpdateAddress(params.id);
  const removeAddress = useRemoveAddress(params.id);

  const wishlistQuery = useCustomerWishlist(params.id);
  const removeWishlistItem = useRemoveWishlistItem(params.id);

  const [addressDialog, setAddressDialog] = useState<{ mode: 'add' | 'edit'; address?: AddressResponse } | null>(null);
  const [deleteAddress, setDeleteAddress] = useState<AddressResponse | null>(null);
  const [addWishlistOpen, setAddWishlistOpen] = useState(false);

  const form = useForm<ProfileFormValues>({ resolver: zodResolver(profileFormSchema) });

  useEffect(() => {
    if (!customer) return;
    form.reset({
      firstName: customer.firstName ?? '',
      lastName: customer.lastName ?? '',
      customerGroup: customer.customerGroup ?? '',
      taxExempt: customer.taxExempt,
      acceptsMarketing: customer.acceptsMarketing,
      tags: customer.tags?.join(', ') ?? '',
      notes: customer.notes ?? '',
      status: customer.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function onSubmit(values: ProfileFormValues) {
    try {
      await updateCustomer.mutateAsync({
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        customerGroup: values.customerGroup || null,
        taxExempt: values.taxExempt,
        acceptsMarketing: values.acceptsMarketing,
        tags: values.tags
          ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined,
        notes: values.notes || null,
        status: values.status,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof ProfileFormValues, { message });
        }
        if (Object.keys(error.fieldErrors).length === 0) {
          form.setError('root', { message: error.message });
        }
      }
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (isError || !customer) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Alert variant="error">This customer could not be found.</Alert>
      </div>
    );
  }

  const addresses = addressesQuery.data ?? [];
  const wishlist = wishlistQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button variant="ghost" size="sm" onClick={() => router.push('/customers')} className="mb-2 -ml-3">
        ← Back to customers
      </Button>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{customer.displayName}</h1>
          <p className="text-sm text-muted-foreground">{customer.email ?? customer.phone ?? 'No contact on file'}</p>
        </div>
        <Badge variant={customer.status === 'ACTIVE' ? 'success' : customer.status === 'BLOCKED' ? 'destructive' : 'default'}>
          {customer.status}
        </Badge>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat label="Orders" value={String(customer.totalOrders)} />
        <Stat label="Total spent" value={formatMoney({ amountMinor: customer.totalSpentMinor, currency: customer.currency ?? 'INR' })} />
        <Stat label="Avg order" value={formatMoney({ amountMinor: customer.averageOrderMinor, currency: customer.currency ?? 'INR' })} />
        <Stat label="Loyalty points" value={String(customer.loyaltyPoints)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Profile" />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" htmlFor="firstName">
                <Input id="firstName" disabled={!canUpdate} {...form.register('firstName')} />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" disabled={!canUpdate} {...form.register('lastName')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer group" htmlFor="customerGroup" hint="Optional">
                <Input id="customerGroup" disabled={!canUpdate} {...form.register('customerGroup')} />
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" disabled={!canUpdate} {...form.register('status')}>
                  {CUSTOMER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Tags" htmlFor="tags" hint="Comma-separated, optional">
              <Input id="tags" disabled={!canUpdate} {...form.register('tags')} />
            </Field>

            <Field label="Notes" htmlFor="notes" hint="Internal only, optional">
              <Textarea id="notes" rows={3} disabled={!canUpdate} {...form.register('notes')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" disabled={!canUpdate} {...form.register('taxExempt')} />
              Tax exempt
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" disabled={!canUpdate} {...form.register('acceptsMarketing')} />
              Accepts marketing emails
            </label>

            {canUpdate && (
              <div className="flex justify-end pt-2">
                <Button type="submit" loading={form.formState.isSubmitting}>
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Addresses" />
        <CardBody>
          {canUpdate && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={() => setAddressDialog({ mode: 'add' })}>
                Add address
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Default</TableHead>
                {canUpdate && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {addresses.length === 0 ? (
                <TableEmptyRow colSpan={canUpdate ? 5 : 4}>No addresses on file.</TableEmptyRow>
              ) : (
                addresses.map((address) => (
                  <TableRow key={address.id}>
                    <TableCell>
                      <p className="font-medium">{address.recipientName}</p>
                      <p className="text-xs text-muted-foreground">{address.phone ?? '—'}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {address.addressLine1}, {address.city}, {address.stateName ?? address.stateCode} {address.postalCode}
                    </TableCell>
                    <TableCell className="text-sm">{address.type}</TableCell>
                    <TableCell className="text-sm">
                      {address.isDefaultShipping && 'Shipping '}
                      {address.isDefaultBilling && 'Billing'}
                    </TableCell>
                    {canUpdate && (
                      <TableCell className="space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => setAddressDialog({ mode: 'edit', address })}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAddress(address)}>
                          Delete
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Wishlist" />
        <CardBody>
          {canUpdate && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" onClick={() => setAddWishlistOpen(true)}>
                Add product
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Added</TableHead>
                {canUpdate && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {wishlist.length === 0 ? (
                <TableEmptyRow colSpan={canUpdate ? 3 : 2}>Nothing wishlisted yet.</TableEmptyRow>
              ) : (
                wishlist.map((item) => (
                  <TableRow key={`${item.productId}-${item.variantId ?? ''}`}>
                    <TableCell>
                      <WishlistProductCell productId={item.productId} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(item.addedAt)}</TableCell>
                    {canUpdate && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            removeWishlistItem.mutate({ productId: item.productId, variantId: item.variantId ?? undefined })
                          }
                        >
                          Remove
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {addressDialog && (
        <AddressFormDialog
          key={addressDialog.address?.id ?? 'new'}
          mode={addressDialog.mode}
          initial={addressDialog.address}
          onOpenChange={(open) => { if (!open) setAddressDialog(null); }}
          onSubmit={async (values) => {
            // The form's own schema is `addressRequestSchema` as-authored, whose
            // defaulted fields (`type`/`countryCode`/the two `isDefault*`) are
            // optional in `z.input` even though `zodResolver` always fills them
            // in by the time this runs — filled in again explicitly here so the
            // mutation's `AddressRequest` (the post-default output type) is
            // satisfied without an unsound cast.
            const body: AddressRequest = {
              ...values,
              type: values.type ?? 'BOTH',
              countryCode: values.countryCode ?? 'IN',
              isDefaultShipping: values.isDefaultShipping ?? false,
              isDefaultBilling: values.isDefaultBilling ?? false,
              // An empty "Optional" text input yields `''`, which the wire
              // schema's `phoneSchema.optional()` rejects (only `undefined`
              // is accepted) — same conversion the create-product form does
              // for `brandId`. Found live: a 422 on submit.
              phone: values.phone || undefined,
            };
            if (addressDialog.mode === 'add') {
              await addAddress.mutateAsync(body);
            } else if (addressDialog.address) {
              await updateAddress.mutateAsync({ addressId: addressDialog.address.id, body });
            }
            setAddressDialog(null);
          }}
        />
      )}

      <Dialog
        open={deleteAddress !== null}
        onOpenChange={(open) => { if (!open) setDeleteAddress(null); }}
        title="Delete address"
        description={deleteAddress ? `The address for "${deleteAddress.recipientName}" will be removed.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteAddress(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={removeAddress.isPending}
            onClick={() => {
              if (!deleteAddress) return;
              removeAddress.mutate(deleteAddress.id, { onSuccess: () => setDeleteAddress(null) });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      {addWishlistOpen && (
        <AddWishlistDialog customerId={params.id} onOpenChange={setAddWishlistOpen} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

/** `WishlistItemResponse` carries only `productId` — resolves it to a name/SKU for display. */
function WishlistProductCell({ productId }: { productId: string }) {
  const { data: product } = useProduct(productId);
  return (
    <Link href={`/products/${productId}`} className="hover:underline">
      <p className="font-medium">{product?.name ?? productId}</p>
      {product && <p className="text-xs text-muted-foreground">{product.sku}</p>}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Address add/edit dialog
// ---------------------------------------------------------------------------

// `phone` is relaxed from the base `phoneSchema.optional()` — an untouched
// optional text input yields `''`, not `undefined`, and `''` fails
// `phoneSchema`'s E.164 regex the same way the customer form's password
// field did. Only enforce the format when something was actually typed.
const addressFormSchema = addressRequestSchema.omit({ phone: true }).extend({
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\+[1-9]\d{7,14}$/.test(v), { message: 'Must be E.164 format, e.g. +919876543210' }),
});
type AddressFormValues = z.input<typeof addressFormSchema>;

function AddressFormDialog({
  mode,
  initial,
  onOpenChange,
  onSubmit,
}: {
  mode: 'add' | 'edit';
  initial?: AddressResponse;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AddressFormValues) => Promise<void>;
}) {
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: initial
      ? {
          label: initial.label ?? '',
          type: initial.type,
          recipientName: initial.recipientName,
          phone: initial.phone ?? '',
          addressLine1: initial.addressLine1,
          addressLine2: initial.addressLine2 ?? '',
          city: initial.city,
          stateCode: initial.stateCode ?? '',
          stateName: initial.stateName ?? '',
          postalCode: initial.postalCode,
          countryCode: initial.countryCode,
          isDefaultShipping: initial.isDefaultShipping,
          isDefaultBilling: initial.isDefaultBilling,
        }
      : { type: 'BOTH', countryCode: 'IN', isDefaultShipping: false, isDefaultBilling: false },
  });

  async function handle(values: AddressFormValues) {
    try {
      await onSubmit(values);
    } catch (error) {
      form.setError('root', { message: error instanceof ApiError ? error.message : 'Could not save this address.' });
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title={mode === 'add' ? 'Add address' : 'Edit address'}>
      <form onSubmit={form.handleSubmit(handle)} className="space-y-4" noValidate>
        {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Recipient name" htmlFor="recipientName" error={form.formState.errors.recipientName?.message}>
            <Input id="recipientName" autoFocus {...form.register('recipientName')} />
          </Field>
          <Field label="Phone" htmlFor="addr-phone" hint="Optional" error={form.formState.errors.phone?.message}>
            <Input id="addr-phone" {...form.register('phone')} />
          </Field>
        </div>

        <Field label="Address line 1" htmlFor="addressLine1" error={form.formState.errors.addressLine1?.message}>
          <Input id="addressLine1" {...form.register('addressLine1')} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2" hint="Optional">
          <Input id="addressLine2" {...form.register('addressLine2')} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City" htmlFor="city" error={form.formState.errors.city?.message}>
            <Input id="city" {...form.register('city')} />
          </Field>
          <Field label="Postal code" htmlFor="postalCode" error={form.formState.errors.postalCode?.message}>
            <Input id="postalCode" {...form.register('postalCode')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="State" htmlFor="stateName" hint="Optional">
            <Input id="stateName" {...form.register('stateName')} />
          </Field>
          <Field label="Country" htmlFor="countryCode">
            <Input id="countryCode" maxLength={2} {...form.register('countryCode')} />
          </Field>
        </div>

        <Field label="Type" htmlFor="type">
          <Select id="type" {...form.register('type')}>
            <option value="BOTH">Shipping & billing</option>
            <option value="SHIPPING">Shipping only</option>
            <option value="BILLING">Billing only</option>
          </Select>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...form.register('isDefaultShipping')} />
          Default shipping address
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...form.register('isDefaultBilling')} />
          Default billing address
        </label>

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

// ---------------------------------------------------------------------------
// Add-to-wishlist dialog — a product search, same pattern as the inventory
// page's "find a product" box.
// ---------------------------------------------------------------------------

function AddWishlistDialog({ customerId, onOpenChange }: { customerId: string; onOpenChange: (open: boolean) => void }) {
  const { store } = useCurrentStore();
  const [search, setSearch] = useState('');
  const addWishlistItem = useAddWishlistItem(customerId);

  const searchQuery = useProducts({ page: 1, limit: 5, q: search, storeId: store?.id ?? '' });
  const results = search.trim().length > 0 ? searchQuery.data?.data ?? [] : [];

  return (
    <Dialog open onOpenChange={onOpenChange} title="Add to wishlist" description="Search for a product to add.">
      <Input
        placeholder="Search by name or SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="mt-2 max-h-64 overflow-y-auto">
        {results.map((product) => (
          <button
            key={product.id}
            type="button"
            className="flex w-full items-center justify-between border-b px-1 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
            onClick={() =>
              addWishlistItem.mutate({ productId: product.id }, { onSuccess: () => onOpenChange(false) })
            }
          >
            <span>{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.sku}</span>
          </button>
        ))}
        {search.trim().length > 0 && results.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No matching products.</p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
