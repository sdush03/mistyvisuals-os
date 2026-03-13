import type { NextConfig } from 'next'

const apiTarget = process.env.API_URL

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/admin/reports/:path*',
        destination: '/admin/finance/summaries/:path*',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    if (!apiTarget) return []
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
