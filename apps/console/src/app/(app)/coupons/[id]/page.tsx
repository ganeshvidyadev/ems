'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { COUPON_STATUSES, updateCouponRequestSchema } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { minorStringToRupees, rupeesToMinorString } from '@/lib/money';
import { useCoupon, useUpdateCoupon } from '@/lib/queries/coupons';

const FORM_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const;

// Same scope as the create form: PERCENTAGE/FIXED_AMOUNT/FREE_SHIPPING and
// store-wide targeting only — see that file's own comment.
const formSchema = updateCouponRequestSchema
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
    discountValue: z.string().trim().optional(),
    maxDiscount: z.string().trim().optional(),
    minOrder: z.string().trim().optional(),
    usageLimitTotal: z.string().trim().optional(),
    usageLimitPerCustomer: z.string().trim().optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
  })
  // Mirrors the wire schema's `discountType`-aware bound (BUG-FE-010): a
  // percentage over 100 should never reach the server, on edit just as on create.
  .refine(
    (v) => {
      if (v.discountType !== 'PERCENTAGE' || !v.discountValue) return true;
      const n = Number(v.discountValue);
      return Number.isFinite(n) && n > 0 && n <= 100;
    },
    { message: 'Percentage must be between 0 and 100', path: ['discountValue'] },
  )
  .refine(
    (v) => {
      if (v.discountType !== 'FIXED_AMOUNT' || !v.discountValue) return true;
      return /^\d+(\.\d{1,2})?$/.test(v.discountValue.trim());
    },
    { message: 'Enter a valid amount', path: ['discountValue'] },
  );
type FormValues = z.input<typeof formSchema>;

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO instant. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditCouponPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canUpdate = usePermission('coupon:update');

  const { data: coupon, isLoading, isError } = useCoupon(params.id);
  const updateCoupon = useUpdateCoupon(params.id);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const discountType = form.watch('discountType');

  useEffect(() => {
    if (!coupon) return;
    form.reset({
      code: coupon.code,
      name: coupon.name ?? '',
      description: coupon.description ?? '',
      status: coupon.status,
      discountType: coupon.discountType === 'BUY_X_GET_Y' ? 'PERCENTAGE' : coupon.discountType,
      // `discountValue` is a DECIMAL(_,4) on the wire ("150.0000"); normalise the
      // PERCENTAGE case for display so the edit input reads "150" rather than
      // "150.0000" (BUG-FE-015). FIXED_AMOUNT already goes through minorStringToRupees.
      discountValue:
        coupon.discountType === 'FIXED_AMOUNT'
          ? minorStringToRupees(coupon.discountValue.split('.')[0] ?? '0')
          : String(Number(coupon.discountValue)),
      maxDiscount: coupon.maxDiscountMinor ? minorStringToRupees(coupon.maxDiscountMinor) : '',
      minOrder: coupon.minOrderMinor ? minorStringToRupees(coupon.minOrderMinor) : '',
      usageLimitTotal: coupon.usageLimitTotal?.toString() ?? '',
      usageLimitPerCustomer: coupon.usageLimitPerCustomer?.toString() ?? '',
      combinable: coupon.combinable,
      autoApply: coupon.autoApply,
      startsAt: toDatetimeLocal(coupon.startsAt),
      endsAt: toDatetimeLocal(coupon.endsAt),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon]);

  async function onSubmit(values: FormValues) {
    const discountValue =
      values.discountType === 'FREE_SHIPPING'
        ? '0'
        : values.discountType === 'FIXED_AMOUNT'
          ? rupeesToMinorString(values.discountValue ?? '0')
          : (values.discountValue ?? '0');

    try {
      await updateCoupon.mutateAsync({
        code: values.code,
        name: values.name || undefined,
        description: values.description || undefined,
        status: values.status,
        discountType: values.discountType,
        discountValue,
        maxDiscountMinor: values.maxDiscount ? rupeesToMinorString(values.maxDiscount) : undefined,
        minOrderMinor: values.minOrder ? rupeesToMinorString(values.minOrder) : undefined,
        combinable: values.combinable,
        autoApply: values.autoApply,
        usageLimitTotal: values.usageLimitTotal ? Number(values.usageLimitTotal) : undefined,
        usageLimitPerCustomer: values.usageLimitPerCustomer ? Number(values.usageLimitPerCustomer) : undefined,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : undefined,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : undefined,
      });
      router.push('/coupons');
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
    return <div className="mx-auto max-w-2xl px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (isError || !coupon) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Alert variant="error">This coupon could not be found.</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Card>
        <CardHeader title={coupon.code} description={coupon.name ?? undefined} />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Code" htmlFor="code" error={form.formState.errors.code?.message}>
                <Input id="code" disabled={!canUpdate} {...form.register('code')} />
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" disabled={!canUpdate} {...form.register('status')}>
                  {COUPON_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Name" htmlFor="name" hint="Optional — internal label">
              <Input id="name" disabled={!canUpdate} {...form.register('name')} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Discount type" htmlFor="discountType">
                <Select id="discountType" disabled={!canUpdate} {...form.register('discountType')}>
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
                  <Input id="discountValue" inputMode="decimal" disabled={!canUpdate} {...form.register('discountValue')} />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Max discount (₹)" htmlFor="maxDiscount" hint="Optional cap">
                <Input id="maxDiscount" inputMode="decimal" disabled={!canUpdate} {...form.register('maxDiscount')} />
              </Field>
              <Field label="Minimum order (₹)" htmlFor="minOrder" hint="Optional">
                <Input id="minOrder" inputMode="decimal" disabled={!canUpdate} {...form.register('minOrder')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Total use limit" htmlFor="usageLimitTotal" hint="Optional">
                <Input id="usageLimitTotal" inputMode="numeric" disabled={!canUpdate} {...form.register('usageLimitTotal')} />
              </Field>
              <Field label="Per-customer limit" htmlFor="usageLimitPerCustomer" hint="Optional">
                <Input
                  id="usageLimitPerCustomer"
                  inputMode="numeric"
                  disabled={!canUpdate}
                  {...form.register('usageLimitPerCustomer')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Starts" htmlFor="startsAt" hint="Optional">
                <Input id="startsAt" type="datetime-local" disabled={!canUpdate} {...form.register('startsAt')} />
              </Field>
              <Field label="Ends" htmlFor="endsAt" hint="Optional">
                <Input id="endsAt" type="datetime-local" disabled={!canUpdate} {...form.register('endsAt')} />
              </Field>
            </div>

            <Field label="Description" htmlFor="description" hint="Optional">
              <Textarea id="description" rows={3} disabled={!canUpdate} {...form.register('description')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" disabled={!canUpdate} {...form.register('combinable')} />
              Combinable with other coupons
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" disabled={!canUpdate} {...form.register('autoApply')} />
              Apply automatically at checkout (no code needed)
            </label>

            {canUpdate && (
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => router.push('/coupons')}>
                  Cancel
                </Button>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
