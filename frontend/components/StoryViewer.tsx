'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { formatDate, formatTimeStr, formatINR } from '@/lib/formatters'

type StoryViewerProps = {
  snapshot: any
  accepted?: boolean
  accepting?: boolean
  onAccept?: (tierId?: string) => void
  isPreview?: boolean
  token?: string
}

const formatMoney = (value: number | string | null | undefined) => formatINR(value ?? 0)

const toDateOnly = (val?: string | null) => {
  if (!val) return ''
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return val
  return d.toISOString().slice(0, 10)
}

const getEventSlotRank = (slot?: string | null) => {
  const s = String(slot || '').toLowerCase()
  if (s.includes('morning')) return 1
  if (s.includes('afternoon')) return 2
  if (s.includes('evening')) return 3
  if (s.includes('night')) return 4
  return 9
}

const getTierList = (draftData: any) => {
  const tiers = draftData?.tiers || []
  const isTiered = draftData?.pricingMode === 'TIERED' && tiers.length > 0
  return { tiers, isTiered }
}

export default function StoryViewer({
  snapshot,
  accepted = false,
  accepting = false,
  onAccept,
  isPreview = false,
  token,
}: StoryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const draft = snapshot?.draftData || {}
  const hero = draft.hero || {}
  
  // Cross-reference names from hero and draft
  const _hero = {
    ...hero,
    brideName: hero?.brideName || hero?.bride_name || draft?.brideName || draft?.bride_name,
    groomName: hero?.groomName || hero?.groom_name || draft?.groomName || draft?.groom_name,
    leadName: hero?.leadName || hero?.lead_name || draft?.leadName || draft?.lead_name,
    coupleNames: hero?.coupleNames || hero?.couple_names || draft?.coupleNames || draft?.couple_names,
    title: hero?.title || hero?.proposal_title || draft?.title || draft?.proposal_title,
    coverImageUrl: hero?.coverImageUrl || hero?.cover_image_url || draft?.coverImageUrl || draft?.cover_image_url
  }

  const pricingItems = draft.pricingItems || []
  const paymentSchedule = draft.paymentSchedule || []
  const moodboard = draft.moodboard || []
  const portraits = draft.portraits || []
  const testimonials = (draft.testimonials || []).filter((t: any) => t && (t.testimonial_text || t.media_url))

  const totalPrice = useMemo(() => {
    if (snapshot?.salesOverridePrice !== undefined && snapshot?.salesOverridePrice !== null) {
      return Number(snapshot.salesOverridePrice || 0)
    }
    return Number(snapshot?.calculatedPrice || 0)
  }, [snapshot])

  const sortedEvents = useMemo(() => {
    const events = Array.isArray(draft.events) ? [...draft.events] : []

    const parseTime = (timeStr?: string) => {
      if (!timeStr) return 9999 // Events without time go to end of day
      const start = timeStr.split(/[-–]/)[0].trim().toLowerCase() // Grab start time before dash
      const match = start.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
      if (!match) return 9999
      let [_, h, m, ap] = match
      let hours = parseInt(h, 10)
      let minutes = parseInt(m || '0', 10)
      if (ap === 'pm' && hours < 12) hours += 12
      if (ap === 'am' && hours === 12) hours = 0
      return hours * 60 + minutes
    }

    events.sort((a: any, b: any) => {
      const aDate = toDateOnly(a?.date)
      const bDate = toDateOnly(b?.date)
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      
      const aTime = parseTime(a?.time)
      const bTime = parseTime(b?.time)
      
      // If both have valid parseable times, sort by time first
      if (aTime !== 9999 || bTime !== 9999) {
        if (aTime !== bTime) return aTime - bTime
      }
      
      // Fallback to slot
      return getEventSlotRank(a?.slot) - getEventSlotRank(b?.slot)
    })
    return events
  }, [draft.events])

  const dayNumbers = useMemo(() => {
    const map: Record<string, number> = {}
    let day = 0
    let lastDate = ''
    for (const ev of sortedEvents) {
      const dateKey = toDateOnly(ev?.date) || `idx-${ev?.id || ev?.name}`
      if (dateKey !== lastDate) {
        day += 1
        lastDate = dateKey
      }
      map[ev?.id || ev?.name || dateKey] = day
    }
    return map
  }, [sortedEvents])

  const mixedPhotos = useMemo(() => {
    // 1. Combine all available photos with URL-based dedup
    const seen = new Set<string>()
    const all: any[] = []
    for (const item of [...moodboard, ...portraits]) {
      const url = typeof item === 'string' ? item : item.url
      if (!url || seen.has(url)) continue
      seen.add(url)
      all.push(item)
    }
    
    // 2. Identify "True Portraits" based on tags or properties
    const isPortrait = (item: any) => {
      if (typeof item === 'string') return false // Can't tell from string URL easily
      const tags = item.tags || []
      const hasPortraitTag = tags.some((t: string) => t.toLowerCase() === 'portrait')
      const hasPortraitProp = item.isPortrait || item.is_portrait || (item.width && item.height && item.height > item.width)
      return hasPortraitTag || hasPortraitProp
    }

    const shuffle = (arr: any[]) => [...arr].sort(() => 0.5 - Math.random())
    
    // Split into candidates for top 4 and others
    const candidates = all.filter(isPortrait)
    const others = all.filter(i => !isPortrait(i))
    
    const shuffledPortraits = shuffle(candidates)
    const shuffledOthers = shuffle(others)
    
    // 3. Force top 4 to be portraits if possible
    const result: any[] = []
    const top4 = shuffledPortraits.slice(0, 4)
    result.push(...top4)
    
    // 4. Fill the rest (total 26) with remaining shuffled photos
    const remaining = shuffle([...shuffledPortraits.slice(4), ...shuffledOthers])
    
    const totalNeeded = 26
    while (result.length < totalNeeded && remaining.length > 0) {
      result.push(remaining.shift())
    }
    
    return result
  }, [moodboard, portraits])

  const slides = [
    <SlideCover key="cover" hero={_hero} sortedEvents={sortedEvents} />,
    <SlideMoodboard key="moodboard" moodboard={mixedPhotos} isActive={currentIndex === 1} background={_hero?.coverImageUrl} />,
    ...sortedEvents.map((ev: any, idx: number) => (
      <SlideEvent
        key={`ev-${idx}`}
        event={ev}
        index={idx}
        dayNumber={dayNumbers[ev?.id || ev?.name || idx]}
        pricingItems={pricingItems}
        isPreview={isPreview}
      />
    )),
    <SlideDeliverables
      key="deliverables"
      deliverables={pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE')}
      background={draft.whatsIncludedBackground || _hero?.coverImageUrl}
      token={token}
    />,
    <SlideInvestment
      key="investment"
      paymentSchedule={paymentSchedule}
      totalPrice={totalPrice}
      salesOverridePrice={snapshot?.salesOverridePrice}
      draftData={draft}
      accepted={accepted}
      accepting={accepting}
      onAccept={onAccept}
      background={_hero?.coverImageUrl}
    />,
    ...(testimonials.length > 0 ? [<SlideTestimonials key="testimonials" testimonials={testimonials} />] : []),
    <SlideConnect key="connect" contactData={draft.contactInfo} />,
  ]

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const index = Math.round(container.scrollLeft / container.clientWidth)
    if (index !== currentIndex) setCurrentIndex(index)
  }

  const handleNav = (e: React.MouseEvent) => {
    // If user clicked a button, link, or the investment details, don't advance the slide
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a') || target.closest('.pointer-events-auto')) {
      return
    }

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    
    // Only navigate if clicking on left 25% or right 25%
    if (x > w * 0.75) {
      container.scrollBy({ left: w, behavior: 'smooth' })
    } else if (x < w * 0.25) {
      container.scrollBy({ left: -w, behavior: 'smooth' })
    }
  }

  return (
    <div className="w-full h-full relative bg-black overflow-hidden select-none">
      {/* 1. Progress Indicators (Slide Bars) */}
      <div className="absolute top-4 left-0 right-0 z-[60] flex gap-1.5 px-4 h-1 pointer-events-none">
        {slides.map((_, i) => (
          <div key={i} className="h-full flex-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-white transition-all duration-300 ${i <= currentIndex ? 'w-full' : 'w-0'}`} 
            />
          </div>
        ))}
      </div>

      {/* 2. Navigation Side Zones (Invisible) - Height restricted to clear top/bottom interactive areas */}
      <div className="absolute inset-x-0 top-24 bottom-32 z-50 pointer-events-none flex">
        <div 
          className="w-[20%] h-full pointer-events-auto cursor-pointer" 
          onClick={() => {
            const container = containerRef.current
            if (container) container.scrollBy({ left: -container.clientWidth, behavior: 'smooth' })
          }}
        />
        <div className="flex-1 h-full pointer-events-none" />
        <div 
          className="w-[20%] h-full pointer-events-auto cursor-pointer" 
          onClick={() => {
            const container = containerRef.current
            if (container) container.scrollBy({ left: container.clientWidth, behavior: 'smooth' })
          }}
        />
      </div>

      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {slides.map((slide, idx) => (
          <div key={idx} className="w-full h-full flex-shrink-0 snap-start overflow-hidden relative">
            {slide}
          </div>
        ))}
      </div>
    </div>
  )
}

