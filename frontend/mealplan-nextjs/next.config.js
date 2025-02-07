/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Remove experimental.serverActions
  experimental: {
    // Add only valid experimental features if needed
  }
};

module.exports = nextConfig;