import type { WebsitePlansDisplayContent } from '@ems/contracts';
import type { PublicPlan } from '@/lib/api-client';

function formatPrice(priceMinor: string, currency: string): string {
  const amount = Number(priceMinor) / 100;
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/** Ported from Automark's `PricingCard.astro` / `PricingSection.astro` — dark card,
 * large price, tick-list of features, CTA. The monthly/yearly toggle is dropped (it
 * needs client-side JS to sync section-level state into each card); we show the
 * monthly price only, same as before this restyle. */
export function PlansSection({ plans, display }: { plans: PublicPlan[]; display: WebsitePlansDisplayContent }) {
  const displayByCode = new Map(display.items.map((item) => [item.planCode, item]));

  return (
    <section id="plans" className="section-box relative my-0 scroll-mt-16 bg-transparent">
      <div className="container">
        <div className="section-container">
          <div className="section-intro centralize">
            <h2 className="hasHighlight title">{display.heading}</h2>
            <p className="subtitle">{display.subheading}</p>
          </div>
          <div className="section-content">
            <div className="relative z-10 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const featured = displayByCode.get(plan.code)?.highlighted ?? false;
                return (
                  <div
                    key={plan.code}
                    className={`relative rounded-3xl px-7 py-10 text-left ${featured ? 'overflow-hidden bg-light/50' : 'bg-light/80'}`}
                  >
                    {featured && (
                      <>
                        <div className="pointer-events-none absolute bottom-0 right-0 -z-10 grid size-160 translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-radial from-primary from-0% to-70% to-transparent" />
                        <div className="absolute right-5 top-10 rounded-lg bg-primary/50 px-3 py-1.5 text-xs font-semibold text-white">
                          Most Popular
                        </div>
                      </>
                    )}

                    <div className="mb-10 leading-none">
                      <span className="text-h3 font-semibold text-white">{formatPrice(plan.priceMonthlyMinor, plan.currency)}</span>
                      {Number(plan.priceMonthlyMinor) > 0 && <span className="ml-1 text-sm text-text">/ Per Month</span>}
                    </div>

                    <h3 className="mb-5 text-h6 text-white">{plan.name}</h3>
                    {plan.description && <p className="text-text-dark">{plan.description}</p>}

                    <a href={display.ctaHref} className="btn btn-primary my-6 block text-center">
                      {display.ctaLabel}
                    </a>

                    <div className="mb-6 font-bold text-white">Features Included</div>
                    <ul className="space-y-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-x-4">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
                            <rect width="24" height="24" rx="6" fill="var(--color-primary)" />
                            <path
                              d="M11.1799 15.6864L17.6989 8.82757C18.1004 8.40902 18.1004 7.73247 17.6989 7.31392C17.2974 6.89536 16.6484 6.89536 16.2468 7.31392L10.4539 13.4159L7.75315 10.5847C7.35164 10.1661 6.70265 10.1661 6.30113 10.5847C5.89962 11.0032 5.89962 11.6798 6.30113 12.0983L9.72792 15.6864C9.92816 15.8951 10.191 16 10.4539 16C10.7168 16 10.9797 15.8951 11.1799 15.6864Z"
                              fill="white"
                            />
                          </svg>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
