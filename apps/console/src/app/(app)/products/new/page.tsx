'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createProductRequestSchema, PRODUCT_STATUSES, PRODUCT_VISIBILITIES } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { VariantMatrixGenerator, type FormVariant } from '@/components/products/variant-matrix-generator';
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
    // Required for SIMPLE products, optional prefix for VARIABLE products
    sku: z.string().trim().optional(),
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

  const [productType, setProductType] = useState<'SIMPLE' | 'VARIABLE'>('SIMPLE');
  const [variants, setVariants] = useState<FormVariant[]>([]);
  const [variantError, setVariantError] = useState<string | null>(null);

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

    if (productType === 'SIMPLE' && (!values.sku || !values.sku.trim())) {
      form.setError('sku', { message: 'SKU is required for simple products' });
      return;
    }

    if (productType === 'VARIABLE') {
      if (variants.length === 0) {
        setVariantError('A variable product requires at least one generated variant.');
        return;
      }
      for (const v of variants) {
        if (!v.sku || !v.sku.trim()) {
          setVariantError(`Every variant must have a valid SKU. Check variant "${v.title || 'Untitled'}".`);
          return;
        }
        if (!v.price || isNaN(Number(v.price)) || Number(v.price) < 0) {
          setVariantError(`Every variant must have a valid non-negative price.`);
          return;
        }
      }
    }

    setVariantError(null);

    const variantsPayload =
      productType === 'VARIABLE'
        ? variants.map((v, idx) => ({
            sku: v.sku.trim(),
            title: v.title || Object.values(v.optionValues).join(' / '),
            barcode: v.barcode?.trim() || undefined,
            optionValues: v.optionValues,
            priceMinor: rupeesToMinorString(v.price),
            comparePriceMinor: v.comparePrice?.trim() ? rupeesToMinorString(v.comparePrice) : undefined,
            position: idx,
            isActive: v.isActive,
          }))
        : undefined;

    try {
      const product = await createProduct.mutateAsync({
        ...values,
        storeId: store.id,
        type: productType,
        sku: values.sku?.trim() || (productType === 'VARIABLE' ? variants[0]?.sku : undefined),
        status: values.status ?? 'DRAFT',
        visibility: values.visibility ?? 'VISIBLE',
        brandId: values.brandId || undefined,
        currency: values.currency ?? 'INR',
        trackInventory: values.trackInventory ?? true,
        allowBackorder: values.allowBackorder ?? false,
        requiresShipping: values.requiresShipping ?? true,
        isFeatured: values.isFeatured ?? false,
        isShareable: values.isShareable ?? false,
        variants: variantsPayload,
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
      <div className="mx-auto max-w-4xl px-6 py-8">
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Card>
        <CardHeader title="New product" description="Add a product to your catalog." />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            {/* Product Type Selector */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/70 space-y-2">
              <label className="text-sm font-semibold text-foreground">Product Type</label>
              <div className="flex flex-wrap gap-6 pt-1">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="productType"
                    value="SIMPLE"
                    checked={productType === 'SIMPLE'}
                    onChange={() => setProductType('SIMPLE')}
                    className="size-4 text-primary"
                  />
                  <span>Simple Product</span>
                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                    Single SKU
                  </Badge>
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="productType"
                    value="VARIABLE"
                    checked={productType === 'VARIABLE'}
                    onChange={() => setProductType('VARIABLE')}
                    className="size-4 text-primary"
                  />
                  <span>Variable Product</span>
                  <Badge variant="outline" className="text-[10px] font-normal text-primary">
                    Matrix Variants
                  </Badge>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {productType === 'SIMPLE'
                  ? 'A standalone product with a single price, SKU, and inventory pool.'
                  : 'A product with multiple options like Size, Color, or Material, each having its own SKU, price, and stock.'}
              </p>
            </div>

            <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message}>
              <Input id="name" autoFocus {...form.register('name')} />
            </Field>

            <Field
              label={productType === 'VARIABLE' ? 'Base SKU (Prefix)' : 'SKU'}
              htmlFor="sku"
              hint={productType === 'VARIABLE' ? 'Prefix used to generate variant SKUs (e.g. TSHIRT)' : undefined}
              error={form.formState.errors.sku?.message}
            >
              <Input id="sku" placeholder={productType === 'VARIABLE' ? 'TSHIRT' : 'SKU-001'} {...form.register('sku')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label={productType === 'VARIABLE' ? 'Default Base Price (₹)' : 'Price (₹)'}
                htmlFor="price"
                hint={productType === 'VARIABLE' ? 'Default price applied when generating variants' : undefined}
                error={form.formState.errors.price?.message}
              >
                <Input id="price" inputMode="decimal" placeholder="199.99" {...form.register('price')} />
              </Field>
              <Field
                label={productType === 'VARIABLE' ? 'Default Compare-at Price (₹)' : 'Compare-at price (₹)'}
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

            {productType === 'VARIABLE' && (
              <div className="pt-4 border-t border-border/80">
                {variantError && (
                  <Alert variant="error" className="mb-4">
                    {variantError}
                  </Alert>
                )}
                <VariantMatrixGenerator
                  baseSku={form.watch('sku')}
                  basePrice={form.watch('price')}
                  baseComparePrice={form.watch('comparePrice')}
                  initialVariants={variants}
                  onChange={(v) => {
                    setVariants(v);
                    setVariantError(null);
                  }}
                />
              </div>
            )}

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
