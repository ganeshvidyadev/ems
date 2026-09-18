'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCustomer } from '@/lib/customer-context';
import { ApiError } from '@/lib/api-client';

export default function CustomerRegisterPage() {
  const { register, isAuthenticated } = useCustomer();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') ?? '/account';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    router.replace(redirectUrl);
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await register({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        acceptsMarketing,
      });
      router.push(redirectUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to create account. Please check your information.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-theme border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Create an Account</h1>
        <p className="mt-1 text-sm text-ink-muted">Join now for faster checkout, order tracking, and wishlist</p>
      </div>

      {error && (
        <div className="mb-4 rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-ink">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="Priya"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-ink">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="Sharma"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-ink">
            Phone number (optional)
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="+91 98765 43210"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password (min 8 characters)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="••••••••"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="marketing"
            type="checkbox"
            checked={acceptsMarketing}
            onChange={(e) => setAcceptsMarketing(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
          />
          <label htmlFor="marketing" className="text-xs text-ink-muted">
            Send me exclusive offers, product announcements and updates
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-10 w-full items-center justify-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Account'}
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link
          href={`/account/login${redirectUrl !== '/account' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
          className="font-medium text-brand hover:underline"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
