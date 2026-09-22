'use client';

import { Scale } from 'lucide-react';
import type { ProductResponse } from '@ems/contracts';
import { useCompareStore } from '@/lib/use-compare';
import { cn } from '@/lib/utils';

export function CompareButton({
  product,
  className,
}: {
  product: ProductResponse;
  className?: string;
}) {
  const { isInCompare, addItem, removeItem, items } = useCompareStore();
  const active = isInCompare(product.id);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      removeItem(product.id);
    } else {
      if (items.length >= 4) {
        alert('You can compare up to 4 products at a time.');
        return;
      }
      addItem(product);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={active ? 'Remove from compare' : 'Add to compare'}
      aria-label={active ? 'Remove from compare' : 'Add to compare'}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-theme border transition-all duration-fast',
        active
          ? 'border-brand bg-brand text-brand-foreground shadow-sm'
          : 'border-line bg-surface/90 text-ink-muted hover:border-brand hover:text-brand hover:bg-surface',
        className,
      )}
    >
      <Scale className="h-3.5 w-3.5" />
    </button>
  );
}
