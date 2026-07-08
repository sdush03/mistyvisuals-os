'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'

type Props = {
  params: Promise<{ slug: string }>
}

export default function GuestGallerySplash({ params }: Props) {
  const { slug } = use(params)
  const router = useRouter()
  
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guest, setGuest] = useState<any>(null)
  
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [submittingPhone, setSubmittingPhone] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')

    // 1. Fetch public event details
    fetch(`${apiUrl}/api/gallery/public/events/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Gallery not found or inactive')
        return res.json()
      })
      .then(async data => {
        setEvent(data)

        // 2. Check if already authenticated
        const token = localStorage.getItem(`mv_gallery_token_${slug}`)
        const savedGuest = localStorage.getItem(`mv_gallery_guest_${slug}`)
        if (token && savedGuest) {
          const parsedGuest = JSON.parse(savedGuest)
          // If code is present and guest doesn't have full access yet, auto-upgrade
          if (code && !parsedGuest.hasFullAccess) {
            try {
              const upgRes = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/upgrade`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code })
              })
              if (upgRes.ok) {
                const upgData = await upgRes.json()
                localStorage.setItem(`mv_gallery_token_${slug}`, upgData.token)
                localStorage.setItem(`mv_gallery_guest_${slug}`, JSON.stringify(upgData.guest))
              }
            } catch (upgErr) {
              console.error('Auto-upgrade failed:', upgErr)
            }
          }
          router.push(`/${slug}/gallery/photos`)
        } else {
          setLoading(false)
        }
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [slug, router, apiUrl])

  // Initialize Google Identity Services
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).google) {
      initializeGoogle()
    }
  }, [event])

  const initializeGoogle = () => {
    const google = (window as any).google
    if (!google || !event) return

    google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '1047124976775-mock.apps.googleusercontent.com',
      callback: handleGoogleCredentialResponse
    })

    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme: 'outline', size: 'large', width: '280' }
    )
  }

  const handleGoogleCredentialResponse = async (response: any) => {
    try {
      setLoading(true)
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')

      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          token: response.credential,
          code
        })
      })

      if (!res.ok) throw new Error('Google authentication failed')
      const data = await res.json()

      completeLogin(data)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }


  const completeLogin = (data: any) => {
    localStorage.setItem(`mv_gallery_token_${slug}`, data.token)
    localStorage.setItem(`mv_gallery_guest_${slug}`, JSON.stringify(data.guest))
    setGuest(data.guest)

    // If guest doesn't have a phone number, show the prompt modal
    if (!data.guest.phoneNumber) {
      setLoading(false)
      setShowPhoneModal(true)
    } else {
      router.push(`/${slug}/gallery/photos`)
    }
  }

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber) return
    setSubmittingPhone(true)

    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phoneNumber })
      })

      if (!res.ok) throw new Error('Failed to save phone number')
      
      // Update local storage guest info
      const updatedGuest = { ...guest, phoneNumber }
      localStorage.setItem(`mv_gallery_guest_${slug}`, JSON.stringify(updatedGuest))

      setShowPhoneModal(false)
      router.push(`/${slug}/gallery/photos`)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmittingPhone(false)
    }
  }

  if (loading && !showPhoneModal) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f5f4f0]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0f172a] border-t-transparent"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#f5f4f0] px-4 text-center">
        <h1 className="font-lora text-2xl font-semibold text-red-600 mb-2">Error Loading Gallery</h1>
        <p className="font-sans text-neutral-600 mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="rounded-full bg-[#0f172a] px-6 py-2 text-white font-sans text-sm hover:opacity-90"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div 
      style={{
        position: 'relative',
        width: '100%',
        height: '100svh',
        minHeight: '560px',
        overflow: 'hidden',
        background: '#111',
        cursor: 'pointer'
      }}
      onClick={() => setShowLoginModal(true)}
    >
      <Script 
        src="https://accounts.google.com/gsi/client" 
        onLoad={initializeGoogle}
        strategy="afterInteractive"
      />

      {/* Full-bleed Cover Image */}
      {event?.coverPhotoUrl && (
        <picture>
          {event?.coverPhotoMobileUrl && (
            <source media="(max-width: 767px)" srcSet={event.coverPhotoMobileUrl} />
          )}
          <img
            src={event.coverPhotoUrl}
            alt={event.title}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 30%',
            }}
          />
        </picture>
      )}

      {/* Gradient overlay — bottom-heavy for legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.65) 100%)',
        zIndex: 10
      }} />

      {/* Central Event Information & ENTER CTA */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '0 2rem',
        justifyContent: 'center',
        zIndex: 20
      }}>

        <h1 style={{
          fontFamily: '"Futura", "Trebuchet MS", Arial, sans-serif',
          fontSize: 'clamp(1.75rem, 4vw, 3.5rem)',
          fontWeight: 400,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#fff',
          lineHeight: 1.1,
          marginBottom: '1rem',
        }}>
          {(event?.title || '').replace(/'s\s+Wedding/gi, '').replace('&', '').replace(/\s+/g, ' ').trim()}
        </h1>
        {event?.date && (
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(0.7rem, 1.1vw, 0.875rem)',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#fff',
            marginBottom: '3rem',
          }}>
            {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}

        <button 
          onClick={(e) => { e.stopPropagation(); setShowLoginModal(true); }}
          className="font-sans text-[11px] font-semibold text-white tracking-widest uppercase border border-white/50 rounded-full px-8 py-3 bg-white/10 hover:bg-white hover:text-[#111] transition-all duration-300 cursor-pointer backdrop-blur-xs"
        >
          Enter Gallery
        </button>
      </div>

      {/* Brand Footer Logo */}
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 20
      }}>
        <a 
          href="https://mistyvisuals.com" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ cursor: 'pointer', display: 'block', transition: 'opacity 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          onClick={(e) => e.stopPropagation()}
        >
          <img 
            src="/logo-white.png" 
            alt="Misty Visuals Logo" 
            style={{ height: '2.5rem', width: 'auto', objectFit: 'contain' }} 
          />
        </a>
      </div>

      {/* Glassmorphic Login Overlay Modal */}
      {showLoginModal && (
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(10px)',
            zIndex: 50,
            padding: '0 2rem'
          }}
          onClick={(e) => { e.stopPropagation(); setShowLoginModal(false); }}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '400px',
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px)',
              borderRadius: '24px',
              padding: '2.5rem 2rem',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '1.25rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: '0.5rem',
              color: '#1c1a18'
            }}>
              Welcome Guests
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              color: '#737373',
              textAlign: 'center',
              lineHeight: 1.5,
              marginBottom: '2rem'
            }}>
              Log in with your social account to instantly find your photos using face recognition
            </p>

            {/* OAuth Buttons Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
              <div id="google-signin-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', minHeight: '44px' }} />

              <button 
                onClick={() => alert('Apple Sign-In is coming soon. Please use Google Sign-In to log in.')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  width: '280px',
                  height: '44px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '0 1rem',
                  backgroundColor: '#000',
                  color: '#fff',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#000'}
              >
                <svg style={{ width: '1.25rem', height: '1.25rem', fill: 'currentColor' }} viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.7-1.13 1.84-.99 2.94.12 0 .24.01.36.01.9 0 2-.62 2.46-1.34z"/>
                </svg>
                <span>Sign in with Apple</span>
              </button>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); setShowLoginModal(false); }}
              style={{
                marginTop: '1.5rem',
                fontSize: '0.75rem',
                color: '#8c867e',
                backgroundColor: 'transparent',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-neutral-100 shadow-2xl animate-waterfall" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-lora text-xl font-medium mb-2 text-[#111111]">One Last Step</h3>
            <p className="font-sans text-xs text-neutral-500 mb-6">
              Enter your phone number so we can notify you if additional photos are uploaded to the gallery.
            </p>

            <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
              <input
                type="tel"
                placeholder="Phone Number (e.g. +91 99999 99999)"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 font-sans text-sm outline-hidden focus:border-[#0f172a]"
                required
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPhoneModal(false)
                    router.push(`/${slug}/gallery/photos`)
                  }}
                  className="flex-1 py-3 border border-neutral-200 rounded-xl text-neutral-600 font-sans text-xs font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Skip for Now
                </button>
                <button
                  type="submit"
                  disabled={submittingPhone}
                  className="flex-1 py-3 bg-[#0f172a] text-white rounded-xl font-sans text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submittingPhone ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
