import { Check } from 'lucide-react';
import type { WebsitePlansDisplayContent } from '@ems/contracts';
import type { PublicPlan } from '@/lib/api-client';
import { ACCENT_MAP } from '@/lib/content-map';

function formatPrice(priceMinor: string, currency: string): string {
  const amount = Number(priceMinor) / 100;
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PlansSection({ plans, display }: { plans: PublicPlan[]; display: WebsitePlansDisplayContent }) {
  const displayByCode = new Map(display.items.map((item) => [item.planCode, item]));
  const fallbackAccents: (keyof typeof ACCENT_MAP)[] = ['sky', 'fuchsia', 'amber', 'emerald', 'rose', 'indigo'];

  return (
    <section id="plans" className="scroll-mt-16 border-t border-line bg-gradient-to-b from-surface-alt to-white">
      <div className="mx-auto max-w-content px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">{display.heading}</h2>
          <p className="mt-4 text-ink-muted">{display.subheading}</p>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const override = displayByCode.get(plan.code);
            const accentKey = override?.accent ?? fallbackAccents[index % fallbackAccents.length] ?? 'indigo';
            const { gradient, check } = ACCENT_MAP[accentKey];
            const highlighted = override?.highlighted ?? false;

            return (
              <div
                key={plan.code}
                className={`overflow-hidden rounded-lg border bg-surface ${
                  highlighted ? 'border-fuchsia-300 shadow-xl shadow-fuchsia-500/10' : 'border-line shadow-sm'
                }`}
              >
                <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
                <div className="p-8">
                  <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
                  {plan.description && <p className="mt-2 text-sm text-ink-muted">{plan.description}</p>}
                  <p className="mt-6">
                    <span className="text-3xl font-bold text-ink">{formatPrice(plan.priceMonthlyMinor, plan.currency)}</span>
                    {Number(plan.priceMonthlyMinor) > 0 && <span className="text-sm text-ink-muted">/month</span>}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${check}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={display.ctaHref}
                    className={`mt-8 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                      highlighted
                        ? `bg-gradient-to-r text-white ${gradient} hover:opacity-90`
                        : 'border border-line text-ink hover:border-brand hover:text-brand'
                    }`}
                  >
                    {display.ctaLabel}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
