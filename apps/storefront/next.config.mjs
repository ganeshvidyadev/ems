/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  transpilePackages: ['@ems/contracts', '@ems/kernel'],
  experimental: { externalDir: true },

  /**
   * Dev-only. A storefront is *only* reachable on a tenant hostname — tenant
   * resolution needs one — but `next dev` binds its own origin to `localhost`, so
   * every request for a `/_next/*` chunk from `northwind.ems.localhost:3001` is
   * cross-origin. Next 15 warns and will eventually block those, which leaves the
   * client bundle unfetched: pages render their server HTML and then never
   * hydrate, so the cart, reviews and checkout are all inert.
   *
   * Only the local platform root domain is listed. This has no effect on a
   * production build, where the app is served from the tenant's own origin.
   */
  allowedDevOrigins: ['*.ems.localhost', 'ems.localhost'],

  images: {
    // Merchant media comes from our own object storage / CDN. An open allowlist
    // would turn the image optimiser into a proxy anyone could point anywhere.
    remotePatterns: [
      { protocol: 'https', hostname: '*.ems.app' },
      { protocol: 'http', hostname: '127.0.0.1', port: '9000' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // No X-Frame-Options DENY here, unlike the console: merchants legitimately
          // embed storefront widgets, and SEO tooling renders pages in frames.
        ],
      },
    ];
  },
};

export default nextConfig;
