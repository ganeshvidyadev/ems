import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch, type PublicPlan } from '@/lib/api-client';
import { PlansSection } from '@/components/plans-section';

// Per-page description taken from the same editable content as the page body, so each route
// has its own snippet instead of inheriting the site-wide one.
export async function generateMetadata(): Promise<Metadata> {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  return { title: 'Plans', description: content.plansDisplay.subheading || undefined };
}

export default async function PlansPage() {
  const [content, plans] = await Promise.all([
    marketingFetch<WebsiteContentResponse>('website/content'),
    marketingFetch<PublicPlan[]>('plans'),
  ]);

  return <PlansSection plans={plans} display={content.plansDisplay} headingAs="h1" />;
}
