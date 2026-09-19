'use client';

import type { CartResponse } from '@ems/contracts';
import { Tag, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { useApplyCoupon, useRemoveCoupon } from '@/lib/use-cart';

export function CouponBox({ cart, onApplied }: { cart: CartResponse; onApplied?: () => void }) {
  const [code, setCode] = useState('');
  const applyCoupon = useApplyCoupon();
  const removeCoupon = useRemoveCoupon();

  function handleApply() {
    const trimmed = code.trim();
    if (!trimmed) return;

    applyCoupon.mutate(
      { code: trimmed },
      {
        onSuccess: () => {
          setCode('');
          onApplied?.();
        },
      },
    );
  }

  if (cart.couponCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-theme border border-brand bg-surface-alt px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink">
          <Tag className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span className="truncate font-medium">{cart.couponCode}</span>
          <span className="shrink-0 text-ink-muted">applied</span>
        </span>
        <button
          type="button"
          onClick={() => {
            removeCoupon.mutate(undefined, {
              onSuccess: () => onApplied?.(),
            });
          }}
          disabled={removeCoupon.isPending}
          aria-label={`Remove coupon ${cart.couponCode}`}
          className="shrink-0 rounded p-1 text-ink-muted transition hover:text-sale disabled:opacity-40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="coupon" className="block text-sm font-medium text-ink">
        Coupon code
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon"
          value={code}
          maxLength={64}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleApply();
            }
          }}
          placeholder="Enter a code"
          aria-invalid={applyCoupon.isError || undefined}
        />
        <Button
          type="button"
          onClick={handleApply}
          variant="secondary"
          loading={applyCoupon.isPending}
          disabled={!code.trim()}
        >
          Apply
        </Button>
      </div>

      {applyCoupon.isError && (
        <p className="text-xs text-sale" role="alert">
          {applyCoupon.error instanceof ApiError
            ? applyCoupon.error.message
            : 'That code could not be applied.'}
        </p>
      )}
    </div>
  );
}
