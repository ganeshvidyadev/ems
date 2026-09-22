'use client';

import type { ProductResponse } from '@ems/contracts';
import { Bell, BellOff, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';

const STORAGE_KEY = 'ems_back_in_stock';

function getStoredRequests(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveRequest(productId: string, email: string) {
  try {
    const stored = getStoredRequests();
    stored[productId] = email;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore
  }
}

function hasRequest(productId: string): boolean {
  const stored = getStoredRequests();
  return Boolean(stored[productId]);
}

/**
 * Back-In-Stock Notification Widget.
 *
 * Shown on PDP when product is out of stock (stockCount === 0 or status === 'OUT_OF_STOCK').
 * Stores requests in localStorage for now; a real implementation would POST to a notifications endpoint.
 */
export function BackInStockWidget({ product }: { product: ProductResponse }) {
  const isOutOfStock = product.status === 'OUT_OF_STOCK';

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(() => hasRequest(product.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOutOfStock) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);

    // Simulate async API call (replace with real endpoint when available)
    await new Promise((resolve) => setTimeout(resolve, 600));
    saveRequest(product.id, trimmed);
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="rounded-theme border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {submitted ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <Bell className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        )}
        <p className="text-sm font-semibold text-amber-900">
          {submitted ? 'You are on the list!' : 'Out of Stock — Notify Me When Available'}
        </p>
      </div>

      {submitted ? (
        <p className="text-xs text-amber-700">
          We will send you an email as soon as <strong>{product.name}</strong> is back in stock.
          You can update your notification preferences in your account.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="your@email.com"
            className="flex-1 rounded-theme border border-amber-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            aria-label="Email address for back-in-stock notification"
            required
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={loading}
            className="shrink-0 border-amber-400 text-amber-900 hover:bg-amber-100 text-xs h-9"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
            Notify Me
          </Button>
        </form>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
