'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createProductRequestSchema, PRODUCT_STATUSES, PRODUCT_VISIBILITIES } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { ApiError, isForbidden } from '@/lib/api-client';
import { useBrands, useCategories } from '@/lib/queries/catalog-refs';
import { useCreateProduct } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import { rupeesToMinorString } from '@/lib/money';

/** Wire fields the server may name in a validation error that this form does not
 * render a control for directly — remapped to the form field that does, so no
 * server message is ever silently dropped (BUG-FE-004). */
const SERVER_FIELD_REMAP: Record<string, string> = {
  priceMinor: 'price',
  comparePriceMinor: 'comparePrice',
};

/** Every form field below that renders an `error` slot via `Field`. Kept in sync with
 * the JSX so the mapper above can tell "no control for this field" from "control exists". */
const FORM_FIELDS_WITH_ERROR_SLOT = new Set([
  'name',
  'sku',
  'price',
  'comparePrice',
  'status',
  'visibility',
  'brandId',
  'categoryId',
  'shortDescription',
  'description',
]);

/**
 * Form-only fields, not the wire schema: `priceMinor` is a rupee decimal here
 * (`"199.99"`) and converted to minor units at submit — asking a merchant to
 * type "19999" for ₹199.99 is the kind of thing that produces a support
 * ticket, not a sale.
 *
 * SIMPLE products only for this first pass — VARIABLE's variant matrix
 * (`createProductRequestSchema`'s own `variants` array, each with its own
 * SKU/price/option values) is a real, separate editor, not a form field, and
 * is the natural next increment once SIMPLE products are solid.
 */
const formSchema = createProductRequestSchema
  .innerType()
  .innerType()
  // `storeId` is required by the wire schema but never collected as a form
  // field — it's added from the current store at submit time (below) — so it
  // must be omitted here too, or zodResolver blocks every submit on a
  // "storeId required" error with no field to attach it to, which is
  // invisible in the UI. Found live: the button did nothing, no request ever
  // fired, and nothing on screen explained why.
  .omit({
    type: true,
    priceMinor: true,
    comparePriceMinor: true,
    categoryIds: true,
    storeId: true,
    brandId: true,
    taxClassId: true,
  })
  .extend({
    // Validated client-side so an invalid or negative price never reaches the
    // server — previously `abc`/`-5` both slipped through `rupeesToMinorString`
    // and came back as a 422 naming `priceMinor`, a field this form has no
    // control for, so the error was silently dropped (BUG-FE-004).
    price: z
      .string()
      .trim()
      .min(1, 'Price is required')
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price'),
    comparePrice: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d+(\.\d{1,2})?$/.test(v), 'Enter a valid price'),
    categoryId: z.string().optional(),
    // The wire schema only requires this cross-field (sku unless VARIABLE), a
    // refine the form's `.innerType().innerType()` strips — so it's restated
    // directly here to catch a blank SKU before a server round-trip (BUG-FE-022).
    sku: z.string().trim().min(1, 'SKU is required'),
    // Relaxed to a plain optional string, not `publicIdSchema` (exactly 26
    // characters) — a native <select>'s unselected "None" option submits an
    // empty string, not `undefined`, which `publicIdSchema.optional()` (only
    // ever satisfied by an *absent* key) rejects outright. Found live: the
    // button did nothing and nothing on screen explained why, because
    // brandId has no rendered error — the failure was invisible.
    brandId: z.string().optional(),
  });
type FormValues = z.input<typeof formSchema>;

