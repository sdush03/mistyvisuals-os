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
    <div className="relative min-h-screen w-full bg-[#f5f4f0] text-[#111111] flex flex-col items-center justify-between pb-12">
      <Script 
        src="https://accounts.google.com/gsi/client" 
        onLoad={initializeGoogle}
        strategy="afterInteractive"
      />

      {/* Cover Image Header */}
      <div className="relative w-full h-[50vh] sm:h-[55vh] overflow-hidden flex items-end justify-center">
        {/* Landscape Cover for Desktop */}
        <div 
          className="absolute inset-0 bg-cover bg-center hidden sm:block transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url(${event?.coverPhotoUrl || 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200'})` }}
        />
        {/* Portrait Cover for Mobile */}
        <div 
          className="absolute inset-0 bg-cover bg-center block sm:hidden transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url(${event?.coverPhotoMobileUrl || event?.coverPhotoUrl || 'https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200'})` }}
        />
        {/* Soft shadow overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-[#f5f4f0] via-black/20 to-black/10" />
        
        {/* Event Meta */}
        <div className="relative z-10 text-center px-4 mb-6">
          <span className="font-sans text-xs uppercase tracking-widest text-[#0f172a] bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full border border-neutral-200">
            Misty Visuals Guest Portal
          </span>
          <h1 className="font-lora text-3xl sm:text-4xl font-semibold mt-4 text-[#111111]">
            {event?.title}
          </h1>
          <p className="font-sans text-sm text-[#0f172a] mt-2 font-medium">
            {event?.date ? new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
          </p>
        </div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md px-6 py-8 mx-auto -mt-8 relative z-20 bg-white rounded-3xl shadow-xl shadow-neutral-200/50 border border-neutral-100 flex flex-col items-center">
        <h2 className="font-lora text-xl font-medium text-center mb-1">Welcome Guests</h2>
        <p className="font-sans text-xs text-neutral-500 text-center mb-6">
          Log in with your social account to instantly find your photos using face recognition
        </p>

        {/* OAuth Buttons Container */}
        <div className="flex flex-col gap-3 w-full items-center">
          {/* Google Button Wrapper */}
          <div id="google-signin-btn" className="w-full flex justify-center min-h-[44px]" />

          {/* Apple Sign-In Button */}
          <button 
            onClick={() => alert('Apple Sign-In is coming soon. Please use Google Sign-In to log in.')}
            className="flex items-center justify-center gap-3 w-[280px] h-[44px] border border-neutral-300 rounded-lg px-4 bg-black text-white hover:bg-neutral-900 transition-colors"
          >
            {/* Apple Icon */}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.7-1.13 1.84-.99 2.94.12 0 .24.01.36.01.9 0 2-.62 2.46-1.34z"/>
            </svg>
            <span className="font-sans text-sm font-semibold">Sign in with Apple</span>
          </button>
        </div>
      </div>

      {/* Brand Footer */}
      <footer className="mt-12 text-center">
        <p className="font-sans text-xs text-neutral-400">
          Powered by <span className="font-semibold text-neutral-600">Misty Visuals</span>
        </p>
      </footer>

      {/* Phone Number Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-neutral-100 shadow-2xl animate-waterfall">
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
