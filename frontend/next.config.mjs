const apiTarget = process.env.API_URL

/** @type {import('next').NextConfig} */
const nextConfig = {
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

import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})

export default withPWA(nextConfig)
