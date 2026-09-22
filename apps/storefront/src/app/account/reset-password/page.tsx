'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';

export default function CustomerResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token') ?? '';

  const [token, setToken] = useState(tokenParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token.trim()) {
      setError('A valid reset token is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.request('auth/reset-password', {
        method: 'POST',
        body: { token: token.trim(), password },
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Password reset failed. The link may have expired.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-theme border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Set New Password</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter and confirm your new secure password</p>
      </div>

      {success ? (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm text-ink font-medium">Password Reset Successful</p>
          <p className="mt-1 text-xs text-ink-muted">You can now sign in with your new password.</p>
          <div className="mt-6">
            <Link
              href="/account/login"
              className="inline-flex h-10 items-center justify-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
            >
              Sign In
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
            {!tokenParam && (
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-ink">
                  Reset Token
                </label>
                <input
                  id="token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                  placeholder="Paste reset token from email"
                />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                New password (min 8 characters)
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-10 w-full items-center justify-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
