import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'About' };

export default async function AboutPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { about } = content;

  return (
    <>
      <PageHero heading={about.heading} subheading={about.subheading} />
      <section className="bg-surface">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-24">
          {about.story.map((paragraph, index) => (
            <p key={index} className="text-base leading-relaxed text-ink-muted">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {about.values.length > 0 && (
        <section className="border-t border-line bg-surface-alt">
          <div className="mx-auto max-w-content px-6 py-24">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {about.values.map((value) => (
                <div key={value.title} className="rounded-lg border border-line bg-surface p-6">
                  <h3 className="text-lg font-semibold text-ink">{value.title}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
