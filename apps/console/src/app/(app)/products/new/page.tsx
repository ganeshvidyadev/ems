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
import { Sparkles, Wand2, Check } from 'lucide-react';

const SERVER_FIELD_REMAP: Record<string, string> = {
  priceMinor: 'price',
  comparePriceMinor: 'comparePrice',
};

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

const formSchema = createProductRequestSchema
  .innerType()
  .innerType()
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
    sku: z.string().trim().optional(),
    brandId: z.string().optional(),
  });
type FormValues = z.input<typeof formSchema>;

interface AiProductSuggestion {
  name: string;
  sku: string;
  price: string;
  comparePrice: string;
  shortDescription: string;
  description: string;
}

const AI_DEMO_PRESETS: Record<string, AiProductSuggestion> = {
  electronics: {
    name: 'AcousticPro ANC Wireless Over-Ear Headphones',
    sku: 'AUDIO-ANC-PRO',
    price: '4999.00',
    comparePrice: '7999.00',
    shortDescription: 'Active Noise Cancelling headphones with 45-hour battery life and custom titanium acoustic drivers.',
    description: 'Experience studio-grade sound anywhere with the AcousticPro ANC Wireless Headphones.\n\nKey Features:\n- Hybrid Active Noise Cancellation blocks up to 95% of ambient background noise.\n- Custom 40mm Titanium Acoustic Drivers delivering deep bass and crisp highs.\n- Massive 45-Hour Battery Life with USB-C Quick Charge (10 mins = 5 hours playback).\n- Plush Memory Foam Ear Cushions engineered for all-day comfort.\n- Low-latency Gaming & Movie Mode with Bluetooth 5.3 multi-point connectivity.',
  },
  apparel: {
    name: '100% Organic Pima Cotton Classic Crewneck Tee',
    sku: 'TEE-PIMA-CRW',
    price: '999.00',
    comparePrice: '1499.00',
    shortDescription: 'Ultra-soft, heavyweight organic Pima cotton t-shirt with tailored regular fit.',
    description: 'Crafted from sustainably sourced 100% long-staple organic Pima cotton for incomparable softness and drape.\n\nKey Features:\n- 220 GSM heavyweight combed fabric for long-term durability without heaviness.\n- Pre-shrunk and double-needle stitched collar to prevent baconing or warping.\n- OEKO-TEX 100 certified non-toxic, skin-friendly eco-dyes.\n- Tailored everyday fit suitable for layering or standalone casual wear.',
  },
  home: {
    name: 'Nordic Minimalist Matte Ceramic Pour-Over Kettle & Brewer Set',
    sku: 'HOME-BREW-NRD',
    price: '2499.00',
    comparePrice: '3299.00',
    shortDescription: 'Handmade matte ceramic coffee dripper set with precision gooseneck spout.',
    description: 'Elevate your morning coffee ritual with this Nordic minimalist pour-over brewer set.\n\nKey Features:\n- High-fire artisan stoneware with heat-retaining matte thermal glaze.\n- Precision 60-degree conical dripper with interior spiral extraction ribs.\n- Includes 500ml server jug, reusable stainless micro-filter, and measuring scoop.\n- Dishwasher safe and microwave friendly.',
  },
};

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

  // AI Assistant state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiAppliedFeedback, setAiAppliedFeedback] = useState(false);

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

  function generateWithAi(categoryKey: string) {
    setAiGenerating(true);
    setTimeout(() => {
      const preset = AI_DEMO_PRESETS[categoryKey] ?? AI_DEMO_PRESETS['electronics']!;
      form.setValue('name', preset.name, { shouldValidate: true });
      form.setValue('sku', preset.sku, { shouldValidate: true });
      form.setValue('price', preset.price, { shouldValidate: true });
      form.setValue('comparePrice', preset.comparePrice, { shouldValidate: true });
      form.setValue('shortDescription', preset.shortDescription, { shouldValidate: true });
      form.setValue('description', preset.description, { shouldValidate: true });
      setAiGenerating(false);
      setAiModalOpen(false);
      setAiAppliedFeedback(true);
      setTimeout(() => setAiAppliedFeedback(false), 4000);
    }, 600);
  }

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
          setVariantError('Every variant must have a valid non-negative price.');
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

            {/* AI Assistant Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <span>AI Product Content Assistant</span>
                    <Badge variant="outline" className="text-[10px] font-normal text-primary">Beta</Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Generate optimized product titles, SKU, high-converting descriptions, and pricing suggestions in 1 click.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAiModalOpen(true)}
                className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
              >
                <Wand2 className="size-3.5 mr-1.5" />
                Generate with AI
              </Button>
            </div>

            {aiAppliedFeedback && (
              <Alert variant="info" className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600" />
                <span>AI generated product copy and details applied to form!</span>
              </Alert>
            )}

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

      {/* AI Generator Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                AI Product Copy & SEO Generator
              </h3>
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Select a product category template or enter rough keywords to generate complete, high-converting catalog data:
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Quick Templates</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => generateWithAi('electronics')}
                  disabled={aiGenerating}
                  className="p-3 rounded-lg border border-border/80 bg-muted/20 hover:border-primary hover:bg-primary/5 text-left transition-all"
                >
                  <div className="font-semibold text-xs text-foreground">🎧 Electronics</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">ANC Headphones</div>
                </button>
                <button
                  type="button"
                  onClick={() => generateWithAi('apparel')}
                  disabled={aiGenerating}
                  className="p-3 rounded-lg border border-border/80 bg-muted/20 hover:border-primary hover:bg-primary/5 text-left transition-all"
                >
                  <div className="font-semibold text-xs text-foreground">👕 Fashion / Apparel</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Organic Pima Tee</div>
                </button>
                <button
                  type="button"
                  onClick={() => generateWithAi('home')}
                  disabled={aiGenerating}
                  className="p-3 rounded-lg border border-border/80 bg-muted/20 hover:border-primary hover:bg-primary/5 text-left transition-all"
                >
                  <div className="font-semibold text-xs text-foreground">☕ Home & Living</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Ceramic Pour-Over</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-foreground">Or Enter Custom Product Keywords</label>
              <Input
                placeholder="e.g. Ergonomic vegan leather office chair with lumbar support"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setAiModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={aiGenerating}
                onClick={() => generateWithAi(aiPrompt.toLowerCase().includes('tea') || aiPrompt.toLowerCase().includes('coffee') ? 'home' : 'electronics')}
              >
                <Sparkles className="size-3.5 mr-1" />
                {aiGenerating ? 'Generating Content...' : 'Generate & Fill Form'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
