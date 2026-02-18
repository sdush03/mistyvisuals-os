import type { NextConfig } from 'next'

const apiTarget = process.env.API_URL || 'http://localhost:3001'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/:path*`,
      },
    ]
  },
}

export default nextConfig
