'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createCouponRequestSchema } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-client';
import { useCreateCoupon } from '@/lib/queries/coupons';
import { rupeesToMinorString } from '@/lib/money';

/**
 * PERCENTAGE / FIXED_AMOUNT / FREE_SHIPPING only for this first pass —
 * BUY_X_GET_Y's product-quantity matrix and per-product/category targeting
 * (`targetIds`/`excludedIds`, `appliesTo` beyond `'ORDER'`) are a real,
 * separate editor, not a form field, the same scope call the product form
 * made for the variant matrix. Likewise `customerEligibility` is always
 * `'ALL'` here — targeting specific customers or a group is that same
 * later editor.
 */
const FORM_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const;

const formSchema = createCouponRequestSchema
  .innerType()
  .omit({
    storeId: true,
    discountType: true,
    discountValue: true,
    maxDiscountMinor: true,
    minOrderMinor: true,
    appliesTo: true,
    targetIds: true,
    excludedIds: true,
    buyQuantity: true,
    getQuantity: true,
    customerEligibility: true,
    eligibleCustomerIds: true,
    eligibleGroup: true,
    usageLimitTotal: true,
    usageLimitPerCustomer: true,
    startsAt: true,
    endsAt: true,
  })
  .extend({
    discountType: z.enum(FORM_DISCOUNT_TYPES),
    // Percentage points as typed ("10" = 10%) for PERCENTAGE, a rupee amount
    // ("199.99") for FIXED_AMOUNT, converted per-type at submit — unused and
    // hidden for FREE_SHIPPING.
    discountValue: z.string().trim().optional(),
    maxDiscount: z.string().trim().optional(),
    minOrder: z.string().trim().optional(),
    usageLimitTotal: z.string().trim().optional(),
    usageLimitPerCustomer: z.string().trim().optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  })
  .refine((v) => v.discountType === 'FREE_SHIPPING' || (v.discountValue && v.discountValue.trim().length > 0), {
    message: 'Discount value is required',
    path: ['discountValue'],
  });
type FormValues = z.input<typeof formSchema>;

export default function NewCouponPage() {
  const router = useRouter();
  const createCoupon = useCreateCoupon();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      discountType: 'PERCENTAGE',
      discountValue: '',
      combinable: false,
      autoApply: false,
    },
  });

  const discountType = form.watch('discountType');

  async function onSubmit(values: FormValues) {
    const discountValue =
      values.discountType === 'FREE_SHIPPING'
        ? '0'
        : values.discountType === 'FIXED_AMOUNT'
          ? rupeesToMinorString(values.discountValue ?? '0')
          : (values.discountValue ?? '0');

    try {
      const coupon = await createCoupon.mutateAsync({
        code: values.code,
        name: values.name || undefined,
        description: values.description || undefined,
        discountType: values.discountType,
        discountValue,
        maxDiscountMinor: values.maxDiscount ? rupeesToMinorString(values.maxDiscount) : undefined,
        minOrderMinor: values.minOrder ? rupeesToMinorString(values.minOrder) : undefined,
        appliesTo: 'ORDER',
        customerEligibility: 'ALL',
        combinable: values.combinable ?? false,
        autoApply: values.autoApply ?? false,
        usageLimitTotal: values.usageLimitTotal ? Number(values.usageLimitTotal) : undefined,
        usageLimitPerCustomer: values.usageLimitPerCustomer ? Number(values.usageLimitPerCustomer) : undefined,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : undefined,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : undefined,
      });
      router.push(`/coupons/${coupon.id}`);
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
        <CardHeader title="New coupon" description="Add a discount code for the storefront." />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <Field label="Code" htmlFor="code" hint="Letters, digits, hyphens and underscores" error={form.formState.errors.code?.message}>
              <Input id="code" autoFocus placeholder="SUMMER10" {...form.register('code')} />
            </Field>

            <Field label="Name" htmlFor="name" hint="Optional — internal label" error={form.formState.errors.name?.message}>
              <Input id="name" {...form.register('name')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Discount type" htmlFor="discountType">
                <Select id="discountType" {...form.register('discountType')}>
                  {FORM_DISCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'PERCENTAGE' ? 'Percentage off' : t === 'FIXED_AMOUNT' ? 'Fixed amount off' : 'Free shipping'}
                    </option>
                  ))}
                </Select>
              </Field>
              {discountType !== 'FREE_SHIPPING' && (
                <Field
                  label={discountType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount (₹)'}
                  htmlFor="discountValue"
                  error={form.formState.errors.discountValue?.message}
                >
                  <Input
                    id="discountValue"
                    inputMode="decimal"
                    placeholder={discountType === 'PERCENTAGE' ? '10' : '199.99'}
                    {...form.register('discountValue')}
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Max discount (₹)" htmlFor="maxDiscount" hint="Optional cap">
                <Input id="maxDiscount" inputMode="decimal" {...form.register('maxDiscount')} />
              </Field>
              <Field label="Minimum order (₹)" htmlFor="minOrder" hint="Optional">
                <Input id="minOrder" inputMode="decimal" {...form.register('minOrder')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Total use limit" htmlFor="usageLimitTotal" hint="Optional">
                <Input id="usageLimitTotal" inputMode="numeric" {...form.register('usageLimitTotal')} />
              </Field>
              <Field label="Per-customer limit" htmlFor="usageLimitPerCustomer" hint="Optional">
                <Input id="usageLimitPerCustomer" inputMode="numeric" {...form.register('usageLimitPerCustomer')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" htmlFor="startsAt" hint="Optional">
                <Input id="startsAt" type="datetime-local" {...form.register('startsAt')} />
              </Field>
              <Field label="Ends" htmlFor="endsAt" hint="Optional">
                <Input id="endsAt" type="datetime-local" {...form.register('endsAt')} />
              </Field>
            </div>

            <Field label="Description" htmlFor="description" hint="Optional">
              <Textarea id="description" rows={3} {...form.register('description')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('combinable')} />
              Combinable with other coupons
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('autoApply')} />
              Apply automatically at checkout (no code needed)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push('/coupons')}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create coupon
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
