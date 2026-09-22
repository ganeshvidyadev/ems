const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class MarketingApiError extends Error {
  constructor(
    public readonly status: number,
    path: string,
  ) {
    super(`Marketing API ${status} for ${path}`);
    this.name = 'MarketingApiError';
  }
}

/**
 * Server-side fetch against the platform API's public endpoints, modeled on
 * `storefrontFetch` in `apps/storefront/src/lib/tenant.ts` but simpler — the
 * marketing site is a single global pitch site, not tenant-scoped, so there is no
 * host to forward. Runs entirely in Server Components, so there is no CORS/browser
 * exposure question: this is a server-to-server call.
 */
export async function marketingFetch<T>(path: string, options: { revalidate?: number | false } = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
    next: { revalidate: options.revalidate ?? 60 },
  });

  if (!response.ok) {
    throw new MarketingApiError(response.status, path);
  }

  const body = (await response.json()) as { success: boolean; data: T };
  if (!body.success) throw new Error(`Marketing API returned an error for ${path}`);

  return body.data;
}

/** Shape of `GET /v1/plans` — the platform's public, pre-signup pricing list. */
export interface PublicPlan {
  code: string;
  name: string;
  description: string | null;
  priceMonthlyMinor: string;
  priceYearlyMinor: string;
  currency: string;
  trialDays: number;
  features: string[];
}
