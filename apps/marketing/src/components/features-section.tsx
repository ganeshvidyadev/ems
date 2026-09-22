import { Boxes, Gauge, Globe, ShieldCheck, ShoppingCart, Users } from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'True multi-tenant isolation',
    description:
      'Every merchant’s data, users, and stores are scoped and isolated at the platform level, enforced consistently across every service.',
    chip: 'bg-indigo-100 text-indigo-600',
  },
  {
    icon: ShoppingCart,
    title: 'Storefront & website builder',
    description:
      'Merchants get a fully provisioned, brandable online store out of the box — no separate hosting or setup required.',
    chip: 'bg-fuchsia-100 text-fuchsia-600',
  },
  {
    icon: Gauge,
    title: 'Plans, billing & quotas',
    description:
      'Flexible pricing tiers with usage limits on products, orders, staff, and storage — upgrade or downgrade without downtime.',
    chip: 'bg-amber-100 text-amber-600',
  },
  {
    icon: Globe,
    title: 'Multi-channel selling',
    description:
      'Connect sales channels and manage orders, inventory, and fulfillment from a single place.',
    chip: 'bg-sky-100 text-sky-600',
  },
  {
    icon: ShieldCheck,
    title: 'Admin control plane',
    description:
      'A dedicated super-admin console for platform health monitoring, tenant support, audited impersonation, and security policy.',
    chip: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: Boxes,
    title: 'Supplier & reseller marketplace',
    description:
      'An internal marketplace connecting suppliers and resellers directly into the merchant catalog.',
    chip: 'bg-rose-100 text-rose-600',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-16 bg-surface">
      <div className="mx-auto max-w-content px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">Everything a modern storefront needs</h2>
          <p className="mt-4 text-ink-muted">
            Built as a single platform so merchants don&rsquo;t have to stitch together separate tools.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.chip}`}>
                <feature.icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
