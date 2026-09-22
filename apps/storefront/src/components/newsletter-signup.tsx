'use client';

import React, { useState, type FormEvent } from 'react';
import { Mail, Check, Loader2, ArrowRight } from 'lucide-react';

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(() => {
    if (typeof window !== 'undefined') {
      return Boolean(localStorage.getItem('ems_newsletter_subscribed'));
    }
    return false;
  });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Simulate newsletter registration and persist local opt-in
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (typeof window !== 'undefined') {
        localStorage.setItem('ems_newsletter_subscribed', 'true');
        localStorage.setItem('ems_newsletter_email', email.trim());
      }
      setIsSubscribed(true);
    } catch {
      setError('Failed to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubscribed) {
    return (
      <div className="flex items-center gap-2 rounded-theme border border-success/30 bg-success/10 p-3 text-xs font-medium text-success">
        <Check className="h-4 w-4 shrink-0" />
        <span>Thank you for subscribing! You will receive exclusive discounts and new product updates.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="Enter your email address"
            className="h-10 w-full rounded-theme border border-line bg-surface pl-9 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
            disabled={isSubmitting}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <span>Subscribe</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </form>
  );
}
