import type { ProductResponse } from '@ems/contracts';
import { PackageOpen, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { CatalogueToolbar } from '@/components/catalogue-toolbar';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-card';
import { Alert, EmptyState } from '@/components/ui';
import { storefrontFetchPage, type StorefrontPage } from '@/lib/tenant';

const PAGE_SIZE = 12;

type SearchParams = { q?: string; sort?: string; page?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : 'All products' };
}

/**
 * Catalogue browsing and search.
 *
 * A server component reading its state out of the URL, so every result set is
 * server-rendered, shareable and indexable. `page`/`q`/`sort` are normalised here
 * rather than trusted: they arrive from a query string a shopper can edit, and the
 * API rejects an out-of-range `limit` or an unknown `sort` field with a 400 that
 * would blank the page.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const sort = normaliseSort(params.sort);
  const page = normalisePage(params.page);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (q) query.set('q', q);
  // Omitted entirely when empty: sending `sort=` is a validation error, not a
  // request for the default ordering.
  if (sort) query.set('sort', sort);

  let result: StorefrontPage<ProductResponse> | null = null;
  try {
    result = await storefrontFetchPage<ProductResponse>(`/products?${query.toString()}`, {
      tags: ['products'],
      revalidate: 60,
    });
  } catch {
    result = null;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">
          {q ? `Results for “${q}”` : 'All products'}
        </h1>
        {result && (
          <p className="text-sm text-ink-muted">
            {result.pagination.total === 0
              ? 'No products'
              : `${result.pagination.total} ${result.pagination.total === 1 ? 'product' : 'products'}`}
          </p>
        )}
      </header>

      <CatalogueToolbar q={q} sort={sort} />

      {!result && <Alert>We could not load the catalogue just now. Please refresh in a moment.</Alert>}

      {result && result.items.length === 0 && (
        <EmptyState
          icon={q ? <SearchX className="h-8 w-8" /> : <PackageOpen className="h-8 w-8" />}
          title={q ? 'No products match that search' : 'Nothing here yet'}
          description={
            q
              ? 'Try a shorter search, or a different word — searching for a brand or a category name often works better than a full product title.'
              : 'This shop has not published any products yet. Do check back soon.'
          }
        />
      )}

      {result && result.items.length > 0 && (
        <>
          <ProductGrid products={result.items} />
          <Pagination
            pagination={result.pagination}
            buildHref={(nextPage) => buildHref({ q, sort, page: nextPage })}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}

function buildHref({ q, sort, page }: { q: string; sort: string; page: number }): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  // Page 1 is the default, so leaving it out keeps the canonical URL clean.
  if (page > 1) params.set('page', String(page));

  const qs = params.toString();
  return qs ? `/products?${qs}` : '/products';
}

/**
 * Only the fields the API's sort allowlist accepts. Anything else becomes the
 * default ordering rather than a 400 — a hand-edited URL should degrade, not break.
 */
const ALLOWED_SORTS = new Set([
  'publishedAt',
  '-publishedAt',
  'name',
  '-name',
  'priceMinor',
  '-priceMinor',
  'createdAt',
  '-createdAt',
  'totalSold',
  '-totalSold',
]);

function normaliseSort(raw: string | undefined): string {
  if (!raw) return '';
  return ALLOWED_SORTS.has(raw) ? raw : '';
}

function normalisePage(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  // The API caps `limit` at 100 but not `page`; a wild page number is harmless
  // here, it just returns an empty set.
  return parsed;
}