const SlideCover = ({ hero, sortedEvents }: { hero: any, sortedEvents: any[] }) => {
  const imageSrc = hero?.coverImageUrl || hero?.cover_image_url
  const isVideo = imageSrc && (imageSrc.includes('.mp4') || imageSrc.includes('.webm') || imageSrc.includes('/api/videos/file'))
  
  // handle names
  const bride = (hero?.brideName || '').trim()
  const groom = (hero?.groomName || '').trim()
  const leadName = (hero?.leadName || '').trim()
  const coupleNames = (hero?.coupleNames || '').trim()
  const hasBoth = bride && groom
  
  // Priority: 1. coupleNames, 2. bride & groom, 3. leadName
  const coupleDisplay = coupleNames || (hasBoth ? `${bride} & ${groom}` : (leadName || hero?.title || 'Wedding Proposal'))

  const dateLine = useMemo(() => {
    if (!sortedEvents || sortedEvents.length === 0) return ''
    const first = sortedEvents[0]?.date
    const last = sortedEvents[sortedEvents.length - 1]?.date
    if (!first) return ''
    if (first === last || !last) return formatDate(first)
    return `${formatDate(first)} – ${formatDate(last)}`
  }, [sortedEvents])

  return (
    <div className="w-full h-full relative bg-neutral-950 flex flex-col overflow-hidden z-20">
      {imageSrc && (
        isVideo ? (
          <video src={imageSrc} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <img src={imageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
        )
      )}
      
      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 60% 35%, rgba(160,80,20,0.18) 0%, transparent 65%)' }} />

      {/* Logo + artful label — top */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-16 gap-3 z-10">
        <img
          src="/logo.png"
          alt="Misty Visuals"
          className="h-14 object-contain opacity-95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
          onError={e => (e.currentTarget.style.display = 'none')}
        />
        <div className="text-[10px] uppercase tracking-[.42em] text-white/90 font-semibold text-center leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          An Artful Approach<br />to Capturing Love
        </div>
      </div>

      {/* Glass card — absolutely centred on the page */}
      <div className="absolute left-0 right-0 px-8 z-10" style={{ top: '50%', transform: 'translateY(-50%)' }}>
        <div
          className="w-full rounded-2xl px-6 py-8 text-center"
          style={{
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="text-[16px] text-white/80 font-normal leading-snug mb-2 font-mono"
            style={{ fontStyle: 'italic' }}
          >
            A Personalized Proposal For
          </div>

          <h1
            className="text-[30px] font-black text-white uppercase leading-none drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] mb-3"
            style={{ letterSpacing: '0.1em' }}
          >
            {coupleDisplay}
          </h1>

          {dateLine && (
            <div className="text-[10px] uppercase tracking-[.3em] text-white/50 font-medium">
              {dateLine}
            </div>
          )}
        </div>
      </div>

      {/* Bottom tagline — monostyled italic */}
      <div
        className="absolute bottom-0 left-0 right-0 text-center px-8 pb-24 text-[20px] text-white/80 font-normal leading-snug z-10 font-mono"
        style={{ fontStyle: 'italic', letterSpacing: '0.02em' }}
      >
        A Curated Photography &amp; Videography Experience for Your Celebration.
      </div>

      {/* Blinking prompt */}
      <div className="absolute bottom-8 left-0 right-0 text-center z-10 pointer-events-none">
        <div className="text-[9px] uppercase tracking-[.4em] font-bold text-white/60 animate-pulse">
          Click Right to Explore
        </div>
      </div>

    </div>
  )
}

const SlideMoodboard = ({ moodboard, isActive, background }: { moodboard: any[], isActive: boolean, background?: string }) => {
  const items = moodboard || []
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const openLightbox = (idx: number) => setLightboxIndex(idx)
  const closeLightbox = () => setLightboxIndex(null)
  
  const next = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % items.length)
    }
  }
  const prev = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + items.length) % items.length)
    }
  }

  return (
    <div className="w-full h-full relative bg-neutral-950 animate-in fade-in duration-700 select-none">
      {background && <img src={background} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.12] grayscale pointer-events-none z-0" />}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-transparent to-neutral-950/80 pointer-events-none z-0" />
      <div className="relative z-10 w-full h-full overflow-y-auto no-scrollbar pt-12 pb-24" style={{ scrollbarWidth: 'none' }}>
      <div className="p-5">
        <h2 className="text-[28px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg whitespace-nowrap overflow-hidden text-ellipsis px-1">Visions & Aesthetics</h2>
        <p className="text-[12px] text-white/50 leading-relaxed mb-6 font-mono italic px-1">
          We’ve carefully curated these visuals to reflect the tone and storytelling style we envision for your celebration.
        </p>

        {items.length === 0 ? (
          <div className="text-white/30 text-[11px] font-mono italic">No visuals selected yet.</div>
        ) : (
          <div className="flex gap-1.5 px-0.5">
            {/* Left Column */}
            <div className="flex-1 flex flex-col gap-1.5">
              {items.map((item: any, idx: number) => {
                if (idx % 2 !== 0) return null
                const url = typeof item === 'string' ? item : item.url
                return (
                  <div 
                    key={idx} 
                    className={`cursor-pointer active:scale-95 transition-transform ${
                      isActive ? 'animate-waterfall opacity-0' : 'opacity-0'
                    }`}
                    style={{ 
                      animationDelay: isActive ? `${idx * 0.08}s` : '0s'
                    }}
                    onClick={() => openLightbox(idx)}
                  >
                    <img src={url} alt="" className="w-full rounded-xl object-cover border border-white/5 shadow-2xl" />
                  </div>
                )
              })}
            </div>
            {/* Right Column */}
            <div className="flex-1 flex flex-col gap-1.5">
              {items.map((item: any, idx: number) => {
                if (idx % 2 === 0) return null
                const url = typeof item === 'string' ? item : item.url
                return (
                  <div 
                    key={idx} 
                    className={`cursor-pointer active:scale-95 transition-transform ${
                      isActive ? 'animate-waterfall opacity-0' : 'opacity-0'
                    }`}
                    style={{ 
                      animationDelay: isActive ? `${idx * 0.08}s` : '0s'
                    }}
                    onClick={() => openLightbox(idx)}
                  >
                    <img src={url} alt="" className="w-full rounded-xl object-cover border border-white/5 shadow-2xl" />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-300 pointer-events-auto"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button 
            className="absolute top-10 right-6 z-[110] text-white/80 p-2 hover:text-white pointer-events-auto"
            onClick={closeLightbox}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          {/* Navigation Arrows */}
          <div className="absolute inset-0 flex items-center justify-between px-4 z-[105] pointer-events-none">
            <button 
              className="w-12 h-12 flex items-center justify-center bg-black/20 backdrop-blur-md rounded-full text-white pointer-events-auto"
              onClick={prev}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button 
              className="w-12 h-12 flex items-center justify-center bg-black/20 backdrop-blur-md rounded-full text-white pointer-events-auto"
              onClick={next}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* Image Container - Click to next photo */}
          <div 
            className="flex-1 flex items-center justify-center p-4 cursor-pointer"
            onClick={next}
          >
            <img 
              src={typeof items[lightboxIndex] === 'string' ? items[lightboxIndex] : items[lightboxIndex].url} 
              alt="" 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Counter */}
          <div className="pb-10 text-center text-[11px] font-mono text-white/40 tracking-widest uppercase">
            {lightboxIndex + 1} / {items.length}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

const SlideEvent = ({ event, index, dayNumber, pricingItems, isPreview }: any) => {
  const imageSrc = event.coverImageUrl || (event.photos ? event.photos[0] : null)
  const isVideo = imageSrc && (imageSrc.includes('.mp4') || imageSrc.includes('.webm') || imageSrc.includes('/api/videos/file/'))
  const crew = (pricingItems || []).filter((i: any) => i.eventId === event.id && i.itemType === 'TEAM_ROLE' && Number(i.quantity) > 0)
  const PinIcon = () => {
      return (
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="#ffffffcc">
          <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/>
          <circle cx="12" cy="9" r="2.5" fill="#111827"/>
        </svg>
      )
  }
  
  // Logic for splitting "Name's Event Name" or "A & B's Event Name"
  const title = event.name || 'Unnamed Event'
  const match = title.match(/^(.+?'s)\s+(.+)$/i)
  const line1 = match ? match[1] : ''
  const line2 = match ? match[2] : title

  const venueLink = event.location 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.location} ${event.city_name || ''}`)}`
    : null

  return (
    <div className="w-full h-full relative bg-black overflow-hidden z-30 animate-in fade-in duration-700">
      {/* 1. Full-bleed event cover */}
      {imageSrc ? (
        isVideo ? (
          <video src={imageSrc} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-90 scale-105" />
        ) : (
          <img src={imageSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 scale-105" />
        )
      ) : (
        <div className="absolute inset-0 bg-neutral-900" />
      )}
      
      {/* Dark bottom gradient overlay */}
      <div className="absolute inset-0 z-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.60) 70%, rgba(0,0,0,0.90) 100%)' }} />

      {/* 2. Top-left Day X pill */}
      <div className="absolute top-16 left-6 z-10 font-mono">
        <div 
          className="text-[10px] uppercase tracking-[0.3em] text-white/90 font-bold px-4 py-2 rounded-full border border-white/15 backdrop-blur-sm"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          Day {dayNumber || index + 1}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 p-8 pb-20 flex flex-col gap-6">
        {/* 3. Event title logic */}
        <div className="space-y-1">
          {line1 && <div className="text-[20px] font-medium text-white/70 tracking-tight drop-shadow-lg italic font-mono">{line1}</div>}
          <h2 className="text-[34px] font-black text-white uppercase tracking-[0.05em] leading-[1.1] drop-shadow-2xl">
            {line2}
          </h2>
        </div>

        {/* 4. Optional Allocated Crew card */}
        {crew.length > 0 && (
          <div 
            className="rounded-2xl p-4 overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.40)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div className="text-[9px] uppercase tracking-[0.3em] text-emerald-300/80 font-bold mb-3 font-mono">Allocated Crew</div>
            <div className="space-y-2">
              {crew.map((item: any, cIdx: number) => (
                <div key={cIdx} className="flex items-center justify-between text-white/90">
                  <span className="text-xs font-medium tracking-wide">{item.label}</span>
                  <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded-md">{item.quantity}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Balanced 2x2 Info Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 pt-6 border-t border-white/10">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-bold font-mono italic">Date</div>
            <div className="text-[12px] font-medium text-white/90 font-mono">
              {event.date_status === 'tba' 
                ? 'TBD'
                : <>
                    {event.date ? formatDate(event.date) : (event.event_date ? formatDate(event.event_date) : '-')}
                    {event.date_status === 'tentative' && <span className="text-white/40 ml-1 text-[10px]">(Tentative)</span>}
                  </>
              }
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-bold font-mono italic">Time</div>
            <div className="text-[12px] font-medium text-white/90 font-mono">
              {event.time ? formatTimeStr(event.time) : (event.start_time ? formatTimeStr(event.start_time) : '-') }
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-bold font-mono italic">Venue</div>
            {(() => {
              const venueName = event.venue || event.location || 'TBD'
              const vLink = (venueName !== 'TBA' && venueName !== 'TBD') ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}` : null
              return vLink ? (
                <a 
                  href={vLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-start gap-1 text-[12px] leading-tight font-medium !text-white/90 hover:!text-white transition-all font-mono group"
                >
                  <PinIcon />
                  <span className="line-clamp-2">
                    {venueName}
                  </span>
                </a>
              ) : (
                <div className="text-[12px] font-medium text-white/90 font-mono">{venueName}</div>
              )
            })()}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-bold font-mono italic">Pax</div>
            <div className="text-[12px] font-medium text-white/90 font-mono">{event.pax || '-'} Guests</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SlideDeliverables = ({ deliverables, background, token }: { deliverables: any[], background?: string, token?: string }) => {
  const isVid = background && (background.includes('.mp4') || background.includes('.webm') || background.includes('/api/videos/file'))
  const [addons, setAddons] = useState<any[]>([])
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([])
  const [isRequesting, setIsRequesting] = useState(false)
  const [isRequested, setIsRequested] = useState(false)

  useEffect(() => {
    fetch('/api/catalog/addons/public')
      .then(r => r.json())
      .then(data => setAddons(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const handleRequest = async () => {
    if (selectedAddonIds.length === 0 || !token) return
    setIsRequesting(true)
    try {
      const res = await fetch(`/api/proposals/${token}/request-addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonIds: selectedAddonIds })
      })
      if (res.ok) setIsRequested(true)
    } finally {
      setIsRequesting(false)
    }
  }

  const toggleAddon = (id: number) => {
    if (isRequested) return
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const videoKeywords = ['film', 'video', 'reel', 'teaser', 'trailer', 'cinematic', 'cinemato']
  const getCat = (d: any) => {
    if (d.category) return d.category;
    const label = String(d.label || d.name || '').toLowerCase()
    return videoKeywords.some(k => label.includes(k)) ? 'VIDEO' : 'PHOTO'
  }

  const photoItems = deliverables.filter((d: any) => getCat(d) === 'PHOTO')
  const videoItems = deliverables.filter((d: any) => getCat(d) === 'VIDEO')
  const otherItems = deliverables.filter((d: any) => getCat(d) === 'OTHER')

  const glassStyle = {
    background: 'rgba(0,0,0,0.40)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)'
  }

  const renderBox = (title: string, items: any[], accentColor: string) => {
    if (items.length === 0) return null
    return (
      <div className="rounded-2xl p-5 overflow-hidden" style={glassStyle}>
        <div className={`text-[9px] uppercase tracking-[0.3em] font-bold mb-4 font-mono`} style={{ color: accentColor }}>
          {title}
        </div>
        <div className="space-y-4">
          {items.map((d: any, idx: number) => {
            const rawLabel = d.name || d.label || String(d)
            const qty = Number(d.quantity || 1)
            const plural = qty > 1 && !rawLabel.endsWith('s') ? rawLabel + 's' : rawLabel
            const displayLabel = qty > 1 ? `${qty} ${plural}` : rawLabel
            return (
              <div key={idx} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-white/90">
                  <span className="text-xs font-semibold tracking-wide">{displayLabel}</span>
                </div>
                {d.description && (
                  <p className="text-[10px] text-white/50 italic leading-snug">
                    {d.description}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-neutral-950 overflow-hidden z-30 animate-in fade-in duration-500 touch-pan-y pointer-events-auto">
      {background ? isVid
        ? <video src={background} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-25" />
        : <img src={background} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />

      <div className="relative z-10 p-8 pt-16 overflow-y-auto h-full no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        <h2 className="text-[28px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg">What's Included</h2>
        <p className="text-[12px] text-white/50 leading-relaxed mb-8 font-mono italic">A thoughtfully curated set of deliverables, crafted to preserve your story.</p>

        <div className="space-y-4 pb-48">
          {deliverables.length === 0 ? (
            <div className="text-white/30 text-sm italic text-center py-8 font-mono">Deliverables to be confirmed.</div>
          ) : (
            <>
              {renderBox('📸 Photography', photoItems, 'rgba(253, 224, 71, 0.8)')}
              {renderBox('🎬 Cinematography', videoItems, 'rgba(147, 197, 253, 0.8)')}
              {renderBox('📦 Other', otherItems, 'rgba(255, 255, 255, 0.6)')}
            </>
          )}

          {addons.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <h2 className="text-[28px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg">Elevate the Story</h2>
              <p className="text-[12px] text-white/50 leading-relaxed mb-6 font-mono italic">Optional premium features to enhance your celebration.</p>

              <div className="rounded-2xl p-5 overflow-hidden" style={glassStyle}>
                <div className="text-[9px] uppercase tracking-[0.3em] font-bold mb-4 font-mono" style={{ color: 'rgba(251, 191, 36, 0.8)' }}>
                  ✦ Add-on Features
                </div>
                <div className="space-y-3">
                  {addons.map((addon: any) => {
                    const isSelected = selectedAddonIds.includes(addon.id)
                    return (
                      <div 
                        key={addon.id} 
                        onClick={() => toggleAddon(addon.id)}
                        className={`relative rounded-xl p-4 cursor-pointer transition-all duration-300 overflow-hidden ${
                          isSelected ? 'bg-amber-400/10' : 'bg-white/[0.03]'
                        }`}
                        style={{ border: isSelected ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className={`text-xs font-semibold tracking-wide transition-colors ${isSelected ? 'text-amber-300' : 'text-white/90'}`}>
                              {addon.name}
                            </div>
                            {addon.description && <div className="text-[10px] text-white/40 mt-1 italic leading-relaxed">{addon.description}</div>}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 pt-0.5">
                            <div className={`text-[11px] font-mono leading-none ${isSelected ? 'text-amber-200' : 'text-white/40'}`}>
                              ₹{Number(addon.price).toLocaleString('en-IN')}
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-amber-400 border-amber-400' : 'border-white/15'
                            }`}>
                              {isSelected && <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button 
                disabled={selectedAddonIds.length === 0 || isRequesting || isRequested}
                onClick={handleRequest}
                className="w-full mt-4 rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.2em] transition-all duration-300 shadow-2xl relative overflow-hidden"
                style={{
                  background: isRequested ? 'rgba(16,185,129,0.1)' : 'rgba(251, 191, 36, 0.1)',
                  border: isRequested ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(251, 191, 36, 0.3)',
                  color: isRequested ? '#6ee7b7' : '#fcd34d',
                  opacity: selectedAddonIds.length === 0 && !isRequested ? 0.3 : 1
                }}
              >
                {isRequesting ? 'Notifying Sales...' : isRequested ? '✓ Selection Requested' : 'Request Selection'}
              </button>
              {isRequested && (
                <p className="text-[10px] text-center text-emerald-400/60 font-mono mt-3 italic animate-in slide-in-from-top-1">
                  Sales has been notified of your interest. 
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const SlideTimeline = ({ timeline, background }: { timeline: any, background?: string }) => {
  const isVid = background && (background.includes('.mp4') || background.includes('.webm') || background.includes('/api/videos/file'))
  const deliveries = [
    { key: 'teaser', label: 'Cinematic Teaser', icon: '✨' },
    { key: 'film', label: 'Wedding Film', icon: '🎬' },
    { key: 'album', label: 'Artisan Album', icon: '📖' },
  ]

  return (
    <div className="w-full h-full relative bg-neutral-950 overflow-hidden z-30 animate-in fade-in duration-500">
      {background ? isVid
        ? <video src={background} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-20 filter grayscale" />
        : <img src={background} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 filter grayscale" />
        : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/95" />

      <div className="relative z-10 p-8 pt-16 h-full flex flex-col">
        <h2 className="text-[28px] font-black text-white uppercase tracking-[.1em] leading-tight mb-2">The Roadmap</h2>
        <p className="text-[11px] text-white/50 uppercase tracking-widest font-mono mb-12">Your post‑production and delivery timeline.</p>

        <div className="space-y-4">
          {deliveries.map((item) => (
            <div
              key={item.key}
              className="w-full rounded-2xl px-6 py-5 flex items-center justify-between"
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            >
              <div className="flex items-center gap-4">
                <span className="text-xl">{item.icon}</span>
                <div className="flex flex-col">
                  <span className="text-[12px] uppercase tracking-widest text-white/40 font-mono mb-1">{item.label}</span>
                  <span className="text-[13px] font-medium text-white/90 font-mono italic">{timeline?.[item.key] || 'TBD'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto pb-12">
          <div className="p-5 rounded-3xl bg-white/5 border border-white/5 text-center">
            <p className="text-[11px] text-white/40 font-mono italic">
              "Good stories take time. We handcraft each frame with the same love you put into your celebration."
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const SlideInvestment = ({ paymentSchedule, totalPrice, salesOverridePrice, draftData, background }: any) => {
  const { tiers, isTiered } = getTierList(draftData)
  const displayPrice = salesOverridePrice ?? totalPrice
  const initialId = tiers.find((t: any) => t.isPopular)?.id || tiers[0]?.id
  const [selectedTierId, setSelectedTierId] = useState(initialId)
  const [expandedTierId, setExpandedTierId] = useState<string | null>(null)
  const [ctaOpen, setCtaOpen] = useState<null | 'reserve' | 'adjust' | 'decline'>(null)
  const [adjustChoice, setAdjustChoice] = useState<string>('')
  const [declineChoice, setDeclineChoice] = useState<string>('')

  return (
    <div className="w-full h-full relative bg-neutral-950 overflow-y-auto no-scrollbar touch-pan-y pointer-events-auto z-30" style={{ scrollbarWidth: 'none' }}>
      {background && <img src={background} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.07] grayscale pointer-events-none" />}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-transparent to-neutral-950/80 pointer-events-none" />
      <div className="relative z-10 p-8 pt-16">
        <h2 className="text-[28px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg">Investment</h2>
        <p className="text-[12px] text-white/50 leading-relaxed mb-6 font-mono italic">Choose the experience that reflects your vision.</p>

        {isTiered ? (
          <div className="grid gap-5">
            {tiers.map((tier: any, tierIdx: number) => {
              const tierName = String(tier.name || '').toLowerCase()
              const isSelected = selectedTierId === tier.id
              const isExpanded = expandedTierId === tier.id

              const tierBadgeText = tierName.includes('essential')
                ? 'Best Value'
                : tierName.includes('signature')
                  ? 'Most Popular'
                  : 'For Elites'

              const accentColor = tierName.includes('essential')
                ? '#C8D8E8'
                : tierName.includes('signature')
                  ? '#F0D4A0'
                  : '#C8956A'

              return (
                <div
                  key={tier.id}
                  onClick={() => {
                    if (selectedTierId !== tier.id) {
                      setSelectedTierId(tier.id)
                      setExpandedTierId(tier.id)
                    } else {
                      setExpandedTierId(expandedTierId === tier.id ? null : tier.id)
                    }
                  }}
                  className="relative rounded-2xl cursor-pointer transition-all duration-300"
                  style={{
                    background: 'rgba(0,0,0,0.40)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: isSelected ? `1.5px solid ${accentColor}` : '1px solid rgba(255,255,255,0.08)',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: isSelected 
                      ? `0 0 30px ${accentColor}18, 0 8px 32px rgba(0,0,0,0.4)` 
                      : '0 4px 20px rgba(0,0,0,0.25)',
                  }}
                >
                  {/* Floating badge on top */}
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] px-3 py-1 rounded-full shadow-xl z-20 transition-all duration-300"
                    style={{ 
                      background: isSelected ? accentColor : `${accentColor}30`,
                      color: isSelected ? '#0a0a0a' : accentColor,
                    }}
                  >
                    {tierBadgeText}
                  </div>

                  <div className="p-5 pt-4">
                    {/* Name + Price Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div 
                          className="text-[13px] uppercase tracking-[0.15em] font-black transition-colors duration-300"
                          style={{ color: isSelected ? accentColor : 'rgba(255,255,255,0.6)' }}
                        >
                          {tier.name}
                        </div>
                        {tier.description && (
                          <p className="text-[11px] text-white/35 mt-1.5 leading-snug font-mono italic max-w-[200px]">{tier.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div 
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300"
                          style={{ borderColor: isSelected ? accentColor : 'rgba(255,255,255,0.2)' }}
                        >
                          <div 
                            className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                            style={{ 
                              background: isSelected ? accentColor : 'transparent',
                              transform: isSelected ? 'scale(1)' : 'scale(0)',
                            }}
                          />
                        </div>
                        <div className="text-right">
                          {(tierName.includes('bespoke') || tierName.includes('luxury')) ? (
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.15em] text-white/50 font-medium">On Request</div>
                              {tier.luxuryRangeLow && tier.luxuryRangeHigh && (
                                <div className="text-[10px] text-white/30 mt-0.5">{formatMoney(tier.luxuryRangeLow)} – {formatMoney(tier.luxuryRangeHigh)}</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="text-xl font-bold text-white tracking-tight">{formatMoney(tier.price)}</div>
                              <div className="text-[9px] text-white/30 mt-0.5 font-mono">exc. GST</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable description with grow animation */}
                    <div 
                      className="grid transition-all duration-500 ease-in-out"
                      style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-4 pt-4 border-t border-white/[0.06]">
                          <p className="text-[11px] text-white/50 leading-relaxed italic">
                            {(() => {
                              if (tierName.includes('essential')) return 'Crafted for couples who value simplicity and elegance, the Essential experience focuses on capturing your wedding in a natural, unobtrusive way.'
                              if (tierName.includes('signature')) return 'Designed for couples who want the highest level of quality and attention, where every moment is captured with precision, intention, and a deeper level of storytelling.'
                              if (tierName.includes('bespoke')) return 'Built for couples who want a no-compromise experience — where every detail is thoughtfully planned, executed, and crafted into a premium visual story.'
                              return ''
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div 
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.40)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* Top decorative line */}
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(240,212,160,0.6), transparent)' }} />
            <div className="p-8 text-center">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-mono mb-4">Total Production Value</div>
              <div className="text-4xl font-black text-white tracking-tight drop-shadow-lg">{formatMoney(displayPrice)}</div>
              <div className="text-[10px] text-white/30 mt-2 font-mono italic">exclusive of applicable taxes</div>
              <div className="w-12 h-[1px] bg-white/10 mx-auto mt-5" />
            </div>
          </div>
        )}

        <div 
          className="mt-10 rounded-2xl p-6 overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <h3 className="text-[18px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg">Payment Structure</h3>
          <p className="text-[11px] text-white/50 leading-relaxed mb-5 font-mono italic">A smooth path from booking to celebration.</p>
          <div className="space-y-2">
            {paymentSchedule.length === 0 && <div className="text-[11px] text-white/40 italic font-mono">Payments structured upon confirmation.</div>}
            {paymentSchedule.map((stage: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-white/90">
                <span className="text-xs font-medium tracking-wide">{stage.label}</span>
                <span className="text-xs font-medium tracking-wide text-white/60">{stage.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-3">
          <button 
            onClick={() => setCtaOpen('reserve')} 
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2.5 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(16,185,129,0.15)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid rgba(16,185,129,0.4)`,
              color: '#6ee7b7',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            Reserve Your Date
          </button>
          <button 
            onClick={() => setCtaOpen('adjust')} 
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2.5 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(245,158,11,0.12)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#fcd34d',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            Adjust This Plan
          </button>
          <button 
            onClick={() => setCtaOpen('decline')} 
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2.5 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            Not a Fit for Us
          </button>
        </div>
      </div>

      <ModalShell open={ctaOpen === 'reserve'} onClose={() => setCtaOpen(null)} title="Reserve Your Date">
        <p className="text-sm text-white/70 mb-4">A 25% booking amount + 18% GST is required to reserve your date.</p>
        <p className="text-sm text-white/60 mb-6">Would you like to pay now?</p>
        <div className="flex gap-3">
          <button className="flex-1 rounded-xl bg-emerald-500 text-white text-sm font-semibold py-2.5">Pay Now</button>
          <button onClick={() => setCtaOpen(null)} className="flex-1 rounded-xl bg-neutral-800 text-white/80 text-sm font-semibold py-2.5">Not Now</button>
        </div>
      </ModalShell>

      <ModalShell open={ctaOpen === 'adjust'} onClose={() => setCtaOpen(null)} title="Adjust This Plan">
        <p className="text-sm text-white/70 mb-4">What would you like to adjust?</p>
        <div className="grid gap-2 mb-6">
          {['Coverage', 'Deliverables', 'Budget'].map(option => (
            <button
              key={option}
              onClick={() => setAdjustChoice(option)}
              className={`rounded-xl border px-4 py-2.5 text-sm ${
                adjustChoice === option ? 'border-amber-400 bg-amber-400/10 text-white' : 'border-white/10 text-white/70'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <button onClick={() => { setCtaOpen(null); setAdjustChoice('') }} className="w-full rounded-xl bg-amber-500 text-white text-sm font-semibold py-2.5">
          Send
        </button>
      </ModalShell>

      <ModalShell open={ctaOpen === 'decline'} onClose={() => setCtaOpen(null)} title="Thanks for letting us know">
        <p className="text-sm text-white/70 mb-4">Would you like to share why?</p>
        <div className="grid gap-2 mb-6">
          {['Budget', 'Exploring other options', 'Timeline', 'Just browsing'].map(option => (
            <button
              key={option}
              onClick={() => setDeclineChoice(option)}
              className={`rounded-xl border px-4 py-2.5 text-sm ${
                declineChoice === option ? 'border-neutral-400 bg-white/10 text-white' : 'border-white/10 text-white/70'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <button onClick={() => { setCtaOpen(null); setDeclineChoice('') }} className="w-full rounded-xl bg-neutral-800 text-white text-sm font-semibold py-2.5">
          Send
        </button>
      </ModalShell>
    </div>
  )
}

const ModalShell = ({ open, onClose, title, children }: { open: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const SlideTestimonials = ({ testimonials }: { testimonials: any[] }) => {
  const glassStyle = {
    background: 'rgba(0,0,0,0.40)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)'
  }

  return (
    <div className="w-full h-full relative bg-neutral-950 flex flex-col overflow-hidden z-30 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 pointer-events-none" />
      
      <div className="relative z-10 p-8 pt-16 flex flex-col h-full">
        <h2 className="text-[28px] font-black text-white tracking-[0.05em] leading-tight mb-1 drop-shadow-lg">Client Love</h2>
        <p className="text-[12px] text-white/50 leading-relaxed font-mono italic mb-8">Kind words from those who let us tell their story.</p>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pb-24" style={{ scrollbarWidth: 'none' }}>
          {testimonials.map((t: any, idx: number) => {
            const isVideo = t.media_url && (t.media_url.includes('.mp4') || t.media_url.includes('.webm') || t.media_url.includes('/api/videos/file'))
            const coupleName = t.couple_names || t.coupleNames || t.couple_name || null
            return (
              <div 
                key={idx} 
                className="rounded-2xl overflow-hidden"
                style={glassStyle}
              >
                {t.media_url && (
                  <div className="w-full">
                    {isVideo ? (
                      <video src={t.media_url} controls playsInline className="w-full max-h-[60vh] object-contain bg-black" />
                    ) : (
                      <img src={t.media_url} alt="" className="w-full aspect-[16/9] object-cover" />
                    )}
                  </div>
                )}

                <div className="p-5">
                  {t.testimonial_text && (
                    <p className="text-white/80 text-[13px] leading-[1.7] italic">
                      "{t.testimonial_text}"
                    </p>
                  )}

                  {coupleName && (
                    <div className="mt-3">
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">— {coupleName}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const SlideConnect = ({ contactData }: { contactData?: any }) => {
  return (
    <div className="w-full h-full relative bg-neutral-950 flex flex-col overflow-hidden z-30 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-gradient-to-tr from-black via-neutral-900 to-black pointer-events-none" />
      
      <div className="relative z-10 p-8 pt-16 flex flex-col h-full">
        <div className="mt-auto mb-16">
          <h2 className="text-[32px] font-black text-white uppercase tracking-tighter leading-[1.1] mb-4">
            Let's Tell<br />
            <span className="text-emerald-400 italic font-mono font-medium lowercase">Your Story.</span>
          </h2>
          <p className="text-[13px] text-white/50 leading-relaxed font-mono max-w-[280px]">
            We'd love to be the ones to capture your magic. Here's how to reach us.
          </p>
        </div>

        <div 
          className="rounded-3xl p-6 space-y-5"
          style={{
            background: 'rgba(255,255,255,0.02)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <ContactRow 
            label="Call" 
            value={contactData?.phone || ['+91 756000 8899', '+91 998877 3181']} 
            icon="phone" 
          />
          <ContactRow 
            label="Email" 
            value={contactData?.email || 'contact@mistyvisuals.com'} 
            icon="email" 
          />
          <ContactRow 
            label="Instagram" 
            value={contactData?.instagram || 'weddingsbymistyvisuals'} 
            icon="instagram" 
            link="https://www.instagram.com/weddingsbymistyvisuals/" 
          />
          <ContactRow 
            label="Location" 
            value={contactData?.address || '415, Sector-40, Gurgaon'} 
            icon="pin" 
            link="https://maps.app.goo.gl/eQ5tbA8WRWqtPxnJ7" 
          />
        </div>

        <div className="mt-auto pt-12 pb-8 flex flex-col items-center gap-4">
          <img
            src="/logo.png"
            alt="Misty Visuals"
            className="h-10 object-contain opacity-50 grayscale contrast-125"
            onError={e => (e.currentTarget.style.display = 'none')}
          />
          <p className="text-center text-[9px] uppercase tracking-[0.4em] text-white/30 font-bold font-mono">
            © 2019 MISTY VISUALS PVT LTD
          </p>
        </div>
      </div>
    </div>
  )
}

const ContactRow = ({ label, value, icon, link }: { label: string, value: string | string[], icon: string, link?: string }) => {
  const renderIcon = () => {
    if (icon === 'phone') {
      return <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v2.6a2 2 0 0 1-2.2 2a19.9 19.9 0 0 1-8.6-3.1a19.5 19.5 0 0 1-6-6a19.9 19.9 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h2.6a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.7l-1 1a16 16 0 0 0 6 6l1-1a2 2 0 0 1 1.7-.6l2.6.4a2 2 0 0 1 1.7 2z"/></svg>
    }
    if (icon === 'email') {
      return <svg className="h-5 w-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><path d="m22 7-10 6L2 7" /></svg>
    }
    if (icon === 'pin') {
      return <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
    }
    if (icon === 'instagram') {
      return <svg className="h-5 w-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.2" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
    }
    if (icon === 'youtube') {
      return <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M11 10.5 15.5 12 11 13.5z" fill="currentColor" stroke="none" /></svg>
    }
    return null
  }

  return (
    <div className="flex items-center gap-4">
      {renderIcon()}
      <div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold mb-0.5">{label}</div>
        <div className="text-white/80 text-[13px] font-medium">
          {Array.isArray(value) ? (
            <div className="flex flex-col">
              {value.map((v) => (
                <a key={v} href={`tel:${v.replace(/\s+/g, '')}`} className="hover:text-white transition-colors">{v}</a>
              ))}
            </div>
          ) : link ? (
            <a href={link} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">{value}</a>
          ) : (
            <span>{value}</span>
          )}
        </div>
      </div>
    </div>
  )
}
