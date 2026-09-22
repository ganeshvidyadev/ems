import type { Metadata } from 'next';
import { MapPin, Briefcase, Clock } from 'lucide-react';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'Careers' };

export default async function CareersPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { career } = content;

  return (
    <>
      <PageHero heading={career.heading} subheading={career.subheading} />
      <section className="bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-24">
          {career.openings.length === 0 ? (
            <p className="text-center text-ink-muted">No open roles right now — check back soon.</p>
          ) : (
            <div className="space-y-4">
              {career.openings.map((opening, index) => (
                <a
                  key={index}
                  href={opening.applyHref}
                  className="block rounded-lg border border-line bg-surface p-6 shadow-sm transition hover:border-brand hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">{opening.title}</h3>
                      <p className="mt-1 text-sm text-ink-muted">{opening.department}</p>
                    </div>
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-600">
                      {opening.type}
                    </span>
                  </div>
                  {opening.description && <p className="mt-3 text-sm text-ink-muted">{opening.description}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {opening.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" /> {opening.department}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {opening.type}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
