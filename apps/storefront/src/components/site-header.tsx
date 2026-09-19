'use client';

import { Search, ShoppingBag, Heart, User, Loader2, ArrowRight, Package, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProductResponse } from '@ems/contracts';
import { formatMinor } from '@/lib/money';
import { useHydrateCartId } from '@/lib/cart-id';
import { useStore } from '@/lib/store-context';
import { useCart } from '@/lib/use-cart';
import { useCustomer } from '@/lib/customer-context';
import { useWishlist } from '@/lib/use-wishlist';
import { useCartDrawer } from '@/lib/use-cart-drawer';
import { ProductThumb } from '@/components/product-thumb';
import { CurrencySwitcher } from '@/components/currency-switcher';
import type { StorefrontTheme } from '@/lib/theme';

function AnnouncementBar() {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className="relative bg-brand px-4 py-1.5 text-center text-[11px] sm:text-xs font-medium text-brand-foreground transition-all">
      <div className="mx-auto flex max-w-content items-center justify-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
        <span>Free All-India Delivery on orders ₹999+ · Use code <span className="font-bold underline">WELCOME10</span> for 10% Off!</span>
      </div>
      <button
        onClick={() => setClosed(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-foreground/70 hover:bg-black/10 hover:text-brand-foreground transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * The persistent shop chrome: store name, search, cart, wishlist, customer account.
 */
export function SiteHeader({ theme = 'default' }: { theme?: StorefrontTheme }) {
  const { name, tenantSlug } = useStore();
  const { customer, isAuthenticated } = useCustomer();
  const { wishlistItems } = useWishlist();

  // Mounted on every page, so this is where the stored cart id gets loaded
  useHydrateCartId(tenantSlug);

  if (theme !== 'default') return (
    <header className={`theme-header ${theme}-header`}>
      <AnnouncementBar />
      <div className="theme-container theme-header-inner">
        <Link href="/" className="theme-logo" aria-label={`${name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === 'organic' ? '/themes/organic/images/logo.svg' : '/themes/famms/images/logo.png'} alt={theme === 'organic' ? 'Organic' : 'Famms'} width={220} height={60} />
          <span>{name}</span>
        </Link>
        <nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/products">Products</Link></nav>
        <div className="theme-header-search"><HeaderSearch /></div>
        <div className="flex items-center gap-2">
          <Link href="/account/wishlist" className="p-2 text-ink hover:text-brand" title="Wishlist">
            <Heart className="h-5 w-5" />
          </Link>
          <CartLink />
          <Link href={isAuthenticated ? '/account' : '/account/login'} className="p-2 text-ink hover:text-brand" title="Account">
            <User className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <AnnouncementBar />
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
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

        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          <Link
            href="/account/wishlist"
            className="relative inline-flex h-10 items-center justify-center rounded-theme border border-line px-2.5 text-ink hover:border-brand hover:text-brand"
            aria-label="Wishlist"
            title="Wishlist"
          >
            <Heart className="h-4 w-4" />
            {wishlistItems.length > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                {wishlistItems.length}
              </span>
            )}
          </Link>

          <CartLink />

          <Link
            href={isAuthenticated ? '/account' : '/account/login'}
            className="inline-flex h-10 items-center gap-1.5 rounded-theme border border-line px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isAuthenticated ? customer?.firstName || 'Account' : 'Sign In'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<ProductResponse[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setTotalResults(0);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/storefront/products?q=${encodeURIComponent(trimmed)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.data ?? []);
          setTotalResults(data.meta?.pagination?.total ?? 0);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Failed to fetch search suggestions:', err);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsOpen(false);
    const trimmed = value.trim();
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : '/products');
  }

  function onSelectProduct(slug: string) {
    setIsOpen(false);
    router.push(`/products/${slug}`);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={onSubmit} role="search" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            if (value.trim().length >= 2 && results.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          placeholder="Search products..."
          aria-label="Search products"
          autoComplete="off"
          className="h-10 w-full rounded-theme border border-line bg-surface-alt pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />
        )}
      </form>

      {/* Floating Instant Search Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-theme border border-line bg-surface shadow-lg">
          {results.length > 0 ? (
            <div>
              <div className="border-b border-line bg-surface-alt px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Products ({totalResults})
              </div>
              <ul className="divide-y divide-line max-h-72 overflow-y-auto">
                {results.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product.slug)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-alt focus:bg-surface-alt focus:outline-none"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-line bg-surface-alt">
                        <ProductThumb name={product.name} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                        {product.shortDescription && (
                          <p className="truncate text-xs text-ink-muted">{product.shortDescription}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-semibold text-ink">
                          {formatMinor(product.priceMinor, product.currency)}
                        </span>
                        {product.comparePriceMinor && (
                          <span className="ml-1.5 text-[11px] text-ink-muted line-through">
                            {formatMinor(product.comparePriceMinor, product.currency)}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line bg-surface-alt p-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    router.push(`/products?q=${encodeURIComponent(value.trim())}`);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  View all {totalResults} results for &ldquo;{value.trim()}&rdquo;
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-ink-muted">
              No products found for &ldquo;{value.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CartLink() {
  const { itemCount, isLoading } = useCart();
  const openDrawer = useCartDrawer((state) => state.openDrawer);

  return (
    <button
      type="button"
      onClick={openDrawer}
      className="relative inline-flex h-10 items-center gap-2 rounded-theme border border-line px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand cursor-pointer"
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
    </button>
  );
}
