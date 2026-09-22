'use client';

import { useState, useEffect } from 'react';
import { Flame, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CartReservationTimerProps {
  initialMinutes?: number;
  className?: string;
}

export function CartReservationTimer({ initialMinutes = 10, className }: CartReservationTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialMinutes * 60);

  useEffect(() => {
    // Check if there's an existing timer expiry in sessionStorage
    const storedExpiry = sessionStorage.getItem('ems_cart_reservation_expiry');
    const now = Date.now();

    if (storedExpiry) {
      const remaining = Math.max(0, Math.floor((parseInt(storedExpiry, 10) - now) / 1000));
      setSecondsLeft(remaining > 0 ? remaining : initialMinutes * 60);
      if (remaining <= 0) {
        sessionStorage.setItem('ems_cart_reservation_expiry', String(now + initialMinutes * 60 * 1000));
      }
    } else {
      const expiry = now + initialMinutes * 60 * 1000;
      sessionStorage.setItem('ems_cart_reservation_expiry', String(expiry));
      setSecondsLeft(initialMinutes * 60);
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Reset loop or stay at 0
          const nextExpiry = Date.now() + initialMinutes * 60 * 1000;
          sessionStorage.setItem('ems_cart_reservation_expiry', String(nextExpiry));
          return initialMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [initialMinutes]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const isUrgent = secondsLeft < 180; // Under 3 minutes

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg px-3.5 py-2 text-xs transition-colors',
        isUrgent
          ? 'border border-sale/40 bg-sale/10 text-sale animate-pulse font-medium'
          : 'border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
        className
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        {isUrgent ? <Flame className="h-4 w-4 text-sale shrink-0" /> : <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />}
        <span>High demand: Items reserved for</span>
      </div>

      <div className="font-mono text-xs font-bold tracking-wider">
        {formatted}
      </div>
    </div>
  );
}
