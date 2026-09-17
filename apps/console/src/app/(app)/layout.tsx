'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { MantisAdminShell } from '@/components/ui/mantis-admin-shell';

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
  const { user, status, logout, impersonating, exitImpersonation } = useAuth();
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

  if (user.userType === 'PLATFORM' && user.roles.includes('PLATFORM_SUPER_ADMIN')) {
    return (
      <MantisAdminShell
        user={user}
        pathname={pathname}
        items={SUPER_ADMIN_NAV}
        homeHref="/analytics"
        badge="Super Admin"
        logout={logout}
      >
        {children}
      </MantisAdminShell>
    );
  }

  return (
    <MantisAdminShell
      user={user}
      pathname={pathname}
      items={COMPANY_ADMIN_NAV}
      homeHref="/"
      badge={user.tenant?.businessName ?? 'Merchant Admin'}
      impersonating={impersonating}
      onExitImpersonation={exitImpersonation}
      logout={logout}
    >
      {children}
    </MantisAdminShell>
  );
}

/**
 * Platform-only navigation, grouped to match the SaaS control-plane information
 * architecture. A super admin has no store of their own, so this must never include
 * tenant-side items (`NAV_ITEMS` below) — that was a real bug (every item after
 * "Platform settings" 403'd/404'd, since a platform admin has no `tenantId`).
 *
 * The one place tenant navigation legitimately belongs is impersonation — and it
 * already gets there for free: `enterImpersonation` swaps `user` to the impersonated
 * tenant user, which flips `user.userType` away from `'PLATFORM'`, so this branch's
 * `if` above stops matching and the tenant branch (with its own `NAV_ITEMS`) renders
 * instead. No separate "nav mode" flag was needed — identity IS the mode.
 *
 * Only groups/items with a real, working page are listed — an entry here that leads
 * nowhere is worse than no entry.
 */
const SUPER_ADMIN_NAV = [
  {
    label: 'Overview',
    items: [
      { href: '/analytics', label: 'Analytics' },
      { href: '/alerts', label: 'Alert center' },
      { href: '/platform-health', label: 'Platform health' },
    ],
  },
  {
    label: 'Customers',
    items: [{ href: '/tenants', label: 'Tenants' }],
  },
  {
    label: 'Revenue',
    items: [
      { href: '/plans', label: 'Plans' },
      { href: '/billing', label: 'Billing' },
      { href: '/dunning', label: 'Dunning & collections' },
      { href: '/settlements', label: 'Settlements' },
      { href: '/quota', label: 'Usage & quotas' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/support', label: 'Support tickets' },
      { href: '/queues', label: 'Jobs & queues' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/tenant-export', label: 'Tenant data export' },
    ],
  },
  {
    label: 'Experience',
    items: [
      { href: '/themes', label: 'Company themes' },
      { href: '/theme-templates', label: 'Theme templates' },
    ],
  },
  {
    label: 'Security',
    items: [
      { href: '/platform-staff', label: 'Platform staff' },
      { href: '/audit-log', label: 'Audit log' },
    ],
  },
  {
    label: 'Diagnostics',
    items: [{ href: '/logs', label: 'Log explorer' }],
  },
  {
    label: 'Platform',
    items: [{ href: '/platform-settings', label: 'Platform settings' }],
  },
] as const;

/**
 * Company Admin / Merchant navigation, structured to mirror modern e-commerce control panels
 * (Shopify/Mantis) with logical functional sections: Commerce, Fulfillment, Storefront, Growth, and Settings.
 */
export const COMPANY_ADMIN_NAV = [
  {
    label: 'Commerce',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/orders', label: 'Orders' },
      { href: '/products', label: 'Products' },
      { href: '/inventory', label: 'Inventory' },
      { href: '/customers', label: 'Customers' },
      { href: '/coupons', label: 'Coupons' },
    ],
  },
  {
    label: 'Fulfillment & Logistics',
    items: [
      { href: '/shipments', label: 'Shipments' },
      { href: '/returns', label: 'Returns (RMA)' },
      { href: '/warehouses', label: 'Warehouses' },
    ],
  },
  {
    label: 'Online Store',
    items: [
      { href: '/theme-editor', label: 'Theme Studio' },
      { href: '/cms', label: 'CMS Pages' },
      { href: '/banners', label: 'Banners' },
      { href: '/menus', label: 'Navigation Menus' },
    ],
  },
  {
    label: 'Growth & Channels',
    items: [
      { href: '/reviews', label: 'Product Reviews' },
      { href: '/channels', label: 'Sales Channels' },
      { href: '/marketplace', label: 'B2B Marketplace' },
    ],
  },
  {
    label: 'Settings & Team',
    items: [
      { href: '/settings', label: 'Store Settings' },
      { href: '/domains', label: 'Custom Domains' },
      { href: '/taxes', label: 'Tax & GST' },
      { href: '/team', label: 'Team & Staff' },
      { href: '/subscription', label: 'Plan & Billing' },
      { href: '/support-tickets', label: 'Help & Support' },
      { href: '/sessions', label: 'Active Sessions' },
      { href: '/system', label: 'System' },
    ],
  },
] as const;
