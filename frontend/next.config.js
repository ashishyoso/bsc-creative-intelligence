/** @type {import('next').NextConfig} */
const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*',   destination: `${backendUrl}/:path*` },
      { source: '/media/:path*', destination: `${backendUrl}/media/:path*` },
    ];
  },
};

module.exports = nextConfig;
