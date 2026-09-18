'use client';

import type { BrandResponse, CategoryResponse } from '@ems/contracts';
import { ChevronDown, ChevronRight, Filter, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface FilterState {
  q: string;
  sort: string;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
}

interface CatalogueFiltersProps {
  categories: CategoryResponse[];
  brands: BrandResponse[];
  filters: FilterState;
  className?: string;
}

const PRICE_PRESETS = [
  { label: 'Under ₹500', min: '', max: '500' },
  { label: '₹500 – ₹1,000', min: '500', max: '1000' },
  { label: '₹1,000 – ₹2,500', min: '1000', max: '2500' },
  { label: 'Above ₹2,500', min: '2500', max: '' },
];

export function CatalogueFilters({ categories, brands, filters, className }: CatalogueFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Price inputs state
  const [minPriceInput, setMinPriceInput] = useState(filters.minPrice ?? '');
  const [maxPriceInput, setMaxPriceInput] = useState(filters.maxPrice ?? '');

  function updateQuery(updates: Partial<FilterState>) {
    const next: FilterState = { ...filters, ...updates };
    const params = new URLSearchParams();

    if (next.q) params.set('q', next.q);
    if (next.sort) params.set('sort', next.sort);
    if (next.category) params.set('category', next.category);
    if (next.brand) params.set('brand', next.brand);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/products?${qs}` : '/products');
    });
    setMobileOpen(false);
  }

  function handlePriceSubmit(e: FormEvent) {
    e.preventDefault();
    updateQuery({
      minPrice: minPriceInput.trim() || undefined,
      maxPrice: maxPriceInput.trim() || undefined,
    });
  }

  const activeFiltersCount =
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0);

  const filterContent = (
    <div className="space-y-6">
      {/* Categories section */}
      {categories.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Categories</h3>
          <ul className="space-y-1.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => updateQuery({ category: undefined })}
                className={cn(
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition',
                  !filters.category
                    ? 'font-medium text-brand bg-surface-alt'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                <span>All Categories</span>
              </button>
            </li>
            {categories.map((cat) => {
              const isSelected = filters.category === cat.id;
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => updateQuery({ category: isSelected ? undefined : cat.id })}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition',
                      isSelected
                        ? 'font-semibold text-brand bg-surface-alt'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Brands section */}
      {brands.length > 0 && (
        <div className="space-y-3 border-t border-line pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Brands</h3>
          <ul className="space-y-1.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => updateQuery({ brand: undefined })}
                className={cn(
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition',
                  !filters.brand
                    ? 'font-medium text-brand bg-surface-alt'
                    : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                )}
              >
                <span>All Brands</span>
              </button>
            </li>
            {brands.map((b) => {
              const isSelected = filters.brand === b.id;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => updateQuery({ brand: isSelected ? undefined : b.id })}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition',
                      isSelected
                        ? 'font-semibold text-brand bg-surface-alt'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <span className="truncate">{b.name}</span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Price Range section */}
      <div className="space-y-3 border-t border-line pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Price (₹)</h3>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => {
            const isSelected = filters.minPrice === p.min && filters.maxPrice === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setMinPriceInput('');
                    setMaxPriceInput('');
                    updateQuery({ minPrice: undefined, maxPrice: undefined });
                  } else {
                    setMinPriceInput(p.min);
                    setMaxPriceInput(p.max);
                    updateQuery({ minPrice: p.min || undefined, maxPrice: p.max || undefined });
                  }
                }}
                className={cn(
                  'rounded border px-2 py-1 text-xs transition',
                  isSelected
                    ? 'border-brand bg-brand text-brand-foreground font-medium'
                    : 'border-line text-ink-muted hover:border-ink-muted hover:text-ink',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Custom Min / Max Inputs */}
        <form onSubmit={handlePriceSubmit} className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                ₹
              </span>
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                className="h-8 w-full rounded border border-line bg-surface pl-6 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </div>
            <span className="text-xs text-ink-muted">–</span>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                ₹
              </span>
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="h-8 w-full rounded border border-line bg-surface pl-6 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <Button type="submit" size="sm" variant="secondary" className="w-full h-7 text-xs">
            Apply Price
          </Button>
        </form>
      </div>

      {/* Clear all active filters */}
      {activeFiltersCount > 0 && (
        <div className="border-t border-line pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMinPriceInput('');
              setMaxPriceInput('');
              updateQuery({ category: undefined, brand: undefined, minPrice: undefined, maxPrice: undefined });
            }}
            className="w-full text-xs text-sale hover:text-sale"
          >
            Clear All Filters ({activeFiltersCount})
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <aside className={cn('relative', className)}>
      {/* Mobile filter toggle trigger */}
      <div className="lg:hidden mb-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setMobileOpen(true)}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
          </span>
          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </div>

      {/* Mobile Drawer Modal */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-full max-w-xs flex-col bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h2 className="text-base font-semibold text-ink">Filter Products</h2>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-1 text-ink-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">{filterContent}</div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 shrink-0 rounded-theme border border-line bg-surface p-5 sticky top-24">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Filters</h2>
          {activeFiltersCount > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
              {activeFiltersCount}
            </span>
          )}
        </div>
        {filterContent}
      </div>
    </aside>
  );
}

/**
 * Active filter badges shown above the product grid with 1-click removal.
 */
export function ActiveFilterChips({
  categories,
  brands,
  filters,
}: {
  categories: CategoryResponse[];
  brands: BrandResponse[];
  filters: FilterState;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const selectedCategory = categories.find((c) => c.id === filters.category);
  const selectedBrand = brands.find((b) => b.id === filters.brand);

  function removeFilter(key: keyof FilterState) {
    const next = { ...filters, [key]: undefined };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.sort) params.set('sort', next.sort);
    if (next.category) params.set('category', next.category);
    if (next.brand) params.set('brand', next.brand);
    if (next.minPrice) params.set('minPrice', next.minPrice);
    if (next.maxPrice) params.set('maxPrice', next.maxPrice);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/products?${qs}` : '/products');
    });
  }

  function clearAll() {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.sort) params.set('sort', filters.sort);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/products?${qs}` : '/products');
    });
  }

  const hasFilters = Boolean(
    selectedCategory ||
      selectedBrand ||
      filters.minPrice ||
      filters.maxPrice ||
      filters.q,
  );

  if (!hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
      <span className="text-xs font-medium text-ink-muted">Active:</span>

      {filters.q && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">
          <span>Search: &quot;{filters.q}&quot;</span>
          <button
            type="button"
            onClick={() => removeFilter('q')}
            className="text-ink-muted hover:text-ink"
            aria-label="Remove search filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {selectedCategory && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-surface-alt px-2.5 py-1 text-xs font-medium text-brand">
          <span>Category: {selectedCategory.name}</span>
          <button
            type="button"
            onClick={() => removeFilter('category')}
            className="text-brand hover:opacity-75"
            aria-label="Remove category filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {selectedBrand && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-surface-alt px-2.5 py-1 text-xs font-medium text-brand">
          <span>Brand: {selectedBrand.name}</span>
          <button
            type="button"
            onClick={() => removeFilter('brand')}
            className="text-brand hover:opacity-75"
            aria-label="Remove brand filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {(filters.minPrice || filters.maxPrice) && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">
          <span>
            Price: {filters.minPrice ? `₹${filters.minPrice}` : '₹0'} – {filters.maxPrice ? `₹${filters.maxPrice}` : 'Any'}
          </span>
          <button
            type="button"
            onClick={() => {
              removeFilter('minPrice');
              removeFilter('maxPrice');
            }}
            className="text-ink-muted hover:text-ink"
            aria-label="Remove price filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={clearAll}
        className="text-xs font-medium text-sale hover:underline ml-1"
      >
        Clear all
      </button>
    </div>
  );
}
