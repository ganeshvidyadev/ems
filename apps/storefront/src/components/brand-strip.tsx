'use client';

import { ShieldCheck, Leaf, HeartHandshake, Award, Truck, Lock, CheckCircle2 } from 'lucide-react';

const TRUST_BADGES = [
  { id: '1', icon: Leaf, title: '100% Certified Organic', desc: 'Sustainably & Ethically Sourced' },
  { id: '2', icon: Award, title: 'ISO 9001 Quality', desc: 'GMP Certified Manufacturing' },
  { id: '3', icon: HeartHandshake, title: 'Cruelty-Free & Vegan', desc: 'Never Tested on Animals' },
  { id: '4', icon: Lock, title: 'Bank-Grade SSL', desc: 'PCI-DSS Compliant Payments' },
  { id: '5', icon: Truck, title: 'Carbon Neutral Delivery', desc: 'Eco-Friendly Safe Packaging' },
];

export function BrandStrip() {
  return (
    <section aria-label="Quality and Trust Certifications" className="rounded-2xl border border-line bg-surface-alt/40 p-6 sm:p-8">
      <div className="text-center max-w-xl mx-auto mb-6">
        <span className="text-[11px] font-bold uppercase tracking-widest text-brand">The Standard of Purity</span>
        <h2 className="font-heading text-lg sm:text-xl font-bold text-ink mt-0.5">
          Crafted with Uncompromised Integrity
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5 sm:gap-6">
        {TRUST_BADGES.map((badge) => {
          const Icon = badge.icon;
          return (
            <div
              key={badge.id}
              className="flex flex-col items-center text-center rounded-xl bg-surface p-4 border border-line/60 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand mb-2.5">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-bold text-xs text-ink">{badge.title}</p>
              <p className="text-[10px] text-ink-muted mt-0.5 leading-snug">{badge.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
