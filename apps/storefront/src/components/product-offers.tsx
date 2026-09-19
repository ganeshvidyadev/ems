'use client';

import React, { useState } from 'react';
import { Tag, Check, Copy } from 'lucide-react';

const OFFERS = [
  {
    code: 'WELCOME10',
    title: 'Flat 10% Off on First Order',
    description: 'Use code at checkout. Applicable on all catalog items.',
    badge: 'NEW USER',
  },
  {
    code: 'FREEFLY',
    title: 'Free Express Shipping',
    description: 'Complimentary priority delivery on orders above ₹999.',
    badge: 'POPULAR',
  },
  {
    code: 'SAVE200',
    title: 'Save ₹200 on ₹1,999+',
    description: 'Instant discount applied at final checkout stage.',
    badge: 'SPECIAL',
  },
];

export function ProductOffers() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="space-y-2.5 rounded-theme border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink">
        <Tag className="h-3.5 w-3.5 text-brand" />
        <span>Available Offers & Coupons</span>
      </div>

      <div className="space-y-2">
        {OFFERS.map((offer) => (
          <div
            key={offer.code}
            className="flex items-center justify-between gap-3 rounded-theme border border-dashed border-line bg-surface-alt/60 p-2.5 text-xs transition-colors hover:border-brand/40"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded text-[11px]">
                  {offer.code}
                </span>
                <span className="font-semibold text-ink text-xs">{offer.title}</span>
              </div>
              <p className="text-[11px] text-ink-muted">{offer.description}</p>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(offer.code)}
              className="flex-shrink-0 inline-flex items-center gap-1 rounded-theme border border-brand/30 bg-surface px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand hover:text-brand-foreground transition-all shadow-2xs"
            >
              {copiedCode === offer.code ? (
                <>
                  <Check className="h-3 w-3 text-success" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
