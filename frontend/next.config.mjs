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

export default nextConfig
