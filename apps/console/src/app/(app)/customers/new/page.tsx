'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerRequestSchema } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { useCreateCustomer } from '@/lib/queries/customers';

// `storeId` is optional on the wire schema too (it defaults from context), so
// no picker or omit-then-relax dance is needed here, unlike the product form.
//
// `password` is relaxed from the base `.min(8).optional()` to a plain
// optional string with its own refine: an untouched optional text input
// yields `''`, not `undefined`, and `''` fails `.min(8)` — found live, the
// button did nothing and the error had no field wired to show it. Only
// enforce the length when something was actually typed.
//
// `email` needs the identical treatment (BUG-FE-005): the base `emailSchema`
// is `.min(3).email(...)`, so an untouched field's `''` fails `.min(3)`
// before the submit handler ever gets a chance to convert it to `undefined`.
// And the wire schema's either-or refine (`email ?? phone`) lives on the
// outer `ZodEffects`, which `.innerType()` strips below — so it is restated
// here, on the form's own schema, with a message that names both fields.
//
// `firstName`/`lastName` turned out to need the same treatment: they are
// `shortTextSchema(100).optional()` on the wire, i.e. `.min(1).optional()`,
// so an untouched field's `''` failed `.min(1)` exactly like `email` did —
// invisible before BUG-FE-006 wired up their `error` prop, and a real block
// on ever submitting this form with either name left blank (both are marked
// "Optional" in the UI).
const formSchema = createCustomerRequestSchema
  .innerType()
  .omit({ password: true, email: true, firstName: true, lastName: true })
  .extend({
    email: z
      .string()
      .trim()
      .max(255, 'Must be at most 255 characters')
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, {
        message: 'Must be a valid email address',
      }),
    firstName: z.string().trim().max(100, 'Must be at most 100 characters').optional(),
    lastName: z.string().trim().max(100, 'Must be at most 100 characters').optional(),
    password: z
      .string()
      .max(128)
      .optional()
      .refine((v) => !v || v.length >= 8, { message: 'Must be at least 8 characters' }),
  })
  .refine((v) => Boolean(v.email?.trim() || v.phone?.trim()), {
    message: 'Enter an email address or a phone number',
    path: ['email'],
  });
type FormValues = z.input<typeof formSchema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const canCreate = usePermission('customer:create');
  const createCustomer = useCreateCustomer();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', phone: '', firstName: '', lastName: '', acceptsMarketing: false },
  });

  async function onSubmit(values: FormValues) {
    try {
      const customer = await createCustomer.mutateAsync({
        email: values.email || undefined,
        phone: values.phone || undefined,
        password: values.password || undefined,
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        acceptsMarketing: values.acceptsMarketing ?? false,
      });
      router.push(`/customers/${customer.id}`);
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

  if (!canCreate) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <CardHeader
            title="New customer"
            description="You do not have permission to add customers. Ask an administrator to grant customer:create."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Card>
        <CardHeader title="New customer" description="For a manual or POS order — the customer never signed up themselves." />
        <CardBody>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {form.formState.errors.root && <Alert variant="error">{form.formState.errors.root.message}</Alert>}

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="First name"
                htmlFor="firstName"
                hint="Optional"
                error={form.formState.errors.firstName?.message}
              >
                <Input id="firstName" autoFocus {...form.register('firstName')} />
              </Field>
              <Field label="Last name" htmlFor="lastName" hint="Optional" error={form.formState.errors.lastName?.message}>
                <Input id="lastName" {...form.register('lastName')} />
              </Field>
            </div>

            <Field
              label="Email"
              htmlFor="email"
              hint="Email or phone is required"
              error={form.formState.errors.email?.message}
            >
              <Input id="email" type="email" {...form.register('email')} />
            </Field>

            <Field
              label="Phone"
              htmlFor="phone"
              hint="Optional if email is given"
              error={form.formState.errors.phone?.message}
            >
              <Input id="phone" type="tel" placeholder="+91XXXXXXXXXX" {...form.register('phone')} />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint="Optional — leave blank for a guest-style account"
              error={form.formState.errors.password?.message}
            >
              <Input id="password" type="password" {...form.register('password')} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('acceptsMarketing')} />
              Accepts marketing emails
            </label>
            {form.formState.errors.acceptsMarketing?.message && (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.acceptsMarketing.message}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => router.push('/customers')}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create customer
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
