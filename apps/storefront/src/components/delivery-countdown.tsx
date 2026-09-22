'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Zap } from 'lucide-react';

export function DeliveryCountdown() {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    function calculateRemaining() {
      const now = new Date();
      // Target today at 18:00:00 (6:00 PM cutoff)
      const cutoff = new Date();
      cutoff.setHours(18, 0, 0, 0);

      let diff = cutoff.getTime() - now.getTime();
      if (diff <= 0) {
        // If past 6 PM, target tomorrow 6 PM
        cutoff.setDate(cutoff.getDate() + 1);
        diff = cutoff.getTime() - now.getTime();
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });
    }

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="rounded-theme border border-brand/20 bg-brand/[0.04] p-3 text-xs text-ink flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Zap className="h-3.5 w-3.5 fill-brand" />
        </span>
        <div>
          <p className="font-semibold text-ink leading-tight">Order soon for same-day dispatch!</p>
          <p className="text-ink-muted text-[11px] mt-0.5">Fast express shipping across India</p>
        </div>
      </div>
      <div className="flex items-center gap-1 font-mono text-xs font-bold text-brand bg-surface px-2.5 py-1 rounded-theme border border-brand/20 shadow-xs">
        <Clock className="h-3.5 w-3.5 text-brand" />
        <span>{pad(timeLeft.hours)}h : {pad(timeLeft.minutes)}m : {pad(timeLeft.seconds)}s</span>
      </div>
    </div>
  );
}
