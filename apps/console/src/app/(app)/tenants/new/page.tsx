'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { useCreateTenant, usePlans } from '@/lib/queries/platform-tenants';

export default function NewTenantPage() {
  const router = useRouter();
  const plans = usePlans();
  const createTenant = useCreateTenant();

  const [businessName, setBusinessName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const canSubmit = businessName.trim().length >= 2 && contactEmail.trim().length > 0 && planCode;

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
              Could not create this tenant. Check the plan code and try again.
            </Alert>
          )}
          {plans.isError && <Alert variant="error">Could not load plans.</Alert>}

          <Field label="Business name" htmlFor="businessName">
            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" hint="The owner account is provisioned separately today; this is a record contact.">
            <Input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone" hint="Optional">
            <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
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
              <Select id="billingCycle" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'YEARLY')}>
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
                    contactPhone: contactPhone.trim() || undefined,
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
