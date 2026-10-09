import type { Metadata } from 'next';
import { Briefcase, MapPin } from 'lucide-react';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

// Per-page description taken from the same editable content as the page body, so each route
// has its own snippet instead of inheriting the site-wide one.
export async function generateMetadata(): Promise<Metadata> {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  return { title: 'Careers', description: content.career.subheading || undefined };
}

export default async function CareersPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { career } = content;

  return (
    <>
      <PageHero heading={career.heading} subheading={career.subheading} />
      <section className="section pt-0">
        <div className="container">
          {career.openings.length === 0 ? (
            <p className="text-center text-text">No open roles right now — check back soon.</p>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              {career.openings.map((opening, index) => (
                <div key={index} className="rounded-2xl border border-border/50 bg-white/5 p-8 backdrop-blur-sm">
                  <div className="mb-6 flex flex-col gap-4">
                    <h3 className="text-h5 font-bold text-white">
                      <a href={opening.applyHref} className="transition-colors duration-200 hover:text-primary">
                        {opening.title}
                      </a>
                    </h3>
                    {opening.description && <p className="leading-relaxed text-text">{opening.description}</p>}
                  </div>

                  <hr className="mb-6 border-border/50" />

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-x-9 gap-y-2">
                      <span className="inline-flex items-center gap-2 text-text">
                        <Briefcase className="h-5 w-5" /> {opening.department} · {opening.type}
                      </span>
                      <span className="inline-flex items-center gap-2 text-text">
                        <MapPin className="h-5 w-5" /> {opening.location}
                      </span>
                    </div>
                    <a href={opening.applyHref} className="btn btn-outline px-6 py-3 text-sm">
                      Apply Now
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
