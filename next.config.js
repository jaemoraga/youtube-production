/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Old addresses keep working (including links in emails already sent).
  async redirects() {
    return [
      { source: '/portal', destination: '/client-submission/youtube', permanent: true },
      { source: '/portal/:path*', destination: '/client-submission/youtube/:path*', permanent: true },
      // The app moved from sponsorships.hoteltechinsider.com; old links (incl. emailed ones) forward.
      { source: '/:path*', has: [{ type: 'host', value: 'sponsorships.hoteltechinsider.com' }], destination: 'https://youtube-studio.hoteltechinsider.com/:path*', permanent: true },
      // Admin pages moved under /admin; the home page is now public.
      { source: '/login', destination: '/admin/login', permanent: true },
      { source: '/upload', destination: '/admin/upload', permanent: true },
      { source: '/projects/:path*', destination: '/admin/projects/:path*', permanent: true },
      { source: '/jobs/:path*', destination: '/admin/jobs/:path*', permanent: true },
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
