import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'mv_auth'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isLogin = pathname === '/login'
  const isProtected = pathname === '/dashboard' || pathname === '/leads' || pathname.startsWith('/leads/') || pathname === '/me'

  const hasAuth = Boolean(req.cookies.get(AUTH_COOKIE)?.value)

  if (isProtected && !hasAuth) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (isLogin && hasAuth) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard', '/leads', '/leads/:path*', '/me', '/login'],
}
