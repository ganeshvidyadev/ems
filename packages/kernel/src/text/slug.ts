/**
 * URL/DNS-safe slug generation.
 *
 * Two distinct rulesets, because the constraints genuinely differ:
 *  - `slugify` produces a URL path segment (products, categories, blog posts).
 *  - `dnsLabel` produces a DNS label for a tenant subdomain, which is stricter:
 *    max 63 characters, must not start or end with a hyphen (RFC 1123).
 */

const DIACRITIC_PATTERN = /[̀-ͯ]/g;

export function slugify(input: string, maxLength = 200): string {
  const slug = input
    .normalize('NFKD')
    .replace(DIACRITIC_PATTERN, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, maxLength).replace(/-+$/, '');
}

/** RFC 1123 DNS label — the tenant subdomain constraint. */
export function dnsLabel(input: string): string {
  const label = slugify(input, 63).replace(/^[^a-z0-9]+/, '');
  return label.replace(/-+$/, '');
}

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'console',
  'dashboard',
  'mail',
  'smtp',
  'imap',
  'ftp',
  'cdn',
  'static',
  'assets',
  'media',
  'img',
  'images',
  'files',
  'download',
  'status',
  'health',
  'metrics',
  'docs',
  'help',
  'support',
  'blog',
  'shop',
  'store',
  'checkout',
  'pay',
  'payments',
  'billing',
  'account',
  'accounts',
  'auth',
  'login',
  'signup',
  'register',
  'test',
  'staging',
  'dev',
  'demo',
  'sandbox',
  'internal',
  'private',
  'secure',
  'ssl',
  'vpn',
  'ns1',
  'ns2',
  'mx',
  'webmail',
  'root',
  'me',
]);

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}

export function isValidDnsLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

/**
 * Appends a numeric suffix until the slug is unique.
 *
 * `exists` is injected rather than assumed, so the same logic serves product
 * slugs (unique per tenant) and tenant subdomains (globally unique) without the
 * uniqueness scope leaking into this function.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  const root = slugify(base) || 'item';
  if (!(await exists(root))) return root;

  for (let n = 2; n <= maxAttempts; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Deterministic attempts exhausted; fall back to a random suffix rather than
  // failing the merchant's save.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}
