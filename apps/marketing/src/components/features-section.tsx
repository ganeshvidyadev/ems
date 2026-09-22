import type { WebsiteFeaturesContent } from '@ems/contracts';
import { FeatureGrid } from '@/components/feature-grid';

export function FeaturesSection({ content }: { content: WebsiteFeaturesContent }) {
  return (
    <section id="features" className="scroll-mt-16 bg-surface">
      <div className="mx-auto max-w-content px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">{content.heading}</h2>
          <p className="mt-4 text-ink-muted">{content.subheading}</p>
        </div>
        <FeatureGrid items={content.items} />
      </div>
    </section>
  );
}
