import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { PageHero } from '@/components/page-hero';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage() {
  const content = await marketingFetch<WebsiteContentResponse>('website/content');
  const { contact } = content;

  return (
    <>
      <PageHero heading={contact.heading} subheading={contact.subheading} />
      <section className="bg-surface">
        <div className="mx-auto max-w-2xl px-6 py-24">
          <div className="space-y-4">
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-lg border border-line p-4 hover:border-brand">
              <Mail className="h-5 w-5 text-fuchsia-600" />
              <span className="text-sm text-ink">{contact.email}</span>
            </a>
            {contact.phone && (
              <div className="flex items-center gap-3 rounded-lg border border-line p-4">
                <Phone className="h-5 w-5 text-fuchsia-600" />
                <span className="text-sm text-ink">{contact.phone}</span>
              </div>
            )}
            {contact.address && (
              <div className="flex items-center gap-3 rounded-lg border border-line p-4">
                <MapPin className="h-5 w-5 text-fuchsia-600" />
                <span className="text-sm text-ink">{contact.address}</span>
              </div>
            )}
          </div>

          <div className="mt-10 text-center">
            <a
              href={contact.ctaHref}
              className="inline-block rounded-md bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/20 hover:from-indigo-500 hover:to-fuchsia-500"
            >
              {contact.ctaLabel}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
