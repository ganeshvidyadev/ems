'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Heart,
  MapPin,
  ShoppingBag,
  RotateCcw,
  User,
  ChevronRight,
  Loader2,
  Star,
  Gift,
} from 'lucide-react';
import { api, type Page } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import { useCustomer } from '@/lib/customer-context';
import { useWishlist } from '@/lib/use-wishlist';
import type { OrderResponse } from '@ems/contracts';

export default function AccountDashboardPage() {

  const { customer } = useCustomer();
  const { wishlistItems } = useWishlist();

  const { data: ordersPage, isLoading } = useQuery<Page<OrderResponse>>({
    queryKey: ['account-orders-dashboard'],
    queryFn: () => api.requestPage<OrderResponse>('account/orders', { query: { page: 1, limit: 3 } }),
  });

  const recentOrders = ordersPage?.items ?? [];
  const totalOrders = ordersPage?.pagination.total ?? 0;

  const STATUS_COLORS: Record<string, string> = {
    DELIVERED: 'bg-emerald-50 text-emerald-700',
    CONFIRMED: 'bg-blue-50 text-blue-700',
    SHIPPED: 'bg-blue-50 text-blue-700',
    PROCESSING: 'bg-amber-50 text-amber-700',
    CANCELLED: 'bg-red-50 text-red-700',
    RETURNED: 'bg-orange-50 text-orange-700',
    PENDING: 'bg-slate-100 text-slate-600',
  };

  const quickLinks = [
    { href: '/account/orders', label: 'My Orders', icon: Package, badge: totalOrders > 0 ? String(totalOrders) : undefined },
    { href: '/account/wishlist', label: 'Wishlist', icon: Heart, badge: wishlistItems.length > 0 ? String(wishlistItems.length) : undefined },
    { href: '/account/addresses', label: 'Saved Addresses', icon: MapPin },
    { href: '/account/returns', label: 'Returns & RMA', icon: RotateCcw },
    { href: '/account/profile', label: 'Profile & Security', icon: User },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-brand/10 to-brand/5 border border-brand/20 p-5 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground text-xl font-bold shadow-md">
          {customer?.firstName ? customer.firstName[0]?.toUpperCase() : 'U'}
        </div>
        <div>
          <p className="text-lg font-bold text-ink">Hello, {customer?.firstName || 'Shopper'}! 👋</p>
          <p className="text-sm text-ink-muted">{customer?.email}</p>
        </div>
      </div>

      {/* Stats Tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-theme border border-line bg-surface p-4 text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-5 w-5 text-brand" />
          </div>
          <p className="text-2xl font-bold text-ink">{totalOrders}</p>
          <p className="text-xs text-ink-muted mt-0.5">Total Orders</p>
        </div>

        <div className="rounded-theme border border-line bg-surface p-4 text-center">
          <div className="flex justify-center mb-2">
            <Heart className="h-5 w-5 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-ink">{wishlistItems.length}</p>
          <p className="text-xs text-ink-muted mt-0.5">Saved Items</p>
        </div>

        <div className="rounded-theme border border-line bg-surface p-4 text-center col-span-2 sm:col-span-1">
          <div className="flex justify-center mb-2">
            <Star className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-ink">Valued</p>
          <p className="text-xs text-ink-muted mt-0.5">Member Status</p>
        </div>
      </div>

      {/* Quick Links Grid */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">Quick Access</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-theme border border-line bg-surface px-4 py-3 hover:border-brand hover:bg-surface-alt transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-ink-muted group-hover:text-brand" />
                  <span className="text-sm font-medium text-ink">{link.label}</span>
                  {link.badge && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
                      {link.badge}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-brand transition-colors" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Recent Orders</h2>
          <Link href="/account/orders" className="text-xs font-medium text-brand hover:underline">
            View All →
          </Link>
        </div>

        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="rounded-theme border border-dashed border-line p-8 text-center">
            <Gift className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-2 text-sm font-medium text-ink">No orders yet</p>
            <p className="mt-1 text-xs text-ink-muted">Your first purchase will appear here.</p>
            <Link
              href="/products"
              className="mt-3 inline-flex h-8 items-center justify-center rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line rounded-theme border border-line overflow-hidden">
            {recentOrders.map((order) => {
              const colorClass = STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-600';
              return (
                <Link
                  key={order.id}
                  href={'/account/orders/' + order.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-surface hover:bg-surface-alt transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-sm">#{order.orderNumber}</p>
                    <p className="text-xs text-ink-muted">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={'rounded-full px-2.5 py-0.5 text-xs font-semibold ' + colorClass}>
                      {order.status}
                    </span>
                    <span className="font-bold text-ink text-sm">
                      {formatMinor(order.total.amountMinor, order.total.currency)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-ink-muted" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
