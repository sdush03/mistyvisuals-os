import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

const API = process.env.API_URL || 'http://localhost:3001'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return new Response('Missing token', { status: 400 })
    }

    // Fetch the proposal data
    const res = await fetch(`${API}/api/proposals/${token}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      throw new Error('Proposal not found')
    }

    const data = await res.json()
    const draft = data?.draftData || data?.snapshotJson?.draftData || {}
    const hero = draft?.hero || {}

    // Extract names
    const bride = (hero?.brideName || hero?.bride_name || draft?.brideName || draft?.bride_name || '').trim()
    const groom = (hero?.groomName || hero?.groom_name || draft?.groomName || draft?.groom_name || '').trim()
    const lead = (hero?.leadName || hero?.lead_name || draft?.leadName || draft?.lead_name || '').trim()
    const rawCoupleNames = hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names
    const coupleNames = rawCoupleNames 
      ? rawCoupleNames 
      : (bride && groom) ? `${bride} & ${groom}` : (lead || 'Your Beautiful Wedding')

    // Extract image
    let coverImageUrl = hero?.coverImageUrl || hero?.cover_image_url || draft?.coverImageUrl || draft?.cover_image_url

    // Ensure absolute URL
    if (coverImageUrl && !coverImageUrl.startsWith('http')) {
      const host = request.headers.get('host') || 'localhost:3000'
      const protocol = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
      coverImageUrl = `${protocol}://${host}${coverImageUrl.startsWith('/') ? '' : '/'}${coverImageUrl}`
    }

    // Default background if none
    if (!coverImageUrl) {
      coverImageUrl = 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=1200&auto=format&fit=crop'
    }

    // Remove video formats for image preview
    if (coverImageUrl.includes('.mp4') || coverImageUrl.includes('.webm') || coverImageUrl.includes('/api/videos')) {
      coverImageUrl = 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=1200&auto=format&fit=crop' 
    }

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            height: '100%',
            width: '100%',
            backgroundColor: '#0a0a0a',
            position: 'relative',
            flexDirection: 'column',
          }}
        >
          {/* Background Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.85,
            }}
          />

          {/* Overlays */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: 'radial-gradient(ellipse at 60% 35%, rgba(160,80,20,0.3) 0%, transparent 65%)',
            }}
          />

          {/* Top branding */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              marginTop: '80px',
              zIndex: 10,
            }}
          >
            <div
              style={{
                fontSize: '42px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '0.15em',
                marginBottom: '16px',
                textTransform: 'uppercase',
                textShadow: '0 4px 12px rgba(0,0,0,0.8)',
              }}
            >
              MISTY VISUALS
            </div>
            <div
              style={{
                fontSize: '18px',
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '0.42em',
                textTransform: 'uppercase',
                fontWeight: 600,
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              AN ARTFUL APPROACH TO CAPTURING LOVE
            </div>
          </div>

          {/* Center Glass Card (we use standard CSS that works in satori) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.6)',
              border: '2px solid rgba(255,255,255,0.15)',
              padding: '60px 40px',
              borderRadius: '24px',
              width: '80%',
              margin: 'auto auto',
              zIndex: 10,
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                fontSize: '28px',
                color: 'rgba(255,255,255,0.8)',
                marginBottom: '20px',
                fontStyle: 'italic',
                fontFamily: 'serif',
              }}
            >
              A Personalized Proposal For
            </div>
            <div
              style={{
                fontSize: '72px',
                fontWeight: 500,
                color: 'white',
                textAlign: 'center',
                fontFamily: 'serif',
                lineHeight: 1.1,
              }}
            >
              {coupleNames}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (e) {
    console.error(e)
    return new Response('${e.message}', { status: 500 })
  }
}
