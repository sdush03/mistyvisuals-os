import { ImageResponse } from 'next/og'

const API = process.env.API_URL || 'http://localhost:3001'

export const runtime = 'nodejs'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

export default async function OGImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let coupleNames = 'Your Proposal'
  let coverUrl = ''
  let title = ''
  let eventDate = ''

  try {
    const res = await fetch(`${API}/api/proposals/${token}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const data = await res.json()
      const draft = data?.draftData || data?.snapshotJson?.draftData || {}
      const hero = draft?.hero || {}
      coupleNames = hero.coupleNames || hero.couple_names || 'Your Proposal'
      title = hero.title || ''
      coverUrl = hero.coverImageUrl || hero.cover_image_url || ''
      
      // Get event date from first event
      const events = draft?.events || []
      if (events.length > 0 && events[0].date) {
        const d = new Date(events[0].date)
        eventDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    }
  } catch {}

  // Make cover URL absolute
  if (coverUrl && !coverUrl.startsWith('http')) {
    coverUrl = `${API}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#0a0a0a',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Cover image */}
        {coverUrl && (
          <img
            src={coverUrl}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.4) 100%)',
          }}
        />

        {/* Top branding */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            MISTY VISUALS
          </div>
        </div>

        {/* Bottom content */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 60px 50px',
          }}
        >
          {/* Decorative line */}
          <div
            style={{
              width: 60,
              height: 2,
              background: 'linear-gradient(90deg, transparent, rgba(240,212,160,0.8), transparent)',
              marginBottom: 24,
              display: 'flex',
            }}
          />

          {/* Title */}
          {title && (
            <div
              style={{
                fontSize: 16,
                color: 'rgba(240,212,160,0.7)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              {title}
            </div>
          )}

          {/* Couple names */}
          <div
            style={{
              fontSize: 52,
              color: 'white',
              fontWeight: 800,
              textAlign: 'center',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {coupleNames}
          </div>

          {/* Event date */}
          {eventDate && (
            <div
              style={{
                fontSize: 16,
                color: 'rgba(255,255,255,0.5)',
                marginTop: 16,
                letterSpacing: '0.15em',
                fontWeight: 500,
              }}
            >
              {eventDate}
            </div>
          )}

          {/* Bottom tag */}
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.3)',
              marginTop: 20,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            A CINEMATIC PROPOSAL
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
