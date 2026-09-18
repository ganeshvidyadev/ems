'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';

export default function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.request('auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-theme border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Reset Password</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter your email and we will send you a reset link</p>
      </div>

      {submitted ? (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm text-ink font-medium">Reset instructions sent</p>
          <p className="mt-1 text-xs text-ink-muted">
            If an account exists for {email}, a password reset link has been dispatched to your inbox.
          </p>
          <div className="mt-6">
            <Link
              href="/account/login"
              className="inline-flex h-10 items-center justify-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 w-full items-center justify-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
            Remembered your password?{' '}
            <Link href="/account/login" className="font-medium text-brand hover:underline">
              Back to Sign In
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
