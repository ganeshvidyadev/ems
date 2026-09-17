'use client';

import type { PlanLimitKey } from '@ems/contracts';
import { PLAN_LIMIT_KEYS } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Textarea } from '@/components/ui/primitives';
import { minorStringToRupees, rupeesToMinorString } from '@/lib/money';
import { usePlatformPlan, useUpdatePlan } from '@/lib/queries/platform-plans';

const LIMIT_LABEL: Record<PlanLimitKey, string> = {
  max_products: 'Products',
  max_orders_per_month: 'Orders / month',
  max_staff_users: 'Staff users',
  max_storage_mb: 'Storage (MB)',
  max_stores: 'Stores',
  max_warehouses: 'Warehouses',
  max_channels: 'Sales channels',
  max_custom_domains: 'Custom domains',
};

export default function EditPlanPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const plan = usePlatformPlan(params.code);
  const updatePlan = useUpdatePlan(params.code);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceMonthly, setPriceMonthly] = useState('0');
  const [priceYearly, setPriceYearly] = useState('0');
  const [trialDays, setTrialDays] = useState('14');
  const [isPublic, setIsPublic] = useState(true);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan.data || hydrated) return;
    setName(plan.data.name);
    setDescription(plan.data.description ?? '');
    setPriceMonthly(minorStringToRupees(plan.data.priceMonthlyMinor));
    setPriceYearly(minorStringToRupees(plan.data.priceYearlyMinor));
    setTrialDays(String(plan.data.trialDays));
    setIsPublic(plan.data.isPublic);
    setLimits(
      Object.fromEntries(Object.entries(plan.data.limits).map(([key, value]) => [key, String(value)])),
    );
    setHydrated(true);
  }, [plan.data, hydrated]);

  if (plan.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">Could not load this plan.</Alert>
      </main>
    );
  }
  if (!plan.data || !hydrated) {
    return <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{plan.data.name}</h1>
        <p className="text-sm text-muted-foreground">
          {plan.data.code} · {plan.data.subscriberCount} subscriber{plan.data.subscriberCount === 1 ? '' : 's'}
        </p>
      </div>

      <Card>
        <CardHeader title="Plan details" />
        <CardBody className="space-y-4">
          {updatePlan.isError && <Alert variant="error">Could not save these changes.</Alert>}

          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="description" hint="Optional">
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Monthly price (₹)" htmlFor="priceMonthly">
              <Input id="priceMonthly" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} />
            </Field>
            <Field label="Yearly price (₹)" htmlFor="priceYearly">
              <Input id="priceYearly" value={priceYearly} onChange={(e) => setPriceYearly(e.target.value)} />
            </Field>
            <Field label="Trial days" htmlFor="trialDays">
              <Input id="trialDays" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Public — listed on the pricing page.
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Limits</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {PLAN_LIMIT_KEYS.map((key) => (
                <Field key={key} label={LIMIT_LABEL[key]} htmlFor={key} hint="Blank = unlimited">
                  <Input
                    id={key}
                    inputMode="numeric"
                    value={limits[key] ?? ''}
                    onChange={(e) => setLimits((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/plans')}>
              Cancel
            </Button>
            <Button
              loading={updatePlan.isPending}
              onClick={() => {
                const numericLimits: Record<string, number> = {};
                for (const [key, value] of Object.entries(limits)) {
                  if (value.trim() !== '') numericLimits[key] = Number(value);
                }
                updatePlan.mutate(
                  {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    priceMonthlyMinor: rupeesToMinorString(priceMonthly || '0'),
                    priceYearlyMinor: rupeesToMinorString(priceYearly || '0'),
                    trialDays: Number(trialDays) || 0,
                    isPublic,
                    limits: numericLimits as never,
                  },
                  { onSuccess: () => router.push('/plans') },
                );
              }}
            >
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
