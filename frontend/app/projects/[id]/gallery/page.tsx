'use client'

import { useState, useEffect, useRef, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default function AdminGalleryPreview({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  
  const [projectSlug, setProjectSlug] = useState<string | null>(null)
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
    activePhotosList.forEach((photo: any) => {
      const imgId = photo.id || photo.r2Url
      if (aspects[imgId]) return
      const img = new Image()
      img.src = photo.r2Url
      img.onload = () => {
        setAspects(prev => {
          if (prev[imgId] === img.naturalWidth / img.naturalHeight) return prev
          return { ...prev, [imgId]: img.naturalWidth / img.naturalHeight }
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
      const imgId = photo.id || photo.r2Url
      const isLandscape = aspects[imgId] ? aspects[imgId] > 1.1 : false

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

  // Fetch project details first to resolve the project slug
  useEffect(() => {
    fetch(`/api/projects/${id}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Project not found')
        return res.json()
      })
      .then(data => {
        if (data.project?.slug) {
          setProjectSlug(data.project.slug)
        } else {
          setProjectSlug(id) // Fallback to id parameter if no slug in response
        }
      })
      .catch(err => {
        console.error('Failed to load project details:', err)
        setProjectSlug(id) // Fallback
      })
  }, [id])

  // Mock guest details and load events once slug is resolved
  useEffect(() => {
    if (!projectSlug) return

    const parsedGuest = { id: -1, name: 'Admin Preview', email: 'admin@mistyvisuals.com', hasFullAccess: true }
    setGuest(parsedGuest)
    setViewMode('all')

    // Fetch public event details using resolved slug
    fetch(`${apiUrl}/api/gallery/public/events/${projectSlug}`)
      .then(res => {
        if (!res.ok) throw new Error('Gallery not found')
        return res.json()
      })
      .then(data => {
        setEvent(data)
        // Background load photos and people
        loadAllPhotos(projectSlug)
        loadPeople(projectSlug)
      })
      .catch((err) => {
        console.error('Failed to fetch public gallery details:', err)
      })
  }, [projectSlug, apiUrl])

  const allPhotosTabs = useMemo(() => {
    const eventTabs: string[] = event?.tabs || []
    const tabsWithPhotos = new Set<string>()
    allPhotos.forEach(p => {
      if (p.tabName) tabsWithPhotos.add(p.tabName)
    })
    const merged = eventTabs.filter(tab => tabsWithPhotos.has(tab))
    tabsWithPhotos.forEach(tab => {
      if (!merged.includes(tab)) merged.push(tab)
    })
    return merged
  }, [allPhotos, event])

  const loadAllPhotos = async (slug: string) => {
    setLoadingAll(true)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/photos`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load photos')
      const data = await res.json()
      setAllPhotos(data.photos || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAll(false)
    }
  }

  const loadPeople = async (slug: string) => {
    if (people.length > 0) return
    setLoadingPeople(true)
    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}/people`, { credentials: 'include' })
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
    if (!file || !projectSlug) return

    // Show preview of selfie
    const reader = new FileReader()
    reader.onloadend = () => {
      setSelfiePreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setSearching(true)
    setErrorSearch('')
    setViewMode('matched')

    const formData = new FormData()
    formData.append('selfie', file)

    try {
      const res = await fetch(`${apiUrl}/api/gallery/public/events/${projectSlug}/search`, {
        method: 'POST',
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

        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.65) 100%)',
        }} />

        {/* Admin Mode Label Indicator */}
        <div style={{
          position: 'absolute', top: '2rem', left: '2rem',
          zIndex: 40,
        }}>
          <span className="text-[10px] font-sans text-white bg-slate-900/80 backdrop-blur-xs border border-white/20 rounded-full px-4 py-1.5 uppercase tracking-widest font-bold">
            Admin Preview Mode
          </span>
        </div>

        {/* Brand & Close Preview button — top right */}
        <div style={{
          position: 'absolute', top: '2rem', right: '2rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          zIndex: 40,
        }}>
          <button 
            onClick={() => window.close()}
            className="text-[10px] font-sans text-white hover:text-[#111] hover:bg-white border border-white/40 rounded-full px-4 py-1.5 transition-colors cursor-pointer uppercase tracking-wider font-semibold"
          >
            Close Preview
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

        {/* Logo */}
        <a href="https://www.mistyvisuals.com" target="_blank" rel="noopener noreferrer" style={{
          position: 'absolute', bottom: '4rem', left: '50%',
          transform: 'translateX(-50%)',
          width: '112px', zIndex: 10,
          display: 'block'
        }}>
          <img
            src="/logo-white.png"
            onError={(e) => {
              e.currentTarget.src = "https://www.mistyvisuals.com/logo-white.png";
            }}
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

          {/* FACES Tab (Admin Preview Only - hidden from clients) */}
          <button 
            onClick={() => {
              setViewMode('people');
              setActivePerson(null);
              if (projectSlug) {
                loadPeople(projectSlug);
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: '0.6875rem',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: viewMode === 'people' ? '#1c1a18' : '#8c867e',
              paddingBottom: '0.25rem',
              borderBottom: viewMode === 'people' ? '1px solid #1c1a18' : '1px solid transparent',
              transition: 'all 0.2s',
              fontWeight: 400,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Faces</span>
            <span style={{
              fontSize: '0.55rem',
              letterSpacing: 'normal',
              textTransform: 'none',
              background: '#f5f5f4',
              color: '#78716c',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontWeight: 500,
              border: '1px solid #e7e5e4'
            }}>
              Preview Only (Hidden from guests)
            </span>
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
        


        {/* VIEW MODE: BROWSE BY PEOPLE */}
        {viewMode === 'people' && (
          <div className="w-full flex flex-col items-center animate-waterfall">
            {loadingPeople ? (
              <div className="flex py-20 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0f172a] border-t-transparent"></div>
              </div>
            ) : activePerson ? (
              <div className="w-full">
                <div className="flex items-center justify-between border-b border-[#e6e3d9] pb-4 mb-6 px-[clamp(0.75rem,3vw,2.5rem)]">
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

                <div style={{ display: 'flex', gap: '12px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 3vw, 2.5rem) 32px' }} className="story-masonry">
                  {getBalancedColumns(activePerson.photos || []).map((colPhotos, colIdx) => (
                    <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {colPhotos.map((p: any, photoIdx: number) => {
                        const globalIdx = (activePerson.photos || []).findIndex((item: any) => item.r2Url === p.r2Url)
                        return (
                          <div
                            key={`${p.id || p.r2Url}-${colIdx}-${photoIdx}`}
                            onClick={() => setActivePhotoIndex(globalIdx)}
                            style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                            className="gallery-item group"
                          >
                            {p.facesScanned === false && (
                              <div 
                                title="Faces not scanned: scanner was offline during upload"
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  right: '8px',
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ef4444',
                                  border: '1.5px solid white',
                                  zIndex: 10,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                }}
                              />
                            )}
                            <img src={p.thumbnailUrl || p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} className="group-hover:scale-[1.03]" />
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 w-full py-4 justify-items-center px-[clamp(0.75rem,3vw,2.5rem)]">
                {people.map((p, idx) => (
                  <div 
                    key={p.id} 
                    onClick={() => setActivePerson(p)}
                    className="flex flex-col items-center cursor-pointer group"
                  >
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-neutral-300 group-hover:border-[#0f172a] shadow-md group-hover:scale-[1.03] transition-all bg-neutral-100 relative">
                      <img 
                        src={p.coverPhotoUrl} 
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src.includes('__')) {
                            const newSrc = target.src.replace(/__([a-zA-Z0-9_]+)\.jpg$/, '.$1.jpg');
                            if (newSrc !== target.src) {
                              target.src = newSrc;
                              return;
                            }
                          }
                          if (target.src.includes('/faces/')) {
                            target.src = target.src.replace('/faces/', '/photos/');
                          }
                        }}
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
                    <div style={{ display: 'flex', gap: '12px', width: '100%', background: '#fff', padding: '16px clamp(0.75rem, 3vw, 2.5rem) 32px' }} className="story-masonry">
                      {getBalancedColumns(filteredList).map((colPhotos, colIdx) => (
                        <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {colPhotos.map((p: any, photoIdx: number) => {
                            const globalIdx = filteredList.findIndex(item => item.r2Url === p.r2Url)
                            return (
                              <div
                                key={`${p.id || p.r2Url}-${colIdx}-${photoIdx}`}
                                onClick={() => setActivePhotoIndex(globalIdx)}
                                style={{ cursor: 'pointer', overflow: 'hidden', lineHeight: 0, aspectRatio: p._gridAspect || '2/3', position: 'relative' }}
                                className="gallery-item group"
                              >
                                {p.facesScanned === false && (
                                  <div 
                                    title="Faces not scanned: scanner was offline during upload"
                                    style={{
                                      position: 'absolute',
                                      top: '8px',
                                      right: '8px',
                                      width: '10px',
                                      height: '10px',
                                      borderRadius: '50%',
                                      backgroundColor: '#ef4444',
                                      border: '1.5px solid white',
                                      zIndex: 10,
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                    }}
                                  />
                                )}
                                <img src={p.thumbnailUrl || p.r2Url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s ease' }} className="group-hover:scale-[1.03]" />
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

      {/* Redesigned website-themed footer */}
      <footer style={{ background: '#f8f7f3', borderTop: '1px solid #e6e3d9', marginTop: '4rem', width: '100%' }}>
        <div style={{
          padding: 'clamp(3rem,6vh,5rem) clamp(1.5rem, 5vw, 5rem) clamp(2rem,4vh,3rem)',
          maxWidth: '1600px',
          margin: '0 auto',
          textAlign: 'left'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: 'clamp(2rem,4vw,4rem)',
            marginBottom: 'clamp(2.5rem,5vh,4rem)',
          }} className="footer-grid">

            {/* Brand column */}
            <div>
              <p style={{
                fontFamily: '"Futura", "Trebuchet MS", Arial, sans-serif',
                fontSize: 'clamp(1rem,1.6vw,1.375rem)',
                fontWeight: 400,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#1c1a18',
                marginBottom: '1rem',
                margin: 0
              }}>
                Misty Visuals
              </p>
              <p style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: '0.5625rem',
                fontWeight: 300,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#4a4540',
                lineHeight: 1.8,
                marginBottom: '1.5rem',
                marginTop: '1rem'
              }}>
                Luxury Wedding Photography<br />& Cinematic Films
              </p>
              <p style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: '0.75rem',
                fontWeight: 300,
                color: '#4a4540',
                lineHeight: 1.8,
                maxWidth: '30ch',
                margin: 0
              }}>
                Misty Visuals specialises in luxury wedding photography and cinematic wedding films across Delhi, Mumbai, Jaipur, Udaipur, and destination weddings worldwide.
              </p>
            </div>

            {/* Navigation */}
            <div>
              <p style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: '0.5rem',
                fontWeight: 500,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: '#1c1a18',
                marginBottom: '1.25rem',
                margin: '0 0 1.25rem 0'
              }}>Navigate</p>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {[
                  ['Home', '/'],
                  ['Portfolio', '/stories'],
                  ['Films', '/films'],
                  ['Testimonials', '/#testimonials'],
                  ['About', '/about'],
                  ['Enquire', '/contact'],
                ].map(([label, href]) => (
                  <a 
                    key={href} 
                    href={`https://www.mistyvisuals.com${href}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                      fontSize: '0.75rem',
                      fontWeight: 300,
                      letterSpacing: '0.04em',
                      color: '#4a4540',
                      textDecoration: 'none',
                      transition: 'color 0.2s ease',
                    }}
                    onMouseOver={e => (e.currentTarget.style.color = '#1c1a18')}
                    onMouseOut={e => (e.currentTarget.style.color = '#4a4540')}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Contact */}
            <div>
              <p style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: '0.5rem',
                fontWeight: 500,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: '#1c1a18',
                marginBottom: '1.25rem',
                margin: '0 0 1.25rem 0'
              }}>Contact</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <a 
                  href="mailto:hello@mistyvisuals.com" 
                  style={{
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    fontSize: '0.75rem',
                    fontWeight: 300,
                    letterSpacing: '0.04em',
                    color: '#4a4540',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#1c1a18')}
                  onMouseOut={e => (e.currentTarget.style.color = '#4a4540')}
                >
                  hello@mistyvisuals.com
                </a>
                <a 
                  href="tel:+917560008899" 
                  style={{
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    fontSize: '0.75rem',
                    fontWeight: 300,
                    letterSpacing: '0.04em',
                    color: '#4a4540',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#1c1a18')}
                  onMouseOut={e => (e.currentTarget.style.color = '#4a4540')}
                >
                  +91 7560008899
                </a>
                <span style={{
                  fontFamily: "'Montserrat', system-ui, sans-serif",
                  fontSize: '0.75rem',
                  fontWeight: 300,
                  letterSpacing: '0.04em',
                  color: '#4a4540',
                  cursor: 'default'
                }}>Delhi, India</span>
                <span style={{
                  fontFamily: "'Montserrat', system-ui, sans-serif",
                  fontSize: '0.75rem',
                  fontWeight: 300,
                  letterSpacing: '0.04em',
                  color: '#4a4540',
                  cursor: 'default'
                }}>Available Worldwide</span>
              </div>
            </div>

            {/* Social */}
            <div>
              <p style={{
                fontFamily: "'Montserrat', system-ui, sans-serif",
                fontSize: '0.5rem',
                fontWeight: 500,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: '#1c1a18',
                marginBottom: '1.25rem',
                margin: '0 0 1.25rem 0'
              }}>Follow</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <a 
                  href="https://www.instagram.com/weddingsbymistyvisuals" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    fontSize: '0.75rem',
                    fontWeight: 300,
                    letterSpacing: '0.04em',
                    color: '#4a4540',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#1c1a18')}
                  onMouseOut={e => (e.currentTarget.style.color = '#4a4540')}
                >
                  Instagram
                </a>
                <a 
                  href="https://www.youtube.com/@weddingsbymistyvisuals" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{
                    fontFamily: "'Montserrat', system-ui, sans-serif",
                    fontSize: '0.75rem',
                    fontWeight: 300,
                    letterSpacing: '0.04em',
                    color: '#4a4540',
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#1c1a18')}
                  onMouseOut={e => (e.currentTarget.style.color = '#4a4540')}
                >
                  YouTube
                </a>
              </div>
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div style={{
            borderTop: '1px solid #ddd8d0',
            paddingTop: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <span style={{
              fontFamily: "'Montserrat', system-ui, sans-serif",
              fontSize: '0.5rem',
              fontWeight: 300,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#4a4540',
            }}>© 2019 Misty Visuals. All rights reserved.</span>
            <span style={{
              fontFamily: "'Montserrat', system-ui, sans-serif",
              fontSize: '0.5rem',
              fontWeight: 300,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#4a4540',
            }}>Photography & Films · India & Worldwide</span>
          </div>
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

      {/* Embedded CSS */}
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
          .story-masonry { gap: 6px !important; padding: 8px 12px 24px !important; }
          .story-masonry > div { gap: 6px !important; }
        }
      `}</style>
    </div>
  )
}
