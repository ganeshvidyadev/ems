import type { MetadataRoute } from 'next';
import { getTenantContext } from '@/lib/tenant';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const tenant = await getTenantContext();
  const baseUrl = tenant.hostname
    ? `https://${tenant.hostname}`
    : (process.env.NEXT_PUBLIC_STORE_URL ?? 'http://localhost:3000');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account/', '/checkout/', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
