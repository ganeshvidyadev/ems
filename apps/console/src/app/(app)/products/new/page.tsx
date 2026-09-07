'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createProductRequestSchema, PRODUCT_STATUSES, PRODUCT_VISIBILITIES } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-client';
import { useBrands, useCategories } from '@/lib/queries/catalog-refs';
import { useCreateProduct } from '@/lib/queries/products';
import { useCurrentStore } from '@/lib/queries/stores';
import { rupeesToMinorString } from '@/lib/money';

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
    price: z.string().trim().min(1, 'Price is required'),
    comparePrice: z.string().trim().optional(),
    categoryId: z.string().optional(),
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
  const { store } = useCurrentStore();
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
    if (!store) return;

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
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof FormValues, { message });
        }
        if (Object.keys(error.fieldErrors).length === 0) {
          form.setError('root', { message: error.message });
        }
      }
    }
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
              <Field label="Status" htmlFor="status">
                <Select id="status" {...form.register('status')}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visibility" htmlFor="visibility">
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
              <Field label="Brand" htmlFor="brandId" hint="Optional">
                <Select id="brandId" {...form.register('brandId')}>
                  <option value="">None</option>
                  {brands?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" htmlFor="categoryId" hint="Optional">
                <Select id="categoryId" {...form.register('categoryId')}>
                  <option value="">None</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.path || c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Short description" htmlFor="shortDescription" hint="Optional">
              <Input id="shortDescription" {...form.register('shortDescription')} />
            </Field>

            <Field label="Description" htmlFor="description" hint="Optional">
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
