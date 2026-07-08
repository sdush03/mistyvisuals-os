'use client'

import React, { useState, useEffect } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/navigation'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'

interface FamilyEvent {
  id: number
  title: string
  slug: string
  date: string
  coverPhotoUrl: string | null
  coverPhotoMobileUrl: string | null
  matchedCount: number
  eventToken: string
  guestInfo: {
    id: number
    name: string
    email: string
    phoneNumber: string | null
    hasFullAccess: boolean
  }
}

export default function FamilyPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)

  useEffect(() => {
    // Check if token exists in localStorage
    const savedToken = localStorage.getItem('mv_family_token')
    const savedProfile = localStorage.getItem('mv_family_profile')
    if (savedToken && savedProfile) {
      setToken(savedToken)
      setProfile(JSON.parse(savedProfile))
      fetchEvents(savedToken)
    } else {
      setLoading(false)
    }
  }, [])

  // Initialize Google Sign-in on mount if script is ready and not logged in
  useEffect(() => {
    if (!token && typeof window !== 'undefined' && (window as any).google) {
      initializeGoogle()
    }
  }, [token])

  const fetchEvents = async (authToken: string) => {
    try {
      setLoading(true)
      const res = await fetch(`${apiUrl}/api/gallery/family/events`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          handleLogout()
          throw new Error('Session expired. Please log in again.')
        }
        throw new Error('Failed to load your weddings')
      }
      const data = await res.json()
      setEvents(data.events || [])
      if (data.selfieUrl) {
        setSelfieUrl(`${apiUrl}${data.selfieUrl}`)
      }
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const initializeGoogle = () => {
    const google = (window as any).google
    const btnContainer = document.getElementById('google-signin-btn')
    if (!google || !btnContainer) return

    google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '1047124976775-mock.apps.googleusercontent.com',
      callback: handleGoogleCredentialResponse
    })

    google.accounts.id.renderButton(
      btnContainer,
      { theme: 'filled_black', size: 'large', width: '280', shape: 'rectangular' }
    )
  }

  const handleGoogleCredentialResponse = async (response: any) => {
    try {
      setLoading(true)
      const res = await fetch(`${apiUrl}/api/gallery/family/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: response.credential
        })
      })

      if (!res.ok) throw new Error('Google authentication failed')
      const data = await res.json()

      localStorage.setItem('mv_family_token', data.token)
      localStorage.setItem('mv_family_profile', JSON.stringify(data.profile))
      setToken(data.token)
      setProfile(data.profile)
      fetchEvents(data.token)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('mv_family_token')
    localStorage.removeItem('mv_family_profile')
    setToken(null)
    setProfile(null)
    setEvents([])
    setSelfieUrl(null)
    setError(null)
    // Reinitialize google signin button on next tick
    setTimeout(() => {
      initializeGoogle()
    }, 100)
  }

  const handleEnterEventGallery = (ev: FamilyEvent) => {
    // Inject the event-specific guest token and details into localStorage
    localStorage.setItem(`mv_gallery_token_${ev.slug}`, ev.eventToken)
    localStorage.setItem(`mv_gallery_guest_${ev.slug}`, JSON.stringify(ev.guestInfo))
    // Direct routing to the wedding photos subpage
    router.push(`/${ev.slug}/gallery/photos`)
  }

  const formatEventDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch (e) {
      return dateStr
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d0d',
      color: '#fff',
      fontFamily: 'Outfit, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem 1rem'
    }}>
      <Script 
        src="https://accounts.google.com/gsi/client" 
        onLoad={initializeGoogle}
        strategy="afterInteractive"
      />

      {/* Header / Logo */}
      <header style={{
        width: '100%',
        maxWidth: '1200px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '3rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        paddingBottom: '1rem'
      }}>
        <a href="https://mistyvisuals.com" target="_blank" rel="noopener noreferrer">
          <img 
            src="/logo-white.png" 
            alt="Misty Visuals Logo" 
            style={{ height: '3.5rem', width: 'auto', objectFit: 'contain' }} 
          />
        </a>

        {token && profile && (
          <button 
            onClick={handleLogout}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#999',
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(255, 0, 0, 0.2)'
              e.currentTarget.style.color = '#ff6b6b'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              e.currentTarget.style.color = '#999'
            }}
          >
            Sign Out
          </button>
        )}
      </header>

      {/* Main Container */}
      <main style={{
        width: '100%',
        maxWidth: '1200px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '5rem 0'
          }}>
            <div className="spinner" style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(255,255,255,0.05)',
              borderTop: '3px solid #b8985c',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '1rem'
            }}></div>
            <p style={{ color: '#888' }}>Loading your family portal...</p>
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : !token ? (
          /* Login Card */
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '24px',
            padding: '3rem 2rem',
            width: '100%',
            maxWidth: '480px',
            textAlign: 'center',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            marginTop: '2rem'
          }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 500,
              marginBottom: '1rem',
              background: 'linear-gradient(135deg, #fff 0%, #b8985c 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px'
            }}>Misty Visuals Family</h1>
            <p style={{
              color: '#888',
              fontSize: '0.975rem',
              lineHeight: 1.5,
              marginBottom: '2rem'
            }}>
              Welcome to the family. Sign in with Google to view all the weddings you've unlocked and access your matched photos instantly.
            </p>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.875rem',
                marginBottom: '1.5rem',
                textAlign: 'left'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div id="google-signin-btn"></div>
            </div>
          </div>
        ) : (
          /* Logged In Dashboard */
          <div style={{ width: '100%' }}>
            {/* User Welcoming Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '20px',
              padding: '1.5rem 2rem',
              marginBottom: '3rem',
              width: '100%'
            }}>
              {selfieUrl ? (
                <img 
                  src={selfieUrl} 
                  alt="Profile selfie" 
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #b8985c',
                    boxShadow: '0 0 12px rgba(184, 152, 92, 0.3)'
                  }} 
                />
              ) : (
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #b8985c 0%, #d4af37 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#000'
                }}>
                  {profile.name ? profile.name.charAt(0).toUpperCase() : 'M'}
                </div>
              )}

              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 500, margin: 0, color: '#fff' }}>
                  Hello, {profile.name || 'Friend'}!
                </h2>
                <p style={{ color: '#888', margin: '0.25rem 0 0 0', fontSize: '0.93rem' }}>
                  {events.length === 0 
                    ? 'Welcome to the Misty Visuals Family.'
                    : `You have matched photos in ${events.length} wedding${events.length > 1 ? 's' : ''}.`
                  }
                </p>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                fontSize: '0.875rem',
                marginBottom: '2rem'
              }}>
                {error}
              </div>
            )}

            {/* Weddings Grid */}
            {events.length === 0 ? (
              /* Empty State */
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px solid rgba(255, 255, 255, 0.03)',
                borderRadius: '24px',
                maxWidth: '600px',
                margin: '0 auto'
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.75rem', color: '#b8985c' }}>
                  No weddings unlocked yet
                </h3>
                <p style={{ color: '#666', fontSize: '0.93rem', lineHeight: 1.6, margin: 0 }}>
                  You haven't logged into any wedding galleries. Open a direct link shared by the bride and groom to view your photos and add that wedding to your profile dashboard.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '2rem',
                width: '100%'
              }}>
                {events.map((ev) => (
                  <div 
                    key={ev.id}
                    onClick={() => handleEnterEventGallery(ev)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      borderRadius: '20px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-6px)'
                      e.currentTarget.style.borderColor = 'rgba(184, 152, 92, 0.3)'
                      e.currentTarget.style.boxShadow = '0 12px 30px rgba(184, 152, 92, 0.15)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)'
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
                    }}
                  >
                    {/* Cover Photo */}
                    <div style={{ width: '100%', height: '200px', background: '#1c1c1c', position: 'relative' }}>
                      {ev.coverPhotoUrl ? (
                        <img 
                          src={`${apiUrl}${ev.coverPhotoUrl}`} 
                          alt={ev.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#333',
                          fontSize: '3rem'
                        }}>
                          📷
                        </div>
                      )}

                      {/* Matched Count Pill */}
                      {ev.matchedCount > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '1rem',
                          right: '1rem',
                          background: 'linear-gradient(135deg, #b8985c 0%, #a38249 100%)',
                          color: '#000',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '30px',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <span>✨</span>
                          <span>{ev.matchedCount} Photo{ev.matchedCount > 1 ? 's' : ''} of You</span>
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div style={{ padding: '1.5rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 500, margin: '0 0 0.5rem 0', color: '#fff' }}>
                        {ev.title}
                      </h3>
                      <p style={{ color: '#666', fontSize: '0.875rem', margin: '0 0 1.5rem 0' }}>
                        📅 {formatEventDate(ev.date)}
                      </p>

                      <button style={{
                        width: '100%',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#b8985c',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        fontWeight: 500,
                        fontSize: '0.93rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #b8985c 0%, #a38249 100%)'
                        e.currentTarget.style.color = '#000'
                        e.currentTarget.style.borderColor = 'transparent'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#b8985c'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      }}
                      >
                        Enter Gallery
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: '5rem',
        color: '#333',
        fontSize: '0.8rem',
        borderTop: '1px solid rgba(255,255,255,0.02)',
        paddingTop: '1.5rem',
        width: '100%',
        textAlign: 'center'
      }}>
        © {new Date().getFullYear()} Misty Visuals. All rights reserved.
      </footer>
    </div>
  )
}
