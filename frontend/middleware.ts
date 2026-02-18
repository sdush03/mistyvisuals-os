import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const token = req.cookies.get('mv_auth')?.value
  const { pathname } = req.nextUrl
  // Public routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  // No auth → force login
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  if (pathname === '/login') {
    return NextResponse.next()
  }

  const hasAuth = Boolean(req.cookies.get(AUTH_COOKIE)?.value)
  if (!hasAuth) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|login|api).*)'],
}
