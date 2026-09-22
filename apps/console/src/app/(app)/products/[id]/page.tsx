'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PRODUCT_STATUSES, PRODUCT_VISIBILITIES, updateProductRequestSchema } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { VariantMatrixGenerator, type FormVariant } from '@/components/products/variant-matrix-generator';
import { usePermission } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { minorStringToRupees, rupeesToMinorString } from '@/lib/money';
import { useBrands, useCategories } from '@/lib/queries/catalog-refs';
import { useProduct, useUpdateProduct } from '@/lib/queries/products';

const formSchema = updateProductRequestSchema
  .omit({ priceMinor: true, comparePriceMinor: true, categoryIds: true, brandId: true })
  .extend({
    price: z.string().trim().min(1, 'Price is required'),
    comparePrice: z.string().trim().optional(),
    categoryId: z.string().optional(),
    // See the create-product page's own comment: a native <select>'s "None"
    // submits `''`, which `publicIdSchema` (exactly 26 characters) rejects —
    // found live, the same invisible-failure shape.
    brandId: z.string().optional(),
  });
type FormValues = z.input<typeof formSchema>;

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canUpdate = usePermission('product:update');

  const { data: product, isLoading, isError } = useProduct(params.id);
  const { data: brands } = useBrands();
  const { data: categories } = useCategories();
  const updateProduct = useUpdateProduct(params.id);

  const [variants, setVariants] = useState<FormVariant[]>([]);
  const [variantError, setVariantError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  // Reset with server data once it arrives — `useForm`'s `defaultValues`
  // can't depend on a query that hasn't resolved yet at mount time.
  useEffect(() => {
    if (!product) return;
    form.reset({
      name: product.name,
      sku: product.sku ?? '',
      price: minorStringToRupees(product.priceMinor),
      comparePrice: product.comparePriceMinor ? minorStringToRupees(product.comparePriceMinor) : '',
      status: product.status,
      visibility: product.visibility,
      brandId: product.brandId ?? '',
      categoryId: product.primaryCategoryId ?? '',
      shortDescription: product.shortDescription ?? '',
      description: product.description ?? '',
      trackInventory: product.trackInventory,
    });

    if (product.variants && product.variants.length > 0) {
      setVariants(
        product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          title: v.title ?? undefined,
          barcode: v.barcode ?? undefined,
          optionValues: v.optionValues,
          price: minorStringToRupees(v.priceMinor),
          comparePrice: v.comparePriceMinor ? minorStringToRupees(v.comparePriceMinor) : undefined,
          isActive: v.isActive,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  async function onSubmit(values: FormValues) {
    if (product?.type === 'VARIABLE') {
      if (variants.length === 0) {
        setVariantError('A variable product requires at least one variant.');
        return;
      }
      for (const v of variants) {
        if (!v.sku || !v.sku.trim()) {
          setVariantError(`Every variant must have a valid SKU. Check variant "${v.title || 'Untitled'}".`);
          return;
        }
        if (!v.price || isNaN(Number(v.price)) || Number(v.price) < 0) {
          setVariantError('Every variant must have a valid non-negative price.');
          return;
        }
      }
    }
    setVariantError(null);

    const variantsPayload =
      product?.type === 'VARIABLE'
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
      await updateProduct.mutateAsync({
        ...values,
        variants: variantsPayload,
        priceMinor: rupeesToMinorString(values.price),
        comparePriceMinor: values.comparePrice ? rupeesToMinorString(values.comparePrice) : undefined,
        categoryIds: values.categoryId ? [values.categoryId] : undefined,
        primaryCategoryId: values.categoryId || undefined,
        brandId: values.brandId || undefined,
      });
      router.push('/products');
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

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (isError || !product) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Alert variant="error">This product could not be found.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Card>
        <CardHeader
          title={product.name}
          description={`SKU ${product.sku ?? '—'}`}
          action={
            <Badge variant={product.type === 'VARIABLE' ? 'default' : 'outline'}>
              {product.type === 'VARIABLE' ? `Variable (${variants.length} variants)` : 'Simple'}
            </Badge>
          }
        />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message}>
              <Input id="name" disabled={!canUpdate} {...form.register('name')} />
            </Field>

            <Field
              label={product.type === 'VARIABLE' ? 'Base SKU (Prefix)' : 'SKU'}
              htmlFor="sku"
              hint={product.type === 'VARIABLE' ? 'Prefix used for variant SKU generation' : undefined}
              error={form.formState.errors.sku?.message}
            >
              <Input id="sku" disabled={!canUpdate} {...form.register('sku')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label={product.type === 'VARIABLE' ? 'Default Base Price (₹)' : 'Price (₹)'}
                htmlFor="price"
                error={form.formState.errors.price?.message}
              >
                <Input id="price" inputMode="decimal" disabled={!canUpdate} {...form.register('price')} />
              </Field>
              <Field
                label={product.type === 'VARIABLE' ? 'Default Compare-at price (₹)' : 'Compare-at price (₹)'}
                htmlFor="comparePrice"
                hint="Optional"
                error={form.formState.errors.comparePrice?.message}
              >
                <Input id="comparePrice" inputMode="decimal" disabled={!canUpdate} {...form.register('comparePrice')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status" htmlFor="status" error={form.formState.errors.status?.message}>
                <Select id="status" disabled={!canUpdate} {...form.register('status')}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Visibility" htmlFor="visibility" error={form.formState.errors.visibility?.message}>
                <Select id="visibility" disabled={!canUpdate} {...form.register('visibility')}>
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
                <Select id="brandId" disabled={!canUpdate} {...form.register('brandId')}>
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
                <Select id="categoryId" disabled={!canUpdate} {...form.register('categoryId')}>
                  <option value="">None</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'  '.repeat(c.depth)}
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
              <Input id="shortDescription" disabled={!canUpdate} {...form.register('shortDescription')} />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              hint="Optional"
              error={form.formState.errors.description?.message}
            >
              <Textarea id="description" rows={5} disabled={!canUpdate} {...form.register('description')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" disabled={!canUpdate} {...form.register('trackInventory')} />
              Track inventory for this product
            </label>

            {product.type === 'VARIABLE' && (
              <div className="pt-4 border-t border-border/80">
                {variantError && (
                  <Alert variant="error" className="mb-4">
                    {variantError}
                  </Alert>
                )}
                <VariantMatrixGenerator
                  baseSku={form.watch('sku') || product.sku || ''}
                  basePrice={form.watch('price')}
                  baseComparePrice={form.watch('comparePrice')}
                  initialVariants={variants}
                  disabled={!canUpdate}
                  onChange={(v) => {
                    setVariants(v);
                    setVariantError(null);
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push('/products')}>
                Back
              </Button>
              {canUpdate && (
                <Button type="submit" loading={form.formState.isSubmitting}>
                  Save changes
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
