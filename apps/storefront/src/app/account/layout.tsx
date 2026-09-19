'use client';

import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  MapPin,
  Heart,
  RotateCcw,
  User,
  CreditCard,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useCustomer } from '@/lib/customer-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/account', icon: LayoutDashboard },
  { label: 'My Orders', href: '/account/orders', icon: Package },
  { label: 'Addresses', href: '/account/addresses', icon: MapPin },
  { label: 'Payment Methods', href: '/account/payment-methods', icon: CreditCard },
  { label: 'Wishlist', href: '/account/wishlist', icon: Heart },
  { label: 'Returns', href: '/account/returns', icon: RotateCcw },
  { label: 'Profile & Security', href: '/account/profile', icon: User },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { customer, isLoading, isAuthenticated, logout } = useCustomer();
  const pathname = usePathname();
  const router = useRouter();

  // Public auth subpages shouldn't be wrapped with the account shell
  const isAuthPage =
    pathname.startsWith('/account/login') ||
    pathname.startsWith('/account/register') ||
    pathname.startsWith('/account/forgot-password') ||
    pathname.startsWith('/account/reset-password');

  if (isAuthPage) {
    return <div className="mx-auto max-w-md py-8">{children}</div>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== 'undefined') {
      router.replace(`/account/login?redirect=${encodeURIComponent(pathname)}`);
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-content">
      {/* Mobile Top Header */}
      <div className="mb-6 flex items-center justify-between border-b border-line pb-4 md:hidden">
        <div>
          <h1 className="text-xl font-bold text-ink">My Account</h1>
          <p className="text-sm text-ink-muted">Hello, {customer?.displayName}</p>
        </div>
        <button
          onClick={() => void logout()}
          className="inline-flex items-center gap-1.5 rounded-theme border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-danger hover:text-danger"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        {/* Sidebar Nav */}
        <aside className="md:col-span-1">
          <div className="rounded-theme border border-line bg-surface p-4">
            <div className="mb-4 hidden border-b border-line pb-4 md:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-foreground font-semibold">
                  {customer?.firstName ? customer.firstName[0]?.toUpperCase() : 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="truncate font-semibold text-ink">{customer?.displayName}</p>
                  <p className="truncate text-xs text-ink-muted">{customer?.email || customer?.phone}</p>
                </div>
              </div>
            </div>

            <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Account navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/account'
                    ? pathname === '/account'
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-theme px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand text-brand-foreground font-semibold'
                        : 'text-ink hover:bg-surface-alt'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-brand-foreground' : 'text-ink-muted'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <button
                onClick={() => void logout()}
                className="mt-2 hidden w-full items-center gap-3 rounded-theme px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger/10 md:flex"
              >
                <LogOut className="h-4 w-4 text-danger" />
                <span>Sign Out</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Content Body */}
        <main className="md:col-span-3">{children}</main>
      </div>
    </div>
  );
}
