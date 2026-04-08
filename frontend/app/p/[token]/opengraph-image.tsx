import { ImageResponse } from 'next/og'

const API = process.env.API_URL || 'http://localhost:3001'

export const runtime = 'nodejs'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

function formatDateRange(events: any[]) {
  const datedEvents = Array.isArray(events)
    ? events
        .map((event) => event?.date)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()))
    : []

  if (!datedEvents.length) return ''

  const first = datedEvents[0]
  const last = datedEvents[datedEvents.length - 1]
  const format = (date: Date) =>
    date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  if (first.getTime() === last.getTime()) return format(first)
  return `${format(first)} - ${format(last)}`
}

export default async function OGImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let coupleNames = 'Your Proposal'
  let coverUrl = ''
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
      const bride = (hero?.brideName || hero?.bride_name || draft?.brideName || draft?.bride_name || '').trim()
      const groom = (hero?.groomName || hero?.groom_name || draft?.groomName || draft?.groom_name || '').trim()
      const lead = (hero?.leadName || hero?.lead_name || draft?.leadName || draft?.lead_name || '').trim()
      const rawCoupleNames = hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names
      coupleNames = rawCoupleNames || ((bride && groom) ? `${bride} & ${groom}` : (lead || 'Your Proposal'))
      coverUrl = hero.coverImageUrl || hero.cover_image_url || ''
      eventDate = formatDateRange(draft?.events || [])
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
            top: 52,
            left: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 30,
              color: 'white',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 700,
              textShadow: '0 4px 12px rgba(0,0,0,0.8)',
            }}
          >
            MISTY VISUALS
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginTop: 14,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            AN ARTFUL APPROACH TO CAPTURING LOVE
          </div>
        </div>

        {/* Center card */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 120px',
            transform: 'translateY(-50%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              backgroundColor: 'rgba(0,0,0,0.58)',
              border: '2px solid rgba(255,255,255,0.15)',
              borderRadius: 24,
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
              padding: '56px 48px',
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: 'rgba(255,255,255,0.82)',
                marginBottom: 22,
                fontStyle: 'italic',
                fontFamily: 'serif',
              }}
            >
              A Personalized Proposal For
            </div>

            <div
              style={{
                fontSize: 68,
                color: 'white',
                fontWeight: 800,
                textAlign: 'center',
                lineHeight: 1.05,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textShadow: '0 4px 20px rgba(0,0,0,0.65)',
              }}
            >
              {coupleNames}
            </div>

            {eventDate && (
              <div
                style={{
                  fontSize: 18,
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: 18,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {eventDate}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 68,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 110px',
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.82)',
              textAlign: 'center',
              fontStyle: 'italic',
              fontFamily: 'serif',
              lineHeight: 1.35,
              textShadow: '0 2px 10px rgba(0,0,0,0.65)',
            }}
          >
            A Curated Photography & Videography Experience for Your Celebration.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
