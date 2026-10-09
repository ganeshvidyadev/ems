import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

// Per-page description taken from the same editable content as the page body, so each route
// has its own snippet instead of inheriting the site-wide one.
export async function generateMetadata(): Promise<Metadata> {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  return { title: 'Contact', description: content.contact.subheading || undefined };
}

export default async function ContactPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { contact } = content;

  return (
    <>
      <PageHero heading={contact.heading} subheading={contact.subheading} />
      <section className="section pt-0">
        <div className="container">
          <div className="mx-auto flex max-w-xl flex-col gap-5">
            <a
              href={`mailto:${contact.email}`}
              className="group flex items-center gap-5 rounded-2xl bg-white/5 p-7 ring-1 ring-white/10 transition-all duration-300 hover:bg-white/10 hover:ring-primary/50"
            >
              <Mail className="h-8 w-8 shrink-0 text-white transition-transform duration-300 group-hover:scale-110" />
              <div>
                <h3 className="font-secondary text-xl font-bold text-white">Email</h3>
                <p className="text-text">{contact.email}</p>
              </div>
            </a>
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="group flex items-center gap-5 rounded-2xl bg-white/5 p-7 ring-1 ring-white/10 transition-all duration-300 hover:bg-white/10 hover:ring-primary/50"
              >
                <Phone className="h-8 w-8 shrink-0 text-white transition-transform duration-300 group-hover:scale-110" />
                <div>
                  <h3 className="font-secondary text-xl font-bold text-white">Phone</h3>
                  <p className="text-text">{contact.phone}</p>
                </div>
              </a>
            )}
            {contact.address && (
              <div className="flex items-center gap-5 rounded-2xl bg-white/5 p-7 ring-1 ring-white/10">
                <MapPin className="h-8 w-8 shrink-0 text-white" />
                <div>
                  <h3 className="font-secondary text-xl font-bold text-white">Address</h3>
                  <p className="text-text">{contact.address}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 text-center">
            <a href={contact.ctaHref} className="btn btn-primary">
              {contact.ctaLabel}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
