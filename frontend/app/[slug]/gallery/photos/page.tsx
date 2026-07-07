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
  const [viewMode, setViewMode] = useState<'matched' | 'people' | 'all'>('matched')
  const [allPhotos, setAllPhotos] = useState<any[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [activeAllTab, setActiveAllTab] = useState<string>('')

  // Browse by People
  const [people, setPeople] = useState<any[]>([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [activePerson, setActivePerson] = useState<any | null>(null)

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
  useEffect(() => {
    if (allPhotosTabs.length > 0 && !activeAllTab) {
      setActiveAllTab(allPhotosTabs[0])
    }
  }, [allPhotosTabs, activeAllTab])

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
    <div className="relative min-h-screen w-full bg-[#f5f4f0] text-[#111111] flex flex-col justify-between">
      
      {/* Top Navigation / Header */}
      <header className="sticky top-0 z-40 bg-[#f5f4f0]/95 backdrop-blur-md border-b border-[#e6e3d9] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="font-sans text-[10px] uppercase tracking-wider text-[#0f172a] font-semibold">
            {event?.title || 'Wedding Gallery'}
          </span>
          <h1 className="font-lora text-base font-semibold text-[#111111]">
            Hello, {guest?.name?.split(' ')[0] || 'Guest'}
          </h1>
        </div>
        <button 
          onClick={handleLogout}
          className="text-xs font-sans text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded-full px-3 py-1 hover:bg-white transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </header>

      {/* Navigation Tabs */}
      <div className="flex gap-6 border-b border-[#e6e3d9] w-full max-w-4xl mx-auto px-4 mt-6">
        <button 
          onClick={() => setViewMode('matched')}
          className={`pb-3 font-sans text-sm font-semibold border-b-2 transition-colors cursor-pointer ${viewMode === 'matched' ? 'border-[#0f172a] text-[#111111]' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
        >
          Matched for You
        </button>
        <button 
          onClick={() => {
            setViewMode('people')
            loadPeople()
            setActivePerson(null)
          }}
          className={`pb-3 font-sans text-sm font-semibold border-b-2 transition-colors cursor-pointer ${viewMode === 'people' ? 'border-[#0f172a] text-[#111111]' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
        >
          People ({people.length > 0 ? people.length : '...'})
        </button>
        <button 
          onClick={() => {
            setViewMode('all')
            loadAllPhotos()
          }}
          className={`pb-3 font-sans text-sm font-semibold border-b-2 transition-colors cursor-pointer ${viewMode === 'all' ? 'border-[#0f172a] text-[#111111]' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
        >
          All Photos ({allPhotos.length > 0 ? allPhotos.length : '...'})
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 flex flex-col items-center">
        
        {/* VIEW MODE: MATCHED */}
        {viewMode === 'matched' && (
          <>
            {/* Search Call to Action */}
            {!hasSearched && !searching && (
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
            )}

            {/* Searching Face Scanning Animation */}
            {searching && (
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
            )}

            {/* Search Results Grid */}
            {hasSearched && !searching && (
              <div className="w-full flex flex-col items-center animate-waterfall">
                
                {/* Selfie Mini Trigger for re-scanning */}
                <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-full border border-neutral-200 shadow-xs mb-8">
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
                  <p className="text-sm font-sans text-red-500 mb-4">{errorSearch}</p>
                )}

                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                    {photos.map((p, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setActivePhoto(p)}
                        className="relative aspect-square overflow-hidden rounded-2xl border border-neutral-200 cursor-pointer group bg-neutral-100"
                      >
                        <img 
                          src={p.r2Url} 
                          alt={p.filename} 
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                          <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                            <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                          </div>
                        </div>
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
                <div className="flex items-center justify-between border-b border-[#e6e3d9] pb-4 mb-6">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                  {activePerson.photos.map((p: any, idx: number) => (
                    <div 
                      key={idx} 
                      onClick={() => setActivePhoto(p)}
                      className="relative aspect-square overflow-hidden rounded-2xl border border-neutral-200 cursor-pointer group bg-neutral-100"
                    >
                      <img 
                        src={p.r2Url} 
                        alt={p.filename} 
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                        <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                          <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : people.length > 0 ? (
              // List view: Circles of people
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 w-full py-4 justify-items-center">
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
                {/* Event Category Tabs */}
                {allPhotosTabs.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mb-8 w-full max-w-lg">
                    {allPhotosTabs.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveAllTab(tab)}
                        className={`px-4 py-2 rounded-full font-sans text-xs font-semibold border transition-all cursor-pointer ${
                          activeAllTab === tab
                            ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-md shadow-neutral-900/10'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}

                {/* Filtered Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                  {allPhotos
                    .filter(p => !activeAllTab || p.tabName === activeAllTab)
                    .map((p, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setActivePhoto(p)}
                        className="relative aspect-square overflow-hidden rounded-2xl border border-neutral-200 cursor-pointer group bg-neutral-100"
                      >
                        <img 
                          src={p.r2Url} 
                          alt={p.filename} 
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3 justify-end">
                          <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs flex items-center justify-center">
                            <svg className="w-4 h-4 text-neutral-800 fill-current" viewBox="0 0 24 24">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
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
      <footer className="w-full bg-[#f8f7f3] border-t border-[#e6e3d9] py-12 px-6 mt-16 text-center">
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
            className="px-6 py-2.5 bg-[#0f172a] text-white rounded-full font-sans text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-md"
          >
            Inquire About Your Wedding
          </a>
        </div>
      </footer>

      {/* Lightbox / View Modal */}
      {activePhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-4 py-8">
          <button 
            onClick={() => setActivePhoto(null)}
            className="absolute top-6 right-6 text-white hover:text-neutral-300 w-10 h-10 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center cursor-pointer"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>
          
          <div className="max-w-3xl max-h-[80vh] w-full h-full flex items-center justify-center">
            <img 
              src={activePhoto.r2Url} 
              alt="Viewing Photo" 
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4">
            <a 
              href={activePhoto.r2Url} 
              download={activePhoto.filename}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-white text-neutral-900 px-6 py-2.5 rounded-full font-sans text-xs font-semibold hover:bg-neutral-100 transition-colors shadow-lg cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
              Download Original
            </a>
          </div>
        </div>
      )}

      {/* Embedded CSS for Face Scanning Laser Animation */}
      <style jsx global>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
