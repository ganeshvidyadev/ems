import { NextResponse, type NextRequest } from 'next/server';

/**
 * Tenant resolution from the `Host` header (docs/01 §12).
 *
 * One deployment serves every tenant's storefront. The hostname is the only tenant
 * signal a shopper's request carries — they are anonymous, so there is no token to
 * read a claim from.
 *
 * This middleware does **not** decide whether the tenant exists. It normalises the
 * host, forwards it, and lets the API resolve it against `tenant_domains` (behind a
 * Redis cache). Duplicating that lookup here would mean a second cache to keep
 * consistent, and Edge middleware cannot reach MySQL anyway.
 *
 * The rewrite carries the host in an explicit header rather than relying on `Host`
 * surviving the internal rewrite, because proxies and platform routing layers
 * rewrite `Host` freely.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? 'ems.localhost';

export const config = {
  // Static assets and the health probe skip tenant resolution: they are the same
  // for every tenant, and running middleware on them costs latency on every image.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|health).*)'],
};

export function middleware(request: NextRequest): NextResponse {
  const rawHost = request.headers.get('host') ?? '';
  // Strip the port: `Host` includes `:3001` in development and would never match a
  // stored hostname.
  const hostname = rawHost.split(':')[0]!.toLowerCase();

  const headers = new Headers(request.headers);
  headers.set('x-ems-hostname', hostname);

  const subdomain = extractSubdomain(hostname);
  if (subdomain) headers.set('x-ems-tenant-slug', subdomain);

  // Distinguishes a free subdomain from a merchant's custom domain, which the API
  // needs in order to pick the right verification and SSL state.
  headers.set('x-ems-domain-type', subdomain ? 'SUBDOMAIN' : 'CUSTOM');

  return NextResponse.next({ request: { headers } });
}

/**
 * Returns the tenant label for `<slug>.ems.app`, or null for a custom domain.
 *
 * `www` is treated as no subdomain — `www.ems.app` is the platform's own site, not
 * a tenant called "www". Reserved labels are rejected at signup (see
 * `isReservedSubdomain` in @ems/kernel), so this only has to handle the shape.
 */
function extractSubdomain(hostname: string): string | null {
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;

  const label = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!label || label === 'www' || label.includes('.')) return null;

  return label;
}
