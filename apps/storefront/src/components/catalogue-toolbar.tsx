'use client';

import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

/**
 * The search-and-sort bar above the product grid.
 *
 * Submits by navigation rather than fetching in place, which keeps the grid a
 * server component: the query lands in the URL, the results are rendered on the
 * server, and the browser never has to hold a second copy of the catalogue.
 *
 * There is deliberately no category or brand filter here. The API exposes no
 * public category-tree or brand-list endpoint — only permission-gated console
 * ones — so a filter UI would be a control with nothing real behind it.
 */

const SORT_OPTIONS = [
  { value: '', label: 'Newest' },
  { value: 'priceMinor', label: 'Price: low to high' },
  { value: '-priceMinor', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
  { value: '-totalSold', label: 'Best selling' },
] as const;

export function CatalogueToolbar({ q, sort }: { q: string; sort: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);

  // Keeps the box in step with the URL when the shopper uses the back button or
  // searches again from the header, where this component is not the source.
  useEffect(() => setValue(q), [q]);

  function navigate(next: { q?: string; sort?: string }) {
    const params = new URLSearchParams();
    const query = (next.q ?? value).trim();
    const nextSort = next.sort ?? sort;

    if (query) params.set('q', query);
    if (nextSort) params.set('sort', nextSort);
    // `page` is intentionally dropped: changing the query or the ordering makes the
    // old page number meaningless, and landing on an empty page 4 looks like a bug.

    const qs = params.toString();
    router.push(qs ? `/products?${qs}` : '/products');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({});
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={onSubmit} role="search" className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="h-10 w-full rounded-theme border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              navigate({ q: '' });
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </form>

      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="whitespace-nowrap text-sm text-ink-muted">
          Sort by
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(event) => navigate({ sort: event.target.value })}
          className="h-10 rounded-theme border border-line bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
