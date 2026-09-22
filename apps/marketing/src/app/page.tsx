import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch, type PublicPlan } from '@/lib/api-client';
import { FeaturesSection } from '@/components/features-section';
import { HeroSection } from '@/components/hero-section';
import { PlansSection } from '@/components/plans-section';

export default async function HomePage() {
  const [content, plans] = await Promise.all([
    marketingFetch<WebsiteContentResponse>('website/content'),
    marketingFetch<PublicPlan[]>('plans'),
  ]);

  return (
    <>
      <HeroSection content={content.hero} />
      <FeaturesSection content={content.features} />
      <PlansSection plans={plans} display={content.plansDisplay} />
    </>
  );
}
