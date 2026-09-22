import type { BrandResponse, CategoryResponse, ProductResponse } from '@ems/contracts';
import { PackageOpen, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { ActiveFilterChips, CatalogueFilters } from '@/components/catalogue-filters';
import { CatalogueResults } from '@/components/catalogue-results';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-card';
import { Alert, EmptyState } from '@/components/ui';
import { storefrontFetchPage, type StorefrontPage } from '@/lib/tenant';

const PAGE_SIZE = 12;

type SearchParams = {
  q?: string;
  sort?: string;
  page?: string;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  onSale?: string;
  rating?: string;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : 'All products' };
}

/**
 * Catalogue browsing and faceted search.
 *
 * A server component reading its state out of the URL, so every result set is
 * server-rendered, shareable and indexable.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const sort = normaliseSort(params.sort);
  const page = normalisePage(params.page);
  const category = (params.category ?? '').trim() || undefined;
  const brand = (params.brand ?? '').trim() || undefined;
  const minPrice = (params.minPrice ?? '').trim() || undefined;
  const maxPrice = (params.maxPrice ?? '').trim() || undefined;
  const inStock = (params.inStock ?? '').trim() || undefined;
  const onSale = (params.onSale ?? '').trim() || undefined;
  const rating = (params.rating ?? '').trim() || undefined;

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (q) query.set('q', q);
  if (sort) query.set('sort', sort);
  if (category) query.set('categoryId', category);
  if (brand) query.set('brandId', brand);

  if (minPrice && !isNaN(Number(minPrice)) && Number(minPrice) >= 0) {
    query.set('minPriceMinor', String(Math.round(Number(minPrice) * 100)));
  }
  if (maxPrice && !isNaN(Number(maxPrice)) && Number(maxPrice) > 0) {
    query.set('maxPriceMinor', String(Math.round(Number(maxPrice) * 100)));
  }

  // Fetch products, categories, and brands concurrently
  const [productResult, categoryResult, brandResult] = await Promise.all([
    storefrontFetchPage<ProductResponse>(`/products?${query.toString()}`, {
      tags: ['products'],
      revalidate: 60,
    }).catch(() => null),
    storefrontFetchPage<CategoryResponse>('/categories?limit=50', {
      tags: ['categories'],
      revalidate: 300,
    }).catch(() => null),
    storefrontFetchPage<BrandResponse>('/brands?limit=50', {
      tags: ['brands'],
      revalidate: 300,
    }).catch(() => null),
  ]);

  const categories = categoryResult?.items ?? [];
  const brands = brandResult?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">
          {q ? `Results for “${q}”` : 'All products'}
        </h1>
        {productResult && (
          <p className="text-sm text-ink-muted">
            {productResult.pagination.total === 0
              ? 'No products'
              : `${productResult.pagination.total} ${productResult.pagination.total === 1 ? 'product' : 'products'}`}
          </p>
        )}
      </header>

      {/* Main layout with responsive faceted sidebar */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <CatalogueFilters
          categories={categories}
          brands={brands}
          filters={{ q, sort, category, brand, minPrice, maxPrice, inStock, onSale, rating }}
        />

        <div className="flex-1 min-w-0 w-full space-y-4">
          <ActiveFilterChips
            categories={categories}
            brands={brands}
            filters={{ q, sort, category, brand, minPrice, maxPrice, inStock, onSale, rating }}
          />

          <CatalogueResults q={q} sort={sort}>
            {!productResult && <Alert>We could not load the catalogue just now. Please refresh in a moment.</Alert>}

            {productResult && productResult.items.length === 0 && (
              <EmptyState
                icon={q ? <SearchX className="h-8 w-8" /> : <PackageOpen className="h-8 w-8" />}
                title={q ? 'No products match that search' : 'No products found'}
                description={
                  q
                    ? 'Try a shorter search, or a different word — searching for a brand or category name often works better.'
                    : 'Try clearing some of your filters to see more products.'
                }
              />
            )}

            {productResult && productResult.items.length > 0 && (
              <>
                <ProductGrid products={productResult.items} />
                <Pagination
                  pagination={productResult.pagination}
                  buildHref={(nextPage) =>
                    buildHref({ q, sort, page: nextPage, category, brand, minPrice, maxPrice, inStock, onSale, rating })
                  }
                  className="pt-2"
                />
              </>
            )}
          </CatalogueResults>
        </div>
      </div>
    </div>
  );
}

function buildHref({
  q,
  sort,
  page,
  category,
  brand,
  minPrice,
  maxPrice,
  inStock,
  onSale,
  rating,
}: {
  q: string;
  sort: string;
  page: number;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  onSale?: string;
  rating?: string;
}): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  if (category) params.set('category', category);
  if (brand) params.set('brand', brand);
  if (minPrice) params.set('minPrice', minPrice);
  if (maxPrice) params.set('maxPrice', maxPrice);
  if (inStock) params.set('inStock', inStock);
  if (onSale) params.set('onSale', onSale);
  if (rating) params.set('rating', rating);
  if (page > 1) params.set('page', String(page));

  const qs = params.toString();
  return qs ? `/products?${qs}` : '/products';
}

/**
 * Only the fields the API's sort allowlist accepts.
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
  return parsed;
}
