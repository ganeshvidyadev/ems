'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, CheckCircle2, Truck, AlertCircle } from 'lucide-react';

export function PincodeChecker({ requiresShipping = true }: { requiresShipping?: boolean }) {
  const [pincode, setPincode] = useState('');
  const [savedPincode, setSavedPincode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ems_customer_pincode');
      if (stored && /^\d{6}$/.test(stored)) {
        setSavedPincode(stored);
        setPincode(stored);
      }
    }
  }, []);

  if (!requiresShipping) return null;

  function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    const clean = pincode.trim();
    if (!/^\d{6}$/.test(clean)) {
      setError('Please enter a valid 6-digit PIN code');
      return;
    }

    setError(null);
    setSavedPincode(clean);
    setIsEditing(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ems_customer_pincode', clean);
    }
  }

  // Calculate estimated delivery: 3 business days ahead
  function getEstimatedDeliveryDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="rounded-theme border border-line bg-surface p-4 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <MapPin className="h-4 w-4 text-brand shrink-0" />
          <span>Delivery Options</span>
        </div>
        {savedPincode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-[11px] font-medium text-brand hover:underline"
          >
            Change
          </button>
        )}
      </div>

      {!savedPincode || isEditing ? (
        <form onSubmit={handleCheck} className="mt-3 space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={pincode}
              onChange={(e) => {
                setPincode(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              placeholder="Enter 6-digit Pincode"
              className="h-8 flex-1 rounded border border-line bg-surface-alt px-3 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center rounded bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
            >
              Check
            </button>
          </div>
          {error && <p className="text-[11px] text-danger">{error}</p>}
        </form>
      ) : (
        <div className="mt-2.5 space-y-1.5 text-ink">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            <span>
              Delivering to <span className="font-semibold text-ink">{savedPincode}</span> by{' '}
              <span className="font-bold text-success">{getEstimatedDeliveryDate()}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted pl-5">
            <span>✓ Standard Delivery Available</span>
            <span>✓ Cash on Delivery (COD) Available</span>
          </div>
        </div>
      )}
    </div>
  );
}
