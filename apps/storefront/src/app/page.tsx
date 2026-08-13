import { getTenantContext } from '@/lib/tenant';

/**
 * Phase 1 storefront home.
 *
 * Renders the resolved tenant context so that host-based resolution is verifiable
 * before any catalogue exists: visiting `northwind.ems.localhost:3001` and
 * `lakeside.ems.localhost:3001` must show different tenants from the same
 * deployment. That is the property the whole storefront depends on, and it is worth
 * being able to see directly.
 *
 * The homepage composition (banners, featured products, theme) arrives in Phase 7.
 */
export default async function HomePage() {
  const tenant = await getTenantContext();

  return (
    <main className="flex min-h-screen flex-col justify-center gap-8 py-16">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-widest text-ink-muted">EMS Storefront</p>
        <h1 className="text-3xl font-semibold">
          {tenant.slug ? titleCase(tenant.slug) : 'Unresolved store'}
        </h1>
      </header>

      <dl className="divide-y rounded-theme border border-line bg-surface-alt">
        <Row label="Hostname" value={tenant.hostname || '(none)'} />
        <Row label="Tenant slug" value={tenant.slug ?? '(custom domain — resolved by the API)'} />
        <Row label="Domain type" value={tenant.domainType} />
      </dl>

      {!tenant.slug && (
        <p className="text-sm text-ink-muted">
          No platform subdomain in this host. On a custom domain the API resolves the tenant from{' '}
          <code className="font-mono">tenant_domains</code>. Locally, try{' '}
          <code className="font-mono">northwind.ems.localhost:3001</code>.
        </p>
      )}

      <p className="text-xs text-ink-muted">
        Catalogue, cart and checkout arrive in Phases 4–5; theming in Phase 7.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  );
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
