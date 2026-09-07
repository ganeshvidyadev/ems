'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/**
 * Authenticated shell.
 *
 * Route protection lives here rather than in Next.js middleware, because the access token
 * is held in memory and is not readable by middleware running on the edge. Middleware
 * could only inspect the refresh cookie, which would let it gate on "has a session" but
 * not on who the user is or what they may do.
 *
 * This is a **UX** gate, not a security boundary. Every request is independently
 * authorised by the API; hiding a page only stops a user wandering into something they
 * cannot use.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Preserve the intended destination so the user lands where they were going rather
      // than on a dashboard they then have to navigate away from.
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  // 'unknown' and 'authenticating' both mean the silent refresh has not settled. Rendering
  // children here would flash protected content before the redirect lands.
  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span
          className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          aria-hidden
        />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/*
        Skip link. Keyboard and screen-reader users otherwise tab through eight nav
        links on every single page load before reaching the content they came for.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Sticky, and translucent so content scrolling under it stays legible. */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="shrink-0 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            EMS
          </Link>

          {/*
            `min-w-0` + `overflow-x-auto` on the nav, not on the page.
            Eight nav items cannot fit a 375px viewport, and without this the whole
            document gained a horizontal scrollbar — so every page scrolled sideways,
            not just the row that overflowed. A proper responsive nav (a sidebar that
            collapses to a drawer) is the real answer and is a separate change.
          */}
          <nav
            aria-label="Main"
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} pathname={pathname}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {/* Identity is a convenience, not navigation — first to go when space is tight. */}
            <div className="hidden text-right text-xs leading-tight sm:block">
              <p className="font-medium">{user.firstName}</p>
              <p className="text-muted-foreground">{user.tenant?.businessName ?? 'Platform'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div id="main">{children}</div>
    </div>
  );
}

/**
 * Nav order is deliberate: the dashboard first, then the things a merchant touches every
 * day, with the operational pages (`Sessions`, `System`) last. `System` is where the
 * Phase-1 health check moved to — still one click away, no longer the landing page.
 *
 * A sidebar with per-item icons and a command palette is the obvious next step at eight
 * items; that is a separate change from this one and is not attempted here.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/products', label: 'Products' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/customers', label: 'Customers' },
  { href: '/coupons', label: 'Coupons' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/system', label: 'System' },
] as const;

/**
 * Active-route highlighting, which the flat text nav had none of — there was no way to
 * tell from the chrome which page you were on.
 *
 * `aria-current="page"` alongside the colour change: the previous nav conveyed nothing
 * at all to assistive tech, and a colour-only indicator would still convey nothing.
 */
function NavLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string;
  children: ReactNode;
}) {
  // Exact match for the dashboard, prefix match for everything else, so `/orders/abc`
  // keeps "Orders" lit while a detail page is open — but `/products` does not light
  // up the dashboard just because every path starts with "/".
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-2.5 py-1.5 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'bg-secondary font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
