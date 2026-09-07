'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/use-auth';

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
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-6">
            <Link href="/" className="text-sm font-semibold">
              EMS
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                Status
              </Link>
              <Link href="/products" className="hover:text-foreground">
                Products
              </Link>
              <Link href="/orders" className="hover:text-foreground">
                Orders
              </Link>
              <Link href="/sessions" className="hover:text-foreground">
                Sessions
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <p className="font-medium">{user.firstName}</p>
              <p className="text-muted-foreground">
                {user.tenant?.businessName ?? 'Platform'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
