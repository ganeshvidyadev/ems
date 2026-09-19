'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Search, Package, Truck, CheckCircle2, Clock, AlertCircle, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';

interface SimulatedTracking {
  orderNumber: string;
  status: 'PROCESSING' | 'DISPATCHED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  carrier: string;
  awb: string;
  destination: string;
  placedAt: string;
  estimatedDelivery: string;
  timeline: { title: string; time: string; done: boolean; current?: boolean }[];
}

export default function GuestOrderTrackingPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trackingData, setTrackingData] = useState<SimulatedTracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTrack = (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setError('Please enter your Order Number.');
      return;
    }
    if (!phoneOrEmail.trim()) {
      setError('Please enter your Email or 10-digit Phone number.');
      return;
    }

    setError(null);
    setIsSearching(true);

    setTimeout(() => {
      setIsSearching(false);
      const cleanNum = orderNumber.trim().toUpperCase();
      const now = new Date();
      const estDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      setTrackingData({
        orderNumber: cleanNum.startsWith('#') ? cleanNum : '#' + cleanNum,
        status: 'IN_TRANSIT',
        carrier: 'Blue Dart Express (Air)',
        awb: 'BD' + Math.floor(100000000 + Math.random() * 900000000) + 'IN',
        destination: 'Mumbai, Maharashtra - 400001',
        placedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        estimatedDelivery: estDate.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        }),
        timeline: [
          { title: 'Order Confirmed & Payment Verified', time: 'Yesterday, 10:30 AM', done: true },
          { title: 'Picked & Packed at Central Hub', time: 'Yesterday, 04:15 PM', done: true },
          { title: 'In Transit — Departed Sorting Facility', time: 'Today, 06:45 AM', done: true, current: true },
          { title: 'Out for Delivery', time: 'Expected Tomorrow Morning', done: false },
          { title: 'Delivered to Doorstep', time: 'Expected by 6 PM Tomorrow', done: false },
        ],
      });
    }, 600);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand mb-1">
          <Truck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Track Your Order</h1>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          Enter your Order Number and registered Email or Phone to track live shipment status in real time.
        </p>
      </div>

      <form onSubmit={handleTrack} className="rounded-theme border border-line bg-surface p-6 shadow-sm space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="orderNumber" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
              Order Number
            </label>
            <input
              id="orderNumber"
              type="text"
              placeholder="e.g. ORD-98241"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="phoneOrEmail" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
              Email or Phone
            </label>
            <input
              id="phoneOrEmail"
              type="text"
              placeholder="e.g. alex@example.com"
              value={phoneOrEmail}
              onChange={(e) => setPhoneOrEmail(e.target.value)}
              className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-theme bg-danger/10 border border-danger/20 p-3 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSearching}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-theme bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 transition-colors disabled:opacity-50"
        >
          {isSearching ? 'Searching tracking record...' : 'Track Package'}
          {!isSearching && <Search className="h-4 w-4" />}
        </button>
      </form>

      {trackingData && (
        <div className="rounded-theme border border-line bg-surface p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <span className="text-xs text-ink-muted">Order</span>
              <h2 className="text-lg font-bold text-ink">{trackingData.orderNumber}</h2>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <Truck className="h-3.5 w-3.5" /> In Transit
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 rounded-theme bg-surface-alt/60 p-4 text-xs border border-line">
            <div>
              <p className="text-ink-muted">Courier Partner</p>
              <p className="font-semibold text-ink mt-0.5">{trackingData.carrier}</p>
            </div>
            <div>
              <p className="text-ink-muted">AWB Tracking #</p>
              <p className="font-mono font-semibold text-brand mt-0.5">{trackingData.awb}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-ink-muted">Estimated Delivery</p>
              <p className="font-semibold text-success mt-0.5">{trackingData.estimatedDelivery}</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Shipment Progress</h3>
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
              {trackingData.timeline.map((step, idx) => (
                <div key={idx} className="relative flex items-start gap-3">
                  <div
                    className={'absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-surface ' + (step.done ? 'border-brand text-brand' : 'border-line text-ink-muted')}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 fill-brand text-brand-foreground" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-line" />
                    )}
                  </div>
                  <div>
                    <p className={'text-xs font-semibold ' + (step.done ? 'text-ink' : 'text-ink-muted')}>
                      {step.title}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{step.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs">
            <span className="text-ink-muted">Need help with this shipment?</span>
            <Link href="/contact" className="font-semibold text-brand hover:underline inline-flex items-center gap-1">
              Contact Support <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}