'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Sparkles,
  Gift,
  ArrowRight,
  Check,
  Copy,
  ChevronRight,
  Coins,
  ShieldCheck,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { useCustomer } from '@/lib/customer-context';
import { Button, Card, Badge } from '@/components/ui';

interface PointVoucher {
  id: string;
  points: number;
  discountAmount: number;
  code: string;
  minSpend: number;
}

const REDEEMABLE_VOUCHERS: PointVoucher[] = [
  { id: '1', points: 250, discountAmount: 250, code: 'LOYALTY250', minSpend: 999 },
  { id: '2', points: 500, discountAmount: 500, code: 'LOYALTY500', minSpend: 1499 },
  { id: '3', points: 1000, discountAmount: 1000, code: 'LOYALTY1000', minSpend: 2499 },
];

const RECENT_TRANSACTIONS = [
  { id: 'tx-1', type: 'EARNED', points: '+180 pts', reason: 'Order #ORD-1084 completed', date: 'Yesterday' },
  { id: 'tx-2', type: 'EARNED', points: '+50 pts', reason: 'Product review submitted & verified', date: '3 days ago' },
  { id: 'tx-3', type: 'REDEEMED', points: '-250 pts', reason: 'Voucher LOYALTY250 redeemed', date: '1 week ago' },
  { id: 'tx-4', type: 'EARNED', points: '+250 pts', reason: 'Friend referral bonus (Priya S.)', date: '2 weeks ago' },
  { id: 'tx-5', type: 'EARNED', points: '+100 pts', reason: 'Welcome loyalty sign-up bonus', date: '1 month ago' },
];

export default function CustomerLoyaltyPage() {
  const { customer } = useCustomer();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = useState(1250);
  const [activeVouchers, setActiveVouchers] = useState<string[]>([]);

  const currentTier = 'Silver Member';
  const tierProgress = 65; // 65% towards Gold (1,500 pts)
  const ptsToNextTier = 250;

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  function handleRedeem(voucher: PointVoucher) {
    if (pointsBalance < voucher.points) return;
    setPointsBalance((prev) => prev - voucher.points);
    setActiveVouchers((prev) => [...prev, voucher.code]);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-line pb-4">
        <div className="flex items-center gap-2 text-brand mb-1">
          <Award className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Rewards Club</span>
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">
          Loyalty Points & VIP Rewards
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Earn points on every purchase and redeem them for instant discounts at checkout.
        </p>
      </div>

      {/* Main Points Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-surface to-brand/5 p-6 sm:p-8 relative overflow-hidden shadow-sm">
          <div className="relative z-10 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Available Loyalty Balance
              </span>
              <Badge tone="brand" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" /> {currentTier}
              </Badge>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="font-heading text-4xl sm:text-5xl font-black text-ink">
                {pointsBalance.toLocaleString('en-IN')}
              </span>
              <span className="text-sm font-semibold text-brand">Points (Worth ₹{pointsBalance})</span>
            </div>

            {/* Tier Progress Bar */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink font-medium">Progress to <strong>Gold VIP</strong></span>
                <span className="text-ink-muted font-mono">{ptsToNextTier} pts remaining</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-line/80">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-700"
                  style={{ width: `${tierProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-ink-muted">
                <span>Silver (500 pts)</span>
                <span>Gold VIP (1,500 pts)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Perks Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand" /> VIP Tier Perks
            </h3>
            <ul className="space-y-2 text-xs text-ink-muted">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
                <span>1 Point per ₹1 spent</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
                <span>Priority Customer Support</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
                <span>Early Access to Flash Sales</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
                <span>Free Birthday Reward Voucher</span>
              </li>
            </ul>
          </div>

          <Link
            href="/products"
            className="inline-flex h-9 items-center justify-center rounded-theme bg-brand px-4 text-xs font-semibold text-brand-foreground hover:bg-brand/90 transition"
          >
            Earn More Points →
          </Link>
        </div>
      </div>

      {/* Redeem Points for Vouchers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink flex items-center gap-2">
              <Coins className="h-5 w-5 text-brand" /> Redeem Points for Coupons
            </h2>
            <p className="text-xs text-ink-muted">Convert your points balance into 1-click checkout vouchers</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REDEEMABLE_VOUCHERS.map((v) => {
            const isRedeemed = activeVouchers.includes(v.code);
            const canRedeem = pointsBalance >= v.points;

            return (
              <div
                key={v.id}
                className={`rounded-xl border p-5 space-y-4 flex flex-col justify-between transition-all ${
                  isRedeemed
                    ? 'border-success/30 bg-success/5'
                    : 'border-line bg-surface hover:shadow-sm'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand">{v.points} Points</span>
                    <Badge tone={isRedeemed ? 'brand' : 'neutral'} className="text-[10px]">
                      {isRedeemed ? 'Ready to Use' : `Min ₹${v.minSpend}`}
                    </Badge>
                  </div>

                  <h3 className="font-heading text-xl font-bold text-ink">
                    ₹{v.discountAmount} Off
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Valid on orders above ₹{v.minSpend.toLocaleString('en-IN')}.
                  </p>
                </div>

                {isRedeemed ? (
                  <div className="flex items-center gap-2 pt-2 border-t border-line/60">
                    <div className="flex-1 rounded-theme bg-surface border border-line px-3 py-1.5 font-mono text-xs font-bold text-ink text-center">
                      {v.code}
                    </div>
                    <button
                      onClick={() => copyCode(v.code)}
                      className="inline-flex h-8 items-center gap-1 rounded-theme border border-brand bg-brand/10 px-2.5 text-xs font-semibold text-brand hover:bg-brand/20 transition"
                    >
                      {copiedCode === v.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedCode === v.code ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canRedeem}
                    onClick={() => handleRedeem(v)}
                    className="w-full text-xs font-semibold"
                  >
                    {canRedeem ? `Redeem for ${v.points} Pts` : 'Insufficient Points'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Points History & Transactions */}
      <div className="space-y-4">
        <h2 className="font-heading text-lg font-bold text-ink flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand" /> Points Activity History
        </h2>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="divide-y divide-line">
            {RECENT_TRANSACTIONS.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 text-xs">
                <div className="space-y-0.5">
                  <p className="font-semibold text-ink">{tx.reason}</p>
                  <p className="text-[11px] text-ink-muted">{tx.date}</p>
                </div>
                <span
                  className={`font-mono font-bold ${
                    tx.type === 'EARNED' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {tx.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
