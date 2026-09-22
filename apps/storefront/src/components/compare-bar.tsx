'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Scale, Trash2, X } from 'lucide-react';
import { useCompareStore } from '@/lib/use-compare';
import { ProductThumb } from '@/components/product-thumb';

export function FloatingCompareBar() {
  const pathname = usePathname();
  const { items, removeItem, clear } = useCompareStore();

  if (items.length === 0 || pathname.startsWith('/products/compare') || pathname.startsWith('/checkout')) {
    return null;
  }

  return (
    <aside
      aria-label="Product comparison floating bar"
      className="fixed bottom-16 sm:bottom-6 left-1/2 z-40 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-brand/20 bg-surface/95 backdrop-blur-md shadow-2xl p-3 sm:p-4 transition-all animate-fade-up"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-brand shrink-0" />
          <span className="text-xs font-semibold text-ink">
            Compare ({items.length}/4)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => clear()}
            className="text-[11px] font-medium text-ink-muted hover:text-danger flex items-center gap-1 transition-colors px-1 py-0.5"
            title="Clear all compared items"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
          <Link
            href="/products/compare"
            className="inline-flex items-center gap-1.5 rounded-theme bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:bg-brand/90 shadow-sm transition-all"
          >
            Compare Now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative flex items-center gap-2 rounded-theme border border-line bg-surface-alt px-2 py-1 shrink-0"
          >
            <ProductThumb name={item.name} className="h-7 w-7 rounded-sm" textClassName="text-[10px]" />
            <span className="max-w-[90px] truncate text-[11px] font-medium text-ink">
              {item.name}
            </span>
            <button
              onClick={() => removeItem(item.id)}
              className="text-ink-muted hover:text-danger rounded-full p-0.5"
              aria-label={'Remove ' + item.name + ' from compare'}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
