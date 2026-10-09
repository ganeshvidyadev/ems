import type { WebsiteFeatureItem } from '@ems/contracts';
import { ACCENT_MAP, ICON_MAP } from '@/lib/content-map';

/** Ported from Automark's `FeatureCard.astro` (bordered tile, centered icon/title/
 * description) — shared by the home page's Features section and the standalone
 * Products page, both of which have the identical content shape. */
export function FeatureGrid({ items }: { items: WebsiteFeatureItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature) => {
        const Icon = ICON_MAP[feature.icon];
        const { chip } = ACCENT_MAP[feature.accent];
        return (
          <div key={feature.title} className="relative border-l border-t border-text-light/5 p-8 xl:px-10 xl:py-11">
            <div className={`mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl ${chip}`}>
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h3 className="mb-4 text-center text-h5-sm font-bold">{feature.title}</h3>
            <p className="text-center">{feature.description}</p>
          </div>
        );
      })}
    </div>
  );
}
