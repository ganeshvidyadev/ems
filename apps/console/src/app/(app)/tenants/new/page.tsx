'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-client';
import { useCreateTenant, usePlans } from '@/lib/queries/platform-tenants';
import { Palette, Check, Sparkles, FolderCode, ShieldCheck } from 'lucide-react';

const STANDARD_THEMES = [
  {
    code: 'default',
    name: 'Default Modern',
    tag: 'General E-Commerce',
    color: '#2563eb',
    font: 'Inter / System',
    desc: 'Clean whitespace, utility product grids, and universal e-commerce layout.',
    badge: '100% Free Standard',
  },
  {
    code: 'organic',
    name: 'Organic Botanicals',
    tag: 'Wellness & Grocery',
    color: '#6bb252',
    font: 'Lora & Inter',
    desc: 'Green botanical accents, farm-fresh badges, and nature-themed photography.',
    badge: '100% Free Standard',
  },
  {
    code: 'famms',
    name: 'Famms Luxury Fashion',
    tag: 'Fashion & Apparel',
    color: '#f7444e',
    font: 'Playfair & Montserrat',
    desc: 'High-fashion editorial lookbook banners and bold discount ribbons.',
    badge: '100% Free Standard',
  },
  {
    code: 'circuit',
    name: 'Circuit Electronics',
    tag: 'Tech & Gadgets',
    color: '#2563eb',
    font: 'Roboto & Space Grotesk',
    desc: 'Dark accent tech hero, OEM warranty badges, and spec breakdown grids.',
    badge: '100% Free Standard',
  },
  {
    code: 'harvest',
    name: 'Harvest Supermarket',
    tag: 'Grocery & Essentials',
    color: '#15803d',
    font: 'Nunito & Open Sans',
    desc: 'Express 2-hour delivery timer, fast-scan tiles, and daily flash deals.',
    badge: '100% Free Standard',
  },
] as const;

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
  const [selectedTheme, setSelectedTheme] = useState<string>('default');

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
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Tenant & Company Onboarding</h1>
        <p className="text-sm text-muted-foreground">
          Creates the company, provisions a dedicated theme folder, and activates the initial storefront template.
        </p>
      </div>

      <Card>
        <CardHeader title="Company Details & Plan" />
        <CardBody className="space-y-5">
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

          <Field label="Business Name" htmlFor="businessName">
            <Input
              id="businessName"
              placeholder="e.g. Acme Retail Pvt Ltd"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </Field>

          <Field
            label="Contact Email"
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
            label="Contact Phone"
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
            <Field label="Platform Plan" htmlFor="planCode">
              <Select id="planCode" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
                <option value="">Select a plan…</option>
                {plans.data?.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Billing Cycle" htmlFor="billingCycle">
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

          {/* Storefront Theme Template Selector */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Palette className="size-4 text-primary" />
                  Initial Storefront Theme Template (5 Free Standards)
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a starting template. All 5 standard themes are included free and can be switched anytime.
                </p>
              </div>
              <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-[11px] font-semibold">
                Free Included
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {STANDARD_THEMES.map((theme) => {
                const isSelected = selectedTheme === theme.code;
                return (
                  <div
                    key={theme.code}
                    onClick={() => setSelectedTheme(theme.code)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                        : 'border-border bg-card hover:border-primary/50 hover:bg-muted/20'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span className="font-semibold text-xs text-foreground">{theme.name}</span>
                        </div>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                            <Check className="size-3.5" /> Selected
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{theme.tag}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {theme.desc}
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-border/80 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Font: {theme.font}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{theme.badge}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Folder isolation notice */}
            <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-2.5 text-xs text-muted-foreground">
              <FolderCode className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Isolated Company Theme Workspace:</span>
                <p>
                  When created, an isolated directory <code className="font-mono text-foreground font-semibold">storage/tenants/{`{slug}`}/themes/{selectedTheme}/</code> will be automatically provisioned. Any custom theme modifications or code requested by this company can be edited there and billed separately.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
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
                    initialTheme: selectedTheme as any,
                  },
                  { onSuccess: () => router.push('/tenants') },
                )
              }
            >
              Create Tenant & Provision Store
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
