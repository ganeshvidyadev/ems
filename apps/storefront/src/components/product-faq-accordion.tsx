'use client';

import React, { useState } from 'react';
import { ChevronDown, Truck, ShieldCheck, RotateCcw, Sparkles } from 'lucide-react';

interface FaqItem {
  id: string;
  icon: React.ElementType;
  title: string;
  content: string;
}

const FAQS: FaqItem[] = [
  {
    id: 'shipping',
    icon: Truck,
    title: 'Shipping & Fast Delivery',
    content:
      'We deliver to over 19,000+ PIN codes across India. Standard orders are dispatched within 24 hours and delivered in 2–4 business days with end-to-end SMS & WhatsApp tracking updates.',
  },
  {
    id: 'genuine',
    icon: ShieldCheck,
    title: '100% Genuine & Quality Guaranteed',
    content:
      'All products are sourced directly from verified manufacturers and undergo strict quality checks. Comes with full brand authenticity certificate and manufacturer warranty.',
  },
  {
    id: 'returns',
    icon: RotateCcw,
    title: '7-Day Easy Returns & Exchange',
    content:
      'Not completely satisfied? We offer a hassle-free 7-day return and exchange policy from the date of delivery. Doorstep pickup is completely free.',
  },
  {
    id: 'care',
    icon: Sparkles,
    title: 'Care & Handling Instructions',
    content:
      'Store in a cool, dry place away from direct sunlight. Follow specific packaging guidelines for maximum longevity and optimal performance.',
  },
];

export function ProductFaqAccordion() {
  const [openIds, setOpenIds] = useState<string[]>(['shipping']);

  const toggle = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-2 border-t border-line pt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink mb-3">
        Frequently Asked Questions & Policies
      </h3>
      <div className="space-y-2">
        {FAQS.map((faq) => {
          const isOpen = openIds.includes(faq.id);
          const Icon = faq.icon;

          return (
            <div
              key={faq.id}
              className="rounded-theme border border-line bg-surface transition-colors"
            >
              <button
                type="button"
                onClick={() => toggle(faq.id)}
                className="flex w-full items-center justify-between p-3.5 text-left text-xs font-semibold text-ink hover:bg-surface-alt/50 transition-colors"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-brand" />
                  <span>{faq.title}</span>
                </div>
                <ChevronDown
                  className={'h-4 w-4 text-ink-muted transition-transform duration-200 ' + (isOpen ? 'rotate-180 text-brand' : '')}
                />
              </button>

              {isOpen && (
                <div className="border-t border-line px-3.5 py-3 text-xs leading-relaxed text-ink-muted bg-surface-alt/20">
                  {faq.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
