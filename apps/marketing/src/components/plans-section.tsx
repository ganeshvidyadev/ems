import { Check } from 'lucide-react';

/**
 * Illustrative tiers, not a live fetch from the platform's `plans` table — this
 * app is public and unauthenticated, and exposing the real plans API here would be
 * a separate decision (CORS, rate limiting, which fields are safe to publish).
 */
const TIERS = [
  {
    name: 'Starter',
    price: '₹1,499',
    period: '/month',
    description: 'For merchants launching their first store.',
    features: ['1 store', 'Up to 500 products', '2 staff accounts', 'Community support'],
    accent: 'from-sky-500 to-sky-400',
    check: 'text-sky-600',
  },
  {
    name: 'Growth',
    price: '₹4,999',
    period: '/month',
    description: 'For merchants scaling across channels.',
    features: [
      'Up to 3 stores',
      'Up to 10,000 products',
      '10 staff accounts',
      'Multi-channel selling',
      'Priority support',
    ],
    highlighted: true,
    accent: 'from-indigo-600 to-fuchsia-600',
    check: 'text-fuchsia-600',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For high-volume merchants with custom needs.',
    features: [
      'Unlimited stores',
      'Unlimited products',
      'Unlimited staff accounts',
      'Dedicated account manager',
      'Custom integrations',
    ],
    accent: 'from-amber-500 to-orange-500',
    check: 'text-amber-600',
  },
];

export function PlansSection() {
  return (
    <section id="plans" className="scroll-mt-16 border-t border-line bg-gradient-to-b from-surface-alt to-white">
      <div className="mx-auto max-w-content px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">Plans that grow with you</h2>
          <p className="mt-4 text-ink-muted">
            Illustrative pricing — contact us for a plan tailored to your business.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`overflow-hidden rounded-lg border bg-surface ${
                tier.highlighted ? 'border-fuchsia-300 shadow-xl shadow-fuchsia-500/10' : 'border-line shadow-sm'
              }`}
            >
              <div className={`h-1.5 bg-gradient-to-r ${tier.accent}`} />
              <div className="p-8">
                <h3 className="text-lg font-semibold text-ink">{tier.name}</h3>
                <p className="mt-2 text-sm text-ink-muted">{tier.description}</p>
                <p className="mt-6">
                  <span className="text-3xl font-bold text-ink">{tier.price}</span>
                  <span className="text-sm text-ink-muted">{tier.period}</span>
                </p>
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tier.check}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:hello@ems.app"
                  className={`mt-8 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                    tier.highlighted
                      ? `bg-gradient-to-r text-white ${tier.accent} hover:opacity-90`
                      : 'border border-line text-ink hover:border-brand hover:text-brand'
                  }`}
                >
                  Get in touch
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
