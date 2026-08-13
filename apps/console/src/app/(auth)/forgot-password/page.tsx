'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordRequestSchema } from '@ems/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { apiPost } from '@/lib/api-client';

type Values = z.input<typeof forgotPasswordRequestSchema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: Values) {
    try {
      await apiPost('/auth/forgot-password', values);
    } catch {
      // Swallowed on purpose. The server already answers identically for known and
      // unknown addresses; surfacing a client-side failure here would reintroduce the
      // very difference that makes account enumeration possible.
    } finally {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader title="Check your email" />
        <CardBody className="space-y-4">
          <Alert variant="info">
            If an account exists for that address, a reset link is on its way. The link
            expires in one hour and can be used once.
          </Alert>
          <p className="text-xs text-muted-foreground">
            Didn’t get it? Check your spam folder, then{' '}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setSent(false);
                form.reset();
              }}
            >
              try again
            </button>
            .
          </p>
          <Link href="/login" className="block text-center text-xs underline underline-offset-4">
            Back to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Reset your password"
        description="We’ll email you a link to choose a new one."
      />
      <CardBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register('email')}
            />
          </Field>

          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>

          <Link href="/login" className="block text-center text-xs underline underline-offset-4">
            Back to sign in
          </Link>
        </form>
      </CardBody>
    </Card>
  );
}
