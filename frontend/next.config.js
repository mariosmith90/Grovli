/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/api/auth/login',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/login',
        destination: '/api/auth/login',
      },
      {
        source: '/register',
        destination: '/auth/register',
      },
    ];
  },
};

module.exports = withPWA(nextConfig);