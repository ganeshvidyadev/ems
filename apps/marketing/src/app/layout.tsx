import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { WebsiteContentResponse } from '@ems/contracts';
import { marketingFetch } from '@/lib/api-client';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EMS — Multi-Tenant E-Commerce Platform', template: '%s · EMS' },
  description:
    'EMS is a multi-tenant e-commerce SaaS platform: merchants sign up, pick a plan, and get a fully provisioned online store with payments, logistics, a website builder, and multi-channel selling.',
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Next.js request-memoizes an identical `fetch()` call made again in page.tsx, so
  // this does not cost a second round-trip to the API.
  const content = await marketingFetch<WebsiteContentResponse>('website/content');

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader content={content.header} />
        <main className="flex-1">{children}</main>
        <SiteFooter content={content.footer} />
      </body>
    </html>
  );
}
