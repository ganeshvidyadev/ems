import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { FeatureGrid } from '@/components/feature-grid';
import { PageHero } from '@/components/page-hero';

// Per-page description taken from the same editable content as the page body, so each route
// has its own snippet instead of inheriting the site-wide one.
export async function generateMetadata(): Promise<Metadata> {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  return { title: 'Products', description: content.products.subheading || undefined };
}

export default async function ProductsPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { products } = content;

  return (
    <>
      <PageHero heading={products.heading} subheading={products.subheading} />
      <section className="section pt-0">
        <div className="container">
          <FeatureGrid items={products.items} />
        </div>
      </section>
    </>
  );
}
