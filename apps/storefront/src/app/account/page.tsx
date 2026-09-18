'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package, MapPin, Heart, ArrowRight, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { useCustomer } from '@/lib/customer-context';
import { api, type Page } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import type { OrderResponse, AddressResponse } from '@ems/contracts';

export default function CustomerDashboardPage() {
  const { customer } = useCustomer();
  const { currency } = useStore();

  const { data: ordersPage, isLoading: ordersLoading } = useQuery<Page<OrderResponse>>({
    queryKey: ['account-recent-orders'],
    queryFn: () => api.requestPage<OrderResponse>('account/orders', { query: { limit: 3 } }),
  });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery<AddressResponse[]>({
    queryKey: ['account-addresses'],
    queryFn: () => api.request<AddressResponse[]>('account/addresses'),
  });

  const recentOrders = ordersPage?.items ?? [];
  const defaultShipping = addresses.find((a) => a.isDefaultShipping) ?? addresses[0];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-theme border border-line bg-gradient-to-r from-brand/10 to-transparent p-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Welcome back, {customer?.firstName || customer?.displayName}!
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Here is what is happening with your store account today.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-theme border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <Package className="h-4 w-4 text-brand" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Orders</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{customer?.totalOrders ?? 0}</p>
        </div>

        <div className="rounded-theme border border-line bg-surface p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <MapPin className="h-4 w-4 text-brand" />
            <span className="text-xs font-medium uppercase tracking-wider">Saved Addresses</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{addresses.length}</p>
        </div>

        <div className="col-span-2 rounded-theme border border-line bg-surface p-4 sm:col-span-1">
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="text-xs font-medium uppercase tracking-wider">Total Spent</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">
            {formatMinor(customer?.totalSpentMinor ?? '0', currency)}
          </p>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="text-lg font-semibold text-ink">Recent Orders</h2>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            View all orders <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {ordersLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-2 text-sm text-ink font-medium">No orders yet</p>
            <p className="text-xs text-ink-muted">When you place an order, it will appear here.</p>
            <Link
              href="/products"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-theme bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
            >
              Explore Products
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">#{order.orderNumber}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === 'DELIVERED'
                          ? 'bg-success/10 text-success'
                          : order.status === 'CANCELLED'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-brand/10 text-brand'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Placed on {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-semibold text-ink">
                    {formatMinor(order.total.amountMinor, order.total.currency)}
                  </span>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="rounded-theme border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Default Address Card */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="text-lg font-semibold text-ink">Default Delivery Address</h2>
          <Link
            href="/account/addresses"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            Manage addresses <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {addressesLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : defaultShipping ? (
          <div className="pt-4">
            <p className="font-medium text-ink">{defaultShipping.recipientName}</p>
            <p className="text-sm text-ink-muted">{defaultShipping.addressLine1}</p>
            {defaultShipping.addressLine2 && (
              <p className="text-sm text-ink-muted">{defaultShipping.addressLine2}</p>
            )}
            <p className="text-sm text-ink-muted">
              {defaultShipping.city}, {defaultShipping.stateName || defaultShipping.stateCode} {defaultShipping.postalCode}
            </p>
            {defaultShipping.phone && (
              <p className="mt-1 text-xs text-ink-muted">Phone: {defaultShipping.phone}</p>
            )}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-muted">No saved addresses yet.</p>
            <Link
              href="/account/addresses"
              className="mt-2 inline-flex items-center text-xs font-medium text-brand hover:underline"
            >
              Add an address
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
