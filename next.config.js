/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The sponsor portal moved from /portal; keep every old link (including emailed ones) working.
  async redirects() {
    return [
      { source: '/portal', destination: '/client-submission/youtube', permanent: true },
      { source: '/portal/:path*', destination: '/client-submission/youtube/:path*', permanent: true },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }];
  },
};
export default nextConfig;
