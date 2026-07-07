import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/privacy', '/terms', '/refund', '/contact']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('mv_auth')?.value

  // Allow Next internals and PWA static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/icons/') ||
    pathname === '/logo.png' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/icon.png' ||
    pathname === '/apple-icon.png' ||
    pathname.startsWith('/workbox-') ||
    pathname.startsWith('/worker-')
  ) {
    return NextResponse.next()
  }

  // Public pages
  if (
    PUBLIC_PATHS.includes(pathname) || 
    pathname.startsWith('/p/') || 
    pathname.startsWith('/api/proposals/') ||
    pathname.match(/\/[^/]+\/gallery(?:\/|$)/)
  ) {
    if (token && PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL('/salesdashboard', req.url))
    }
    return NextResponse.next()
  }

  // Protected routes
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api).*)'],
}
