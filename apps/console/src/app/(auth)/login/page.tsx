'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, mfaVerifyRequestSchema } from '@ems/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

type LoginValues = z.input<typeof loginRequestSchema>;
type MfaValues = { code: string };

export default function LoginPage() {
  const router = useRouter();
  const { login, completeMfa } = useAuth();

  const [formError, setFormError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  /**
   * Read at submit time, not with `useSearchParams()` during render.
   *
   * Calling `useSearchParams()` here forces the whole page into the parent Suspense
   * fallback during prerender, so the server HTML would contain a spinner instead of the
   * login form — the slowest possible first paint on the most-visited page in the console.
   * The redirect target is only needed once, on success, when `window` definitely exists.
   */
  const resolveNextPath = (): string => {
    if (typeof window === 'undefined') return '/';
    const next = new URLSearchParams(window.location.search).get('next');
    // Only same-origin relative paths. An absolute URL here would be an open redirect:
    // `?next=https://evil.example` would bounce a freshly-authenticated user off-site.
    if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
    return next;
  };

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '', rememberDevice: false },
  });

  const mfaForm = useForm<MfaValues>({ defaultValues: { code: '' } });

  async function onLogin(values: LoginValues) {
    setFormError(null);

    try {
      const result = await login(values.email, values.password, values.tenantSlug);

      if (result.outcome === 'MFA_REQUIRED') {
        // Second factor pending — swap the form rather than navigating, so the challenge
        // token stays in memory and is never put in a URL.
        setMfaToken(result.mfaToken);
        return;
      }

      router.replace(resolveNextPath());
    } catch (error) {
      if (error instanceof ApiError) {
        // Field errors are attached where the server identified them; anything else
        // becomes a form-level message. Never surface the raw code to the user.
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          loginForm.setError(field as keyof LoginValues, { message });
        }

        if (error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
          setFormError(
            'Verify your email address before signing in. Check your inbox for the link.',
          );
        } else if (Object.keys(error.fieldErrors).length === 0) {
          setFormError(error.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  }

  async function onVerifyMfa(values: MfaValues) {
    if (!mfaToken) return;
    setFormError(null);

    try {
      await completeMfa(mfaToken, values.code, useRecoveryCode ? 'RECOVERY_CODE' : 'TOTP');
      router.replace(resolveNextPath());
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'That code was not accepted. Try again.';
      mfaForm.setError('code', { message });

      // An expired challenge token cannot be retried — send the user back to the start
      // rather than letting them type codes against a dead token.
      if (error instanceof ApiError && error.code === 'AUTH_TOKEN_EXPIRED') {
        setMfaToken(null);
        setFormError('That took too long. Please sign in again.');
      }
    }
  }

  // -------------------------------------------------------------------------
  // MFA challenge
  // -------------------------------------------------------------------------
  if (mfaToken) {
    return (
      <Card>
        <CardHeader
          title="Two-factor authentication"
          description={
            useRecoveryCode
              ? 'Enter one of your recovery codes.'
              : 'Enter the 6-digit code from your authenticator app.'
          }
        />
        <CardBody>
          <form onSubmit={mfaForm.handleSubmit(onVerifyMfa)} className="space-y-4" noValidate>
            {formError && <Alert variant="error">{formError}</Alert>}

            <Field
              label={useRecoveryCode ? 'Recovery code' : 'Authentication code'}
              htmlFor="code"
              error={mfaForm.formState.errors.code?.message}
            >
              <Input
                id="code"
                // one-time-code lets browsers and iOS autofill an SMS/authenticator code.
                autoComplete="one-time-code"
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                placeholder={useRecoveryCode ? 'XXXX-XXXX-XXXX' : '000000'}
                autoFocus
                aria-invalid={Boolean(mfaForm.formState.errors.code)}
                {...mfaForm.register('code', { required: 'Enter your code' })}
              />
            </Field>

            <Button type="submit" className="w-full" loading={mfaForm.formState.isSubmitting}>
              Verify and sign in
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setUseRecoveryCode((previous) => !previous);
                  mfaForm.reset();
                }}
              >
                {useRecoveryCode ? 'Use authenticator app' : 'Use a recovery code'}
              </button>
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMfaToken(null);
                  setFormError(null);
                }}
              >
                Start over
              </button>
            </div>
          </form>
        </CardBody>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Password
  // -------------------------------------------------------------------------
  return (
    <Card>
      <CardHeader title="Sign in" description="Access your store dashboard." />
      <CardBody>
        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <Field label="Email" htmlFor="email" error={loginForm.formState.errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(loginForm.formState.errors.email)}
              {...loginForm.register('email')}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={loginForm.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(loginForm.formState.errors.password)}
              {...loginForm.register('password')}
            />
          </Field>

          <Button type="submit" className="w-full" loading={loginForm.formState.isSubmitting}>
            Sign in
          </Button>

          <div className="text-center text-xs">
            <Link
              href="/forgot-password"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
