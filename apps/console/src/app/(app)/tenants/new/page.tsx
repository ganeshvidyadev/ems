'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-client';
import { useCreateTenant, usePlans } from '@/lib/queries/platform-tenants';

function normalizePhone(phone: string): string | undefined {
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('+')) return trimmed;
  // If exactly 10 digits (common Indian format), prefix with +91
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  return trimmed;
}

export default function NewTenantPage() {
  const router = useRouter();
  const plans = usePlans();
  const createTenant = useCreateTenant();

  const [businessName, setBusinessName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  // Auto-select first available plan once plans load
  useEffect(() => {
    const firstPlan = plans.data?.[0];
    if (!planCode && firstPlan) {
      setPlanCode(firstPlan.code);
    }
  }, [plans.data, planCode]);

  const canSubmit = businessName.trim().length >= 2 && contactEmail.trim().length > 0 && Boolean(planCode);

  const errorObj = createTenant.error;
  const apiError = errorObj instanceof ApiError ? errorObj : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New tenant</h1>
        <p className="text-sm text-muted-foreground">
          Creates the company and starts it on a plan directly — no trial, no self-signup email.
        </p>
      </div>

      <Card>
        <CardHeader title="Company details" />
        <CardBody className="space-y-4">
          {createTenant.isError && (
            <Alert variant="error">
              <div className="space-y-1">
                <p className="font-medium">
                  {errorObj instanceof Error ? errorObj.message : 'Could not create this tenant.'}
                </p>
                {apiError?.details && apiError.details.length > 0 && (
                  <ul className="list-inside list-disc text-xs space-y-0.5 mt-1">
                    {apiError.details.map((d, i) => (
                      <li key={i}>
                        {d.field ? <span className="font-semibold">{d.field}: </span> : null}
                        {d.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Alert>
          )}
          {plans.isError && <Alert variant="error">Could not load plans from server.</Alert>}

          <Field label="Business name" htmlFor="businessName">
            <Input
              id="businessName"
              placeholder="e.g. Acme Retail Pvt Ltd"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </Field>
          <Field
            label="Contact email"
            htmlFor="contactEmail"
            hint="Store owner login and primary contact for notifications."
          >
            <Input
              id="contactEmail"
              type="email"
              placeholder="owner@company.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Contact phone"
            htmlFor="contactPhone"
            hint="E.164 format, e.g. +919876543210 (or 10-digit mobile number)"
          >
            <Input
              id="contactPhone"
              placeholder="+919876543210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="planCode">
              <Select id="planCode" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
                <option value="">Select a plan…</option>
                {plans.data?.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Billing cycle" htmlFor="billingCycle">
              <Select
                id="billingCycle"
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'YEARLY')}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/tenants')}>
              Cancel
            </Button>
            <Button
              loading={createTenant.isPending}
              disabled={!canSubmit}
              onClick={() =>
                createTenant.mutate(
                  {
                    businessName: businessName.trim(),
                    contactEmail: contactEmail.trim(),
                    contactPhone: normalizePhone(contactPhone),
                    countryCode: 'IN',
                    defaultCurrency: 'INR',
                    defaultLocale: 'en-IN',
                    timezone: 'Asia/Kolkata',
                    planCode,
                    billingCycle,
                  },
                  { onSuccess: () => router.push('/tenants') },
                )
              }
            >
              Create tenant
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
