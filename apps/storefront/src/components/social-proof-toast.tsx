'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import Link from 'next/link';

interface SaleEvent {
  buyer: string;
  city: string;
  item: string;
  slug?: string;
  timeAgo: string;
}

const SAMPLE_EVENTS: SaleEvent[] = [
  { buyer: 'Pooja', city: 'Mumbai', item: 'Cotton T-Shirt', timeAgo: '2 minutes ago' },
  { buyer: 'Rahul', city: 'Bengaluru', item: 'Wireless Earbuds', timeAgo: '4 minutes ago' },
  { buyer: 'Ananya', city: 'Delhi NCR', item: 'Stainless Water Bottle', timeAgo: '6 minutes ago' },
  { buyer: 'Vikram', city: 'Hyderabad', item: 'Leather Backpack', timeAgo: '9 minutes ago' },
  { buyer: 'Sneha', city: 'Pune', item: 'Organic Honey 500g', timeAgo: '12 minutes ago' },
  { buyer: 'Karan', city: 'Jaipur', item: 'Ceramic Coffee Mug', timeAgo: '15 minutes ago' },
];

export function SocialProofToast() {
  const [eventIndex, setEventIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    // Show after initial 4 seconds
    const initialTimer = setTimeout(() => {
      setVisible(true);
    }, 4000);

    // Periodic cycling
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setEventIndex((prev) => (prev + 1) % SAMPLE_EVENTS.length);
        setVisible(true);
      }, 1000);
    }, 12000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [dismissed]);

  const current = SAMPLE_EVENTS[eventIndex];
  if (dismissed || !visible || !current) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 hidden sm:block max-w-xs animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface/95 p-3 shadow-lg backdrop-blur text-ink">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <ShoppingBag className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-ink truncate">
            <span className="font-semibold">{current.buyer}</span> in {current.city}
          </p>
          <p className="text-ink-muted truncate">
            Purchased <span className="text-brand font-medium">{current.item}</span>
          </p>
          <p className="text-[10px] text-ink-muted/70 mt-0.5">{current.timeAgo} • Verified Purchase</p>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 text-ink-muted hover:bg-surface-alt hover:text-ink transition"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
