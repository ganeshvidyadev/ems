import type { WebsiteFeatureItem } from '@ems/contracts';
import { ACCENT_MAP, ICON_MAP } from '@/lib/content-map';

/** The "icon + title + description" card grid, shared by the home page's Features
 * section and the standalone Products page — both sections have the identical shape. */
export function FeatureGrid({ items }: { items: WebsiteFeatureItem[] }) {
  return (
    <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature) => {
        const Icon = ICON_MAP[feature.icon];
        const { chip } = ACCENT_MAP[feature.accent];
        return (
          <div key={feature.title}>
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${chip}`}>
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-ink">{feature.title}</h3>
            <p className="mt-2 text-sm text-ink-muted">{feature.description}</p>
          </div>
        );
      })}
    </div>
  );
}
