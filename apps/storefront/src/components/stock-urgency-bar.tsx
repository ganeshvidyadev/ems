'use client';

import { useState, useEffect } from 'react';
import { Flame, AlertCircle, Clock, ShieldCheck } from 'lucide-react';

interface StockUrgencyBarProps {
  stockCount?: number;
  threshold?: number;
  className?: string;
}

export function StockUrgencyBar({ stockCount = 5, threshold = 10, className = '' }: StockUrgencyBarProps) {
  // Only show urgency if stock count is at or below threshold and > 0
  if (stockCount > threshold || stockCount <= 0) return null;

  const percentage = Math.min(100, Math.max(10, Math.round((stockCount / threshold) * 100)));

  return (
    <div className={`rounded-lg border border-sale/30 bg-sale/5 p-3 text-xs ${className}`}>
      <div className="flex items-center justify-between font-medium text-sale">
        <div className="flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-sale animate-pulse" />
          <span>Hurry, only <strong className="font-bold">{stockCount} left</strong> in stock!</span>
        </div>
        <span className="text-[10px] opacity-80">High Demand</span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sale/20">
        <div
          className="h-full bg-sale transition-all duration-500 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
