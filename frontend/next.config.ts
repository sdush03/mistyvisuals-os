import type { NextConfig } from 'next'

const apiTarget = process.env.API_URL

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiTarget) return []
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/:path*`,
      },
    ]
  },
}

export default nextConfig
