'use client';

import { Cookie, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

const STORAGE_KEY = 'ems_cookie_consent';

/**
 * Modern, non-intrusive Cookie & Privacy Consent Banner for Storefront.
 * Complies with modern e-commerce data transparency and GDPR/DPDP guidelines.
 * Persists customer preference in localStorage.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't made a choice yet
    try {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        // Small timeout for graceful slide-up entrance after page load
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore localStorage security/private browsing exceptions
    }
  }, []);

  const handleConsent = (choice: 'all' | 'essential') => {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie and privacy consent"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 rounded-2xl border border-line bg-surface/95 p-5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 print:hidden"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Cookie className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-ink">Cookie & Privacy Notice</h3>
            <p className="text-[11px] text-ink-muted">We respect your shopping privacy</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleConsent('essential')}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-alt hover:text-ink transition-colors"
          aria-label="Dismiss cookie notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        We use essential cookies to keep your shopping cart intact and ensure secure checkout. No third-party tracking cookies are placed without your permission.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => handleConsent('all')}
          className="flex-1 text-xs font-semibold py-1.5 h-8 shadow-sm"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Accept All
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleConsent('essential')}
          className="text-xs py-1.5 h-8 text-ink-muted hover:text-ink"
        >
          Essential Only
        </Button>
      </div>
    </aside>
  );
}
