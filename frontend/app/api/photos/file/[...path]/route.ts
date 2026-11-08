import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL
  const resolvedParams = await context.params
  const pathSegments = resolvedParams?.path
  if (!pathSegments || pathSegments.length === 0) {
    return new NextResponse('Not found', { status: 404 })
  }

  const filePath = pathSegments.join('/')

  // If apiUrl is configured, try proxying to the backend
  if (apiUrl) {
    try {
      const upstreamUrl = `${apiUrl}/api/photos/file/${filePath}`
      const forwardHeaders: Record<string, string> = {}
      const range = req.headers.get('range')
      if (range) {
        forwardHeaders['range'] = range
      }
      const upstreamRes = await fetch(upstreamUrl, {
        headers: forwardHeaders,
        redirect: 'follow'
      })

      if (upstreamRes.ok || upstreamRes.status === 206) {
        const headers = new Headers(upstreamRes.headers)
        return new NextResponse(upstreamRes.body, {
          status: upstreamRes.status,
          headers,
        })
      }
    } catch {
      // Backend fetch failed, proceed to direct CDN fallback
    }
  }

  // Fallback: If it's a portal/questionnaire or gallery asset, redirect directly to Cloudflare R2 public CDN
  if (filePath.startsWith('portals/') || filePath.startsWith('events/')) {
    return NextResponse.redirect(`https://gallery.mistyvisuals.com/${filePath}`)
  }

  return new NextResponse('Failed to load image', { status: 404 })
}
