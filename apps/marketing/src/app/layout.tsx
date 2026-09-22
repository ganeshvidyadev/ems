import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EMS — Multi-Tenant E-Commerce Platform', template: '%s · EMS' },
  description:
    'EMS is a multi-tenant e-commerce SaaS platform: merchants sign up, pick a plan, and get a fully provisioned online store with payments, logistics, a website builder, and multi-channel selling.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