export default function NewProductPage() {
  const router = useRouter();
  const canCreate = usePermission('product:create');
  const { store, isLoading: storeLoading, isError: storeIsError, error: storeError } = useCurrentStore();
  const { data: brands } = useBrands();
  const { data: categories } = useCategories();
  const createProduct = useCreateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      sku: '',
      price: '',
      currency: 'INR',
      status: 'DRAFT',
      visibility: 'VISIBLE',
      trackInventory: true,
      allowBackorder: false,
      isFeatured: false,
      isShareable: false,
      requiresShipping: true,
    },
  });

  async function onSubmit(values: FormValues) {
    if (storeLoading) {
      form.setError('root', { message: 'Still loading your store — try again in a moment.' });
      return;
    }
    if (!store) {
      form.setError('root', {
        message:
          storeIsError && isForbidden(storeError)
            ? 'You do not have permission to look up your store, so a product cannot be created.'
            : 'No store is available for this account, so a product cannot be created.',
      });
      return;
    }

    try {
      const product = await createProduct.mutateAsync({
        ...values,
        storeId: store.id,
        type: 'SIMPLE',
        status: values.status ?? 'DRAFT',
        visibility: values.visibility ?? 'VISIBLE',
        brandId: values.brandId || undefined,
        currency: values.currency ?? 'INR',
        trackInventory: values.trackInventory ?? true,
        allowBackorder: values.allowBackorder ?? false,
        requiresShipping: values.requiresShipping ?? true,
        isFeatured: values.isFeatured ?? false,
        isShareable: values.isShareable ?? false,
        // SIMPLE products (the only type this form creates) never carry a
        // variant matrix — see this file's own doc comment on why that's a
        // separate editor, not a field here.
        variants: undefined,
        priceMinor: rupeesToMinorString(values.price),
        comparePriceMinor: values.comparePrice ? rupeesToMinorString(values.comparePrice) : undefined,
        categoryIds: values.categoryId ? [values.categoryId] : undefined,
        primaryCategoryId: values.categoryId || undefined,
      });
      router.push(`/products/${product.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        const unmapped: string[] = [];
        for (const [wireField, message] of Object.entries(error.fieldErrors)) {
          const field = SERVER_FIELD_REMAP[wireField] ?? wireField;
          if (FORM_FIELDS_WITH_ERROR_SLOT.has(field)) {
            form.setError(field as keyof FormValues, { message });
          } else {
            unmapped.push(message);
          }
        }
        // Any server message that named a field this form has no rendered
        // control for previously vanished silently — surface it as a root
        // alert instead so nothing is ever dropped (BUG-FE-004).
        if (Object.keys(error.fieldErrors).length === 0 || unmapped.length > 0) {
          form.setError('root', {
            message: unmapped.length > 0 ? unmapped.join(' ') : error.message,
          });
        }
      }
    }
  }

  if (!canCreate) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <CardHeader
            title="New product"
            description="You do not have permission to add products. Ask an administrator to grant product:create."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Card>
        <CardHeader title="New product" description="Add a product to your catalog." />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message}>
              <Input id="name" autoFocus {...form.register('name')} />
            </Field>

            <Field label="SKU" htmlFor="sku" error={form.formState.errors.sku?.message}>
              <Input id="sku" {...form.register('sku')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Price (₹)" htmlFor="price" error={form.formState.errors.price?.message}>
                <Input id="price" inputMode="decimal" placeholder="199.99" {...form.register('price')} />
              </Field>
              <Field
                label="Compare-at price (₹)"
                htmlFor="comparePrice"
                hint="Optional — shown struck through"
                error={form.formState.errors.comparePrice?.message}
              >
                <Input id="comparePrice" inputMode="decimal" placeholder="249.99" {...form.register('comparePrice')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status" htmlFor="status" error={form.formState.errors.status?.message}>
                <Select id="status" {...form.register('status')}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visibility" htmlFor="visibility" error={form.formState.errors.visibility?.message}>
                <Select id="visibility" {...form.register('visibility')}>
                  {PRODUCT_VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Brand" htmlFor="brandId" hint="Optional" error={form.formState.errors.brandId?.message}>
                <Select id="brandId" {...form.register('brandId')}>
                  <option value="">None</option>
                  {brands?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Category"
                htmlFor="categoryId"
                hint="Optional"
                error={form.formState.errors.categoryId?.message}
              >
                <Select id="categoryId" {...form.register('categoryId')}>
                  <option value="">None</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'  '.repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Short description"
              htmlFor="shortDescription"
              hint="Optional"
              error={form.formState.errors.shortDescription?.message}
            >
              <Input id="shortDescription" {...form.register('shortDescription')} />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              hint="Optional"
              error={form.formState.errors.description?.message}
            >
              <Textarea id="description" rows={5} {...form.register('description')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('trackInventory')} />
              Track inventory for this product
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push('/products')}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create product
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
