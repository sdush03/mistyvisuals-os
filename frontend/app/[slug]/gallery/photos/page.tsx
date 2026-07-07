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
  const [activePhoto, setActivePhoto] = useState<any | null>(null)

  // Tabs & Views
  const [viewMode, setViewMode] = useState<'matched' | 'people' | 'all'>('all')
  const [allPhotos, setAllPhotos] = useState<any[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [activeAllTab, setActiveAllTab] = useState<string>('')

  // Browse by People
  const [people, setPeople] = useState<any[]>([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [activePerson, setActivePerson] = useState<any | null>(null)
  
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
    } else if (viewMode === 'people' && activePerson) {
      return activePerson.photos || []
    } else if (viewMode === 'all') {
      return allPhotos.filter(p => !activeAllTab || p.tabName === activeAllTab)
    }
    return []
  }, [viewMode, photos, activePerson, allPhotos, activeAllTab])

  // Preload natural aspects
  useEffect(() => {
    activePhotosList.forEach(photo => {
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
  const allPhotosTabs = useMemo(() => {
    const tabs = new Set<string>()
    allPhotos.forEach(p => {
      if (p.tabName) tabs.add(p.tabName)
    })
    return Array.from(tabs)
  }, [allPhotos])

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

    setGuest(JSON.parse(savedGuest))

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
        loadPeople()
      })
      .catch(() => {
        localStorage.removeItem(`mv_gallery_token_${slug}`)
        localStorage.removeItem(`mv_gallery_guest_${slug}`)
        router.push(`/${slug}/gallery`)
      })
  }, [slug, router, apiUrl])

  const loadAllPhotos = async () => {
    if (allPhotos.length > 0) return
    setLoadingAll(true)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/photos`)
      if (!res.ok) throw new Error('Failed to load photos')
      const data = await res.json()
      setAllPhotos(data.photos || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAll(false)
    }
  }

  const loadPeople = async () => {
    if (people.length > 0) return
    setLoadingPeople(true)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/people`)
      if (!res.ok) throw new Error('Failed to load clustered people')
      const data = await res.json()
      setPeople(data.people || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingPeople(false)
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
    localStorage.removeItem(`mv_gallery_token_${slug}`)
    localStorage.removeItem(`mv_gallery_guest_${slug}`)
    router.push(`/${slug}/gallery`)
  }

  const getPersonLabel = (index: number) => {
    let label = ''
    let temp = index
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label
      temp = Math.floor(temp / 26) - 1
    }
    return `Person ${label}`
  }

  return (
    <div className="relative min-h-screen w-full bg-white text-[#111111] flex flex-col justify-between">
      
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
            onClick={handleLogout}
            className="text-[10px] font-sans text-white hover:text-[#111] hover:bg-white border border-white/40 rounded-full px-4 py-1.5 transition-colors cursor-pointer uppercase tracking-wider font-semibold"
          >
            Sign Out
          </button>
        </div>

        {/* Centered title block */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyCenter: 'center',
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
            position: 'absolute', bottom: '1.75rem', left: 'clamp(0.75rem, 5vw, 5rem)',
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
        padding: 'clamp(2rem, 4vh, 4rem) clamp(0.75rem, 5vw, 5rem)',
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
        <div className="flex gap-12 w-full px-[clamp(0.75rem,5vw,5rem)] justify-start">
          {/* ALL Tab */}
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
          <>
            {/* Search Call to Action */}
            {!hasSearched && !searching && (
              <div className="w-full px-[clamp(0.75rem,5vw,5rem)] flex flex-col items-center">
                <div className="w-full max-w-md text-center py-16 px-6 bg-white rounded-3xl border border-neutral-100 shadow-xl shadow-neutral-200/50 mt-8 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-6 text-neutral-400">
                    <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
                    </svg>
                  </div>
                  <h2 className="font-lora text-2xl font-medium mb-2">Find Your Photos</h2>
                  <p className="font-sans text-sm text-neutral-500 mb-8 max-w-xs mx-auto">
                    Take a quick selfie or upload a photo to scan the gallery for pictures of you.
                  </p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    accept="image/*" 
                    capture="user" 
                    className="hidden" 
                  />
                  <button 
                    onClick={handleSelfieUploadClick}
                    className="w-full py-4 bg-[#0f172a] text-white rounded-2xl font-sans text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-neutral-900/10 cursor-pointer"
                  >
                    Start Scanning
                  </button>
                  <button 
                    onClick={() => {
                      setViewMode('people')
                      loadPeople()
                    }}
                    className="mt-4 text-xs font-sans text-neutral-500 hover:text-neutral-900 hover:underline cursor-pointer"
                  >
                    Or browse by people instead
                  </button>
                </div>
              </div>
            )}

            {/* Searching Face Scanning Animation */}
            {searching && (
              <div className="w-full px-[clamp(0.75rem,5vw,5rem)] flex flex-col items-center">
                <div className="w-full max-w-md text-center py-12 px-6 bg-white rounded-3xl border border-neutral-100 shadow-xl shadow-neutral-200/50 mt-8 flex flex-col items-center">
                  <div className="relative w-48 h-48 rounded-2xl overflow-hidden mb-6 border-2 border-[#0f172a]">
                    {selfiePreview && (
                      <img src={selfiePreview} alt="Selfie Preview" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-x-0 h-1 bg-linear-to-r from-teal-400 via-emerald-400 to-teal-400 animate-[scan_2s_ease-in-out_infinite] shadow-lg shadow-emerald-500/50" />
                  </div>
                  <h3 className="font-lora text-xl font-medium mb-1">Scanning Face...</h3>
                  <p className="font-sans text-xs text-neutral-500 animate-pulse">
                    Our AI is matching your selfie with the wedding photos.
                  </p>
                </div>
              </div>
            )}

            {/* Search Results Grid */}
            {hasSearched && !searching && (
              <div className="w-full flex flex-col items-center animate-waterfall">
                
                {/* Selfie Mini Trigger for re-scanning */}
                <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-full border border-neutral-200 shadow-xs mb-8 mx-auto">
                  {selfiePreview && (
                    <img src={selfiePreview} alt="Selfie" className="w-8 h-8 rounded-full object-cover border border-neutral-200" />
                  )}
                  <span className="font-sans text-xs text-neutral-500 font-medium">
                    {photos.length} photos found
                  </span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    accept="image/*" 
                    capture="user" 
                    className="hidden" 
                  />
                  <button 
                    onClick={handleSelfieUploadClick}
                    className="text-xs font-sans text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1 font-semibold hover:bg-teal-100 cursor-pointer"
                  >
                    Scan Again
                  </button>
                </div>

                {errorSearch && (
                  <div className="w-full px-[clamp(0.75rem,5vw,5rem)]">
                    <p className="text-sm font-sans text-red-500 mb-4">{errorSearch}</p>
                  </div>
                )}

                {photos.length > 0 ? (
                  <div style={{ display: 'flex', gap: '16px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 5vw, 5rem) 32px' }} className="story-masonry">
                    {getBalancedColumns(photos).map((colPhotos, colIdx) => (
                      <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {colPhotos.map((p: any) => {
                          const globalIdx = photos.findIndex(item => item.r2Url === p.r2Url)
                          return (
                            <div
                              key={p.r2Url}
                              onClick={() => setActivePhotoIndex(globalIdx)}
                              style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                              className="gallery-item group"
                            >
                              <img src={p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} className="group-hover:scale-[1.03]" />
                              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                                <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                                  <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                                  </svg>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <p className="font-lora text-lg text-neutral-600 mb-2">No matching photos found</p>
                    <p className="font-sans text-xs text-neutral-400 max-w-xs mx-auto">
                      Try uploading another selfie with direct lighting, clear face visibility, and without wearing sunglasses or hats.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* VIEW MODE: BROWSE BY PEOPLE */}
        {viewMode === 'people' && (
          <div className="w-full flex flex-col items-center animate-waterfall">
            {loadingPeople ? (
              <div className="flex py-20 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0f172a] border-t-transparent"></div>
              </div>
            ) : activePerson ? (
              // Sub-view: Photos of a specific person
              <div className="w-full">
                {/* Header info */}
                <div className="flex items-center justify-between border-b border-[#e6e3d9] pb-4 mb-6 px-[clamp(0.75rem,5vw,5rem)]">
                  <button 
                    onClick={() => setActivePerson(null)}
                    className="flex items-center gap-1.5 text-xs font-sans font-semibold text-[#0f172a] hover:opacity-85 cursor-pointer bg-white border border-[#e6e3d9] rounded-full px-4 py-2 transition-opacity"
                  >
                    ← Back to People
                  </button>
                  <h3 className="font-lora text-lg font-medium">
                    {getPersonLabel(people.indexOf(activePerson))} ({activePerson.photoCount} photos)
                  </h3>
                </div>

                <div style={{ display: 'flex', gap: '16px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 5vw, 5rem) 32px' }} className="story-masonry">
                  {getBalancedColumns(activePerson.photos || []).map((colPhotos, colIdx) => (
                    <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {colPhotos.map((p: any) => {
                        const globalIdx = (activePerson.photos || []).findIndex((item: any) => item.r2Url === p.r2Url)
                        return (
                          <div
                            key={p.r2Url}
                            onClick={() => setActivePhotoIndex(globalIdx)}
                            style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                            className="gallery-item group"
                          >
                            <img src={p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} className="group-hover:scale-[1.03]" />
                            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                              <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                                <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                                </svg>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : people.length > 0 ? (
              // List view: Circles of people
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 w-full py-4 justify-items-center px-[clamp(0.75rem,5vw,5rem)]">
                {people.map((p, idx) => (
                  <div 
                    key={p.id} 
                    onClick={() => setActivePerson(p)}
                    className="flex flex-col items-center cursor-pointer group"
                  >
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-neutral-300 group-hover:border-[#0f172a] shadow-md group-hover:scale-[1.03] transition-all bg-neutral-100 relative">
                      <img 
                        src={p.coverPhotoUrl} 
                        alt="Person Cover" 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="font-sans text-xs font-semibold text-[#111111] mt-3 group-hover:underline">
                      {getPersonLabel(idx)}
                    </span>
                    <span className="font-sans text-[10px] text-neutral-400 mt-0.5">
                      {p.photoCount} photos
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="font-lora text-lg text-neutral-600 mb-2">No people found in this gallery</p>
                <p className="font-sans text-xs text-neutral-400">
                  Please run the desktop uploader script to process faces.
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
                    <div style={{ display: 'flex', gap: '16px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 5vw, 5rem) 32px' }} className="story-masonry">
                      {getBalancedColumns(filteredList).map((colPhotos, colIdx) => (
                        <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {colPhotos.map((p: any) => {
                            const globalIdx = filteredList.findIndex(item => item.r2Url === p.r2Url)
                            return (
                              <div
                                key={p.r2Url}
                                onClick={() => setActivePhotoIndex(globalIdx)}
                                style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                                className="gallery-item group"
                              >
                                <img src={p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} className="group-hover:scale-[1.03]" />
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                                  <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                                    <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                                    </svg>
                                  </div>
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
            display: 'flex', alignItems: 'center', justify: 'center',
          }}
          onClick={() => setActivePhotoIndex(null)}
        >
          {/* Image */}
          <img 
            src={activePhotosList[activePhotoIndex].r2Url} 
            alt="" 
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '96vw', maxHeight: '94vh',
              objectFit: 'contain',
              userSelect: 'none',
              borderRadius: '8px'
            }}
          />

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

          {/* Download button */}
          <div style={{ position: 'absolute', bottom: '3.5rem', left: '50%', transform: 'translateX(-50%)' }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => handleDownload(activePhotosList[activePhotoIndex].r2Url, activePhotosList[activePhotoIndex].filename)}
              className="flex items-center gap-2 bg-white text-neutral-900 px-6 py-2.5 rounded-full font-sans text-xs font-semibold hover:bg-neutral-100 transition-colors shadow-lg cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
              Download Original
            </button>
          </div>

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

      {/* Embedded CSS for Face Scanning Laser Animation and styling */}
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
        @media (max-width: 640px) {
          .story-masonry { gap: 8px !important; padding: 8px 12px 24px !important; }
          .story-masonry > div { gap: 8px !important; }
        }
      `}</style>
    </div>
  )
}
