'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Truck, ShieldCheck, Gift, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

interface Announcement {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  ctaText?: string;
  ctaHref?: string;
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: '1',
    icon: Sparkles,
    text: '⚡ Flash Festive Sale: Use voucher code WELCOME10 for 10% off',
    ctaText: 'Shop Sale',
    ctaHref: '/products?onSale=true',
  },
  {
    id: '2',
    icon: Truck,
    text: '🚚 Free Express Shipping across India on all orders above ₹999',
    ctaText: 'Learn More',
    ctaHref: '/products',
  },
  {
    id: '3',
    icon: Gift,
    text: '🎁 Give ₹250, Get ₹250! Invite your friends and earn instant store credits',
    ctaText: 'Refer & Earn',
    ctaHref: '/account/referrals',
  },
  {
    id: '4',
    icon: ShieldCheck,
    text: '🛡️ 100% Genuine Items • 7-Day Easy Hassle-Free Returns Guaranteed',
    ctaText: 'Our Promise',
    ctaHref: '/contact',
  },
];

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isPaused || dismissed) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [isPaused, dismissed]);

  if (dismissed) return null;

  const current = ANNOUNCEMENTS[index] ?? ANNOUNCEMENTS[0]!;
  const Icon = current.icon;

  return (
    <aside 
      aria-label="Store Announcement"
      className="relative z-30 bg-ink text-surface py-2 px-4 text-xs select-none border-b border-white/10"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="mx-auto max-w-content flex items-center justify-between gap-4">
        {/* Nav arrow left */}
        <button
          type="button"
          onClick={() => setIndex((prev) => (prev > 0 ? prev - 1 : ANNOUNCEMENTS.length - 1))}
          className="hidden sm:inline-flex p-1 text-surface/70 hover:text-surface transition rounded"
          aria-label="Previous announcement"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Center message */}
        <div className="flex-1 flex items-center justify-center gap-2 text-center truncate">
          <Icon className="h-3.5 w-3.5 text-brand shrink-0 animate-pulse" />
          <span className="truncate font-medium text-[11px] sm:text-xs tracking-wide">
            {current.text}
          </span>
          {current.ctaHref && current.ctaText && (
            <Link
              href={current.ctaHref}
              className="hidden md:inline-block ml-1 font-bold underline underline-offset-2 hover:text-brand transition text-[11px]"
            >
              {current.ctaText} →
            </Link>
          )}
        </div>

        {/* Nav arrow right & dismiss */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length)}
            className="hidden sm:inline-flex p-1 text-surface/70 hover:text-surface transition rounded"
            aria-label="Next announcement"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 text-surface/50 hover:text-surface transition rounded ml-1"
            aria-label="Dismiss announcement bar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
