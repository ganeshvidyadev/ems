import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch, type PublicPlan } from '@/lib/api-client';
import { PlansSection } from '@/components/plans-section';

export const metadata: Metadata = { title: 'Plans' };

export default async function PlansPage() {
  const [content, plans] = await Promise.all([
    marketingFetch<WebsiteContentResponse>('website/content'),
    marketingFetch<PublicPlan[]>('plans'),
  ]);

  return <PlansSection plans={plans} display={content.plansDisplay} />;
}
