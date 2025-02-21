/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/api/auth/login",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/login",
        destination: "/api/auth/login",
      },
      {
        source: "/register",
        destination: "/auth/register",
      },
      {
        source: "/subscriptions",
        destination: "/auth/subscriptions",
      },
    ];
  },
};

module.exports = nextConfig;