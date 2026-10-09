import type { Metadata } from 'next';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

// Per-page description taken from the same editable content as the page body, so each route
// has its own snippet instead of inheriting the site-wide one.
export async function generateMetadata(): Promise<Metadata> {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  return { title: 'About', description: content.about.subheading || undefined };
}

export default async function AboutPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { about } = content;

  return (
    <>
      <PageHero heading={about.heading} subheading={about.subheading} />

      <section className="section overflow-hidden pt-0">
        <div className="container">
          <hr className="h-px border-0 bg-linear-to-r from-transparent from-3% via-white/40 to-97% to-transparent" />
          <div className="mx-auto max-w-3xl space-y-6 border-x border-text/10 px-6 py-16 xl:px-15">
            {about.story.map((paragraph, index) => (
              <p key={index} className="text-h6 leading-relaxed text-text">
                {paragraph}
              </p>
            ))}
          </div>
          <hr className="h-px border-0 bg-linear-to-r from-transparent from-3% via-white/40 to-97% to-transparent" />
        </div>
      </section>

      {about.values.length > 0 && (
        <section className="section relative">
          <div className="container">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {about.values.map((value) => (
                <div key={value.title} className="rounded-2xl bg-white/5 p-8">
                  <h3 className="text-h5-sm font-bold">{value.title}</h3>
                  <p className="mt-5 text-text-dark">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
