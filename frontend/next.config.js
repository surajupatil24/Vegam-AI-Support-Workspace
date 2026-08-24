/** @type {import('next').NextConfig} */
const internalApiUrl = (process.env.INTERNAL_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '')

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
