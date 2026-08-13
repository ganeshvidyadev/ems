/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  transpilePackages: ['@ems/contracts', '@ems/kernel'],
  experimental: { externalDir: true },

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
