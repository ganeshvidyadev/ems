import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { FeatureGrid } from '@/components/feature-grid';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { products } = content;

  return (
    <>
      <PageHero heading={products.heading} subheading={products.subheading} />
      <section className="bg-surface">
        <div className="mx-auto max-w-content px-6 py-24">
          <FeatureGrid items={products.items} />
        </div>
      </section>
    </>
  );
}
