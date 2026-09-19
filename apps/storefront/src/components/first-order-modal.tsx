'use client';

import { useState, useEffect } from 'react';
import { Sparkles, X, Copy, Check, Gift, ShoppingBag, ArrowRight } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';

export function FirstOrderModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    // Only show once per shopper session after 6 seconds
    const hasSeen = sessionStorage.getItem('ems_seen_welcome_modal');
    if (hasSeen) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      sessionStorage.setItem('ems_seen_welcome_modal', 'true');
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  if (!isOpen) return null;

  function handleCopy() {
    navigator.clipboard.writeText('WELCOME10');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    handleCopy();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-ink-muted hover:bg-surface-alt hover:text-ink transition"
          aria-label="Close welcome modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Gift className="h-6 w-6" />
          </div>

          <div>
            <Badge tone="sale" className="text-xs mb-1 font-semibold">
              First Time Shopper?
            </Badge>
            <h3 className="font-heading text-2xl font-bold text-ink">
              Get 10% Off Your First Order!
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Unlock instant savings on your entire cart with our welcome voucher.
            </p>
          </div>

          {!subscribed ? (
            <form onSubmit={handleSubscribe} className="space-y-3 pt-2">
              <input
                type="email"
                required
                placeholder="Enter your email address…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3.5 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
              <Button type="submit" className="w-full inline-flex items-center justify-center gap-2">
                <span>Unlock Voucher</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-3 pt-3">
              <p className="text-xs font-semibold text-brand">🎉 Voucher Unlocked & Copied!</p>
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 font-mono text-sm font-bold text-ink">
                <span>WELCOME10</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded bg-brand px-2.5 py-1 text-xs font-sans font-semibold text-brand-foreground hover:opacity-90"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[10px] text-ink-muted">Use code WELCOME10 at checkout to save 10%.</p>
              <Button type="button" onClick={() => setIsOpen(false)} className="w-full">
                Continue Shopping
              </Button>
            </div>
          )}

          <p className="text-[10px] text-ink-muted/70">
            No spam guaranteed. You can unsubscribe at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
