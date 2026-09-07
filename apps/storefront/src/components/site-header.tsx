'use client';

import { Search, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useHydrateCartId } from '@/lib/cart-id';
import { useStore } from '@/lib/store-context';
import { useCart } from '@/lib/use-cart';

/**
 * The persistent shop chrome: store name, search, cart.
 *
 * A client component because all three of those need browser state — the item
 * count comes from the cart query, and search has to survive typing without a
 * round-trip per keystroke. The store *name* is passed down from the server
 * layout rather than fetched here, so the header renders complete in the first
 * HTML instead of flashing a placeholder.
 */
export function SiteHeader() {
  const { name, tenantSlug } = useStore();

  // Mounted on every page, so this is where the stored cart id gets loaded — one
  // place, rather than each page remembering to hydrate it.
  useHydrateCartId(tenantSlug);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight text-ink hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {name}
        </Link>

        <nav className="hidden items-center gap-4 text-sm text-ink-muted sm:flex">
          <Link href="/products" className="hover:text-ink">
            All products
          </Link>
        </nav>

        <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:flex-1 sm:max-w-sm">
          <HeaderSearch />
        </div>

        <CartLink />
      </div>
    </header>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    // Navigating rather than filtering in place keeps the result set server-rendered
    // and the query in the URL, so a search is a shareable, back-button-able page.
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : '/products');
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search products"
        aria-label="Search products"
        className="h-10 w-full rounded-theme border border-line bg-surface-alt pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </form>
  );
}

function CartLink() {
  const { itemCount, isLoading } = useCart();

  return (
    <Link
      href="/cart"
      className="relative inline-flex h-10 items-center gap-2 rounded-theme border border-line px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      aria-label={isLoading ? 'Cart' : `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {/* Hidden entirely at zero, and while the stored cart id is still being read:
          a badge that flashes "0" then jumps to "3" on every page load looks broken. */}
      {!isLoading && itemCount > 0 && (
        <span
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-brand-foreground"
          aria-hidden
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  );
}
