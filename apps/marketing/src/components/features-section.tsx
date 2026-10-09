import type { WebsiteFeaturesContent } from '@ems/contracts';
import { FeatureGrid } from '@/components/feature-grid';

export function FeaturesSection({ content }: { content: WebsiteFeaturesContent }) {
  return (
    <section id="features" className="section scroll-mt-16">
      <div className="container">
        <div className="section-container">
          <div className="section-intro centralize">
            <h2 className="hasHighlight title">{content.heading}</h2>
            <p className="subtitle">{content.subheading}</p>
          </div>
          <div className="section-content">
            <FeatureGrid items={content.items} />
          </div>
        </div>
      </div>
    </section>
  );
}
