'use client'

import { useState, useEffect, useRef, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string }>
}

export default function GuestGalleryPhotos({ params }: Props) {
  const { slug } = use(params)
  const router = useRouter()
  
  const [event, setEvent] = useState<any>(null)
  const [guest, setGuest] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)

  // Helper to fetch selfie image with auth and return a blob URL
  const fetchAuthenticatedSelfie = async (selfieGuestId: number) => {
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    if (!token) return
    try {
      const res = await fetch(`${apiUrl}/api/gallery/family/selfie/${selfieGuestId}?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const blob = await res.blob()
        setSelfiePreview(prev => {
          if (prev && prev.startsWith('blob:')) {
            URL.revokeObjectURL(prev)
          }
          return URL.createObjectURL(blob)
        })
      }
    } catch (err) {
      console.error('Failed to load selfie:', err)
    }
  }

  // Cleanup selfiePreview Blob URL on unmount
  useEffect(() => {
    return () => {
      if (selfiePreview && selfiePreview.startsWith('blob:')) {
        URL.revokeObjectURL(selfiePreview)
      }
    }
  }, [selfiePreview])

  const [activePhoto, setActivePhoto] = useState<any | null>(null)
  const [loadingMatched, setLoadingMatched] = useState(false)

  // Profile states
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [newSelfieFile, setNewSelfieFile] = useState<File | null>(null)
  const [newSelfiePreview, setNewSelfiePreview] = useState<string | null>(null)

  // Cleanup newSelfiePreview Blob URL on unmount or change
  useEffect(() => {
    return () => {
      if (newSelfiePreview && newSelfiePreview.startsWith('blob:')) {
        URL.revokeObjectURL(newSelfiePreview)
      }
    }
  }, [newSelfiePreview])
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [phoneValidationError, setPhoneValidationError] = useState<string | null>(null)
  const [shakePhone, setShakePhone] = useState(false)

  // Tabs & Views
  const [viewMode, setViewMode] = useState<'matched' | 'all' | 'favorites'>('all')
  const [allPhotos, setAllPhotos] = useState<any[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [activeAllTab, setActiveAllTab] = useState<string>('')


  
  // Masonry layout and Lightbox navigation states
  const [cols, setCols] = useState(4)
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null)

  useEffect(() => {
    const updateCols = () => {
      if (typeof window !== 'undefined') {
        if (window.innerWidth <= 640) setCols(2)
        else if (window.innerWidth <= 1024) setCols(3)
        else setCols(4)
      }
    }
    updateCols()
    window.addEventListener('resize', updateCols)
    return () => window.removeEventListener('resize', updateCols)
  }, [])

  // Track currently active list of photos for dynamic preload & lightbox
  const activePhotosList = useMemo(() => {
    if (viewMode === 'matched') {
      return photos || []
    } else if (viewMode === 'all') {
      return allPhotos.filter(p => !activeAllTab || p.tabName === activeAllTab)
    } else if (viewMode === 'favorites') {
      return allPhotos.filter(p => p.isLiked)
    }
    return []
  }, [viewMode, photos, allPhotos, activeAllTab])

  // Preload natural aspects
  useEffect(() => {
    activePhotosList.forEach((photo: any) => {
      const id = photo.id || photo.r2Url
      if (aspects[id]) return
      const img = new Image()
      img.src = photo.r2Url
      img.onload = () => {
        setAspects(prev => {
          if (prev[id] === img.naturalWidth / img.naturalHeight) return prev
          return { ...prev, [id]: img.naturalWidth / img.naturalHeight }
        })
      }
    })
  }, [activePhotosList, aspects])

  // Lightbox keyboard arrows handler
  const handlePrevPhoto = () => {
    if (activePhotoIndex !== null && activePhotoIndex > 0) {
      setActivePhotoIndex(activePhotoIndex - 1)
    }
  }

  const handleNextPhoto = () => {
    if (activePhotoIndex !== null && activePhotoIndex < activePhotosList.length - 1) {
      setActivePhotoIndex(activePhotoIndex + 1)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePhotoIndex === null) return
      if (e.key === 'Escape') setActivePhotoIndex(null)
      if (e.key === 'ArrowRight') handleNextPhoto()
      if (e.key === 'ArrowLeft') handlePrevPhoto()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePhotoIndex, activePhotosList])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = activePhotoIndex !== null ? 'hidden' : ''
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = ''
      }
    }
  }, [activePhotoIndex])

  const getBalancedColumns = (photosList: any[]) => {
    const columns: any[][] = Array.from({ length: cols }, () => [])
    const colHeights = Array(cols).fill(0)

    photosList.forEach((photo, index) => {
      const id = photo.id || photo.r2Url
      const isLandscape = aspects[id] ? aspects[id] > 1.1 : false

      let gridAspect = '2/3'
      if (isLandscape) {
        gridAspect = '3/2'
      } else {
        const cycle = index % 3
        if (cycle === 0) gridAspect = '2/3'
        else if (cycle === 1) gridAspect = '3/4'
        else gridAspect = '4/5'
      }

      const numAspect = isLandscape ? 1.5 : (gridAspect === '2/3' ? 2/3 : (gridAspect === '3/4' ? 3/4 : 4/5))
      const heightContribution = 1 / numAspect

      let shortestIdx = 0
      let minHeight = colHeights[0]
      for (let i = 1; i < cols; i++) {
        if (colHeights[i] < minHeight) {
          minHeight = colHeights[i]
          shortestIdx = i
        }
      }

      columns[shortestIdx].push({
        ...photo,
        _gridAspect: gridAspect
      })
      colHeights[shortestIdx] += heightContribution
    })

    return columns
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

  // Categorize unique event tab names from all photos
  // All tabs (including "Highlights") only show if they have >= 1 photo.
  // If guest is not full access, ONLY show "Highlights" tab.
  const allPhotosTabs = useMemo(() => {
    const eventTabs: string[] = event?.tabs || []
    const tabsWithPhotos = new Set<string>()
    allPhotos.forEach(p => {
      if (p.tabName) tabsWithPhotos.add(p.tabName)
    })
    // Keep only event tabs that have photos, preserving their order
    let merged = eventTabs.filter(tab => tabsWithPhotos.has(tab))
    // Append any photo tabs not already in the event tabs list
    tabsWithPhotos.forEach(tab => {
      if (!merged.includes(tab)) merged.push(tab)
    })
    // If guest is not full access, only show Highlights
    if (guest && !guest.hasFullAccess) {
      merged = merged.filter(tab => tab === 'Highlights')
    }
    return merged
  }, [allPhotos, event, guest])

  // Automatically select the first event tab when photos load
  // useEffect(() => {
  //   if (allPhotosTabs.length > 0 && !activeAllTab) {
  //     setActiveAllTab(allPhotosTabs[0])
  //   }
  // }, [allPhotosTabs, activeAllTab])

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    const savedGuest = localStorage.getItem(`mv_gallery_guest_${slug}`)
    
    if (!token || !savedGuest) {
      router.push(`/${slug}/gallery`)
      return
    }

    const parsedGuest = JSON.parse(savedGuest)
    if (!parsedGuest.phoneNumber || !parsedGuest.hasSelfie) {
      router.push(`/${slug}/gallery`)
      return
    }

    setGuest(parsedGuest)
    if (parsedGuest.hasSelfie) {
      fetchAuthenticatedSelfie(parsedGuest.id)
    }
    if (parsedGuest.hasFullAccess) {
      setViewMode('all')
    } else {
      setViewMode('matched')
    }

    // Fetch public event details
    fetch(`${apiUrl}/api/gallery/public/events/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Gallery not found')
        return res.json()
      })
      .then(data => {
        setEvent(data)
        // Background load counts
        loadAllPhotos()
        // Load matched photos
        loadMatchedPhotos()
      })
      .catch(() => {
        localStorage.removeItem(`mv_gallery_token_${slug}`)
        localStorage.removeItem(`mv_gallery_guest_${slug}`)
        router.push(`/${slug}/gallery`)
      })

    // Sync profile source of truth from database
    fetch(`${apiUrl}/api/gallery/public/events/${slug}/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (res.ok) return res.json()
      })
      .then(data => {
        if (data && data.profile) {
          const updatedGuest = {
            ...parsedGuest,
            name: data.profile.name,
            phoneNumber: data.profile.phoneNumber,
            hasSelfie: data.profile.hasSelfie
          }
          localStorage.setItem(`mv_gallery_guest_${slug}`, JSON.stringify(updatedGuest))
          setGuest(updatedGuest)
          
          if (data.profile.selfieGuestId) {
            fetchAuthenticatedSelfie(data.profile.selfieGuestId)
          }
        }
      })
      .catch(err => {
        console.error('Failed to sync guest profile:', err)
      })
  }, [slug, router, apiUrl])

  // Lock body scroll and handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowProfileModal(false)
      }
    }

    if (showProfileModal) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showProfileModal])

  const loadMatchedPhotos = async () => {
    setLoadingMatched(true)
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/matched-photos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!res.ok) throw new Error('Failed to load matched photos')
      const data = await res.json()
      setPhotos(data.photos || [])
      setHasSearched(true)
    } catch (err) {
      console.error('Failed to load matched photos automatically:', err)
    } finally {
      setLoadingMatched(false)
    }
  }

  const [showHeartPop, setShowHeartPop] = useState(false)
  const heartPopTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleLightboxDoubleTap = async (photoId: number, isCurrentlyLiked: boolean) => {
    if (heartPopTimeoutRef.current) {
      clearTimeout(heartPopTimeoutRef.current)
    }
    setShowHeartPop(true)
    heartPopTimeoutRef.current = setTimeout(() => {
      setShowHeartPop(false)
    }, 800)

    if (!isCurrentlyLiked) {
      await toggleLikeOnPhoto(photoId)
    }
  }

  const lastTapRef = useRef(0)

  const toggleLikeOnPhoto = async (photoId: number) => {
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    if (!token) return

    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/photos/${photoId}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!res.ok) throw new Error('Failed to toggle like')
      const data = await res.json()

      // Update in allPhotos state
      setAllPhotos(prev => prev.map(p => {
        if (p.id === photoId) {
          return { ...p, isLiked: data.liked, likeCount: data.likeCount }
        }
        return p
      }))

      // Update in matched photos state
      setPhotos(prev => prev.map(p => {
        if (p.id === photoId) {
          return { ...p, isLiked: data.liked, likeCount: data.likeCount }
        }
        return p
      }))

    } catch (err) {
      console.error('Like toggle error:', err)
    }
  }

  const loadAllPhotos = async () => {
    if (allPhotos.length > 0) return
    setLoadingAll(true)
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    try {
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/photos`, { headers })
      if (!res.ok) throw new Error('Failed to load photos')
      const data = await res.json()
      setAllPhotos(data.photos || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAll(false)
    }
  }



  const handleSelfieUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.warn('Blob download failed, falling back to direct link:', err)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview of selfie
    const reader = new FileReader()
    reader.onloadend = () => {
      setSelfiePreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setSearching(true)
    setErrorSearch('')
    setViewMode('matched')

    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    const formData = new FormData()
    formData.append('selfie', file)

    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!res.ok) throw new Error('Face matching failed. Please try a different photo.')
      const data = await res.json()
      
      setPhotos(data.photos || [])
      setHasSearched(true)
    } catch (err: any) {
      setErrorSearch(err.message)
    } finally {
      setSearching(false)
    }
  }

  const [errorSearch, setErrorSearch] = useState('')

  const handleLogout = () => {
    // Clear ALL gallery and circle tokens — not just current slug
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (
        key?.startsWith('mv_gallery_token_') ||
        key?.startsWith('mv_gallery_guest_') ||
        key === 'mv_circle_token' ||
        key === 'mv_circle_profile'
      ) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    router.push(`/${slug}/gallery`)
  }

  const openProfile = () => {
    if (!guest) return
    setEditName(guest.name || '')
    setEditPhone(guest.phoneNumber || '')
    setNewSelfieFile(null)
    setNewSelfiePreview(null)
    setUpdateError(null)
    setPhoneValidationError(null)
    setShakePhone(false)
    setShowProfileModal(true)
  }

  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setNewSelfieFile(file)
      setNewSelfiePreview(URL.createObjectURL(file))
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = localStorage.getItem(`mv_gallery_token_${slug}`)
    if (!token) return

    setUpdatingProfile(true)
    setUpdateError(null)
    setPhoneValidationError(null)

    // Standard phone number validation
    if (editPhone) {
      const cleanNum = editPhone.replace(/[\s\-\(\)\+]/g, '')
      const looksLikeIndian = cleanNum.length === 10 || (cleanNum.length === 11 && cleanNum.startsWith('0')) || (cleanNum.length === 12 && cleanNum.startsWith('91'))
      
      let isValid = false
      if (looksLikeIndian) {
        isValid = /^(?:91|0)?[6-9]\d{9}$/.test(cleanNum)
      } else {
        isValid = /^[1-9]\d{9,14}$/.test(cleanNum)
      }

      if (!isValid) {
        let errorMsg = 'Please enter a valid mobile number (including country code)'
        if (cleanNum.length === 10 && !/^[6-9]/.test(cleanNum)) {
          errorMsg = 'Invalid Indian number (must start with 6-9). For international numbers, add the country code (e.g. +1...)'
        }
        setPhoneValidationError(errorMsg)
        setShakePhone(true)
        setTimeout(() => setShakePhone(false), 400)
        setUpdatingProfile(false)
        return
      }
    }

    try {
      const formData = new FormData()
      formData.append('name', editName)
      formData.append('phoneNumber', editPhone)
      if (newSelfieFile) {
        formData.append('selfie', newSelfieFile)
      }

      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/profile/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const data = await res.json()
      // Update local storage guest data
      const updatedGuest = {
        ...guest,
        name: data.profile.name,
        phoneNumber: data.profile.phoneNumber,
        hasSelfie: data.profile.hasSelfie
      }
      localStorage.setItem(`mv_gallery_guest_${slug}`, JSON.stringify(updatedGuest))
      setGuest(updatedGuest)

      // Re-load selfie image preview URL
      if (data.profile.selfieGuestId) {
        fetchAuthenticatedSelfie(data.profile.selfieGuestId)
      }

      setShowProfileModal(false)
      // Reload matched photos since selfie has changed!
      loadMatchedPhotos()
    } catch (err: any) {
      setUpdateError(err.message)
    } finally {
      setUpdatingProfile(false)
    }
  }



  return (
    <div className="relative min-h-screen w-full bg-white text-[#111111] flex flex-col justify-between">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heartPop {
          0% { transform: scale(0); opacity: 0; }
          15% { transform: scale(1.2); opacity: 0.9; }
          30% { transform: scale(1); opacity: 0.9; }
          80% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .animate-heart-pop {
          animation: heartPop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .gallery-item img {
          transition: transform 0.4s ease-out !important;
        }
        .gallery-item:hover img {
          transform: scale(1.02) !important;
        }
      `}} />
      
      {/* ── Full-bleed Cover ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100svh',
        minHeight: '560px',
        overflow: 'hidden',
        background: '#111',
      }}>
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
        }} />

        {/* Brand & Sign Out button — top right */}
        <div style={{
          position: 'absolute', top: '2rem', right: '2rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          zIndex: 40,
        }}>
          <button 
            onClick={openProfile}
            className="text-[10px] font-sans text-white hover:text-[#111] hover:bg-white border border-white/40 rounded-full px-4 py-1.5 transition-colors cursor-pointer uppercase tracking-wider font-semibold flex items-center gap-1.5"
          >
            {selfiePreview ? (
              <img 
                src={selfiePreview} 
                alt="Selfie" 
                style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover' }} 
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <span>👤</span>
            )}
            My Profile
          </button>
          <button 
            onClick={handleLogout}
            className="text-[10px] font-sans text-white hover:text-[#111] hover:bg-white border border-white/40 rounded-full px-4 py-1.5 transition-colors cursor-pointer uppercase tracking-wider font-semibold"
          >
            Sign Out
          </button>
        </div>

        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '0 2rem',
          justifyContent: 'center'
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
              marginBottom: '2.5rem',
            }}>
              {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}

          {/* Scroll CTA */}
          <a
            href="#details"
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById('details');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.5625rem',
              fontWeight: 500,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: '#fff',
              border: '1px solid #fff',
              padding: '0.9rem 2.25rem',
              textDecoration: 'none',
              transition: 'background 0.3s, border-color 0.3s',
            }}
            className="cover-cta"
          >
            View Gallery
          </a>
        </div>

        {/* Photo count — bottom left */}
        {allPhotos.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '1.75rem', left: 'clamp(0.75rem, 3vw, 2.5rem)',
            fontFamily: "'Montserrat', system-ui, sans-serif",
            fontSize: 'clamp(0.5rem, 1vw, 0.5875rem)',
            letterSpacing: '0.22em', color: '#fff',
            textTransform: 'uppercase',
            fontWeight: 300,
            zIndex: 10,
          }}>
            {allPhotos.length} photographs
          </div>
        )}

        {/* Logo — static, centred, slightly above the arrow, clickable */}
        <a href="https://www.mistyvisuals.com" target="_blank" rel="noopener noreferrer" style={{
          position: 'absolute', bottom: '4rem', left: '50%',
          transform: 'translateX(-50%)',
          width: '112px', zIndex: 10,
          display: 'block'
        }}>
          <img
            src="/logo-white.png"
            alt="Misty Visuals"
            style={{ width: '100%', display: 'block', opacity: 1 }}
          />
        </a>

        {/* Scroll down chevron */}
        <div className="scroll-chevron" style={{
          position: 'absolute', bottom: '1.75rem', left: '50%', transform: 'translateX(-50%)',
        }}>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round">
            <polyline points="1,1 7,7 13,1" />
          </svg>
        </div>
      </div>

      {/* ── Couple Details ── */}
      <div id="details" style={{ 
        background: '#fff', 
        padding: 'clamp(2rem, 4vh, 4rem) clamp(0.75rem, 3vw, 2.5rem)',
        textAlign: 'left',
        maxWidth: '800px',
        margin: '0',
        width: '100%',
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&display=swap" rel="stylesheet" />
        <h1 style={{
          fontFamily: "'Montserrat', system-ui, sans-serif",
          fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
          fontWeight: 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#1c1a18',
          margin: '0 0 0.5rem 0',
          lineHeight: '1.2',
        }}>
          {(event?.title || '').replace(/'s\s+Wedding/gi, '').replace('&', '').replace(/\s+/g, ' ').trim()}
        </h1>
        
        {event?.date && (
          <p style={{
            fontFamily: "'Montserrat', system-ui, sans-serif",
            fontSize: '0.625rem',
            fontWeight: 500,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#4a4540',
            margin: '0',
          }}>
            {new Date(event.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>

      {/* Navigation Tabs */}
      <div id="gallery-tabs" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-100 w-full" style={{ padding: '1.5rem 0 0.5rem' }}>
        <div className="flex gap-12 w-full px-[clamp(0.75rem,3vw,2.5rem)] justify-start">
          {/* ALL Tab */}
          {guest?.hasFullAccess && (
            <button 
              onClick={() => {
                setViewMode('all');
                setActiveAllTab('');
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '0.6875rem',
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: (viewMode === 'all' && activeAllTab === '') ? '#1c1a18' : '#8c867e',
                paddingBottom: '0.25rem',
                borderBottom: (viewMode === 'all' && activeAllTab === '') ? '1px solid #1c1a18' : '1px solid transparent',
                transition: 'all 0.2s',
                fontWeight: 400
              }}
            >
              All
            </button>
          )}

          {/* MY PHOTOS Tab */}
          <button 
            onClick={() => {
              setViewMode('matched');
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '0.6875rem',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: viewMode === 'matched' ? '#1c1a18' : '#8c867e',
              paddingBottom: '0.25rem',
              borderBottom: viewMode === 'matched' ? '1px solid #1c1a18' : '1px solid transparent',
              transition: 'all 0.2s',
              fontWeight: 400
            }}
          >
            My Photos
          </button>

          {/* MY FAVORITES Tab */}
          <button 
            onClick={() => {
              setViewMode('favorites');
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '0.6875rem',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: viewMode === 'favorites' ? '#1c1a18' : '#8c867e',
              paddingBottom: '0.25rem',
              borderBottom: viewMode === 'favorites' ? '1px solid #1c1a18' : '1px solid transparent',
              transition: 'all 0.2s',
              fontWeight: 400
            }}
          >
            My Favorites
          </button>

          {/* Dynamic Event Tabs */}
          {allPhotosTabs.map(tab => (
            <button
              key={tab}
              onClick={() => {
                setViewMode('all');
                setActiveAllTab(tab);
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '0.6875rem',
                letterSpacing: '0.15em', textTransform: 'uppercase',
                color: (viewMode === 'all' && activeAllTab === tab) ? '#1c1a18' : '#8c867e',
                paddingBottom: '0.25rem',
                borderBottom: (viewMode === 'all' && activeAllTab === tab) ? '1px solid #1c1a18' : '1px solid transparent',
                transition: 'all 0.2s',
                fontWeight: 400
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 w-full pb-8 pt-0 flex flex-col items-stretch">
        
        {/* VIEW MODE: MATCHED */}
        {viewMode === 'matched' && (
          <div className="w-full flex flex-col items-center animate-waterfall">
            {loadingMatched ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0f172a] border-t-transparent mb-4"></div>
                <p className="font-sans text-xs text-neutral-500">Finding your photos...</p>
              </div>
            ) : photos.length > 0 ? (
              <div style={{ display: 'flex', gap: '12px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 3vw, 2.5rem) 32px' }} className="story-masonry">
                {getBalancedColumns(photos).map((colPhotos, colIdx) => (
                  <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {colPhotos.map((p: any) => {
                      const globalIdx = photos.findIndex(item => item.r2Url === p.r2Url)
                      return (
                        <div
                          key={p.r2Url}
                          onClick={() => setActivePhotoIndex(globalIdx)}
                          style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                          className="gallery-item group"
                        >
                          <img src={p.thumbnailUrl || p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {/* Download Button (Top-Right) */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(p.r2Url, p.filename);
                            }}
                            style={{ transition: 'all 0.2s' }}
                            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 shadow-sm hover:bg-white"
                          >
                            <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                          </div>

                          {/* Heart/Like Badge (Bottom-Right) */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLikeOnPhoto(p.id);
                            }}
                            style={{ transition: 'all 0.2s' }}
                            className={`absolute bottom-3 right-3 z-10 flex items-center gap-1.5 cursor-pointer select-none ${
                              p.likeCount > 0 || p.isLiked 
                                ? 'opacity-100' 
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {p.isLiked ? (
                              <svg className="w-5 h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] fill-current text-red-500" viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            ) : (
                              <svg 
                                className="w-5 h-5" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="white" 
                                strokeWidth="2.2"
                                style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.85))' }}
                              >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            )}
                            {p.likeCount > 0 && (
                              <span 
                                style={{ 
                                  color: 'white', 
                                  textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 1px 1px rgba(0,0,0,0.9)',
                                  fontFamily: 'system-ui, sans-serif'
                                }} 
                                className="text-xs font-bold"
                              >
                                {p.likeCount}
                              </span>
                            )}
                          </div>
                          

                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="font-lora text-lg text-neutral-600 mb-2">No matching photos found</p>
                <p className="font-sans text-xs text-neutral-400 max-w-xs mx-auto">
                  We couldn't find any photos matching your selfie. If more photos are uploaded later, we'll scan them automatically!
                </p>
              </div>
            )}
          </div>
        )}

        {/* VIEW MODE: MY FAVORITES */}
        {viewMode === 'favorites' && (
          <div className="w-full flex flex-col items-center animate-waterfall">
            {allPhotos.filter(p => p.isLiked).length > 0 ? (
              <div style={{ display: 'flex', gap: '12px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 3vw, 2.5rem) 32px' }} className="story-masonry">
                {getBalancedColumns(allPhotos.filter(p => p.isLiked)).map((colPhotos, colIdx) => (
                  <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {colPhotos.map((p: any) => {
                      const globalIdx = allPhotos.filter(p => p.isLiked).findIndex(item => item.r2Url === p.r2Url)
                      return (
                        <div
                          key={p.r2Url}
                          onClick={() => setActivePhotoIndex(globalIdx)}
                          style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                          className="gallery-item group"
                        >
                          <img src={p.thumbnailUrl || p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {/* Download Button (Top-Right) */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(p.r2Url, p.filename);
                            }}
                            style={{ transition: 'all 0.2s' }}
                            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 shadow-sm hover:bg-white"
                          >
                            <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                          </div>

                          {/* Heart/Like Badge (Bottom-Right) */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLikeOnPhoto(p.id);
                            }}
                            style={{ transition: 'all 0.2s' }}
                            className={`absolute bottom-3 right-3 z-10 flex items-center gap-1.5 cursor-pointer select-none ${
                              p.likeCount > 0 || p.isLiked 
                                ? 'opacity-100' 
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {p.isLiked ? (
                              <svg className="w-5 h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] fill-current text-red-500" viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            ) : (
                              <svg 
                                className="w-5 h-5" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="white" 
                                strokeWidth="2.2"
                                style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.85))' }}
                              >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                              </svg>
                            )}
                            {p.likeCount > 0 && (
                              <span 
                                style={{ 
                                  color: 'white', 
                                  textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 1px 1px rgba(0,0,0,0.9)',
                                  fontFamily: 'system-ui, sans-serif'
                                }} 
                                className="text-xs font-bold"
                              >
                                {p.likeCount}
                              </span>
                            )}
                          </div>
                          

                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="font-lora text-lg text-neutral-600 mb-2">No favorites selected yet</p>
                <p className="font-sans text-xs text-neutral-400 max-w-xs mx-auto">
                  Double-tap any photo in the viewer to add it to your favorites!
                </p>
              </div>
            )}
          </div>
        )}


        {/* VIEW MODE: BROWSE ALL PHOTOS */}
        {viewMode === 'all' && (
          <div className="w-full flex flex-col items-center animate-waterfall">
            {loadingAll ? (
              <div className="flex py-20 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0f172a] border-t-transparent"></div>
              </div>
            ) : allPhotos.length > 0 ? (
              <>
                {/* Filtered Grid */}
                {(() => {
                  const filteredList = allPhotos.filter(p => !activeAllTab || p.tabName === activeAllTab);
                  return (
                    <div style={{ display: 'flex', gap: '12px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 3vw, 2.5rem) 32px' }} className="story-masonry">
                      {getBalancedColumns(filteredList).map((colPhotos, colIdx) => (
                        <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {colPhotos.map((p: any) => {
                            const globalIdx = filteredList.findIndex(item => item.r2Url === p.r2Url)
                            return (
                              <div
                                key={p.r2Url}
                                onClick={() => setActivePhotoIndex(globalIdx)}
                                style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                                className="gallery-item group"
                              >
                                <img src={p.thumbnailUrl || p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                {/* Download Button (Top-Right) */}
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(p.r2Url, p.filename);
                                  }}
                                  style={{ transition: 'all 0.2s' }}
                                  className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 shadow-sm hover:bg-white"
                                >
                                  <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                                  </svg>
                                </div>

                                {/* Heart/Like Badge (Bottom-Right) */}
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLikeOnPhoto(p.id);
                                  }}
                                  style={{ transition: 'all 0.2s' }}
                                  className={`absolute bottom-3 right-3 z-10 flex items-center gap-1.5 cursor-pointer select-none ${
                                    p.likeCount > 0 || p.isLiked 
                                      ? 'opacity-100' 
                                      : 'opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  {p.isLiked ? (
                                    <svg className="w-5 h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] fill-current text-red-500" viewBox="0 0 24 24">
                                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                    </svg>
                                  ) : (
                                    <svg 
                                      className="w-5 h-5" 
                                      viewBox="0 0 24 24" 
                                      fill="none" 
                                      stroke="white" 
                                      strokeWidth="2.2"
                                      style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.85))' }}
                                    >
                                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                    </svg>
                                  )}
                                  {p.likeCount > 0 && (
                                    <span 
                                      style={{ 
                                        color: 'white', 
                                        textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 1px 1px rgba(0,0,0,0.9)',
                                        fontFamily: 'system-ui, sans-serif'
                                      }} 
                                      className="text-xs font-bold"
                                    >
                                      {p.likeCount}
                                    </span>
                                  )}
                                </div>
                                

                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-center py-16">
                <p className="font-lora text-lg text-neutral-600 mb-2">No photos in this gallery</p>
                <p className="font-sans text-xs text-neutral-400">
                  Please upload photos using the desktop uploader script.
                </p>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Persistent Brand Lead Capture Footer */}
      <footer className="w-full bg-[#f8f7f3] border-t border-[#e6e3d9] py-16 px-6 mt-16 text-center">
        <div className="max-w-md mx-auto flex flex-col items-center">
          <span className="font-sans text-[10px] uppercase tracking-widest text-[#0f172a] font-semibold mb-2">
            Misty Visuals
          </span>
          <h4 className="font-lora text-xl font-medium mb-3 text-[#111111]">
            Captured by Misty Visuals
          </h4>
          <p className="font-sans text-xs text-neutral-500 mb-6 leading-relaxed">
            Loving your wedding photos? Create a lifetime of memories for your own events. Contact us to learn about our premium wedding and pre-wedding photography collections.
          </p>
          <a 
            href="/contact" 
            target="_blank"
            className="px-6 py-3 bg-[#0f172a] text-white rounded-full font-sans text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-md"
          >
            Inquire About Your Wedding
          </a>
        </div>
      </footer>

      {/* Lightbox / View Modal */}
      {activePhotoIndex !== null && activePhotosList[activePhotoIndex] && (
        <div 
          role="dialog"
          aria-modal
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(10,8,6,0.97)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setActivePhotoIndex(null)}
        >
          {/* Image */}
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
            <img 
              src={activePhotosList[activePhotoIndex].r2Url} 
              alt="" 
              onDoubleClick={() => handleLightboxDoubleTap(activePhotosList[activePhotoIndex].id, activePhotosList[activePhotoIndex].isLiked)}
              onTouchEnd={e => {
                const now = Date.now();
                if (now - lastTapRef.current < 300) {
                  handleLightboxDoubleTap(activePhotosList[activePhotoIndex].id, activePhotosList[activePhotoIndex].isLiked);
                }
                lastTapRef.current = now;
              }}
              style={{
                maxWidth: '96vw', maxHeight: '94vh',
                objectFit: 'contain',
                userSelect: 'none',
                borderRadius: '8px'
              }}
            />
            {showHeartPop && (
              <div 
                className="animate-heart-pop"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  marginTop: '-40px',
                  marginLeft: '-40px',
                  pointerEvents: 'none',
                  color: 'white',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.35))',
                  zIndex: 350
                }}
              >
                <svg className="w-20 h-20 fill-current text-white/95" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Close button */}
          <button 
            onClick={() => setActivePhotoIndex(null)}
            aria-label="Close"
            style={{
              position: 'absolute', top: '1.25rem', right: '1.25rem',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', padding: '0.5rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>

          {/* Prev */}
          {activePhotoIndex > 0 && (
            <button 
              onClick={e => { e.stopPropagation(); handlePrevPhoto() }}
              aria-label="Previous"
              style={{
                position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '1rem', color: 'rgba(255,255,255,0.5)',
              }}
            >
              <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                <polyline points="9,1 1,9 9,17"/>
              </svg>
            </button>
          )}

          {/* Next */}
          {activePhotoIndex < activePhotosList.length - 1 && (
            <button 
              onClick={e => { e.stopPropagation(); handleNextPhoto() }}
              aria-label="Next"
              style={{
                position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '1rem', color: 'rgba(255,255,255,0.5)',
              }}
            >
              <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                <polyline points="1,1 9,9 1,17"/>
              </svg>
            </button>
          )}

             {/* Download Original */}
            <button 
              onClick={() => handleDownload(activePhotosList[activePhotoIndex].r2Url, activePhotosList[activePhotoIndex].filename)}
              className="flex items-center gap-2 bg-white text-neutral-900 px-6 py-2.5 rounded-full font-sans text-xs font-semibold hover:bg-neutral-100 transition-colors shadow-lg cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
              Download Original
            </button>

            {/* Heart/Like Button */}
            <button 
              onClick={() => toggleLikeOnPhoto(activePhotosList[activePhotoIndex].id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-sans text-xs font-semibold transition-all shadow-lg cursor-pointer ${
                activePhotosList[activePhotoIndex].isLiked 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/20 backdrop-blur-xs'
              }`}
            >
              <svg 
                className={`w-4 h-4 fill-current ${activePhotosList[activePhotoIndex].isLiked ? 'text-white' : 'text-white'}`} 
                viewBox="0 0 24 24"
              >
                {activePhotosList[activePhotoIndex].isLiked ? (
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                ) : (
                  <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752a.499.499 0 0 1-.57 0c-.438-.283-1.791-1.51-4.303-3.752C4.549 14.08 1.9 12.194 1.9 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.208.314.51.54.877.643a.502.502 0 0 0 .57-.282 4.21 4.21 0 0 1 3.675-1.941m0-2a6.22 6.22 0 0 0-4.792 2.27A6.22 6.22 0 0 0 7.208 1.9 6.988 6.988 0 0 0 .1 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.098 1.66 1.66 0 0 0 2.184 0 44.997 44.997 0 0 0 3.518-3.098l1.027-.918c.284-.253.568-.5.853-.747 2.466-2.143 5.015-4.36 5.015-7.97a6.988 6.988 0 0 0-7.108-7.222z"/>
                )}
              </svg>
              <span>
                {activePhotosList[activePhotoIndex].isLiked ? 'Liked' : 'Like'} ({activePhotosList[activePhotoIndex].likeCount || 0})
              </span>
            </button>

          {/* Counter */}
          <div style={{
            position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--font-sans)', fontSize: '0.5rem', letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.3)',
          }}>
            {activePhotoIndex + 1} &nbsp;/&nbsp; {activePhotosList.length}
          </div>
        </div>
      )}

      {/* ── My Profile Modal (Linen Aesthetic) ── */}
      {showProfileModal && guest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28, 26, 24, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 350,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid #ddd8d0',
            borderRadius: '2px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5rem 2rem',
              borderBottom: '1px solid #f0ede8'
            }}>
              <h2 style={{
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '0.875rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                margin: 0,
                color: '#1c1a18'
              }}>
                Edit Profile
              </h2>
              <button 
                onClick={() => setShowProfileModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: '#8c867e',
                  lineHeight: 1,
                  padding: 0
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProfile} style={{ padding: '2rem' }}>
              {updateError && (
                <div style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.75rem 1rem',
                  borderRadius: '2px',
                  fontSize: '0.75rem',
                  marginBottom: '1.5rem',
                  fontFamily: 'Montserrat, sans-serif'
                }}>
                  {updateError}
                </div>
              )}

              {/* Selfie Avatar Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '2rem'
              }}>
                <div style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#f8f7f3',
                  border: '1px solid #ddd8d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  marginBottom: '1rem'
                }}>
                  {newSelfiePreview || selfiePreview ? (
                    <img 
                      src={newSelfiePreview || selfiePreview || ''} 
                      alt="Selfie Preview" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '2rem', color: '#ddd8d0' }}>👤</span>
                  )}
                </div>
                <input 
                  type="file"
                  id="selfie-file-input"
                  accept="image/*"
                  onChange={handleSelfieChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('selfie-file-input')?.click()}
                  style={{
                    background: 'none',
                    border: '1px solid #ddd8d0',
                    color: '#1c1a18',
                    padding: '0.4rem 1rem',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    fontFamily: 'Montserrat, sans-serif'
                  }}
                >
                  Change Selfie
                </button>
                <p style={{
                  fontSize: '0.625rem',
                  color: '#8c867e',
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  fontFamily: 'Montserrat, sans-serif'
                }}>
                  Upload a clear close-up selfie to find your wedding photos automatically.
                </p>
              </div>

              {/* Fields */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#8c867e',
                  marginBottom: '0.5rem',
                  fontFamily: 'Montserrat, sans-serif'
                }}>
                  Email Address
                </label>
                <div style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1px solid #ddd8d0',
                  borderRadius: '2px',
                  fontSize: '0.8125rem',
                  fontFamily: 'Montserrat, sans-serif',
                  color: '#8c867e',
                  background: '#f8f7f3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxSizing: 'border-box'
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b5b0aa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {guest.email}
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#8c867e',
                  marginBottom: '0.5rem',
                  fontFamily: 'Montserrat, sans-serif'
                }}>
                  Full Name
                </label>
                <input 
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '1px solid #ddd8d0',
                    borderRadius: '2px',
                    fontSize: '0.8125rem',
                    fontFamily: 'Montserrat, sans-serif',
                    color: '#1c1a18',
                    background: '#ffffff'
                  }}
                />
              </div>

              <div style={{ marginBottom: '2.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#8c867e',
                  marginBottom: '0.5rem',
                  fontFamily: 'Montserrat, sans-serif'
                }}>
                  Phone Number
                </label>
                <input 
                  type="text"
                  value={editPhone}
                  onChange={(e) => {
                    setEditPhone(e.target.value)
                    if (phoneValidationError) setPhoneValidationError(null)
                  }}
                  placeholder="e.g. +91 98765 43210"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: phoneValidationError ? '1px solid #ff4d4d' : '1px solid #ddd8d0',
                    borderRadius: '2px',
                    fontSize: '0.8125rem',
                    fontFamily: 'Montserrat, sans-serif',
                    color: '#1c1a18',
                    background: '#ffffff',
                    outline: 'none',
                    animation: shakePhone ? 'shake 0.4s ease-in-out' : 'none'
                  }}
                />
                {phoneValidationError && (
                  <div style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '0.7rem',
                    color: '#ff4d4d',
                    marginTop: '0.5rem',
                    textAlign: 'left'
                  }}>
                    {phoneValidationError}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: '1px solid #ddd8d0',
                    color: '#8c867e',
                    padding: '0.85rem 1.5rem',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    fontFamily: 'Montserrat, sans-serif'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingProfile}
                  style={{
                    flex: 1,
                    background: '#1c1a18',
                    border: '1px solid #1c1a18',
                    color: '#ffffff',
                    padding: '0.85rem 1.5rem',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    fontFamily: 'Montserrat, sans-serif'
                  }}
                >
                  {updatingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              <a 
                href="/circle"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: '#8c867e',
                  marginTop: '1.5rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  textDecoration: 'none',
                  fontFamily: 'Montserrat, sans-serif'
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#1c1a18' }}
                onMouseOut={(e) => { e.currentTarget.style.color = '#8c867e' }}
              >
                ← View All My Weddings (My Circle)
              </a>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.8; }
        }
        .cover-cta:hover {
          background: #fff !important;
          border-color: #fff !important;
          color: #000 !important;
        }
        .scroll-chevron {
          animation: bounce 2.2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(5px); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        @media (max-width: 640px) {
          .story-masonry { gap: 6px !important; padding: 8px 12px 24px !important; }
          .story-masonry > div { gap: 6px !important; }
        }
      `}</style>
    </div>
  )
}
