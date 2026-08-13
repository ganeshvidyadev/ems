'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordRequestSchema } from '@ems/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { ApiError, apiPost } from '@/lib/api-client';

type Values = z.input<typeof resetPasswordRequestSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  async function onSubmit(values: Values) {
    setFormError(null);

    try {
      await apiPost('/auth/reset-password', values);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof Values, { message });
        }
        if (Object.keys(error.fieldErrors).length === 0) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please request a new link.');
      }
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader title="Link not valid" />
        <CardBody className="space-y-4">
          <Alert variant="error">
            This reset link is missing its token. Request a new one to continue.
          </Alert>
          <Link
            href="/forgot-password"
            className="block text-center text-xs underline underline-offset-4"
          >
            Request a new link
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader title="Password updated" />
        <CardBody className="space-y-4">
          {/*
            Stating the session revocation explicitly matters: the user is about to find
            themselves signed out on their other devices, and an unexplained sign-out reads
            as a bug or a breach.
          */}
          <Alert variant="success">
            Your password has been changed and every other signed-in device was signed out.
          </Alert>
          <Button className="w-full" onClick={() => router.replace('/login')}>
            Sign in
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Choose a new password" />
      <CardBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <Field
            label="New password"
            htmlFor="password"
            hint="At least 12 characters. Length beats complexity — a passphrase works well."
            error={form.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
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

          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
