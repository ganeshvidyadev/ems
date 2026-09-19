import type { MetadataRoute } from 'next';
import type { ProductResponse } from '@ems/contracts';
import { getTenantContext, storefrontFetchPage } from '@/lib/tenant';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await getTenantContext();
  const baseUrl = tenant.hostname
    ? `https://${tenant.hostname}`
    : (process.env.NEXT_PUBLIC_STORE_URL ?? 'http://localhost:3000');

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/cart`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.3,
    },
  ];

  try {
    const { items: products } = await storefrontFetchPage<ProductResponse>('/products?limit=250', {
      revalidate: 3600,
      tags: ['products'],
    });

    const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
