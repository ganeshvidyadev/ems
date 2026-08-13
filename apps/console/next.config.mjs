/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Workspace packages ship CommonJS from tsc. Transpiling them here means the
  // console can import Zod contracts directly without a separate build step in
  // the dev loop.
  transpilePackages: ['@ems/contracts', '@ems/kernel'],

  experimental: {
    // Both packages resolve from the monorepo root, outside this app's directory.
    externalDir: true,
  },

  // The console is authenticated and never indexed, so these are unconditional.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
