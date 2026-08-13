'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { acceptInvitationRequestSchema, type InvitationPreview } from '@ems/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { ApiError, apiGet, apiPost } from '@/lib/api-client';

type Values = z.input<typeof acceptInvitationRequestSchema>;

export default function AcceptInvitePage() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Preview first, so the page can say what is being accepted instead of showing a bare
  // password form to someone who may not remember being invited.
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => apiGet<InvitationPreview>(`/invitations/preview?token=${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false,
  });

  const form = useForm<Values>({
    resolver: zodResolver(acceptInvitationRequestSchema),
    defaultValues: { token, firstName: '', lastName: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);

    try {
      await apiPost('/invitations/accept', values);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof Values, { message });
        }
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Ask for a fresh invitation.');
      }
    }
  }

  if (!token || preview.isError) {
    return (
      <Card>
        <CardHeader title="Invitation not valid" />
        <CardBody className="space-y-4">
          <Alert variant="error">
            This invitation link is invalid, already used, revoked, or expired. Invitations
            last 7 days — ask whoever invited you to send a new one.
          </Alert>
          <Link href="/login" className="block text-center text-xs underline underline-offset-4">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader title="You’re all set" />
        <CardBody className="space-y-4">
          <Alert variant="success">Your account is ready. Sign in to get started.</Alert>
          <Button className="w-full" onClick={() => router.replace('/login')}>
            Sign in
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Accept your invitation"
        description={
          preview.data
            ? `Join ${preview.data.storeName} as ${preview.data.roles.join(' and ')}.`
            : 'Loading invitation…'
        }
      />
      <CardBody>
        {preview.data && (
          <p className="mb-4 text-xs text-muted-foreground">
            Invited{preview.data.invitedByName ? ` by ${preview.data.invitedByName}` : ''} for{' '}
            <span className="font-mono">{preview.data.email}</span>
          </p>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <Field
            label="First name"
            htmlFor="firstName"
            error={form.formState.errors.firstName?.message}
          >
            <Input
              id="firstName"
              autoComplete="given-name"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.firstName)}
              {...form.register('firstName')}
            />
          </Field>

          <Field
            label="Last name"
            htmlFor="lastName"
            error={form.formState.errors.lastName?.message}
          >
            <Input id="lastName" autoComplete="family-name" {...form.register('lastName')} />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            hint="At least 12 characters. You choose it — we never email a password."
            error={form.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={form.formState.errors.confirmPassword?.message}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              {...form.register('confirmPassword')}
            />
          </Field>

          <Button
            type="submit"
            className="w-full"
            loading={form.formState.isSubmitting}
            disabled={!preview.data}
          >
            Create my account
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
