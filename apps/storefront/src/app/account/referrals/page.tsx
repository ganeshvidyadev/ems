'use client';

import { useState } from 'react';
import { Gift, Copy, Check, Share2, Users, DollarSign, Award, ChevronRight, MessageCircle, Twitter, Send } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';

interface ReferralActivity {
  id: string;
  refereeName: string;
  date: string;
  status: 'REWARDED' | 'ORDER_PLACED' | 'SIGNED_UP';
  rewardMinor: string;
}

const SAMPLE_ACTIVITIES: ReferralActivity[] = [
  { id: '1', refereeName: 'Priya Verma', date: '18 Sep 2026', status: 'REWARDED', rewardMinor: '25000' },
  { id: '2', refereeName: 'Amit Saxena', date: '15 Sep 2026', status: 'REWARDED', rewardMinor: '25000' },
  { id: '3', refereeName: 'Deepak Joshi', date: '12 Sep 2026', status: 'ORDER_PLACED', rewardMinor: '25000' },
  { id: '4', refereeName: 'Neha Kapoor', date: '08 Sep 2026', status: 'SIGNED_UP', rewardMinor: '0' },
];

export default function ReferralsPage() {
  const [copied, setCopied] = useState(false);
  const referralCode = 'REF-VIP789';
  const referralUrl = typeof window !== 'undefined' ? `${window.location.origin}?ref=${referralCode}` : `https://store.ems.com?ref=${referralCode}`;

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareWhatsApp() {
    const text = encodeURIComponent(`Hey! Shop authentic quality items using my invite code ${referralCode} and get ₹250 off your first purchase! ${referralUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  function handleShareTwitter() {
    const text = encodeURIComponent(`Get ₹250 off your order with code ${referralCode} at EMS Store! 🛍️`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(referralUrl)}`, '_blank');
  }

  return (
    <div className="space-y-6 md:col-span-3">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-brand to-brand/80 p-6 text-brand-foreground shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
              <Gift className="h-3.5 w-3.5" /> Refer & Earn Rewards
            </span>
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              Give ₹250, Get ₹250
            </h2>
            <p className="text-sm opacity-90 max-w-md">
              Share your unique referral link with friends. When they place their first order, they get ₹250 off and you earn ₹250 store credits!
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-4 backdrop-blur border border-white/20 text-center shrink-0">
            <p className="text-xs uppercase tracking-wider opacity-80">Available Credits</p>
            <p className="font-heading text-3xl font-bold mt-1">₹500.00</p>
            <span className="text-[10px] opacity-75">Auto-applied at checkout</span>
          </div>
        </div>
      </div>

      {/* Share Box Card */}
      <Card className="p-6 space-y-4">
        <h3 className="font-heading text-base font-bold text-ink">Your Referral Link</h3>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="w-full rounded-lg border border-line bg-surface-alt/40 px-3.5 py-2.5 font-mono text-xs text-ink focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button onClick={handleCopy} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2">
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? 'Copied Link!' : 'Copy Link'}</span>
            </Button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex h-10 w-10 items-center justify-center rounded-theme bg-emerald-600 text-white hover:bg-emerald-700 transition"
              title="Share on WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleShareTwitter}
              className="flex h-10 w-10 items-center justify-center rounded-theme bg-sky-500 text-white hover:bg-sky-600 transition"
              title="Share on X / Twitter"
            >
              <Twitter className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Friends Invited</p>
            <p className="font-heading text-xl font-bold text-ink">4</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Successful Purchases</p>
            <p className="font-heading text-xl font-bold text-ink">2</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Total Earned</p>
            <p className="font-heading text-xl font-bold text-ink">₹500.00</p>
          </div>
        </Card>
      </div>

      {/* Activity History Table */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3.5 bg-surface-alt/40">
          <h3 className="font-heading text-sm font-semibold text-ink">Referral Activity</h3>
        </div>

        <div className="divide-y divide-line">
          {SAMPLE_ACTIVITIES.map((act) => (
            <div key={act.id} className="flex items-center justify-between p-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt font-bold text-ink">
                  {act.refereeName[0]}
                </div>
                <div>
                  <p className="font-medium text-ink">{act.refereeName}</p>
                  <p className="text-[10px] text-ink-muted">{act.date}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {act.status === 'REWARDED' && (
                  <Badge tone="brand" className="text-[10px]">
                    +₹250 Credited
                  </Badge>
                )}
                {act.status === 'ORDER_PLACED' && (
                  <Badge tone="neutral" className="text-[10px]">
                    Order Processing
                  </Badge>
                )}
                {act.status === 'SIGNED_UP' && (
                  <Badge tone="neutral" className="text-[10px]">
                    Signed Up
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
