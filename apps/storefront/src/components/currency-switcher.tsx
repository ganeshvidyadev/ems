'use client';

import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'India (INR ₹)' },
  { code: 'USD', symbol: '$', label: 'United States (USD $)' },
  { code: 'EUR', symbol: '€', label: 'Europe (EUR €)' },
  { code: 'GBP', symbol: '£', label: 'United Kingdom (GBP £)' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE (AED د.إ)' },
];

export function CurrencySwitcher() {
  const [selected, setSelected] = useState('INR');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ems_user_currency');
      if (stored) setSelected(stored);
    } catch {
      // Ignore
    }
  }, []);

  const handleSelect = (code: string) => {
    setSelected(code);
    setOpen(false);
    try {
      localStorage.setItem('ems_user_currency', code);
    } catch {
      // Ignore
    }
  };

  const curr = SUPPORTED_CURRENCIES.find((c) => c.code === selected) || {
    code: 'INR',
    symbol: '₹',
    label: 'India (INR ₹)',
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center gap-1.5 rounded-theme border border-line bg-surface px-2.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand transition-colors"
        title="Select Region & Currency"
        aria-label="Select Region & Currency"
      >
        <Globe className="h-3.5 w-3.5 text-ink-muted" />
        <span>{curr.code}</span>
        <span className="text-ink-muted font-normal">({curr.symbol})</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1.5 z-40 w-48 rounded-theme border border-line bg-surface p-1 shadow-xl animate-fade-up">
            <div className="px-2 py-1.5 border-b border-line text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Select Currency
            </div>
            {SUPPORTED_CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleSelect(c.code)}
                className={'w-full text-left flex items-center justify-between px-2.5 py-1.5 text-xs rounded-sm transition-colors ' +
                  (selected === c.code
                    ? 'bg-brand/10 font-bold text-brand'
                    : 'text-ink hover:bg-surface-alt')}
              >
                <span>{c.label}</span>
                {selected === c.code && <span className="text-brand">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
