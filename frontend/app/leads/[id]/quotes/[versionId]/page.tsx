'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { create } from 'zustand'
import { formatLeadName } from '@/lib/leadNameFormat'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { formatDateTime, formatDate, formatTimeStr, toISTDateInput, toISTISOString, toISTDatetimeLocalInput } from '@/lib/formatters'
import CurrencyInput from '@/components/CurrencyInput'
import CalendarInput from '@/components/CalendarInput'
import { getAuth } from '@/lib/authClient'
import StoryViewer from '@/components/StoryViewer'
import PhotoPickerModal from '@/components/PhotoPickerModal'

const HoverVideo = ({ src, className, onClick }: any) => {
  return (
    <video 
      src={src} 
      muted 
      loop 
      playsInline 
      preload="metadata"
      className={className}
      onClick={onClick}
      onMouseEnter={e => e.currentTarget.play().catch(() => {})}
      onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
    />
  )
}

type QuoteHero = {
  title: string
  subtitle: string
  location: string
  date: string
  coverImageUrl: string
  coupleNames?: string
}

type QuoteEvent = {
  id: string
  name: string
  originalType?: string
  date: string
  location: string
  coverImageUrl?: string
  pax?: number
  time?: string
  slot?: string | null
  venue_metadata?: any | null
  date_status?: 'confirmed' | 'tentative' | 'tba'
}

type QuoteDeliverable = {
  label: string
  description: string
  heroImage?: string
}

type QuotePricingItem = {
  id: string
  itemType?: 'TEAM_ROLE' | 'DELIVERABLE'
  catalogId?: number | null
  label: string
  quantity: number
  unitPrice: number
  eventId?: string | null
}

type QuotePaymentScheduleItem = {
  label: string
  dueDate: string
  amount: number
  percentage?: number
}

type QuoteTier = {
  id: string
  name: string
  price: number                 // system-generated
  overridePrice?: number | null // user override — becomes the displayed price
  discountedPrice?: number | null // special discount price (triggers strikethrough)
  discountLabel?: string        // e.g. "Early Bird", "Diwali Special"
  description: string
  isPopular?: boolean
  itemsIncluded?: string[]
  luxuryRangeLow?: number
  luxuryRangeHigh?: number
}

type QuoteDraft = {
  hero: QuoteHero
  events: QuoteEvent[]
  deliverables: QuoteDeliverable[]
  pricingItems: QuotePricingItem[]
  paymentSchedule: QuotePaymentScheduleItem[]
  overridePrice: number | null
  overrideReason: string
  quoteGroupId: number | null
  moodboard?: any[]
  portraits?: any[]
  whatsIncludedBackground?: string
  connectCoverImageUrl?: string
  testimonials?: any[]
  pricingMode?: 'SINGLE' | 'TIERED'
  tiers?: QuoteTier[]
  selectedTierId?: string | null
  expirySettings?: {
     validUntil?: string
     discountEnabled?: boolean
     discountTitle?: string
     discountAmount?: number
     discountExpiresAt?: string
  }
  additionalTerms?: string[]
  offeredAddons?: number[]
}

type PricingSummary = {
  calculatedPrice: number
  targetPrice: number
  minimumPrice: number
}

type QuoteStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'EXPIRED' | 'ACCEPTED' | 'ADMIN_REJECTED'

type CatalogItem = {
  id: number
  name: string
  price: number
  unitType: string
  active: boolean
  category?: string | null
}

type QuoteBuilderState = {
  draft: QuoteDraft
  pricingSummary: PricingSummary
  isSaving: boolean
  lastSavedAt: string | null
  activeTab: 'cover' | 'moodboard' | 'testimonials' | 'schedule' | 'deliverables' | 'addons' | 'investment' | 'conditions'
  setActiveTab: (tab: 'cover' | 'moodboard' | 'testimonials' | 'schedule' | 'deliverables' | 'addons' | 'investment' | 'conditions') => void
  setDraft: (next: QuoteDraft) => void
  updateDraft: (patch: Partial<QuoteDraft>) => void
  setPricingSummary: (summary: Partial<PricingSummary>) => void
  setSaving: (value: boolean) => void
  setLastSavedAt: (value: string | null) => void
}

const emptyDraft: QuoteDraft = {
  hero: { title: 'Wedding Proposal', subtitle: 'Captured with care', location: '', date: '', coverImageUrl: '' },
  events: [],
  deliverables: [],
  pricingItems: [],
  paymentSchedule: [],
  overridePrice: null,
  overrideReason: '',
  quoteGroupId: null,
  moodboard: [],
}

const useQuoteBuilderStore = create<QuoteBuilderState>((set) => ({
  draft: emptyDraft,
  pricingSummary: { calculatedPrice: 0, targetPrice: 0, minimumPrice: 0 },
  isSaving: false,
  lastSavedAt: null,
  activeTab: 'cover',
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDraft: (draft) => set({ draft }),
  updateDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  setPricingSummary: (summary) => set((state) => ({ pricingSummary: { ...state.pricingSummary, ...summary } })),
  setSaving: (value) => set({ isSaving: value }),
  setLastSavedAt: (value) => set({ lastSavedAt: value }),
}))

const cardClass = 'bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 overflow-hidden relative'
const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-1 block'
const inputClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-2.5 text-sm focus:border-neutral-900 focus:bg-white focus:outline-none transition-colors duration-200'

const formatMoney = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
const generateId = () => Math.random().toString(36).substring(2, 9)
const dateToYMD = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const toDateOnly = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return dateToYMD(parsed)
  }
  return value.split('T')[0].split(' ')[0]
}

const getEventSlotRank = (slot?: string | null) => {
  const value = String(slot || '').toLowerCase()
  if (value.includes('morning')) return 0
  if (value.includes('day')) return 1
  if (value.includes('evening')) return 2
  if (value.includes('night')) return 3
  return 9
}

// Canonicalize slot for grouping concurrent events
// morning + day = same crew window (daytime)
// evening + night = same crew window (nighttime)
const normalizeSlot = (slot?: string | null): string => {
  const s = String(slot || '').toLowerCase().trim()
  if (!s) return '_no_slot'
  if (s.includes('morning') || s.includes('day') || s.includes('afternoon')) return 'daytime'
  if (s.includes('evening') || s.includes('night')) return 'nighttime'
  return s
}

const parseTimeSort = (timeStr?: string | null) => {
  if (!timeStr) return 9999 // Put missing times at end within that day
  const start = timeStr.split(/[-–]/)[0].trim().toLowerCase()
  const match = start.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!match) return 9999
  let [_, h, m, ap] = match
  let hours = parseInt(h, 10)
  let minutes = parseInt(m || '0', 10)
  if (ap === 'pm' && hours < 12) hours += 12
  if (ap === 'am' && hours === 12) hours = 0
  return hours * 60 + minutes
}

const sortQuoteEvents = (events: QuoteEvent[]) => {
  return [...events].sort((a, b) => {
    const aDate = toDateOnly(a.date)
    const bDate = toDateOnly(b.date)
    if (aDate !== bDate) return aDate.localeCompare(bDate)
    
    const aTime = parseTimeSort(a.time)
    const bTime = parseTimeSort(b.time)
    if (aTime !== 9999 || bTime !== 9999) {
      if (aTime !== bTime) return aTime - bTime
    }
    
    const aSlot = getEventSlotRank(a.slot)
    const bSlot = getEventSlotRank(b.slot)
    if (aSlot !== bSlot) return aSlot - bSlot
    return 0
  })
}
const formatMaybeDateTime = (value: string | null | undefined) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return formatDate(parsed)
}
const normalizeEventDates = (events: QuoteEvent[]) =>
  events.map((event) => ({ ...event, date: formatMaybeDateTime(event.date) }))

const buildPrefilledDraft = (draft: QuoteDraft, lead: any | null, status: QuoteStatus, media?: { videos: any[], photos: any[], testimonials: any[] }) => {
  if (!lead) return draft
  if (status !== 'DRAFT') {
     const pricingItems = draft.pricingItems?.map(p => ({ ...p, id: p.id || generateId() })) || []
     return { ...draft, events: normalizeEventDates(draft.events || []), pricingItems }
  }

  const formatted = formatLeadName(lead)
  const leadName = formatted.leadName || formatted.suffix || formatted.fulldisplay
  const getFirstName = (name: string | null) => name ? name.trim().split(/\s+/)[0] : null
  const coupleNames = (lead.bride_name || lead.groom_name) ? [getFirstName(lead.bride_name), getFirstName(lead.groom_name)].filter(Boolean).join(' & ') : (lead.name || '')
  const hero = { ...draft.hero }
  hero.title = leadName || hero.title
  hero.coupleNames = coupleNames || hero.coupleNames
  if (lead?.is_destination && lead?.country && lead.country.toLowerCase() !== 'india') hero.location = lead.country
  if (!hero.location && lead?.city_name) hero.location = lead.city_name
  if (hero.location === 'India') hero.location = '' // Final safety wipe if it leaked through somehow

  let newEvents: QuoteEvent[] = []
  if (lead?.events?.length > 0) {
     const sortedLeadEvents = [...lead.events].sort((a: any, b: any) => {
        const aDate = toDateOnly(a.event_date)
        const bDate = toDateOnly(b.event_date)
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        
        const aTime = parseTimeSort(a.start_time)
        const bTime = parseTimeSort(b.start_time)
        if (aTime !== 9999 || bTime !== 9999) {
          if (aTime !== bTime) return aTime - bTime
        }
        
        const aSlot = getEventSlotRank(a.slot)
        const bSlot = getEventSlotRank(b.slot)
        if (aSlot !== bSlot) return aSlot - bSlot
        return 0
     })
     const brideFirst = getFirstName(lead.bride_name)
     const groomFirst = getFirstName(lead.groom_name)
     const personalizeEvent = (rawName: string) => {
        const raw = rawName.trim()
        const lower = raw.toLowerCase()
        const cLower = (lead.coverage_scope || 'Both Sides').toLowerCase()
        const isBrideCov = cLower.includes('bride')
        const isGroomCov = cLower.includes('groom')
        const isBothCov = !isBrideCov && !isGroomCov
        
        const hasBride = lower.includes('bride')
        const hasGroom = lower.includes('groom')
        const bothKnown = brideFirst && groomFirst
        
        let clean = raw.replace(/\s*\([^)]*bride[^)]*\)/i, '').replace(/\s*\([^)]*groom[^)]*\)/i, '').trim()
        if (clean.toLowerCase() === 'wedding' || clean.toLowerCase() === 'the wedding') clean = 'Wedding Day'
        
        if (isBothCov) {
            if (hasBride && !hasGroom && brideFirst) return `${brideFirst}'s ${clean}`
            if (hasGroom && !hasBride && groomFirst) return `${groomFirst}'s ${clean}`
            if (!hasBride && !hasGroom && bothKnown) return `${brideFirst} & ${groomFirst}'s ${clean}`
        } else if (isBrideCov) {
            if ((hasBride || (!hasBride && !hasGroom)) && brideFirst) return `${brideFirst}'s ${clean}`
        } else if (isGroomCov) {
            if ((hasGroom || (!hasBride && !hasGroom)) && groomFirst) return `${groomFirst}'s ${clean}`
        }
        return raw
     }

     const activeLeadEvents = sortedLeadEvents.filter((le: any) => {
         if (!draft.events || draft.events.length === 0) return true
         return draft.events.some((e: any) => e.originalType === le.event_type || e.name === le.event_type || e.name === personalizeEvent(le.event_type))
     })

     newEvents = activeLeadEvents.map((le: any) => {
        const existing = draft.events?.find((e: any) => e.originalType === le.event_type || e.name === le.event_type || e.name === personalizeEvent(le.event_type))
        const rawT = [le.start_time, le.end_time].filter(Boolean).join(' - ')
        const t = formatTimeStr(rawT)
        
        let coverImageUrl = existing?.coverImageUrl || undefined
        if (!coverImageUrl && media) {
            const typeStr = (le.event_type || '').toLowerCase()
            const matchTag = (tags: any) => {
               if (!tags) return false
               const tArr = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : []
               // Never use 'deliverables'-tagged media for event backgrounds — reserved for What's Included
               if (tArr.some((t: string) => t.trim().toLowerCase() === 'deliverables')) return false
               return tArr.some((t: string) => typeStr.includes(t.trim().toLowerCase()))
            }
            
            const matchingVideos = media.videos.filter(v => matchTag(v.tags))
            if (matchingVideos.length > 0) {
               coverImageUrl = matchingVideos[Math.floor(Math.random() * matchingVideos.length)].url
            } else {
               const matchingPhotos = media.photos.filter(p => matchTag(p.tags))
               if (matchingPhotos.length > 0) {
                  coverImageUrl = matchingPhotos[Math.floor(Math.random() * matchingPhotos.length)].url
               }
            }
         }
        const generatedName = personalizeEvent(le.event_type || 'Event')
        // A name is "manually renamed" only if it doesn't match the raw type,
        // doesn't match the newly generated personalized name,
        // AND doesn't "contain" the base event word (meaning it's a truly custom label)
        const baseWord = (le.event_type || '').replace(/\s*\([^)]*\)/i,'').trim().toLowerCase()
        const savedLower = (existing?.name || '').toLowerCase()
        const isGenericOrPersonalized = !existing?.name 
           || savedLower === le.event_type?.toLowerCase()
           || savedLower.includes(baseWord)
           || existing?.originalType === le.event_type
        const finalName = isGenericOrPersonalized ? generatedName : existing!.name

        return {
           id: existing?.id || generateId(),
           originalType: le.event_type,
           name: finalName,
           date: le.event_date || '',
           location: le.venue || (le.city_name ? `TBD, ${le.city_name}` : hero.location ? `TBD, ${hero.location}` : 'TBD'),
           pax: le.pax || 0,
           time: t || existing?.time || '',
           coverImageUrl,
           slot: le.slot || null,
           venue_metadata: le.venue_metadata || existing?.venue_metadata || null,
           date_status: le.date_status || existing?.date_status || 'confirmed',
        }
     })
  } else if (lead?.event_type) {
     const existing = draft.events?.find(e => e.name === lead.event_type)
     newEvents = [{ id: existing?.id || generateId(), name: lead.event_type, date: '', location: hero.location || '', pax: 0, time: '' }]
  }

  // CRITICAL: If the lead has no events in lead_events but the draft already
  // has events (copied from a previous version), preserve the draft's events
  // and team assignments instead of wiping them with an empty array.
  const hasDraftEvents = Array.isArray(draft.events) && draft.events.length > 0
  if (newEvents.length === 0 && hasDraftEvents) {
     newEvents = draft.events.map((e: any) => ({ ...e, id: e.id || generateId() }))
  }
  
  const pricingItems = draft.pricingItems?.map(p => {
     let mappedEventId = p.eventId
     if (!mappedEventId && p.itemType === 'TEAM_ROLE' && newEvents.length > 0) {
        mappedEventId = newEvents[0].id
     }
     return { ...p, id: p.id || generateId(), eventId: mappedEventId }
  }) || []

  // Feature: What's Included background — strictly uses 'deliverables' tag, video first then photo fallback
  let whatsIncludedBackground = (draft as any).whatsIncludedBackground || ''
  if (!whatsIncludedBackground && media) {
      const hasDeliverableTag = (tags: any) => {
         if (!tags) return false
         const tArr = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : []
         return tArr.some((t: string) => t.trim().toLowerCase() === 'deliverables')
      }
      const deliverableVids = media.videos.filter(v => hasDeliverableTag(v.tags))
      if (deliverableVids.length > 0) {
          whatsIncludedBackground = deliverableVids[Math.floor(Math.random() * deliverableVids.length)].url
      } else {
          const deliverablePhotos = media.photos.filter(p => hasDeliverableTag(p.tags))
          if (deliverablePhotos.length > 0) {
              whatsIncludedBackground = deliverablePhotos[Math.floor(Math.random() * deliverablePhotos.length)].url
          }
      }
  }

  // Feature: Testimonials — filter against live catalog to prune deleted ones
  const liveTestimonialIds = new Set((media?.testimonials || []).map((t: any) => Number(t.id)))
  let testimonials = ((draft as any).testimonials || []).filter((t: any) => t && liveTestimonialIds.has(Number(t.id)))
  if (testimonials.length === 0 && media && media.testimonials.length > 0) {
      const shuffled = [...media.testimonials].sort(() => 0.5 - Math.random())
      testimonials = shuffled.slice(0, 3)
  }

   return {
      ...draft,
      hero: { ...hero, date: formatMaybeDateTime(hero.date) },
      events: normalizeEventDates(newEvents),
      pricingItems,
      whatsIncludedBackground,
      testimonials,
      pricingMode: draft.pricingMode || 'TIERED',
      tiers: draft.tiers || [
         { id: 'tier_1', name: 'Essential', price: 0, description: 'Elegant and timeless coverage for intimate celebrations.', itemsIncluded: [] },
         { id: 'tier_2', name: 'Signature', price: 0, description: 'A refined storytelling experience for modern weddings', isPopular: true, itemsIncluded: [] },
         { id: 'tier_3', name: 'Bespoke', price: 0, description: 'Your wedding, told at its finest', itemsIncluded: [] }
      ],
      paymentSchedule: (draft.paymentSchedule?.length === 0 || (draft.paymentSchedule?.[0]?.label === 'New Payment')) ? [
         { label: 'Booking Advance', dueDate: 'Upon Booking', percentage: 25, amount: 0 },
         { label: 'Event Day Payment', dueDate: 'Event Day', percentage: 65, amount: 0 },
         { label: 'Final Handover', dueDate: 'Handover', percentage: 10, amount: 0 }
      ] : draft.paymentSchedule
   }
}

const QuoteBuilderPage = () => {
  const params = useParams() as { id: string; versionId: string }
  const leadId = params.id
  const versionId = params.versionId
  const { draft, pricingSummary, isSaving, lastSavedAt, activeTab, setActiveTab, setDraft, updateDraft, setPricingSummary, setSaving, setLastSavedAt } = useQuoteBuilderStore()
  
  const [lead, setLead] = useState<any | null>(null)
  const [teamRoles, setTeamRoles] = useState<CatalogItem[]>([])
  const [deliverablesCatalog, setDeliverablesCatalog] = useState<CatalogItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('DRAFT')
  const isLocked = ['SENT', 'EXPIRED', 'ACCEPTED'].includes(quoteStatus)

  // ── Quick Add Presets ─────────────────────────────────────────────────────
  const [presets, setPresets] = useState<any[]>([])
  const [quickAddModal, setQuickAddModal] = useState<{ open: boolean; type: 'TEAM' | 'DELIVERABLE'; eventId?: string } | null>(null)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [isPreviewModalOpen, setPreviewModalOpen] = useState(false)
  const [expiryPickerOpen, setExpiryPickerOpen] = useState(false)
  const [versionExpiresAt, setVersionExpiresAt] = useState<string | null>(null)
  const [proposalLink, setProposalLink] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  
  const [pickingPhotoFor, setPickingPhotoFor] = useState<{type: 'cover'} | {type: 'event', eventId: string} | {type: 'moodboard', index?: number} | {type: 'deliverables'} | null>(null)
  const [randomCovers, setRandomCovers] = useState<string[]>([])

  useEffect(() => {
    apiFetch('/api/public/covers')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setRandomCovers(data) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // Instant local math — slot-aware crew pricing + orphan item filtering
  const localCalculatedTotal = useMemo(() => {
     // 0. Valid event ID set (to detect orphaned pricing items)
     const validEventIds = new Set((draft.events as any[]).map(e => e.id))

     // 1. Map events to YYYY-MM-DD dates and normalized slots
     const eventIdToDate: Record<string, string> = {}
     const eventIdToSlot: Record<string, string> = {}
     draft.events.forEach((e: any) => {
        if (e.id) {
           eventIdToSlot[e.id] = normalizeSlot(e.slot)
           if (e.date) {
              const d = new Date(e.date)
              eventIdToDate[e.id] = !Number.isNaN(d.getTime())
                 ? toISTDateInput(d)
                 : String(e.date).split('T')[0].split(' ')[0]
           }
        }
     })

     // 2. Map deliverable units from catalog
     const delUnits: Record<number, string> = {}
     deliverablesCatalog.forEach((d: any) => { delUnits[d.id] = d.unitType })

     let total = 0
     // Slot-aware crew: dateKey → slotKey → catalogKey → summed qty + unit price
     const crewSlotSums: Record<string, Record<string, Record<string, { qty: number; price: number }>>> = {}
     // Deliverables: still per-day-max
     const delDailyMaxes: Record<string, Record<string, { max: number; price: number }>> = {}

     draft.pricingItems.forEach((it: any) => {
        // Skip orphaned items (eventId set but that event was deleted/replaced)
        if (it.eventId && !validEventIds.has(it.eventId)) return

        const type = it.itemType
        const catalogId = Number(it.catalogId)
        const qty = Number(it.quantity || 0)
        const price = Number(it.unitPrice || 0)
        const ck = String(catalogId)
        const unitType = type === 'TEAM_ROLE' ? 'PER_DAY' : (delUnits[catalogId] || 'PER_UNIT')
        const dateKey = it.eventId ? eventIdToDate[it.eventId] : null
        const slotKey = it.eventId ? eventIdToSlot[it.eventId] : null

        if (type === 'TEAM_ROLE') {
           if (dateKey && slotKey) {
              // Same day + same slot → events are concurrent → SUM qty
              if (!crewSlotSums[dateKey]) crewSlotSums[dateKey] = {}
              if (!crewSlotSums[dateKey][slotKey]) crewSlotSums[dateKey][slotKey] = {}
              const prev = crewSlotSums[dateKey][slotKey][ck]
              if (!prev) crewSlotSums[dateKey][slotKey][ck] = { qty, price }
              else prev.qty += qty
           } else {
              // No date or no event mapping → raw sum (unassigned/dateless)
              total += qty * price
           }
        } else {
           if (unitType === 'PER_DAY' && dateKey) {
              if (!delDailyMaxes[dateKey]) delDailyMaxes[dateKey] = {}
              if (!delDailyMaxes[dateKey][ck]) delDailyMaxes[dateKey][ck] = { max: 0, price }
              delDailyMaxes[dateKey][ck].max = Math.max(delDailyMaxes[dateKey][ck].max, qty)
           } else {
              total += qty * price
           }
        }
     })

     // 3. Per day: take the slot that requires the MOST crew per role (photographer covers whole day)
     Object.values(crewSlotSums).forEach(slotMap => {
        const maxByRole: Record<string, { qty: number; price: number }> = {}
        Object.values(slotMap).forEach(roleMap => {
           Object.entries(roleMap).forEach(([ck, { qty, price }]) => {
              if (!maxByRole[ck] || qty > maxByRole[ck].qty) maxByRole[ck] = { qty, price }
           })
        })
        Object.values(maxByRole).forEach(({ qty, price }) => { total += qty * price })
     })

     // 4. Add deliverable daily maxes
     Object.values(delDailyMaxes).forEach(day => {
        Object.values(day).forEach(({ max, price }) => { total += max * price })
     })

     return total
  }, [draft.pricingItems, draft.events, deliverablesCatalog])

  // Detailed pricing breakdown for admin bifurcation — slot-aware + orphan filtering
  const pricingBreakdown = useMemo(() => {
     const validEventIds = new Set((draft.events as any[]).map(e => e.id))

     const eventIdToDate: Record<string, string> = {}
     const eventIdToName: Record<string, string> = {}
     const eventIdToSlot: Record<string, string> = {}
     draft.events.forEach((e: any) => {
        if (e.id) {
           eventIdToName[e.id] = e.name || 'Event'
           eventIdToSlot[e.id] = normalizeSlot(e.slot)
           if (e.date) {
              const d = new Date(e.date)
              eventIdToDate[e.id] = !Number.isNaN(d.getTime())
                 ? toISTDateInput(d)
                 : String(e.date).split('T')[0].split(' ')[0]
           }
        }
     })

     const delUnits: Record<number, string> = {}
     deliverablesCatalog.forEach((d: any) => { delUnits[d.id] = d.unitType })

     let crewTotal = 0
     let deliverablesTotal = 0

     // Slot-aware crew: dateKey → slotKey → catalogKey → { qty (summed), price }
     const crewSlotSums: Record<string, Record<string, Record<string, { qty: number; price: number }>>> = {}
     // Track eventIds per dateKey for sub-row labels
     const dateToEventIds: Record<string, string[]> = {}
     const delDailyMaxes: Record<string, Record<string, { max: number; price: number }>> = {}

     draft.pricingItems.forEach((it: any) => {
        // Skip orphaned items
        if (it.eventId && !validEventIds.has(it.eventId)) return

        const type = it.itemType
        const catalogId = Number(it.catalogId)
        const qty = Number(it.quantity || 0)
        const price = Number(it.unitPrice || 0)
        const ck = String(catalogId)
        const unitType = type === 'TEAM_ROLE' ? 'PER_DAY' : (delUnits[catalogId] || 'PER_UNIT')
        const dateKey = it.eventId ? eventIdToDate[it.eventId] : null
        const slotKey = it.eventId ? eventIdToSlot[it.eventId] : null

        if (type === 'TEAM_ROLE') {
           if (dateKey && slotKey) {
              if (!crewSlotSums[dateKey]) crewSlotSums[dateKey] = {}
              if (!crewSlotSums[dateKey][slotKey]) crewSlotSums[dateKey][slotKey] = {}
              const prev = crewSlotSums[dateKey][slotKey][ck]
              if (!prev) crewSlotSums[dateKey][slotKey][ck] = { qty, price }
              else prev.qty += qty // SUM — concurrent slots need cumulative crew
              // Track which events are on this date
              if (!dateToEventIds[dateKey]) dateToEventIds[dateKey] = []
              if (it.eventId && !dateToEventIds[dateKey].includes(it.eventId)) dateToEventIds[dateKey].push(it.eventId)
           } else {
              crewTotal += qty * price
           }
        } else {
           if (unitType === 'PER_DAY' && dateKey) {
              if (!delDailyMaxes[dateKey]) delDailyMaxes[dateKey] = {}
              if (!delDailyMaxes[dateKey][ck]) delDailyMaxes[dateKey][ck] = { max: 0, price }
              delDailyMaxes[dateKey][ck].max = Math.max(delDailyMaxes[dateKey][ck].max, qty)
           } else {
              deliverablesTotal += qty * price
           }
        }
     })

     // Build per-event sub-rows: dayCost = sum of (max-slot qty × price) per role
     const crewByEvent: { eventId: string; name: string; cost: number }[] = []

     Object.entries(crewSlotSums).forEach(([dateKey, slotMap]) => {
        // Find the peak slot per role
        const maxByRole: Record<string, { qty: number; price: number }> = {}
        Object.values(slotMap).forEach(roleMap => {
           Object.entries(roleMap).forEach(([ck, { qty, price }]) => {
              if (!maxByRole[ck] || qty > maxByRole[ck].qty) maxByRole[ck] = { qty, price }
           })
        })
        let dayCost = 0
        Object.values(maxByRole).forEach(({ qty, price }) => { dayCost += qty * price })
        crewTotal += dayCost

        const eventIds = dateToEventIds[dateKey] || []
        if (eventIds.length === 1) {
           crewByEvent.push({ eventId: eventIds[0], name: eventIdToName[eventIds[0]] || 'Event', cost: dayCost })
        } else {
           const names = eventIds.map(id => eventIdToName[id] || 'Event')
           const label = names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} more`
           crewByEvent.push({ eventId: dateKey, name: label, cost: dayCost })
        }
     })

     // Add any explicitly unassigned crew (eventId = null, not orphaned)
     const unassignedCrew = (draft.pricingItems as any[])
        .filter(it => it.itemType === 'TEAM_ROLE' && !it.eventId)
        .reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unitPrice || 0), 0)
     if (unassignedCrew > 0) {
        crewByEvent.push({ eventId: '_unassigned', name: 'Unassigned', cost: unassignedCrew })
     }

     Object.values(delDailyMaxes).forEach(day => {
        Object.values(day).forEach(({ max, price }) => { deliverablesTotal += max * price })
     })

     const numDays = new Set(Object.values(eventIdToDate)).size
     return { crewTotal, deliverablesTotal, numDays, crewByEvent }
  }, [draft.pricingItems, draft.events, deliverablesCatalog])
  
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null)
  const pricingSyncTimer = useRef<NodeJS.Timeout | null>(null)
  const autoCurateInitRef = useRef(false)

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) => fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [versionRes, leadRes, teamRes, delRes, authRes, vidRes, photoRes, testRes, presetsRes] = await Promise.all([
          apiFetch(`/api/quote-versions/${versionId}`),
          apiFetch(`/api/leads/${leadId}`),
          apiFetch('/api/catalog/team-roles'),
          apiFetch('/api/catalog/deliverables'),
          getAuth(),
          apiFetch('/api/videos'),
          apiFetch('/api/photos'),
          apiFetch('/api/testimonials'),
          apiFetch('/api/catalog/presets')
        ])
        const versionData = await versionRes.json().catch(() => null)
        const leadData = await leadRes.json().catch(() => null)
        const teamData = await teamRes.json().catch(() => [])
        const delData = await delRes.json().catch(() => [])
        const videosData = await vidRes.json().catch(() => [])
        const photosData = await photoRes.json().catch(() => [])
        const testData = await testRes.json().catch(() => [])
        const presetsData = await presetsRes.json().catch(() => [])
        
        if (!active) return
        if (!versionRes.ok || !versionData) return setError('Unable to load quotation.')

        if (authRes?.authenticated) setRoles(Array.isArray(authRes.user?.roles) ? authRes.user.roles : [])
        if (leadRes.ok && leadData) setLead(leadData)
        if (teamRes.ok) setTeamRoles(Array.isArray(teamData) ? teamData : [])
        if (delRes.ok) setDeliverablesCatalog(Array.isArray(delData) ? delData : [])
        if (presetsRes.ok) setPresets(Array.isArray(presetsData) ? presetsData : [])

        const fetchedStatus = versionData?.status || 'DRAFT'
        const baseDraft = versionData?.draftDataJson && typeof versionData.draftDataJson === 'object' 
           ? { ...emptyDraft, ...versionData.draftDataJson } 
           : { ...emptyDraft }
        
        // 1. Recover Pricing Items flawlessly. Prioritize JSON draft which securely holds layout metadata (eventId, custom labels). 
        // Only use lossy dbItems map if draft is empty (e.g. legacy data).
        const dbItems = Array.isArray(versionData.items) ? versionData.items : []
        const draftItems = Array.isArray(baseDraft.pricingItems) ? baseDraft.pricingItems : []

        if (draftItems.length > 0) {
           baseDraft.pricingItems = draftItems.map((dIt: any) => {
              const catalog = dIt.itemType === 'TEAM_ROLE' ? teamData : delData
              const catItem = catalog.find((c: any) => c.id === dIt.catalogId)
              return { 
                ...dIt, 
                category: dIt.category || catItem?.category,
                description: dIt.description || catItem?.description || null
              }
           });
        } else {
           baseDraft.pricingItems = dbItems.map((dbIt: any) => {
              const catalog = dbIt.itemType === 'TEAM_ROLE' ? teamData : delData
              const catItem = catalog.find((c: any) => c.id === dbIt.catalogId)
              return {
                 id: dbIt.id?.toString() || generateId(),
                 itemType: dbIt.itemType,
                 catalogId: dbIt.catalogId,
                 label: dbIt.label || catItem?.name || 'Item',
                 category: catItem?.category,
                 description: catItem?.description || null,
                 quantity: Number(dbIt.quantity || 1),
                 unitPrice: Number(dbIt.unitPrice || 0),
                 eventId: dbIt.eventId?.toString() || null
              }
           })
        }

        const merged = buildPrefilledDraft({
          ...baseDraft,
          quoteGroupId: versionData.quoteGroupId ?? null,
          overridePrice: baseDraft.overridePrice ?? (versionData?.salesOverridePrice !== null ? Number(versionData?.salesOverridePrice) : null),
          overrideReason: baseDraft.overrideReason ?? (versionData?.overrideReason || ''),
        }, leadRes.ok ? leadData : null, fetchedStatus, { videos: videosData, photos: photosData, testimonials: testData })

        merged.events = normalizeEventDates(sortQuoteEvents(merged.events || []))
        setDraft(merged)
        setPricingSummary({
          calculatedPrice: Number(versionData?.calculatedPrice || 0),
          targetPrice: Number(versionData?.targetPrice || 0),
          minimumPrice: Number(versionData?.minimumPrice || 0),
        })
        setQuoteStatus(fetchedStatus)
        if (versionData?.expiresAt) setVersionExpiresAt(versionData.expiresAt)
        // Restore existing proposal link for sent/expired quotes
        const existingToken = versionData?.proposalSnapshots?.[0]?.proposalToken
        if (existingToken) setProposalLink(`${window.location.origin}/p/${existingToken}`)
      } catch {
        if (active) setError('Failure fetching builder data.')
      }
    }
    load()
    return () => { active = false }
  }, [leadId, versionId, setDraft, setPricingSummary])

  useEffect(() => {
     let interval: NodeJS.Timeout
     if (quoteStatus === 'PENDING_APPROVAL') {
        const checkStatus = async () => {
           try {
              const res = await apiFetch(`/api/quote-versions/${versionId}`)
              const data = await res.json()
              if (res.ok && data.status && data.status !== quoteStatus) {
                 setQuoteStatus(data.status)
              }
           } catch(e) {}
        }
        interval = setInterval(checkStatus, 3000)
     }
     return () => { if (interval) clearInterval(interval) }
  }, [quoteStatus, versionId])


  useEffect(() => {
    if (autoCurateInitRef.current) return
    if (!lead || !draft) return
    const events = Array.isArray(draft.events) ? draft.events : []
    if (events.length === 0) return

    const hasMoodboard = Array.isArray(draft.moodboard) && draft.moodboard.length > 0
    const hasPortraits = Array.isArray(draft.portraits) && draft.portraits.length > 0
    const needsCovers = events.some((e: any) => !e.coverImageUrl)
    const needsHeroCover = !draft.hero?.coverImageUrl || !draft.connectCoverImageUrl
    if (hasMoodboard && !needsCovers && hasPortraits && !needsHeroCover) return

    autoCurateInitRef.current = true
    const runAutoCurate = async () => {
      try {
        if (needsHeroCover) {
           const res = await apiFetch(`/api/public/covers`)
           const cV = await res.json().catch(() => [])
           if (Array.isArray(cV) && cV.length > 0) {
              const uHero = { ...draft.hero, coverImageUrl: draft.hero?.coverImageUrl || cV[0] }
              const uConnect = draft.connectCoverImageUrl || cV[1] || cV[0]
              updateDraft({ hero: uHero, connectCoverImageUrl: uConnect })
           }
        }

        if (!hasMoodboard) {
          const notesText = `${String(lead?.notes || '')} ${String(lead?.requirements || '')}`.toLowerCase()
          const payload = {
            structuredEvents: events.map((e: any) => ({
               name: String(e.name || e.originalType || ''),
               slot: String(e.slot || ''),
               location: String(e.location || '')
            })),
            location: draft.hero?.location || '',
            isDestination: !!draft.hero?.location && String(draft.hero.location).toLowerCase() !== 'local',
            requiredCount: Math.min(28, 8 + (events.length * 4)),
            excludeUrls: [],
            notesContext: notesText,
          }
          const res = await apiFetch(`/api/photos/auto-curate`, { method: 'POST', body: JSON.stringify(payload) })
          const autoPickedUrls = await res.json().catch(() => [])
          if (Array.isArray(autoPickedUrls) && autoPickedUrls.length > 0) {
            updateDraft({ moodboard: autoPickedUrls })
          }
        }

        if (needsCovers) {
          const cloneEvents = [...events]
          let changed = false
          for (let i = 0; i < cloneEvents.length; i++) {
            if (!cloneEvents[i].coverImageUrl) {
              const payload = {
                structuredEvents: [{
                   name: String(cloneEvents[i].name || cloneEvents[i].originalType || ''),
                   slot: String(cloneEvents[i].slot || ''),
                   location: String(cloneEvents[i].location || '')
                }],
                requiredCount: 1,
                excludeUrls: cloneEvents.map((e: any) => e.coverImageUrl).filter(Boolean),
              }
              const res = await apiFetch(`/api/photos/auto-curate`, { method: 'POST', body: JSON.stringify(payload) })
              const dt = await res.json().catch(() => [])
              if (dt && dt[0]) {
                cloneEvents[i].coverImageUrl = dt[0].url || dt[0]
                changed = true
              }
            }
          }
          if (changed) updateDraft({ events: cloneEvents })
        }

        if (!hasPortraits) {
          const notesText = `${String(lead?.notes || '')} ${String(lead?.requirements || '')}`.toLowerCase()
          const eventNames = events.map((e: any) => String(e.name || e.originalType || '').toLowerCase())
          const hasWedding = eventNames.some((n: string) => n.includes('wedding') && !n.includes('pre wedding') && !n.includes('pre-wedding'))
          const payload = {
            leadEvents: events.map((e: any) => e.name),
            location: draft.hero?.location || '',
            isDestination: !!draft.hero?.location && String(draft.hero.location).toLowerCase() !== 'local',
            excludeUrls: (draft.moodboard || []).map((m: any) => (typeof m === 'string' ? m : m.url)).filter(Boolean),
            notesContext: notesText,
            hasWedding,
            existingPortraitCount: 0,
          }
          const res = await apiFetch('/api/photos/auto-curate-portraits', { method: 'POST', body: JSON.stringify(payload) })
          const picked = await res.json().catch(() => [])
          if (Array.isArray(picked) && picked.length > 0) {
            updateDraft({ portraits: picked })
          }
        }
      } catch {}
    }
    runAutoCurate()
  }, [draft, lead, updateDraft])

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await apiFetch(`/api/quote-versions/${versionId}/draft`, { method: 'PATCH', body: JSON.stringify({ draftDataJson: draft }) })
        const data = await res.json().catch(() => null)
        if (data && data.status) setQuoteStatus(data.status)
        setLastSavedAt(toISTISOString(new Date()))
      } finally {
        setSaving(false)
      }
    }, 1500)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [draft, versionId, setSaving, setLastSavedAt])

  useEffect(() => {
    if (pricingSyncTimer.current) clearTimeout(pricingSyncTimer.current)
    pricingSyncTimer.current = setTimeout(async () => {
      try {
        const payload = draft.pricingItems.filter(i => i.itemType && i.catalogId && Number(i.quantity) > 0).map(i => ({
           itemType: i.itemType, catalogId: Number(i.catalogId), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice)
        }))
        await apiFetch(`/api/quote-versions/${versionId}/pricing-items`, { method: 'POST', body: JSON.stringify({ items: payload }) })
        
        const reqRes = await apiFetch(`/api/quote-versions/${versionId}`, {
           method: 'PATCH', body: JSON.stringify({ salesOverridePrice: draft.overridePrice ?? null, overrideReason: draft.overrideReason || null })
        })
        const reqData = await reqRes.json().catch(() => null)
        if (reqData && reqData.status) setQuoteStatus(reqData.status)
        
        const res = await apiFetch(`/api/quote-versions/${versionId}/calculate`, { method: 'POST' })
        const data = await res.json()
        setPricingSummary({ calculatedPrice: Number(data?.calculatedPrice || 0), targetPrice: Number(data?.targetPrice || 0), minimumPrice: Number(data?.minimumPrice || 0) })
      } catch {}
    }, 800)
    return () => { if (pricingSyncTimer.current) clearTimeout(pricingSyncTimer.current) }
  }, [draft.pricingItems, draft.overridePrice, draft.overrideReason, versionId, setPricingSummary])

   // Sync Tiers when calculated price changes
   useEffect(() => {
      // Use localCalculatedTotal for instant reactive updates in the builder
      const baseTotal = localCalculatedTotal
      if (draft.pricingMode !== 'TIERED' || !baseTotal) return
      
      const roundTo10k = (num: number) => Math.ceil(num / 10000) * 10000
      const basicPrice = roundTo10k(baseTotal)
      const signaturePrice = roundTo10k(basicPrice * 1.20)
      
      const newTiers = (draft.tiers || []).map((t: any) => {
         if (t.id === 'tier_1' || t.name === 'Essential' || t.name === 'Basic') {
            const updated = { ...t, name: 'Essential', price: basicPrice }
            if (!t.description || t.description === 'Essential coverage for your celebration.') {
               updated.description = 'Elegant and timeless coverage for intimate celebrations.'
            }
            return updated
         }
         if (t.id === 'tier_2' || t.name === 'Signature') {
            const updated = { ...t, name: 'Signature', price: signaturePrice }
            if (!t.description || t.description === 'Our most popular comprehensive experience.' || t.description === 'Our most popular cinematic storytelling package.') {
               updated.description = 'A refined storytelling experience for modern weddings'
            }
            return updated
         }
         if (t.id === 'tier_3' || t.name === 'Bespoke' || t.name === 'Luxury') {
            return { 
               ...t, 
               name: 'Bespoke',
               description: t.description || 'Your wedding, told at its finest',
               price: roundTo10k(signaturePrice * 1.50),
               luxuryRangeLow: roundTo10k(signaturePrice * 1.20),
               luxuryRangeHigh: roundTo10k(signaturePrice * 1.50),
            }
         }
         return t
      })

      const hasChanged = JSON.stringify(newTiers) !== JSON.stringify(draft.tiers)
      if (hasChanged) {
         updateDraft({ tiers: newTiers })
      }
   }, [localCalculatedTotal, draft.pricingMode])

  const handleAction = async (endpoint: string, successMsg: string, extraPayload: any = {}) => {
     if (endpoint === 'submit' || endpoint === 'send') {
        const teamMembers = (draft.pricingItems || []).filter(i => i.itemType === 'TEAM_ROLE')
        const events = draft.events || []
        
        // Ensure every event has at least one crew member
        for (const ev of events) {
           const evCrew = teamMembers.filter(tm => tm.eventId === ev.id)
           if (evCrew.length === 0) {
              alert(`Validation Error: ${ev.name || 'An event'} has no crew assigned. Please add at least 1 crew member to every event.`)
              return
           }
        }

        const deliverables = (draft.pricingItems || []).filter(i => i.itemType === 'DELIVERABLE')
        if (deliverables.length === 0) {
           alert("Validation Error: Please add at least 1 deliverable.")
           return
        }

        let hasPhotographer = false
        let hasVideographer = false
        
        teamMembers.forEach(c => {
           const role = (c.label || '').toLowerCase()
           if (role.includes('photo')) hasPhotographer = true
           if (role.includes('video') || role.includes('cinemato')) hasVideographer = true
        })

        let hasPhotoDeliverable = false
        let hasVideoDeliverable = false
        
        deliverables.forEach(d => {
           const cat = (d as any).category || deliverablesCatalog.find(c => c.id === d.catalogId)?.category || 'OTHER'
           if (cat === 'PHOTO') hasPhotoDeliverable = true
           if (cat === 'VIDEO') hasVideoDeliverable = true
        })

        if (hasPhotographer && !hasPhotoDeliverable) {
           alert("Validation Error: You have a photographer in the schedule, but no photography deliverables are included.")
           return
        }
        if (hasVideographer && !hasVideoDeliverable) {
           alert("Validation Error: You have a videographer/cinematographer in the schedule, but no video deliverables are included.")
           return
        }
     }

     setApprovalBusy(true)
     try {
       const res = await apiFetch(`/api/quote-versions/${versionId}/${endpoint}`, { method: 'POST', body: JSON.stringify(extraPayload) })
       const data = await res.json()
       if(!res.ok) throw new Error(data?.error || 'Action failed')
       if(data.status) setQuoteStatus(data.status)
       if(data.proposalToken) {
          const link = `${window.location.origin}/p/${data.proposalToken}`
          setProposalLink(link)
          await navigator.clipboard.writeText(link).catch(() => {})
          setLinkCopied(true)
          setTimeout(() => setLinkCopied(false), 3000)
          setShareModalOpen(true)
       } else {
          setActionNotice(successMsg)
       }
     } catch(e: any) {
        setError(e.message)
     } finally {
        setApprovalBusy(false)
     }
  }

  const handleCopyLink = async () => {
    if (!proposalLink) return
    await navigator.clipboard.writeText(proposalLink).catch(() => {})
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 3000)
  }

  const handleShareWhatsApp = (phone?: string) => {
    if (!proposalLink) return
    const coupleNames = (draft.hero as any)?.coupleNames || ''
    const msg = coupleNames
      ? `Hi! Here's your cinematic proposal for ${coupleNames} by Misty Visuals ✨\n\n${proposalLink}`
      : `Hi! Your proposal from Misty Visuals is ready ✨\n\n${proposalLink}`
    const encoded = encodeURIComponent(msg)
    const cleanPhone = phone?.replace(/[^\d]/g, '') || ''
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`
    window.open(url, '_blank')
    setShareModalOpen(false)
  }

  const tabs = [
    { id: 'cover', label: 'Cover & Couple' },
    { id: 'moodboard', label: 'Visions & Aesthetics' },
    { id: 'testimonials', label: 'Client Testimonials' },
    { id: 'schedule', label: 'Event Schedule & Teams' },
    { id: 'deliverables', label: "What's Included" },
    { id: 'addons', label: 'Add-ons' },
    { id: 'investment', label: 'Investment & Payment' },
    { id: 'conditions', label: 'Special Conditions' }
  ] as const

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-24">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-neutral-200 px-8 py-5 sticky top-0 z-40 shadow-sm flex items-center justify-between">
         <div>
            <div className="flex items-center gap-3 mb-1">
               <Link href={`/leads/${leadId}/quotes`} className="text-xs font-semibold text-neutral-400 hover:text-neutral-900 transition flex items-center">
                  ← Back to Quotes
               </Link>
               <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  quoteStatus === 'EXPIRED' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                  quoteStatus === 'SENT' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                  quoteStatus === 'ACCEPTED' ? 'bg-sky-50 text-sky-600 border border-sky-200' :
                  'bg-neutral-100 text-neutral-600'
               }`}>
                  {quoteStatus.replace('_', ' ')}
               </span>
            </div>
            <div className="flex items-center gap-3">
               <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Quotation Builder</h1>
               <div className="relative">
                  {isLocked ? (
                     <span
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold cursor-default"
                        style={{
                           background: 'rgba(16,185,129,0.08)',
                           color: '#059669',
                           border: '1px solid rgba(16,185,129,0.2)',
                        }}
                     >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10b981' }} />
                        {draft.expirySettings?.validUntil
                           ? `Expires ${formatDate(draft.expirySettings.validUntil)}`
                           : versionExpiresAt
                              ? `Expires ${formatDate(versionExpiresAt)}`
                              : 'Validity: 14d auto'}
                     </span>
                  ) : (
                     <>
                        <button
                           onClick={() => setExpiryPickerOpen(!expiryPickerOpen)}
                           className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition hover:bg-neutral-100"
                           style={{
                              background: draft.expirySettings?.validUntil ? 'rgba(16,185,129,0.08)' : 'rgba(0,0,0,0.04)',
                              color: draft.expirySettings?.validUntil ? '#059669' : '#a3a3a3',
                              border: draft.expirySettings?.validUntil ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(0,0,0,0.06)',
                           }}
                           title="Click to set expiration date"
                        >
                           <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: draft.expirySettings?.validUntil ? '#10b981' : '#d4d4d4' }} />
                           {draft.expirySettings?.validUntil
                              ? `Valid until ${formatDate(draft.expirySettings.validUntil)}`
                              : 'Validity: 14d auto'}
                           <svg className="w-3 h-3 ml-0.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        {expiryPickerOpen && (
                           <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-neutral-200 p-4 z-50 w-[280px] animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-2">Quote Expiration Date</div>
                              <CalendarInput
                                 className={`w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm`}
                                 value={draft.expirySettings?.validUntil || ''}
                                 onChange={(val) => {
                                    updateDraft({ expirySettings: { ...(draft.expirySettings || {}), validUntil: val } })
                                 }}
                                 placeholder="Select expiry date"
                              />
                              <p className="text-[10px] text-neutral-400 mt-2 leading-relaxed">
                                 If blank, auto-expires <strong>14 days</strong> after the web link is generated. New versions inherit the previous version&apos;s expiry date.
                              </p>
                              {draft.expirySettings?.validUntil && (
                                 <button onClick={() => {
                                    updateDraft({ expirySettings: { ...(draft.expirySettings || {}), validUntil: '' } })
                                 }} className="text-[10px] text-rose-500 font-semibold mt-2 hover:text-rose-600 transition">Clear date</button>
                              )}
                           </div>
                        )}
                     </>
                  )}
               </div>
            </div>
         </div>
         
         <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 font-medium mr-4">
              {isSaving ? 'Saving...' : lastSavedAt ? `Saved ${formatDateTime(lastSavedAt)}` : ''}
            </span>
            <button onClick={() => setPreviewModalOpen(true)} className="px-5 py-2 rounded-full border border-neutral-200 bg-white text-sm font-semibold hover:bg-neutral-50 transition shadow-sm flex items-center gap-2">
               🖥️ Live Preview
            </button>
            {quoteStatus === 'DRAFT' && (
               <button disabled={approvalBusy} onClick={() => handleAction('submit', 'Submitted for approval')} className="px-5 py-2 bg-neutral-900 text-white rounded-full text-sm font-semibold hover:bg-neutral-800 transition shadow-sm flex items-center gap-2">
                  {approvalBusy ? (
                     <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Submitting...</>
                  ) : (
                     <>📝 Request Approval</>
                  )}
               </button>
            )}

            {quoteStatus === 'ADMIN_REJECTED' && (
               <button disabled={approvalBusy} onClick={() => handleAction('submit', 'Submitted for approval')} className="px-5 py-2 bg-rose-600 text-white rounded-full text-sm font-semibold hover:bg-rose-700 transition shadow-sm flex items-center gap-2 border border-rose-700">
                  {approvalBusy ? (
                     <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Submitting...</>
                  ) : (
                     <>⚠️ Needs Revisions — Resubmit</>
                  )}
               </button>
            )}
            
            {quoteStatus === 'PENDING_APPROVAL' && roles.includes('admin') && (
               <>
                 <button disabled={approvalBusy} onClick={() => handleAction('approve', 'Approved by Admin')} className="px-5 py-2 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition shadow-sm">Approve Quote</button>
                 <button disabled={approvalBusy} onClick={() => {
                   const reason = window.prompt('Reason for disapproval:');
                   if (reason) handleAction('reject', 'Rejected Quote', { note: reason });
                 }} className="px-5 py-2 rounded-full bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition shadow-sm">Disapprove</button>
               </>
            )}
            
            {quoteStatus === 'PENDING_APPROVAL' && !roles.includes('admin') && (
               <div className="px-5 py-2 rounded-full bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200">Pending Admin Approval...</div>
            )}



            {isLocked && proposalLink ? (
               <button onClick={() => { handleCopyLink(); setShareModalOpen(true) }} className="px-5 py-2 bg-neutral-900 text-white rounded-full text-sm font-semibold hover:bg-neutral-800 transition shadow-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Share Link
               </button>
            ) : quoteStatus === 'APPROVED' && (!isLocked && (
               <button disabled={approvalBusy} onClick={() => handleAction('send', '')} className="px-5 py-2 bg-emerald-600 text-white rounded-full text-sm font-semibold hover:bg-emerald-700 transition shadow-sm flex items-center gap-2">
                  {approvalBusy ? (
                     <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Sending...</>
                  ) : (
                     <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg> Send Proposal</>
                  )}
               </button>
            ))}
         </div>
      </div>

      {/* Share Modal */}
      {shareModalOpen && proposalLink && (
         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShareModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
               <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                     </div>
                     <div>
                        <div className="font-bold text-lg">Proposal Ready!</div>
                        <div className="text-white/80 text-sm">Link copied to clipboard ✓</div>
                     </div>
                  </div>
               </div>
               <div className="p-6 space-y-5">
                  <div className="flex items-center gap-2 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                     <div className="flex-1 text-sm text-neutral-600 font-mono truncate">{proposalLink}</div>
                     <button onClick={handleCopyLink} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition ${linkCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'}`}>
                        {linkCopied ? '✓ Copied' : 'Copy'}
                     </button>
                  </div>
                  <div className="space-y-3">
                     <div className="text-sm font-bold text-neutral-900">Send via WhatsApp</div>
                     {lead?.phone && (
                        <button onClick={() => handleShareWhatsApp(lead.phone)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition group">
                           <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                           </div>
                           <div className="text-left flex-1 min-w-0">
                              <div className="text-sm font-semibold text-neutral-900 group-hover:text-emerald-700 transition">{lead.name || lead.firstName || 'Lead Contact'}</div>
                              <div className="text-xs text-neutral-500 truncate">{lead.phone}</div>
                           </div>
                           <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                     )}
                     <button onClick={() => handleShareWhatsApp()} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 transition text-sm font-medium text-neutral-600">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#25D366]" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Send to another number
                     </button>
                  </div>
                  <button onClick={() => setShareModalOpen(false)} className="w-full py-2.5 text-sm font-semibold text-neutral-400 hover:text-neutral-600 transition">Done</button>
               </div>
            </div>
         </div>
      )}

      <div className="max-w-[1400px] mx-auto mt-8 px-4 md:px-6 grid grid-cols-1 md:grid-cols-[250px_1fr] lg:grid-cols-[300px_1fr] gap-6 md:gap-8 items-start">
         {/* Left Tab Navigation */}
         <div className="space-y-2 sticky top-[100px]">
            <div className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400 pl-4 mb-4 hidden md:block">Builder Flow</div>
            
            {/* Mobile Dropdown */}
            <div className="md:hidden relative mb-4">
               <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as any)}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3.5 text-neutral-900 font-semibold shadow-sm outline-none focus:ring-2 focus:ring-neutral-900 appearance-none pr-10"
               >
                  {tabs.map(t => (
                     <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
               </select>
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
               </div>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden md:block space-y-2">
               {tabs.map(t => (
                  <button 
                     key={t.id} 
                     onClick={() => setActiveTab(t.id)}
                     className={`w-full text-left px-5 py-3.5 rounded-2xl font-semibold transition-all ${activeTab === t.id ? 'bg-white text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-neutral-200/50' : 'text-neutral-500 hover:bg-neutral-200/50 hover:text-neutral-700'}`}
                  >
                     {t.label}
                  </button>
               ))}
            </div>

            {/* Quick Summary Card — Admin only */}
            {roles.includes('admin') && (
               <div className="mt-8 bg-neutral-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Quote Total</div>
                  <div className="text-3xl font-light tracking-tight">{formatMoney(draft.overridePrice ?? localCalculatedTotal)}</div>

                  {/* Bifurcation Breakdown */}
                  <div className="mt-5 pt-4 border-t border-white/10 space-y-2.5">
                     <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-neutral-500 mb-1">Cost Breakdown</div>
                     <div className="text-xs text-neutral-400 flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                           Crew ({pricingBreakdown.numDays} day{pricingBreakdown.numDays !== 1 ? 's' : ''})
                        </span>
                        <span className="font-medium text-neutral-300">{formatMoney(pricingBreakdown.crewTotal)}</span>
                     </div>
                     {/* Per-event crew sub-rows */}
                     {pricingBreakdown.crewByEvent.length > 1 && pricingBreakdown.crewByEvent.map((ev) => (
                        <div key={ev.eventId} className="text-[10px] text-neutral-500 flex justify-between items-center pl-4">
                           <span className="truncate mr-2">{ev.name}</span>
                           <span className="font-medium shrink-0">{formatMoney(ev.cost)}</span>
                        </div>
                     ))}
                     <div className="text-xs text-neutral-400 flex justify-between items-center">
                        <span className="flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                           Deliverables
                        </span>
                        <span className="font-medium text-neutral-300">{formatMoney(pricingBreakdown.deliverablesTotal)}</span>
                     </div>
                     <div className="text-xs text-neutral-300 flex justify-between items-center pt-2 border-t border-white/5 font-semibold">
                        <span>Subtotal</span>
                        <span>{formatMoney(localCalculatedTotal)}</span>
                     </div>
                     {draft.overridePrice !== null && draft.overridePrice !== undefined && (
                        <div className={`text-xs flex justify-between items-center pt-1 font-semibold ${
                           draft.overridePrice < localCalculatedTotal ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                           <span>{draft.overridePrice < localCalculatedTotal ? '↓ Override' : '↑ Override'}</span>
                           <span>{draft.overridePrice < localCalculatedTotal ? '−' : '+'}{formatMoney(Math.abs(draft.overridePrice - localCalculatedTotal))}</span>
                        </div>
                     )}
                  </div>

                  {/* Tier Prices — only when tiered mode */}
                  {draft.pricingMode === 'TIERED' && localCalculatedTotal > 0 && (
                     <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                        <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-neutral-500 mb-1">Tier Prices</div>
                        {(draft.tiers || []).map((tier: any) => {
                           const displayPrice = tier.overridePrice ?? tier.discountedPrice ?? tier.price
                           const isOverridden = tier.overridePrice != null || tier.discountedPrice != null
                           return (
                              <div key={tier.id} className="text-xs text-neutral-400 flex justify-between items-center">
                                 <span className="flex items-center gap-1.5">
                                    {tier.isPopular && <span className="text-amber-400">★</span>}
                                    {tier.name}
                                 </span>
                                 <span className={`font-medium ${isOverridden ? 'text-amber-300' : 'text-neutral-300'}`}>
                                    {isOverridden && <span className="line-through text-neutral-500 mr-1.5 text-[10px]">{formatMoney(tier.price)}</span>}
                                    {formatMoney(displayPrice)}
                                 </span>
                              </div>
                           )
                        })}
                     </div>
                  )}
               </div>
            )}
         </div>

         {/* Main Editor Area */}
         <div className={`w-full ${isLocked ? 'relative' : ''}`}>
            {isLocked && (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 text-amber-800 text-sm font-medium border border-amber-200 flex items-center gap-3">
                <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>This quote is <strong>{quoteStatus.toLowerCase()}</strong> and cannot be edited. Create a new version to make changes.</span>
              </div>
            )}
            <div className={isLocked ? 'pointer-events-none opacity-60 select-none' : ''}>
            {error && <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-100">{error}</div>}
            {actionNotice && <div className="mb-6 p-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-100">{actionNotice}</div>}

            {activeTab === 'cover' && <CoverTab draft={draft} updateDraft={updateDraft} onPickPhoto={() => setPickingPhotoFor({type: 'cover'})} randomCovers={randomCovers} />}
            {activeTab === 'moodboard' && <MoodboardTab draft={draft} updateDraft={updateDraft} apiFetch={apiFetch} onPickPhoto={(idx?: number) => setPickingPhotoFor({type: 'moodboard', index: idx})} lead={lead} />}
            {activeTab === 'testimonials' && <TestimonialsSelectionTab draft={draft} updateDraft={updateDraft} apiFetch={apiFetch} />}
            {activeTab === 'schedule' && <ScheduleTab draft={draft} updateDraft={updateDraft} teamCatalog={teamRoles} apiFetch={apiFetch} onPickPhoto={(eventId: string) => setPickingPhotoFor({type: 'event', eventId})} lead={lead} teamPresets={presets.filter((p: any) => p.type === 'TEAM')} onQuickAddTeam={(eventId: string) => setQuickAddModal({ open: true, type: 'TEAM', eventId })} />}
            {activeTab === 'deliverables' && <DeliverablesTab draft={draft} updateDraft={updateDraft} dCatalog={deliverablesCatalog} onPickBackground={() => setPickingPhotoFor({type: 'deliverables'})} deliverablePresets={presets.filter((p: any) => p.type === 'DELIVERABLE')} onQuickAddDeliverables={() => setQuickAddModal({ open: true, type: 'DELIVERABLE' })} />}
            {activeTab === 'addons' && <AddonsTab draft={draft} updateDraft={updateDraft} dCatalog={deliverablesCatalog} />}
            {activeTab === 'investment' && <InvestmentTab draft={draft} updateDraft={updateDraft} calculatedTotal={localCalculatedTotal} />}
            {activeTab === 'conditions' && <ConditionsTab draft={draft} updateDraft={updateDraft} />}
            </div>
         </div>
      </div>

      {/* ── Quick Add Preset Modal ─────────────────────────────────── */}
      {quickAddModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">Quick Add</div>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900">
                  {quickAddModal.type === 'TEAM' ? 'Team Bundle' : 'Deliverable Package'}
                </h2>
              </div>
              <button onClick={() => setQuickAddModal(null)} className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600">Close</button>
            </div>

            {presets.filter((p: any) => p.type === quickAddModal.type && p.active !== false).length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 py-10 text-center">
                <div className="text-2xl mb-2">{quickAddModal.type === 'TEAM' ? '👥' : '📦'}</div>
                <div className="text-sm text-neutral-500 mb-3">No presets configured yet.</div>
                <a href="/admin/presets" target="_blank" rel="noreferrer" className="text-xs font-semibold text-neutral-700 underline">Create presets in Admin → Config</a>
              </div>
            ) : (
              <div className="space-y-3">
                {presets.filter((p: any) => p.type === quickAddModal.type && p.active !== false).map((preset: any) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      const newItems = preset.items
                        .map((item: any) => {
                          if (quickAddModal.type === 'TEAM') {
                            const catalogItem = teamRoles.find((c: any) => c.id === item.catalogId)
                            if (!catalogItem) return null
                            return { id: generateId(), itemType: 'TEAM_ROLE', catalogId: item.catalogId, label: item.label, quantity: item.quantity, unitPrice: item.unitPrice, eventId: quickAddModal.eventId || null }
                          } else {
                            const catalogItem = deliverablesCatalog.find((c: any) => c.id === item.catalogId)
                            if (!catalogItem) return null
                            return { id: generateId(), itemType: 'DELIVERABLE', catalogId: item.catalogId, label: item.label, quantity: item.quantity, unitPrice: item.unitPrice, category: catalogItem.category, description: (catalogItem as any).description || null, deliveryTimeline: (catalogItem as any).deliveryTimeline || null, phase: (catalogItem as any).deliveryPhase || 'WEDDING', eventId: null }
                          }
                        })
                        .filter(Boolean)
                      // Merge — don't duplicate existing catalogIds for this event
                      const existingIds = new Set(
                        draft.pricingItems
                          .filter((i: any) => quickAddModal.type === 'TEAM' ? (i.itemType === 'TEAM_ROLE' && i.eventId === (quickAddModal.eventId || null)) : i.itemType === 'DELIVERABLE')
                          .map((i: any) => i.catalogId)
                      )
                      const toAdd = newItems.filter((i: any) => !existingIds.has(i.catalogId))
                      if (toAdd.length > 0) updateDraft({ pricingItems: [...draft.pricingItems, ...toAdd] })
                      setQuickAddModal(null)
                    }}
                    className="w-full text-left rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 transition p-4 group"
                  >
                    <div className="font-semibold text-neutral-900 group-hover:text-neutral-800 mb-2">{preset.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {preset.items.map((item: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
                          <span className="font-bold text-neutral-900">{item.quantity}×</span> {item.label}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pickingPhotoFor && (
         <PhotoPickerModal 
            multiSelect={pickingPhotoFor.type === 'moodboard' && pickingPhotoFor.index === undefined}
            onClose={() => setPickingPhotoFor(null)} 
            onSelect={(photoPayload: any) => {
               const url = typeof photoPayload === 'string' ? photoPayload : photoPayload.url
               if (pickingPhotoFor.type === 'cover') {
                  updateDraft({ hero: { ...draft.hero, coverImageUrl: url } })
               } else if (pickingPhotoFor.type === 'event') {
                  updateDraft({ events: draft.events.map((e: any) => e.id === pickingPhotoFor.eventId ? { ...e, coverImageUrl: url } : e) })
               } else if (pickingPhotoFor.type === 'moodboard') {
                  const m = [...(draft.moodboard || [])]
                  const photoObj = typeof photoPayload === 'string' ? { url: photoPayload } : { url, tags: photoPayload.tags, score: '(Manual)' }
                  if (pickingPhotoFor.index !== undefined) {
                     m[pickingPhotoFor.index] = photoObj
                  } else {
                     m.push(photoObj)
                  }
                  updateDraft({ moodboard: m })
                } else if (pickingPhotoFor.type === 'deliverables') {
                   updateDraft({ whatsIncludedBackground: url })
                }
               setPickingPhotoFor(null)
            }}
            onMultiSelect={(photos: any[]) => {
               if (pickingPhotoFor.type === 'moodboard') {
                  const m = [...(draft.moodboard || [])]
                  for (const p of photos) {
                     const url = typeof p === 'string' ? p : p.url
                     const photoObj = typeof p === 'string' ? { url: p } : { url, tags: p.tags, score: '(Manual)' }
                     m.push(photoObj)
                  }
                  updateDraft({ moodboard: m })
               }
               setPickingPhotoFor(null)
            }}
         />
      )}

      {/* Live Preview Modal */}
      {isPreviewModalOpen && (
         <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <button 
               onClick={() => setPreviewModalOpen(false)}
               className="absolute top-6 right-6 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition backdrop-blur-md z-50 text-xl font-light"
            >
               ✕
            </button>
            
            <div className="w-[400px] h-[850px] max-h-[90vh] rounded-[3rem] overflow-hidden border-[8px] border-neutral-800 shadow-2xl relative force-light">
               <StoryViewer 
                  snapshot={{
                     draftData: draft,
                     calculatedPrice: localCalculatedTotal,
                     salesOverridePrice: draft.overridePrice
                  }} 
                  isPreview 
               />
               {/* Simulating iPhone Notch */}
               <div className="absolute top-0 inset-x-0 h-7 flex justify-center pointer-events-none z-50">
                  <div className="w-32 h-6 bg-neutral-800 rounded-b-3xl"></div>
               </div>
            </div>
         </div>
       )}
    </div>
  )
}

const CoverTab = ({ draft, updateDraft, onPickPhoto, randomCovers }: any) => {
   const h = draft.hero
   const activeCover = h?.coverImageUrl || (randomCovers ? randomCovers[0] : null)
   const usingAutoCover = !h?.coverImageUrl && activeCover
   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">The Brand Cover</h2>
            <p className="text-neutral-500 mt-1 text-sm">Design the immersive first impression of the Web Story.</p>
         </div>
         
         <div className={cardClass}>
            <div className={labelClass}>Hero Top Details (Synced Automatically from Lead)</div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
               <div>
                  <label className="text-xs text-neutral-500 font-medium ml-1">Main Title</label>
                  <div className={`mt-1 ${inputClass} opacity-80 bg-neutral-100 flex items-center text-neutral-700 font-semibold select-none min-h-[44px]`}>{h.title || 'No Name Found'}</div>
               </div>
               <div>
                  <label className="text-xs text-neutral-500 font-medium ml-1">Couple</label>
                  <div className={`mt-1 ${inputClass} opacity-80 bg-neutral-100 flex items-center text-neutral-700 font-semibold select-none min-h-[44px]`}>{h.coupleNames || 'Not specified'}</div>
               </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
               <div>
                  <label className="text-xs text-neutral-500 font-medium ml-1">Event Venue</label>
                  <div className={`mt-1 ${inputClass} opacity-80 bg-neutral-100 flex items-center text-neutral-700 font-semibold select-none min-h-[44px]`}>{h.location || '-'}</div>
               </div>
               <div>
                  <label className="text-xs text-neutral-500 font-medium ml-1">Dates</label>
                  <div className={`mt-1 ${inputClass} opacity-80 bg-neutral-100 flex items-center text-neutral-700 font-semibold select-none min-h-[44px]`}>{h.date || 'Multiple Dates'}</div>
               </div>
            </div>
         </div>

         <div className={cardClass}>
            <div className={labelClass}>Cinematic Cover Image</div>
            <div className="mt-4 flex gap-4">
               {activeCover ? (
                  <div className="w-48 h-64 bg-neutral-100 rounded-xl overflow-hidden border border-neutral-200 flex-shrink-0 relative group cursor-pointer shadow-sm">
                     {(activeCover.includes('.mp4') || activeCover.includes('.webm') || activeCover.includes('/api/videos/file')) ? (
                         <HoverVideo src={activeCover} onClick={onPickPhoto} className="w-full h-full object-cover" />
                     ) : (
                        <img src={activeCover} onClick={onPickPhoto} className="w-full h-full object-cover" />
                     )}
                     {usingAutoCover && (
                         <div className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md backdrop-blur-sm">
                             ✨ Auto Cover
                         </div>
                     )}
                     <div onClick={onPickPhoto} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-sm font-semibold backdrop-blur-sm">Change Cover</div>
                     {!usingAutoCover && <button onClick={(e) => { e.stopPropagation(); updateDraft({ hero: { ...h, coverImageUrl: '' }}); }} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-red-500 transition opacity-0 group-hover:opacity-100 z-10">✕</button>}
                  </div>
               ) : (
                  <button onClick={onPickPhoto} className="w-48 h-64 bg-neutral-50 rounded-xl border border-dashed border-neutral-300 hover:bg-neutral-100 hover:border-neutral-400 text-neutral-500 transition flex flex-col items-center justify-center flex-shrink-0">
                     <span className="text-3xl mb-2 opacity-30">🖼️</span>
                     <span className="text-xs font-semibold">Choose Cover</span>
                  </button>
               )}
               <div className="flex-1 space-y-2">
                  <p className="text-sm text-neutral-500 mb-4">Paste a high resolution image URL from your Photo Library tagged '#couple-portrait' to guarantee conversion momentum.</p>
                  <input className={inputClass} value={h.coverImageUrl} onChange={e => updateDraft({ hero: { ...h, coverImageUrl: e.target.value }})} placeholder="https://..." />
                  <button onClick={() => onPickPhoto()} className="px-4 py-2 mt-2 bg-neutral-100 font-semibold text-neutral-700 text-sm rounded-lg hover:bg-neutral-200 transition">Browse Media Library</button>
               </div>
            </div>
         </div>
      </div>
   )
}

const MoodboardTab = ({ draft, updateDraft, apiFetch, onPickPhoto, lead }: any) => {
   const mItems = draft.moodboard || []
   const notesText = String(lead?.notes || '').toLowerCase() + ' ' + String(lead?.requirements || '').toLowerCase()
   const isVipLead = lead?.important === true || lead?.important === 'yes'
   const vipBoostTags = ['resort', 'day', 'candid', 'aesthetic', 'editorial', 'pastel', 'moody']
   const coverageScope = String(lead?.coverage_scope || 'Both Sides').toLowerCase()
   const isBrideOnly = coverageScope.includes('bride') && !coverageScope.includes('both')
   const isGroomOnly = coverageScope.includes('groom') && !coverageScope.includes('both')
   
   const remove = (idx: number) => {
       const clone = [...mItems]
       clone.splice(idx, 1)
       updateDraft({ moodboard: clone })
   }

   const [loadingAuto, setLoadingAuto] = useState(false)
   const [loadingPortraits, setLoadingPortraits] = useState(false)
   const [liveTags, setLiveTags] = useState<Record<string, string[]>>({})

   const portraitItems: any[] = draft.portraits || []
   const portraitSubjectTags = ['portrait', 'bride', 'groom', 'couple']

   // Count portraits already present in moodboard
   const existingPortraitCount = mItems.filter((m: any) => {
      const tags: string[] = liveTags[typeof m === 'string' ? m : m.url] || m.tags || []
      return tags.some(t => portraitSubjectTags.includes(String(t).toLowerCase()))
   }).length

   useEffect(() => {
      apiFetch('/api/photos')
        .then((r: any) => r.json())
        .then((data: any[]) => {
           if (Array.isArray(data)) {
              const map: Record<string, string[]> = {}
              data.forEach(p => { map[p.url] = p.tags })
              setLiveTags(map)
           }
        })
        .catch(() => {})
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])

   const autoFill = async () => {
       setLoadingAuto(true)
       try {
          const payload = {
            structuredEvents: draft.events?.map((e: any) => ({
               name: String(e.name || e.originalType || ''),
               slot: String(e.slot || ''),
               location: String(e.location || '')
            })) || [],
            location: draft.hero?.location || '',
            isDestination: !!draft.hero?.location && draft.hero.location.toLowerCase() !== 'local',
            requiredCount: Math.min(28, 8 + ((draft.events?.length || 1) * 4)),
            excludeUrls: [...mItems.map((m: any) => typeof m === 'string' ? m : m.url), ...portraitItems.map((p: any) => typeof p === 'string' ? p : p.url)].filter(Boolean),
            notesContext: notesText,
            coverageScope
          }
          const res = await apiFetch(`/api/photos/auto-curate`, { method: 'POST', body: JSON.stringify(payload) })
          const autoPickedUrls = await res.json()
          
          if(Array.isArray(autoPickedUrls) && autoPickedUrls.length > 0) {
             updateDraft({ moodboard: autoPickedUrls })
          }
       } catch {} finally {
          setLoadingAuto(false)
       }
   }

   const autoFillPortraits = async () => {
      setLoadingPortraits(true)
      try {
         const moodboardUrls = mItems.map((m: any) => typeof m === 'string' ? m : m.url)
         const portraitUrls = portraitItems.map((p: any) => typeof p === 'string' ? p : p.url)
         const eventNames = (draft.events || []).map((e: any) => String(e.name || e.originalType || '').toLowerCase())
         const hasWedding = eventNames.some((n: string) => n.includes('wedding'))

         const payload = {
            structuredEvents: draft.events?.map((e: any) => ({
               name: String(e.name || e.originalType || ''),
               slot: String(e.slot || ''),
               location: String(e.location || '')
            })) || [],
            location: draft.hero?.location || '',
            isDestination: !!draft.hero?.location && draft.hero.location.toLowerCase() !== 'local',
            excludeUrls: [...moodboardUrls, ...portraitUrls],
            notesContext: notesText,
            hasWedding,
            existingPortraitCount,
            coverageScope
         }
         const res = await apiFetch('/api/photos/auto-curate-portraits', { method: 'POST', body: JSON.stringify(payload) })
         const picked = await res.json()
         if (Array.isArray(picked) && picked.length > 0) {
            updateDraft({ portraits: picked })
         }
      } catch {} finally {
         setLoadingPortraits(false)
      }
   }

   const removePortrait = (idx: number) => {
      const clone = [...portraitItems]
      clone.splice(idx, 1)
      updateDraft({ portraits: clone })
   }

   useEffect(() => {
      if (mItems.length === 0 && !loadingAuto) {
         autoFill()
      }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])

   const knownEventTags = ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding']
   const knownLocTags = ['destination', 'local', 'palace', 'resort', 'home']
   const sideWords = ['bride', 'groom']
   const coreSubjects = ['couple', 'portrait']
   const dayTimeTags = ['day', 'morning', 'daylight', 'outdoor']
   const nightTimeTags = ['evening', 'night', 'dusk', 'golden hour']

   // Build structured event matchers for accurate side-aware scoring (now includes slot + venue type)
   const eventMatchers = (draft.events || []).map((e: any) => {
      const rawType = e.originalType || e.name || ''
      const parenMatch = rawType.match(/\(([^)]+)\)/i)
      const sideQualifier = parenMatch ? parenMatch[1].trim().toLowerCase() : null
      const baseWordRaw = rawType.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim().toLowerCase()
      const baseWord = knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
      // Derive time-of-day expectation from event slot
      const slot = String(e.slot || '').toLowerCase()
      const timeOfDay: 'day' | 'night' | null = 
         (slot.includes('morning') || slot.includes('day')) ? 'day' :
         (slot.includes('evening') || slot.includes('night')) ? 'night' :
         null
      // Derive venue type from Google Places metadata
      const VENUE_PRIORITY = ['banquet_hall', 'wedding_venue', 'event_venue', 'resort', 'hotel', 'spa', 'lodging']
      const meta = e.venue_metadata ? (typeof e.venue_metadata === 'string' ? JSON.parse(e.venue_metadata) : e.venue_metadata) : null
      const gTypes: string[] = meta?.types || []
      const venueType = VENUE_PRIORITY.find(v => gTypes.includes(v)) || null
      // Classify: banquet-hall type vs hotel/resort type
      const venueClass: 'banquet' | 'hotel' | null =
         (venueType === 'banquet_hall' || venueType === 'wedding_venue' || venueType === 'event_venue') ? 'banquet' :
         (venueType === 'hotel' || venueType === 'resort' || venueType === 'lodging' || venueType === 'spa') ? 'hotel' :
         null
      const isResort = venueType === 'resort'
      return { baseWord, sideQualifier, timeOfDay, venueClass, isResort }
   })

   const locTargetTags: string[] = []
   if (draft.hero?.location) {
      if (draft.hero.location.toLowerCase() !== 'local') locTargetTags.push('destination')
      else locTargetTags.push('local')
   }

   // Pre-compute all time-of-day targets to use in tag highlight logic
   const timeTargetTags: string[] = []
   for (const m of eventMatchers) {
      if (m.timeOfDay === 'day') dayTimeTags.forEach(t => { if (!timeTargetTags.includes(t)) timeTargetTags.push(t) })
      if (m.timeOfDay === 'night') nightTimeTags.forEach(t => { if (!timeTargetTags.includes(t)) timeTargetTags.push(t) })
   }

   const calculateLiveScore = (pTags: string[]) => {
      const pLower = pTags.map(t => t.toLowerCase())
      let score = 0

      // --- Event scoring (side-aware + time-of-day) ---
      let maxEventScore = 0
      for (const matcher of eventMatchers) {
         if (!knownEventTags.includes(matcher.baseWord)) continue
         const photoHasEvent = pLower.includes(matcher.baseWord)
         if (!photoHasEvent) continue // skip if not matching the event

         let currentEventScore = 0
         if (!matcher.sideQualifier) {
            currentEventScore = 10
         } else {
            const photoHasSameSide = pLower.includes(matcher.sideQualifier)
            const photoHasOppositeSide = sideWords.find(s => s !== matcher.sideQualifier && pLower.includes(s))
            
            if (photoHasSameSide) currentEventScore = 10
            else if (photoHasOppositeSide) currentEventScore = 0 
            else currentEventScore = 3
         }
         
         if (currentEventScore > maxEventScore) {
            maxEventScore = currentEventScore
         }

         // --- Time-of-day bonus (+2) ---
         if (matcher.timeOfDay === 'day') {
            if (dayTimeTags.some(t => pLower.includes(t))) score += 2
         } else if (matcher.timeOfDay === 'night') {
            if (nightTimeTags.some(t => pLower.includes(t))) score += 2
         }

         // --- Venue type rules ---
         // Penalty: hotel/resort lead → penalise banquet-tagged photos (-3)
         // Note: banquet venues are permissive (banquets often inside hotels)
         if (matcher.venueClass === 'hotel') {
            if (pLower.includes('banquet')) score -= 3
         }
         // Bonus: resort venue → reward resort/palace-tagged photos (+3)
         if (matcher.isResort) {
            if (pLower.includes('resort') || pLower.includes('palace')) score += 3
         }
      }

      score += maxEventScore

      // --- Location scoring (+3) ---
      if (pLower.some(t => locTargetTags.includes(t))) score += 3

      // --- Subject bonuses (+2) ---
      if (pLower.some(t => coreSubjects.includes(t))) score += 2

      // --- Notes & Global matching (+1 each) ---
      for (const t of pLower) {
         if (!knownEventTags.includes(t) && !knownLocTags.includes(t) && !sideWords.includes(t)) {
            if (notesText.includes(t) && t.length > 3) score += 1
         }
      }

      if (notesText.includes('colour') && pLower.includes('color')) score += 1
      if (notesText.includes('color') && pLower.includes('colour')) score += 1

      // --- VIP lead bonus: important=true → boost premium visual tags (+1 each) ---
      if (isVipLead) {
         for (const t of vipBoostTags) {
            if (pLower.includes(t)) score += 1
         }
      }

      // --- Coverage scope penalty: wrong-side photos get -2 ---
      if (isBrideOnly && pLower.includes('groom')) score -= 2
      if (isGroomOnly && pLower.includes('bride')) score -= 2

      return score
   }

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8 flex justify-between items-end">
            <div>
               <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Visions & Aesthetics</h2>
               <p className="text-neutral-500 mt-1 text-sm">Add a 2-3 page moodboard to explicitly convey visual direction.</p>
               <p className="text-[11px] text-neutral-400 mt-2">Note: Moodboard has two re-roll buttons — Palette + Portraits.</p>
            </div>
            <button onClick={autoFill} disabled={loadingAuto} className="px-4 py-2 bg-emerald-50 text-emerald-600 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-emerald-100 transition shadow-sm mb-1 disabled:opacity-50 flex gap-2 items-center">
               <span>✨</span> {loadingAuto ? 'Curating...' : 'Re-roll Palette'}
            </button>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[...mItems].sort((a: any, b: any) => {
               const sA = calculateLiveScore(liveTags[a.url || a] || a.tags || [])
               const sB = calculateLiveScore(liveTags[b.url || b] || b.tags || [])
               return sB - sA
            }).map((item: any, idx: number) => {
               const img = typeof item === 'string' ? item : item.url
               const displayTags = liveTags[img] || item.tags || []
               
               let scoreText = typeof item === 'string' ? "Legacy" : (item.score ?? "Manual")
               if (liveTags[img]) {
                  const s = calculateLiveScore(displayTags)
                  scoreText = `${s}.0`
               }
               
               const hasMeta = displayTags.length > 0 || scoreText !== "Legacy"
               
               return (
                  <div key={idx} 
                     style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }} 
                     className="animate-in fade-in slide-in-from-bottom-4 duration-700 aspect-[4/5] bg-neutral-100 rounded-3xl overflow-hidden relative group shadow-sm border border-neutral-200"
                  >
                     <img src={img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                     
                     {hasMeta && (
                        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/20 text-white/90 text-[10px] font-mono leading-tight max-w-[80%] text-right self-end shadow-xl z-10 pointer-events-none transition opacity-70 group-hover:opacity-100">
                           <div className="font-bold text-emerald-400 mb-0.5 whitespace-nowrap">SCORE: {scoreText}</div>
                           {displayTags.length > 0 && (
                             <div className="break-words leading-relaxed text-[8px]">
                                {displayTags.map((tag: string, tIdx: number) => {
                                   const tl = tag.toLowerCase()
                                   const isMatched = eventMatchers.some((m: any) => m.baseWord === tl || m.sideQualifier === tl) || 
                                                     locTargetTags.includes(tl) || 
                                                     coreSubjects.includes(tl) || 
                                                     timeTargetTags.includes(tl) ||
                                                     (isVipLead && vipBoostTags.includes(tl)) ||
                                                     (notesText.includes(tl) && tl.length > 3) ||
                                                     (notesText.includes('colour') && tl === 'color') ||
                                                     (notesText.includes('color') && tl === 'colour')

                                   return (
                                     <span key={tIdx} className={isMatched ? 'text-emerald-300 font-bold' : 'opacity-40'}>
                                       {tag}{tIdx < displayTags.length - 1 ? ', ' : ''}
                                     </span>
                                   )
                                })}
                             </div>
                           )}
                        </div>
                     )}

                     <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                        <div className="flex items-center justify-center gap-3">
                           <button onClick={() => onPickPhoto(idx)} className="w-10 h-10 bg-white/20 hover:bg-white text-white hover:text-black backdrop-blur-md rounded-full flex items-center justify-center transition shadow-lg text-sm">✏️</button>
                           <button onClick={() => remove(idx)} className="px-3 py-1.5 bg-red-500/80 hover:bg-red-600 text-white backdrop-blur-md rounded-full flex items-center justify-center transition text-[10px] font-bold uppercase tracking-widest">Remove</button>
                        </div>
                     </div>
                  </div>
               )
            })}
            
            <button onClick={() => onPickPhoto()} className="aspect-[4/5] bg-white border-2 border-dashed border-neutral-300 rounded-3xl flex flex-col items-center justify-center text-neutral-400 hover:bg-neutral-50 hover:border-neutral-400 transition-all gap-2 group shadow-sm">
               <span className="text-4xl group-hover:scale-110 transition-transform duration-300 mb-2">📸</span>
               <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Add Image</span>
            </button>
         </div>

         {/* ── Portrait Boost Section ── */}
         <div className="mt-10 border-t border-neutral-100 pt-8">
            <div className="flex justify-between items-end mb-6">
               <div>
                  <h3 className="text-lg font-bold text-neutral-900 tracking-tight">Portrait Boost</h3>
                  <p className="text-sm text-neutral-500 mt-0.5">
                     {existingPortraitCount} portrait{existingPortraitCount !== 1 ? 's' : ''} already in moodboard · targeting {Math.max(6, Math.min(12, 14 - existingPortraitCount))} more
                  </p>
               </div>
               <button
                  onClick={autoFillPortraits}
                  disabled={loadingPortraits}
                  className="px-4 py-2 bg-violet-50 text-violet-600 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-violet-100 transition shadow-sm disabled:opacity-50 flex gap-2 items-center"
               >
                  <span>🖼️</span> {loadingPortraits ? 'Curating...' : 'Re-roll Portraits'}
               </button>
            </div>

            {portraitItems.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 bg-neutral-50 rounded-3xl border-2 border-dashed border-neutral-200 text-neutral-400 gap-3">
                  <span className="text-4xl">🖼️</span>
                  <p className="text-xs font-bold uppercase tracking-widest">No portraits selected</p>
                  <button onClick={autoFillPortraits} disabled={loadingPortraits} className="mt-1 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition disabled:opacity-50">
                     Auto-Curate Portraits
                  </button>
               </div>
            ) : (
               <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {portraitItems.map((item: any, idx: number) => {
                     const img = typeof item === 'string' ? item : item.url
                     const displayTags: string[] = liveTags[img] || item.tags || []
                     const isWeddingPortrait = displayTags.some((t: string) => t.toLowerCase() === 'wedding') &&
                        displayTags.some((t: string) => portraitSubjectTags.includes(t.toLowerCase()))
                     return (
                        <div
                           key={idx}
                           style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
                           className="animate-in fade-in slide-in-from-bottom-4 duration-700 aspect-[4/5] bg-neutral-100 rounded-3xl overflow-hidden relative group shadow-sm border border-neutral-200"
                        >
                           <img src={img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                           {isWeddingPortrait && (
                              <div className="absolute top-3 left-3 bg-amber-500/90 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-bold text-white uppercase tracking-widest z-10 pointer-events-none">💍 Wedding</div>
                           )}
                           {displayTags.length > 0 && (
                              <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/20 text-[9px] font-mono leading-tight max-w-[80%] text-right shadow-xl z-10 pointer-events-none opacity-70 group-hover:opacity-100 transition">
                                 <div className="break-words text-violet-300 font-semibold">{displayTags.filter((t: string) => portraitSubjectTags.includes(t.toLowerCase())).join(', ')}</div>
                                 <div className="break-words opacity-50 mt-0.5">{displayTags.filter((t: string) => !portraitSubjectTags.includes(t.toLowerCase())).join(', ')}</div>
                              </div>
                           )}
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                              <div className="flex items-center justify-center">
                                 <button onClick={() => removePortrait(idx)} className="px-3 py-1.5 bg-red-500/80 hover:bg-red-600 text-white backdrop-blur-md rounded-full flex items-center justify-center transition text-[10px] font-bold uppercase tracking-widest">Remove</button>
                              </div>
                           </div>
                        </div>
                     )
                  })}
               </div>
            )}
         </div>
      </div>
   )
}

const ScheduleTab = ({ draft, updateDraft, teamCatalog, apiFetch, onPickPhoto, lead, teamPresets = [], onQuickAddTeam }: any) => {
   const events = draft.events || []
   const sortedEvents = useMemo(() => sortQuoteEvents(events), [events])
   const dayNumberByEventId = useMemo(() => {
      const map = new Map<string, number>()
      let day = 0
      let lastDate = ''
      sortedEvents.forEach((event: any) => {
         const dateKey = toDateOnly(event.date) || ''
         if (dateKey !== lastDate) {
            day += 1
            lastDate = dateKey
         }
         if (event.id) map.set(event.id, day)
      })
      return map
   }, [sortedEvents])

   // --- Add Event ---
   const [addDropdownOpen, setAddDropdownOpen] = useState(false)
   const [leadEvents, setLeadEvents] = useState<any[]>([])
   const [loadingLeadEvents, setLoadingLeadEvents] = useState(false)
   const addDropdownRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      if (!addDropdownOpen) return
      const handleClick = (e: MouseEvent) => {
         if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
            setAddDropdownOpen(false)
         }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
   }, [addDropdownOpen])

   const fetchLeadEvents = async () => {
      if (!lead?.id) return
      setLoadingLeadEvents(true)
      try {
         const res = await apiFetch(`/api/leads/${lead.id}`)
         if (res.ok) {
            const freshLead = await res.json()
            setLeadEvents(freshLead.events || [])
         }
      } catch {} finally {
         setLoadingLeadEvents(false)
      }
   }

   const existingEventTypes = useMemo(() => {
      return new Set(events.map((e: any) => (e.originalType || e.name || '').toLowerCase()))
   }, [events])

   const availableLeadEvents = useMemo(() => {
      return leadEvents.filter((le: any) => {
         const type = (le.event_type || '').toLowerCase()
         return type && !existingEventTypes.has(type)
      })
   }, [leadEvents, existingEventTypes])

   const addEventFromLead = (leadEvent: any) => {
      const rawT = [leadEvent.start_time, leadEvent.end_time].filter(Boolean).join(' - ')
      const t = formatTimeStr(rawT)
      const newEvent: QuoteEvent = {
         id: generateId(),
         originalType: leadEvent.event_type,
         name: leadEvent.event_type,
         date: leadEvent.event_date || '',
         location: leadEvent.venue || 'TBD',
         pax: leadEvent.pax || 0,
         time: t || '',
         slot: leadEvent.slot || null,
         venue_metadata: leadEvent.venue_metadata || null,
         date_status: leadEvent.date_status || 'confirmed',
      }
      updateDraft({ events: [...events, newEvent] })
      setAddDropdownOpen(false)
   }

   // --- Delete Event ---
   const [deleteConfirm, setDeleteConfirm] = useState<{ eventId: string; eventName: string } | null>(null)

   const confirmDeleteEvent = () => {
      if (!deleteConfirm) return
      const eventId = deleteConfirm.eventId
      // Remove only this specific event from events array
      const updatedEvents = events.filter((e: any) => e.id !== eventId)
      // Remove all team/pricing items tied to this specific event
      const updatedPricingItems = (draft.pricingItems || []).filter((i: any) => i.eventId !== eventId)
      updateDraft({ events: updatedEvents, pricingItems: updatedPricingItems })
      setDeleteConfirm(null)
   }
   
   // Multi-select team panel state (per event)
   const [teamPanelEventId, setTeamPanelEventId] = useState<string | null>(null)
   const [teamPanelSelected, setTeamPanelSelected] = useState<Set<number>>(new Set())
   const teamPanelRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      if (!teamPanelEventId) return
      const handleClick = (e: MouseEvent) => {
         if (teamPanelRef.current && !teamPanelRef.current.contains(e.target as Node)) {
            setTeamPanelEventId(null)
            setTeamPanelSelected(new Set<number>())
         }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
   }, [teamPanelEventId])

   const openTeamPanel = (eventId: string) => {
      setTeamPanelEventId(eventId)
      setTeamPanelSelected(new Set<number>())
   }

   const toggleTeamSelection = (catalogId: number, usedIds: Set<number>) => {
      if (usedIds.has(catalogId)) return
      setTeamPanelSelected(prev => {
         const next = new Set(prev)
         if (next.has(catalogId)) next.delete(catalogId)
         else next.add(catalogId)
         return next
      })
   }

   const confirmAddTeam = (eventId: string) => {
      const newItems = teamCatalog
         .filter((c: any) => teamPanelSelected.has(c.id))
         .map((c: any) => ({ id: generateId(), itemType: 'TEAM_ROLE', catalogId: c.id, label: c.name, quantity: 1, unitPrice: c.price, eventId }))
      if (newItems.length > 0) updateDraft({ pricingItems: [...draft.pricingItems, ...newItems] })
      setTeamPanelEventId(null)
      setTeamPanelSelected(new Set<number>())
   }

   const isAllTeamUsed = (eventId: string) => {
      const usedCatalogIds = new Set(draft.pricingItems.filter((i: any) => i.itemType === 'TEAM_ROLE' && i.eventId === eventId).map((i: any) => i.catalogId))
      return teamCatalog.filter((c: any) => c.active).every((c: any) => usedCatalogIds.has(c.id))
   }
   const updateItem = (id: string, p: any) => updateDraft({ pricingItems: draft.pricingItems.map((i: any) => i.id === id ? { ...i, ...p } : i) })
   const removeItem = (id: string) => updateDraft({ pricingItems: draft.pricingItems.filter((i: any) => i.id !== id) })

   const [loadingCovers, setLoadingCovers] = useState(false)
   const autoFillEvents = async () => {
      setLoadingCovers(true)
      const cloneEvents = [...events]
      let changed = false
      try {
         for (let i = 0; i < cloneEvents.length; i++) {
            if (!cloneEvents[i].coverImageUrl) {
               const payload = {
                  leadEvents: [cloneEvents[i].name],
                  requiredCount: 1,
                  excludeUrls: cloneEvents.map(e => e.coverImageUrl).filter(Boolean)
               }
               const res = await apiFetch(`/api/photos/auto-curate`, { method: 'POST', body: JSON.stringify(payload) })
               const dt = await res.json()
               if (dt && dt[0]) {
                  cloneEvents[i].coverImageUrl = dt[0].url || dt[0]
                  changed = true
               }
            }
         }
         if (changed) updateDraft({ events: cloneEvents })
      } catch {} finally {
         setLoadingCovers(false)
      }
   }

   useEffect(() => {
      if (events.some((e: any) => !e.coverImageUrl) && !loadingCovers) autoFillEvents()
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8 flex justify-between items-end">
            <div>
               <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Event Schedule & Crew</h2>
               <p className="text-neutral-500 mt-1 text-sm">Quote precision per day. Add or remove events synced from the Lead.</p>
            </div>
            <div className="flex gap-2">
               {events.some((e: any) => !e.coverImageUrl) && (
                  <button onClick={autoFillEvents} disabled={loadingCovers} className="px-4 py-2 bg-emerald-50 text-emerald-600 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-emerald-100 transition shadow-sm mb-1 disabled:opacity-50">
                     {loadingCovers ? 'Curating Covers...' : '✨ Auto Cover Events'}
                  </button>
               )}
               <div className="relative mb-1" ref={addDropdownRef}>
                  <button
                     onClick={() => { setAddDropdownOpen(!addDropdownOpen); if (!addDropdownOpen) fetchLeadEvents() }}
                     className="px-4 py-2 bg-neutral-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition shadow-sm"
                  >
                     + Add Event
                  </button>
                  {addDropdownOpen && (
                     <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-neutral-200 p-2 z-50 w-[280px] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold px-3 py-2">Lead Events</div>
                        {loadingLeadEvents ? (
                           <div className="px-3 py-4 text-center text-sm text-neutral-400">Loading...</div>
                        ) : availableLeadEvents.length === 0 ? (
                           <div className="px-3 py-4 text-center text-sm text-neutral-400 italic">All lead events already added</div>
                        ) : (
                           availableLeadEvents.map((le: any, i: number) => (
                              <button
                                 key={i}
                                 onClick={() => addEventFromLead(le)}
                                 className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition flex items-center gap-3"
                              >
                                 <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 shrink-0">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                 </div>
                                 <div>
                                    <div className="text-sm font-semibold text-neutral-800">{le.event_type}</div>
                                    <div className="text-[11px] text-neutral-400">{le.event_date ? formatMaybeDateTime(le.event_date) : 'Date TBD'}</div>
                                 </div>
                              </button>
                           ))
                        )}
                        <button onClick={() => setAddDropdownOpen(false)} className="w-full mt-1 py-2 text-xs text-neutral-400 hover:text-neutral-600 font-semibold transition">Close</button>
                     </div>
                  )}
               </div>
            </div>
         </div>

         {events.length === 0 && <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-neutral-200">No events added to the Lead yet.</div>}

         {sortedEvents.map((e: any, idx: number) => {
            const teamForEvent = draft.pricingItems.filter((i: any) => i.eventId === e.id && i.itemType === 'TEAM_ROLE')
            const dayNumber = dayNumberByEventId.get(e.id) ?? (idx + 1)
            
            return (
               <div key={`${e.id ?? 'event'}-${idx}`} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
                  <div className="bg-neutral-50 border-b border-neutral-200 px-6 py-4 flex gap-4 items-start">
                     <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-200 flex items-center justify-center font-bold text-neutral-400 shrink-0">
                        {String(dayNumber).padStart(2, '0')}
                     </div>
                     <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between pt-2">
                           <div className="text-lg font-bold text-neutral-900">{e.name || 'Unnamed Event'}</div>
                           <button
                              onClick={() => setDeleteConfirm({ eventId: e.id, eventName: e.name || 'Unnamed Event' })}
                              className="text-neutral-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition"
                              title="Remove event from quote"
                           >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                           </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div>
                              <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Date</div>
                              <div className="text-sm bg-neutral-100 rounded-md border border-neutral-200 px-3 py-1.5 w-full text-neutral-600 font-medium select-none flex items-center min-h-[34px]">{e.date_status === 'tba' ? <span className="text-neutral-400 italic">TBD</span> : <>{formatMaybeDateTime(e.date) || '-'}{e.date_status === 'tentative' && <span className="text-amber-500 ml-1 text-xs">(Tentative)</span>}</>}</div>
                           </div>
                           <div>
                              <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Time</div>
                              <div className="text-sm bg-neutral-100 rounded-md border border-neutral-200 px-3 py-1.5 w-full text-neutral-600 font-medium select-none flex items-center min-h-[34px]">{formatTimeStr(e.time) || '-'}</div>
                           </div>
                           <div>
                              <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Venue</div>
                              <div className="text-sm bg-neutral-100 rounded-md border border-neutral-200 px-3 py-1.5 w-full text-neutral-600 font-medium select-none flex items-center min-h-[34px]">{e.location || '-'}</div>
                           </div>
                           <div>
                              <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Guest Pax</div>
                              <div className="text-sm bg-neutral-100 rounded-md border border-neutral-200 px-3 py-1.5 w-full text-neutral-600 font-medium select-none flex items-center min-h-[34px]">{e.pax ? `${e.pax} Guests` : '-'}</div>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="p-6">
                     <div className="flex justify-between items-center mb-4">
                        <div className={labelClass}>Deployed Crew for Day {dayNumber}</div>
                        <div className="flex items-center gap-2">
                           {teamPresets.length > 0 && (
                             <button onClick={() => onQuickAddTeam?.(e.id)} className="text-[11px] font-bold px-3 py-1 rounded-lg transition bg-neutral-900 text-white hover:bg-neutral-800">
                               ⚡ Quick Add
                             </button>
                           )}
                           {/* Multi-select Add Member floating panel */}
                           <div className="relative" ref={teamPanelEventId === e.id ? teamPanelRef : undefined}>
                              <button
                                 onClick={() => teamPanelEventId === e.id ? setTeamPanelEventId(null) : openTeamPanel(e.id)}
                                 disabled={isAllTeamUsed(e.id)}
                                 className={`text-[11px] font-bold px-3 py-1 rounded transition ${isAllTeamUsed(e.id) ? 'bg-neutral-50 text-neutral-300 cursor-not-allowed' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                              >
                                 + Add Member
                              </button>
                              {teamPanelEventId === e.id && (() => {
                                 const usedIds = new Set<number>(draft.pricingItems.filter((i: any) => i.itemType === 'TEAM_ROLE' && i.eventId === e.id).map((i: any) => Number(i.catalogId)))
                                 const available = teamCatalog.filter((c: any) => c.active)
                                 return (
                                    <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
                                       <div className="px-3 py-2 border-b border-neutral-100 text-[10px] uppercase tracking-widest font-bold text-neutral-400">Select Team Members</div>
                                       <div className="max-h-56 overflow-y-auto">
                                          {available.length === 0 ? (
                                             <div className="px-4 py-4 text-xs text-neutral-400 text-center">No roles in catalog</div>
                                          ) : available.map((c: any) => {
                                             const isUsed = usedIds.has(c.id)
                                             const isSelected = teamPanelSelected.has(c.id)
                                             return (
                                                <button
                                                   key={c.id}
                                                   disabled={isUsed}
                                                   onClick={() => toggleTeamSelection(c.id, usedIds)}
                                                   className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition text-left ${isUsed ? 'opacity-40 cursor-not-allowed bg-neutral-50' : isSelected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50 text-neutral-800'}`}
                                                >
                                                   <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[9px] font-bold ${isUsed ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : isSelected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300 text-transparent'}`}>✓</span>
                                                   <span className="flex-1 font-medium">{c.name}</span>
                                                   {isUsed && <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Added</span>}
                                                </button>
                                             )
                                          })}
                                       </div>
                                       <div className="px-3 py-2.5 border-t border-neutral-100 flex items-center justify-between gap-2">
                                          <span className="text-[11px] text-neutral-400">{teamPanelSelected.size} selected</span>
                                          <div className="flex gap-2">
                                             <button onClick={() => { setTeamPanelEventId(null); setTeamPanelSelected(new Set<number>()) }} className="px-3 py-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition">Cancel</button>
                                             <button onClick={() => confirmAddTeam(e.id)} disabled={teamPanelSelected.size === 0} className="px-3 py-1.5 text-xs font-bold bg-neutral-900 text-white rounded-lg disabled:opacity-40 hover:bg-neutral-800 transition">Add Selected</button>
                                          </div>
                                       </div>
                                    </div>
                                 )
                              })()}
                           </div>
                        </div>
                     </div>
                     
                     {teamForEvent.length === 0 && <div className="text-xs text-neutral-400 italic bg-neutral-50 p-3 rounded-xl border border-dashed border-neutral-200">No team assigned.</div>}
                     
                     <div className="space-y-2">
                        {teamForEvent.map((t: any) => {
                           const isLegacy = t.catalogId && teamCatalog.find((c: any) => c.id === t.catalogId && !c.active);
                           return (
                              <div key={t.id} className="flex flex-col md:flex-row gap-3 md:items-center group border md:border-none border-neutral-100 p-3 md:p-0 rounded-xl">
                                 {isLegacy ? (
                                    <div className="w-full md:w-1/2 bg-neutral-100 border border-neutral-200 text-sm px-3 py-2 rounded-lg text-neutral-500 flex items-center justify-between pointer-events-none select-none">
                                       <span className="font-semibold text-neutral-400">{t.label || 'Unknown Role'}</span>
                                       <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-white border border-neutral-200 px-2 py-0.5 rounded shadow-sm">Archived</span>
                                    </div>
                                 ) : (
                                    <select value={t.catalogId} onChange={(ev) => {
                                       const cat = teamCatalog.find((c: any) => c.id === Number(ev.target.value))
                                       if(cat) updateItem(t.id, { catalogId: cat.id, label: cat.name, unitPrice: cat.price })
                                    }} className="w-full md:w-1/2 bg-neutral-50 border border-neutral-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-neutral-400">
                                       {(() => {
                                          const usedIds = new Set(draft.pricingItems.filter((i: any) => i.itemType === 'TEAM_ROLE' && i.eventId === e.id && i.id !== t.id).map((i: any) => i.catalogId))
                                          return teamCatalog.filter((c: any) => (c.active && !usedIds.has(c.id)) || c.id === t.catalogId).map((c: any) => (
                                             <option key={c.id} value={c.id}>{c.name}</option>
                                          ))
                                       })()}
                                    </select>
                                 )}
                                 <div className="flex items-center justify-between w-full md:w-auto md:justify-start gap-4">
                                    <div className="flex items-center gap-2">
                                       <span className="text-xs text-neutral-400 font-bold shrink-0">QTY</span>
                                       <input type="text" inputMode="numeric" pattern="[0-9]*" value={t.quantity === 0 ? '' : t.quantity} onChange={(ev) => { const raw = ev.target.value.replace(/[^0-9]/g, ''); updateItem(t.id, { quantity: raw === '' ? 0 : Number(raw) }) }} onBlur={() => { if (!t.quantity || t.quantity < 1) updateItem(t.id, { quantity: 1 }) }} className="w-16 text-center bg-neutral-50 border border-neutral-200 text-sm px-2 py-2 rounded-lg focus:outline-none" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <div className="font-medium text-sm text-neutral-700 w-24 text-right">{formatMoney(t.quantity * t.unitPrice)}</div>
                                       <button onClick={() => removeItem(t.id)} className="text-neutral-300 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 px-2 transition">✕</button>
                                    </div>
                                 </div>
                              </div>
                           )
                        })}
                     </div>
                     
                     {/* Event Photo Picker */}
                     <div className="mt-8 pt-6 border-t border-neutral-100 mb-2">
                        <div className={labelClass}>Web Story Event Background</div>
                        <div className="flex gap-4 items-center mt-3">
                           {e.coverImageUrl ? (
                               <div className="w-[100px] h-[60px] rounded-lg bg-neutral-100 border border-neutral-200 flex-shrink-0 relative group shadow-sm overflow-hidden">
                                   {(e.coverImageUrl.includes('.mp4') || e.coverImageUrl.includes('.webm') || e.coverImageUrl.includes('/api/videos/file')) ? (
                                       <HoverVideo src={e.coverImageUrl} className="w-full h-full object-cover" />
                                   ) : (
                                       <img src={e.coverImageUrl} className="w-full h-full object-cover" />
                                   )}
                                   <button onClick={() => updateDraft({ events: events.map((ev: any) => ev.id === e.id ? { ...ev, coverImageUrl: '' } : ev) })} className="absolute top-1 right-1 bg-black/60 text-white rounded flex items-center justify-center p-1 w-5 h-5 opacity-0 group-hover:opacity-100 transition z-10"><span className="text-[10px]">✕</span></button>
                               </div>
                           ) : (
                               <div className="w-[100px] h-[60px] rounded-lg bg-neutral-50 border border-dashed border-neutral-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                                  <span className="text-xl opacity-20">🖼️</span>
                               </div>
                           )}
                           <button onClick={() => onPickPhoto(e.id)} className="px-3 py-2 bg-white border border-neutral-200 text-xs font-semibold rounded-md hover:bg-neutral-50 shadow-sm flex gap-2 items-center text-neutral-600 transition">✨ Choose from Library</button>
                        </div>
                     </div>
                  </div>
               </div>
            )
         })}

         {/* Delete Confirmation Dialog */}
         {deleteConfirm && (
            <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center animate-in fade-in duration-150" onClick={() => setDeleteConfirm(null)}>
               <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6 w-[380px] max-w-[90vw] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-4">
                     <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                     </div>
                     <div>
                        <h3 className="text-lg font-bold text-neutral-900">Remove Event</h3>
                        <p className="text-sm text-neutral-500">This will also remove all assigned crew.</p>
                     </div>
                  </div>
                  <p className="text-sm text-neutral-600 mb-6">
                     Are you sure you want to remove <strong>{deleteConfirm.eventName}</strong> from this quote? All team members assigned to this event will also be removed.
                  </p>
                  <div className="flex gap-3 justify-end">
                     <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-4 py-2 text-sm font-semibold text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={confirmDeleteEvent}
                        className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition shadow-sm"
                     >
                        Remove Event
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   )
}

const DeliverablesTab = ({ draft, updateDraft, dCatalog, onPickBackground, deliverablePresets = [], onQuickAddDeliverables }: any) => {
   const globalItemTypes = draft.pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE' || !i.eventId)
   const bgUrl = draft.whatsIncludedBackground || ''
   const isVideo = bgUrl && (bgUrl.includes('.mp4') || bgUrl.includes('.webm') || bgUrl.includes('/api/videos/file'))

   const usedDeliverableIds = new Set<number>(draft.pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE').map((i: any) => Number(i.catalogId)))
   const allDeliverablesUsed = dCatalog.filter((c: any) => c.active && c.category !== 'ADDON').every((c: any) => usedDeliverableIds.has(c.id))

   // Multi-select deliverable panel
   const [delPanelOpen, setDelPanelOpen] = useState(false)
   const [delPanelSelected, setDelPanelSelected] = useState<Set<number>>(new Set())
   const delPanelRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      if (!delPanelOpen) return
      const handleClick = (e: MouseEvent) => {
         if (delPanelRef.current && !delPanelRef.current.contains(e.target as Node)) {
            setDelPanelOpen(false)
            setDelPanelSelected(new Set<number>())
         }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
   }, [delPanelOpen])

   const toggleDelSelection = (catalogId: number) => {
      if (usedDeliverableIds.has(catalogId)) return
      setDelPanelSelected(prev => {
         const next = new Set(prev)
         if (next.has(catalogId)) next.delete(catalogId)
         else next.add(catalogId)
         return next
      })
   }

   const confirmAddDeliverables = () => {
      const newItems = dCatalog
         .filter((c: any) => delPanelSelected.has(c.id))
         .map((c: any) => ({ id: generateId(), itemType: 'DELIVERABLE', catalogId: c.id, label: c.name, quantity: 1, unitPrice: c.price, category: c.category, description: c.description || null, deliveryTimeline: c.deliveryTimeline || null, phase: c.deliveryPhase || 'WEDDING', eventId: null }))
      if (newItems.length > 0) updateDraft({ pricingItems: [...draft.pricingItems, ...newItems] })
      setDelPanelOpen(false)
      setDelPanelSelected(new Set<number>())
   }

   const updateItem = (id: string, p: any) => updateDraft({ pricingItems: draft.pricingItems.map((i: any) => i.id === id ? { ...i, ...p } : i) })
   const removeItem = (id: string) => updateDraft({ pricingItems: draft.pricingItems.filter((i: any) => i.id !== id) })

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Final Deliverables</h2>
            <p className="text-neutral-500 mt-1 text-sm">Albums, edited photos, films and final handover items.</p>
         </div>

         {/* What's Included Background Picker */}
         <div className={cardClass}>
            <div className={labelClass}>Web Story — What's Included Background</div>
            <p className="text-xs text-neutral-400 mt-1 mb-2">Tag media with <strong>deliverables</strong> in the library. Video preferred, photo as fallback.</p>
            <div className="flex gap-4 items-center mt-3">
               {draft.whatsIncludedBackground ? (
                   <div className="w-[100px] h-[60px] rounded-lg bg-neutral-100 border border-neutral-200 flex-shrink-0 relative group shadow-sm overflow-hidden">
                       {(draft.whatsIncludedBackground.includes('.mp4') || draft.whatsIncludedBackground.includes('.webm') || draft.whatsIncludedBackground.includes('/api/videos/file')) ? (
                           <video
                              src={draft.whatsIncludedBackground}
                              muted loop playsInline preload="metadata"
                              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                              onMouseEnter={e => e.currentTarget.play().catch(()=>{})}
                              onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                           />
                       ) : (
                           <img src={draft.whatsIncludedBackground} alt="Background" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                       )}
                       <button onClick={() => updateDraft({ whatsIncludedBackground: '' })} className="absolute top-1 right-1 bg-black/60 text-white rounded flex items-center justify-center p-1 w-5 h-5 opacity-0 group-hover:opacity-100 transition z-10"><span className="text-[10px]">✕</span></button>
                   </div>
               ) : (
                   <div className="w-[100px] h-[60px] rounded-lg bg-neutral-50 border border-dashed border-neutral-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-xl opacity-20">🎬</span>
                   </div>
               )}
               <button onClick={onPickBackground} className="px-3 py-2 bg-white border border-neutral-200 text-xs font-semibold rounded-md hover:bg-neutral-50 shadow-sm flex gap-2 items-center text-neutral-600 transition">✨ Choose from Library</button>
            </div>
         </div>

         {/* Outro Background Picker */}
         <div className={cardClass}>
            <div className="flex justify-between items-center mb-6">
               <div className={labelClass}>Included In Package</div>
               <div className="flex items-center gap-2">
                  {deliverablePresets.length > 0 && (
                    <button onClick={() => onQuickAddDeliverables?.()} className="px-4 py-2 text-xs font-bold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition">
                      ⚡ Quick Add
                    </button>
                  )}
                  {/* Multi-select Add Deliverable floating panel */}
                  <div className="relative" ref={delPanelRef}>
                     <button
                        onClick={() => { setDelPanelOpen(v => !v); setDelPanelSelected(new Set<number>()) }}
                        disabled={allDeliverablesUsed}
                        className={`px-4 py-2 text-xs font-bold rounded-lg ${allDeliverablesUsed ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                     >
                        + Add Deliverable
                     </button>
                     {delPanelOpen && (() => {
                        const activeNonAddon = dCatalog.filter((c: any) => c.active && c.category !== 'ADDON')
                        const phaseLabel = (p: string) => p === 'PRE_WEDDING' ? '💍 Pre-Wedding' : '💒 Wedding'
                        const catLabel = (c: string) => c === 'PHOTO' ? '📸 Photography' : c === 'VIDEO' ? '🎥 Cinematography' : '📦 Other'
                        return (
                           <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="px-3 py-2 border-b border-neutral-100 text-[10px] uppercase tracking-widest font-bold text-neutral-400">Select Deliverables</div>
                              <div className="max-h-72 overflow-y-auto">
                                 {['PRE_WEDDING', 'WEDDING'].map(phase => {
                                    const phaseItems = activeNonAddon.filter((c: any) => (c.deliveryPhase || 'WEDDING') === phase)
                                    if (phaseItems.length === 0) return null
                                    return (
                                       <div key={phase}>
                                          <div className="px-3 py-1.5 bg-neutral-50 text-[10px] uppercase tracking-widest font-bold text-neutral-500 border-b border-neutral-100">{phaseLabel(phase)}</div>
                                          {['PHOTO', 'VIDEO', 'OTHER'].map(cat => {
                                             const items = phaseItems.filter((c: any) => (c.category || 'OTHER') === cat)
                                             if (items.length === 0) return null
                                             return (
                                                <div key={cat}>
                                                   <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400 bg-white">{catLabel(cat)}</div>
                                                   {items.map((c: any) => {
                                                      const isUsed = usedDeliverableIds.has(c.id)
                                                      const isSelected = delPanelSelected.has(c.id)
                                                      return (
                                                         <button
                                                            key={c.id}
                                                            disabled={isUsed}
                                                            onClick={() => toggleDelSelection(c.id)}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition text-left ${isUsed ? 'opacity-40 cursor-not-allowed bg-neutral-50' : isSelected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50 text-neutral-800'}`}
                                                         >
                                                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[9px] font-bold ${isUsed ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : isSelected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300 text-transparent'}`}>✓</span>
                                                            <span className="flex-1 font-medium">{c.name}</span>
                                                            {isUsed && <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Added</span>}
                                                         </button>
                                                      )
                                                   })}
                                                </div>
                                             )
                                          })}
                                       </div>
                                    )
                                 })}
                              </div>
                              <div className="px-3 py-2.5 border-t border-neutral-100 flex items-center justify-between gap-2">
                                 <span className="text-[11px] text-neutral-400">{delPanelSelected.size} selected</span>
                                 <div className="flex gap-2">
                                    <button onClick={() => { setDelPanelOpen(false); setDelPanelSelected(new Set<number>()) }} className="px-3 py-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition">Cancel</button>
                                    <button onClick={confirmAddDeliverables} disabled={delPanelSelected.size === 0} className="px-3 py-1.5 text-xs font-bold bg-neutral-900 text-white rounded-lg disabled:opacity-40 hover:bg-neutral-800 transition">Add Selected</button>
                                 </div>
                              </div>
                           </div>
                        )
                     })()}
                  </div>
               </div>
            </div>
            
            <div className="space-y-8">
               {globalItemTypes.length === 0 && <div className="text-center py-10 bg-neutral-50 rounded-xl border border-dashed border-neutral-200 text-sm text-neutral-400">No deliverables added.</div>}
               
               {['PRE_WEDDING', 'WEDDING'].map(phase => {
                  const phaseItems = globalItemTypes.filter((t: any) => (t.phase || 'WEDDING') === phase);
                  if (phaseItems.length === 0) return null;
                  
                  const phaseLabel = phase === 'PRE_WEDDING' ? '💍 Before the Vows' : '💒 Wedding Deliverables';

                  return (
                     <div key={phase} className="space-y-6">
                        <div className="text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">{phaseLabel}</div>
                        
                        {phase === 'PRE_WEDDING' ? (
                           <div className="space-y-4">
                              <div className="text-xs uppercase tracking-widest font-bold text-neutral-500 ml-2">PRE WEDDING</div>
                              {phaseItems.map((t: any) => {
                                 const isLegacy = t.catalogId && dCatalog.find((c: any) => c.id === t.catalogId && !c.active);
                                 const defaultEmoji = '💍';
                                 return (
                                    <div key={t.id} className="flex flex-col md:flex-row gap-4 md:items-center p-4 bg-neutral-50 border border-neutral-100 rounded-xl group transition-colors hover:border-neutral-200">
                                       <div className="flex items-center gap-3 w-full md:w-auto">
                                          <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-neutral-200 flex items-center justify-center shrink-0">{defaultEmoji}</div>
                                          {isLegacy ? (
                                             <div className="flex-1 bg-neutral-100 border border-neutral-200 text-sm px-3 py-2 rounded-lg text-neutral-500 flex items-center justify-between pointer-events-none select-none md:mr-2">
                                                <span className="font-semibold text-neutral-400">{t.label || 'Unknown Item'}</span>
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-white border border-neutral-200 px-2 py-0.5 rounded shadow-sm">Archived</span>
                                             </div>
                                          ) : (
                                             <select value={t.catalogId} onChange={(ev) => {
                                                const cat = dCatalog.find((c: any) => c.id === Number(ev.target.value))
                                                if(cat) updateItem(t.id, { catalogId: cat.id, label: cat.name, unitPrice: cat.price, category: cat.category, description: cat.description || null, deliveryTimeline: cat.deliveryTimeline || null, phase: cat.deliveryPhase || 'WEDDING' })
                                             }} className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none cursor-pointer">
                                                {['PHOTO', 'VIDEO', 'OTHER'].map(optCat => {
                                                   const usedIds = new Set(draft.pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE' && i.id !== t.id).map((i: any) => i.catalogId))
                                                   const options = dCatalog.filter((c: any) => ((c.active && !usedIds.has(c.id)) || c.id === t.catalogId) && (c.category || 'OTHER') === optCat)
                                                   if (options.length === 0) return null
                                                   const optLabel = optCat === 'PHOTO' ? 'Photography' : optCat === 'VIDEO' ? 'Cinematography' : 'Other'
                                                   return (
                                                      <optgroup key={optCat} label={optLabel}>
                                                         {options.map((c: any) => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                         ))}
                                                      </optgroup>
                                                   )
                                                })}
                                             </select>
                                          )}
                                       </div>
                                       <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto md:ml-auto">
                                          <div className="flex items-center gap-2">
                                             <span className="text-xs text-neutral-400 font-bold shrink-0">QTY</span>
                                             <input type="text" inputMode="numeric" pattern="[0-9]*" value={t.quantity === 0 ? '' : t.quantity} onChange={(ev) => { const raw = ev.target.value.replace(/[^0-9]/g, ''); updateItem(t.id, { quantity: raw === '' ? 0 : Number(raw) }) }} onBlur={() => { if (!t.quantity || t.quantity < 1) updateItem(t.id, { quantity: 1 }) }} className="w-16 text-center bg-white border border-neutral-200 text-sm px-2 py-1.5 rounded focus:outline-none" />
                                          </div>
                                          <button onClick={() => removeItem(t.id)} className="text-neutral-300 hover:text-red-500 px-2 transition opacity-100 md:opacity-0 group-hover:opacity-100">✕</button>
                                       </div>
                                    </div>
                                 )
                              })}
                           </div>
                        ) : (
                           ['PHOTO', 'VIDEO', 'OTHER'].map(category => {
                              const catItems = phaseItems.filter((t: any) => {
                                 const cat = dCatalog.find((c: any) => c.id === t.catalogId)?.category || 'OTHER';
                                 return cat === category;
                              });
                              
                              if (catItems.length === 0) return null;

                              const blockLabel = category === 'PHOTO' ? 'PHOTOGRAPHY' : category === 'VIDEO' ? 'CINEMATOGRAPHY' : 'OTHER';
                              const defaultEmoji = category === 'PHOTO' ? '📸' : category === 'VIDEO' ? '🎥' : '🎁';

                              return (
                                 <div key={category} className="space-y-4">
                                    <div className="text-xs uppercase tracking-widest font-bold text-neutral-500 ml-2">{blockLabel}</div>
                                    {catItems.map((t: any) => {
                                       const isLegacy = t.catalogId && dCatalog.find((c: any) => c.id === t.catalogId && !c.active);
                                       return (
                                          <div key={t.id} className="flex flex-col md:flex-row gap-4 md:items-center p-4 bg-neutral-50 border border-neutral-100 rounded-xl group transition-colors hover:border-neutral-200">
                                             <div className="flex items-center gap-3 w-full md:w-auto">
                                                <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-neutral-200 flex items-center justify-center shrink-0">{defaultEmoji}</div>
                                             {isLegacy ? (
                                                <div className="flex-1 bg-neutral-100 border border-neutral-200 text-sm px-3 py-2 rounded-lg text-neutral-500 flex items-center justify-between pointer-events-none select-none mr-2">
                                                   <span className="font-semibold text-neutral-400">{t.label || 'Unknown Item'}</span>
                                                   <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 bg-white border border-neutral-200 px-2 py-0.5 rounded shadow-sm">Archived</span>
                                                </div>
                                             ) : (
                                                <select value={t.catalogId} onChange={(ev) => {
                                                   const cat = dCatalog.find((c: any) => c.id === Number(ev.target.value))
                                                   if(cat) updateItem(t.id, { catalogId: cat.id, label: cat.name, unitPrice: cat.price, category: cat.category, description: cat.description || null, deliveryTimeline: cat.deliveryTimeline || null, phase: cat.deliveryPhase || 'WEDDING' })
                                                }} className="flex-1 bg-transparent text-sm font-semibold text-neutral-900 focus:outline-none cursor-pointer">
                                                   {['PHOTO', 'VIDEO', 'OTHER'].map(optCat => {
                                                      const usedIds = new Set(draft.pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE' && i.id !== t.id).map((i: any) => i.catalogId))
                                                      const options = dCatalog.filter((c: any) => ((c.active && !usedIds.has(c.id)) || c.id === t.catalogId) && (c.category || 'OTHER') === optCat)
                                                      if (options.length === 0) return null
                                                      const optLabel = optCat === 'PHOTO' ? 'Photography' : optCat === 'VIDEO' ? 'Cinematography' : 'Other'
                                                      return (
                                                         <optgroup key={optCat} label={optLabel}>
                                                            {options.map((c: any) => (
                                                               <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                         </optgroup>
                                                      )
                                                   })}
                                                </select>
                                             )}
                                             </div>
                                             <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto md:ml-auto">
                                                <div className="flex items-center gap-2">
                                                   <span className="text-xs text-neutral-400 font-bold shrink-0">QTY</span>
                                                   <input type="text" inputMode="numeric" pattern="[0-9]*" value={t.quantity === 0 ? '' : t.quantity} onChange={(ev) => { const raw = ev.target.value.replace(/[^0-9]/g, ''); updateItem(t.id, { quantity: raw === '' ? 0 : Number(raw) }) }} onBlur={() => { if (!t.quantity || t.quantity < 1) updateItem(t.id, { quantity: 1 }) }} className="w-16 text-center bg-white border border-neutral-200 text-sm px-2 py-1.5 rounded focus:outline-none" />
                                                </div>
                                                <button onClick={() => removeItem(t.id)} className="text-neutral-300 hover:text-red-500 px-2 transition opacity-100 md:opacity-0 group-hover:opacity-100">✕</button>
                                             </div>
                                          </div>
                                       )
                                    })}
                                 </div>
                              )
                           })
                        )}
                     </div>
                  )
               })}
            </div>
         </div>
      </div>
   )
}

const AddonsTab = ({ draft, updateDraft, dCatalog }: any) => {
   const addonsCatalog = dCatalog.filter((c: any) => c.active && (c.category === 'ADDON'))
   
   // Track which addon catalog IDs are currently selected to be offered
   const offeredAddonIds = new Set(draft.offeredAddons || [])

   const toggleAddon = (addonId: number) => {
      const next = new Set(offeredAddonIds)
      if (next.has(addonId)) next.delete(addonId)
      else next.add(addonId)
      updateDraft({ offeredAddons: Array.from(next) })
   }

   const selectedCount = offeredAddonIds.size

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Add-on Services</h2>
            <p className="text-neutral-500 mt-1 text-sm">
               Select which add-ons to offer the client in the proposal. Only selected add-ons will be visible.
            </p>
         </div>

         {addonsCatalog.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-neutral-200">
               <div className="text-4xl mb-3 opacity-30">🧩</div>
               <div className="text-sm font-semibold text-neutral-700">No add-ons configured</div>
               <p className="text-xs text-neutral-400 mt-1">Add items with category "ADDON" in Pricing Catalog → Deliverables.</p>
            </div>
         ) : (
            <>
               {/* Add-on Cards Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {addonsCatalog.map((addon: any) => {
                     const isSelected = offeredAddonIds.has(addon.id)

                     return (
                        <div
                           key={addon.id}
                           className={`relative rounded-2xl border-2 transition-all duration-200 cursor-pointer overflow-hidden ${
                              isSelected
                                 ? 'border-neutral-900 bg-white shadow-lg ring-1 ring-neutral-900/5'
                                 : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
                           }`}
                           onClick={() => toggleAddon(addon.id)}
                        >
                           {/* Selection indicator */}
                           <div className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                 ? 'bg-neutral-900 border-neutral-900'
                                 : 'border-neutral-300 bg-white'
                           }`}>
                              {isSelected && (
                                 <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                 </svg>
                              )}
                           </div>

                           <div className="p-5">
                              <div className="flex items-start gap-3 mb-3 pr-8">
                                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                                    isSelected ? 'bg-neutral-900 text-white' : 'bg-neutral-100'
                                 }`}>
                                    {addon.name.toLowerCase().includes('drone') ? '🚁' :
                                     addon.name.toLowerCase().includes('pre-wedding') || addon.name.toLowerCase().includes('pre wedding') ? '💑' :
                                     addon.name.toLowerCase().includes('led') ? '📺' :
                                     addon.name.toLowerCase().includes('print') ? '🖨️' :
                                     addon.name.toLowerCase().includes('photographer') ? '📸' :
                                     addon.name.toLowerCase().includes('album') ? '📖' :
                                     '✨'}
                                 </div>
                                 <div className="min-w-0">
                                    <div className="text-sm font-bold text-neutral-900 leading-tight">{addon.name}</div>
                                    {addon.description && (
                                       <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{addon.description}</p>
                                    )}
                                 </div>
                              </div>

                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
                                 <div className="text-lg font-bold text-neutral-900">{formatMoney(addon.price)}</div>
                                 {addon.unitType && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-2 py-1 rounded-md">
                                       {addon.unitType === 'PER_DAY' ? 'Per Day' : addon.unitType === 'PER_EVENT' ? 'Per Event' : addon.unitType === 'FLAT' ? 'Flat Rate' : 'Per Unit'}
                                    </span>
                                 )}
                              </div>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </>
         )}
      </div>
   )
}

const InvestmentTab = ({ draft, updateDraft, calculatedTotal }: any) => {
   const milestones = draft.paymentSchedule || []
   const totalPerc = milestones.reduce((sum: number, m: any) => sum + (m.percentage || 0), 0)
   const activeTotal = draft.pricingMode === 'TIERED' 
      ? (draft.tiers?.find((t: any) => t.id === draft.selectedTierId || t.isPopular)?.price || 0)
      : (draft.overridePrice ?? calculatedTotal)

   const addMilestone = () => {
      const remainingPerc = 100 - totalPerc
      if (remainingPerc <= 0) return // No more space
      updateDraft({ 
         paymentSchedule: [...milestones, { 
            label: 'Final Payment', 
            dueDate: 'On Delivery', 
            percentage: remainingPerc, 
            amount: Math.round(activeTotal * (remainingPerc/100)) 
         }] 
      })
   }

   const updateM = (idx: number, p: any) => { 
      const n = [...milestones]
      const updated = { ...n[idx], ...p }
      
      // If percentage changed, ensure we don't exceed 100% (or at least provide feedback)
      if (p.percentage !== undefined) {
         updated.amount = Math.round(activeTotal * (p.percentage / 100))
      } 
      
      n[idx] = updated
      updateDraft({ paymentSchedule: n }) 
   }

   const removeM = (idx: number) => updateDraft({ paymentSchedule: milestones.filter((_: any, i: number) => i !== idx) })

   // Auto-calculate amounts when total changes
   useEffect(() => {
     const hasPerc = milestones.some((m: any) => m.percentage !== undefined)
     if (hasPerc) {
        const updated = milestones.map((m: any) => ({
           ...m,
           amount: m.percentage !== undefined ? Math.round(activeTotal * (m.percentage / 100)) : m.amount
        }))
        // Only update if amounts actually changed to avoid loop
        const changed = updated.some((m: any, i: number) => m.amount !== milestones[i].amount)
        if (changed) updateDraft({ paymentSchedule: updated })
     }
   }, [activeTotal])

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Investment & Payments</h2>
            <p className="text-neutral-500 mt-1 text-sm">Control the final math, payment milestones, and expiration bounds.</p>
         </div>

         <div className={cardClass}>
            <div className="flex justify-between items-center mb-6 border-b border-neutral-100 pb-4">
               <div className={labelClass}>Pricing Strategy</div>
               <div className="flex bg-neutral-100 p-1 rounded-lg">
                  <button onClick={() => updateDraft({ pricingMode: 'SINGLE' })} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition ${draft.pricingMode !== 'TIERED' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>Single Price</button>
                  <button onClick={() => updateDraft({ pricingMode: 'TIERED' })} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition ${draft.pricingMode === 'TIERED' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>3 Options (Tiers)</button>
               </div>
            </div>

            <div className="space-y-6">
               {draft.pricingMode !== 'TIERED' && (
                  <div className="flex gap-4 items-center mb-6 pb-6 border-b border-neutral-100">
                    <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Select Base Package For This Quote:</span>
                    <div className="flex gap-2">
                      {draft.tiers?.map((t: any) => (
                        <button 
                          key={t.id} 
                          onClick={() => updateDraft({ selectedTierId: t.id })}
                          className={`px-5 py-2 rounded-xl text-xs font-bold border-2 transition ${draft.selectedTierId === t.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}
                        >
                          {t.name || 'Unnamed Package'}
                        </button>
                      ))}
                    </div>
                  </div>
               )}

               <div className={`grid gap-6 ${draft.pricingMode === 'TIERED' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {draft.tiers?.map((tier: QuoteTier, idx: number) => {
                     if (draft.pricingMode !== 'TIERED' && tier.id !== (draft.selectedTierId || draft.tiers[0]?.id)) return null;
                     
                     return (
                        <div key={tier.id} className={`p-5 rounded-2xl border-2 transition ${(draft.pricingMode === 'TIERED' && tier.isPopular) || draft.pricingMode !== 'TIERED' ? 'border-emerald-200 bg-emerald-50/30' : 'border-neutral-100 bg-neutral-50/20'}`}>
                           <div className="flex justify-between items-center mb-4">
                              <input value={tier.name} onChange={e => {
                                 const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], name: e.target.value }; 
                                 updateDraft({ tiers: n })
                              }} className="bg-transparent font-bold text-sm text-neutral-900 focus:outline-none w-full" placeholder="Tier Name" />
                              {draft.pricingMode === 'TIERED' && (
                                <button onClick={() => {
                                   const n = (draft.tiers || []).map((t: any, i: number) => ({ ...t, isPopular: i === idx })); 
                                   updateDraft({ tiers: n, selectedTierId: tier.id }) // Automatically set as active selection for milestones
                                }} className={`shrink-0 ml-2 w-6 h-6 flex items-center justify-center rounded-full transition ${tier.isPopular ? 'bg-emerald-500 text-white shadow-lg' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'}`}>★</button>
                              )}
                           </div>
                           
                           <div className="relative mb-4">
                              {tier.name === 'Bespoke' && draft.pricingMode === 'TIERED' ? (
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-col gap-3">
                                    <div className="relative w-full">
                                      <span className="absolute left-3 top-2.5 text-xs text-neutral-400 font-bold">₹</span>
                                      <CurrencyInput value={tier.luxuryRangeLow ?? ''} onChange={(val) => {
                                        const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], luxuryRangeLow: Number(val) || 0 }; 
                                        updateDraft({ tiers: n })
                                      }} className="w-full bg-white pl-7 pr-2 py-1.5 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-900" placeholder="Low" />
                                      <span className="absolute -top-1.5 left-2 bg-white px-1 text-[8px] uppercase tracking-tighter text-neutral-400">Min Range</span>
                                    </div>
                                    <div className="relative w-full">
                                      <span className="absolute left-3 top-2.5 text-xs text-neutral-400 font-bold">₹</span>
                                      <CurrencyInput value={tier.luxuryRangeHigh ?? ''} onChange={(val) => {
                                        const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], luxuryRangeHigh: Number(val) || 0 }; 
                                        updateDraft({ tiers: n })
                                      }} className="w-full bg-white pl-7 pr-2 py-1.5 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-900" placeholder="High" />
                                      <span className="absolute -top-1.5 left-2 bg-white px-1 text-[8px] uppercase tracking-tighter text-neutral-400">Max Range</span>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-neutral-400 italic px-1">Visible range for "On Request"</p>
                                </div>
                              ) : (
                                 <div className="space-y-3">
                                   {/* System-generated price (read-only reference) */}
                                   <div>
                                     <div className="flex items-center gap-2 mb-1">
                                       <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">System Price</span>
                                       <span className="text-xs font-bold text-neutral-400">₹{Math.round(tier.price).toLocaleString('en-IN')}</span>
                                     </div>
                                   </div>
                                   {/* Override price */}
                                   <div className="relative">
                                     <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-1">Display Price</span>
                                     <span className="absolute left-3 top-[26px] text-xs text-neutral-400 font-bold">₹</span>
                                     <CurrencyInput value={tier.overridePrice ?? tier.price ?? ''} onChange={(val) => {
                                       const n = [...(draft.tiers || [])]; 
                                       const numVal = Number(val) || 0;
                                       const sysPrice = Math.round(tier.price || 0);
                                       if (numVal < sysPrice && numVal > 0) {
                                         n[idx] = { ...n[idx], overridePrice: sysPrice };
                                       } else {
                                         n[idx] = { ...n[idx], overridePrice: numVal === sysPrice ? null : numVal };
                                       }
                                       updateDraft({ tiers: n })
                                     }} className={`w-full bg-white pl-7 pr-3 py-2.5 border rounded-xl text-xl font-black text-neutral-900 focus:ring-1 transition outline-none ${
                                       tier.overridePrice != null && tier.overridePrice < Math.round(tier.price || 0) ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-400' : 'border-neutral-200 focus:border-emerald-400 focus:ring-emerald-400'
                                     }`} placeholder="0" />
                                     {tier.overridePrice != null && tier.overridePrice !== tier.price && (
                                       <button onClick={() => {
                                         const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], overridePrice: null }; updateDraft({ tiers: n })
                                       }} className="absolute right-2 top-[26px] text-[9px] text-neutral-400 hover:text-neutral-600 px-1.5 py-0.5 rounded bg-neutral-100" title="Reset to system price">Reset</button>
                                     )}
                                     <p className="text-[9px] text-neutral-400 mt-1 px-1">Display price must be ≥ System Price (₹{Math.round(tier.price || 0).toLocaleString('en-IN')})</p>
                                   </div>
                                   {/* Discount section */}
                                   {tier.discountedPrice != null ? (
                                     <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50 space-y-2">
                                       <div className="flex items-center justify-between">
                                         <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-bold">Special Discount</span>
                                         <button onClick={() => {
                                           const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], discountedPrice: null, discountLabel: undefined }; updateDraft({ tiers: n })
                                         }} className="text-[9px] text-rose-400 hover:text-rose-600 font-bold">Remove</button>
                                       </div>
                                       <input value={tier.discountLabel || ''} onChange={e => {
                                         const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], discountLabel: e.target.value }; updateDraft({ tiers: n })
                                       }} className="w-full bg-white px-3 py-1.5 border border-emerald-100 rounded-lg text-xs text-neutral-900 font-medium" placeholder="e.g. Early Bird, Diwali Special" />
                                       <div className="relative">
                                         <span className="absolute left-3 top-2 text-xs text-emerald-600 font-bold">₹</span>
                                         <CurrencyInput value={tier.discountedPrice ?? ''} onChange={(val) => {
                                           const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], discountedPrice: Number(val) || 0 }; updateDraft({ tiers: n })
                                         }} className="w-full bg-white pl-7 pr-3 py-1.5 border border-emerald-100 rounded-lg text-sm font-bold text-emerald-700" placeholder="Discounted amount" />
                                       </div>
                                     </div>
                                   ) : (
                                     <button onClick={() => {
                                       const n = [...(draft.tiers || [])]; 
                                       const basePrice = tier.overridePrice ?? tier.price;
                                       n[idx] = { ...n[idx], discountedPrice: Math.round(basePrice * 0.9), discountLabel: '' }; 
                                       updateDraft({ tiers: n })
                                     }} className="text-[10px] text-emerald-600 font-bold hover:text-emerald-700 transition flex items-center gap-1">
                                       <span>+</span> Add Special Discount
                                     </button>
                                   )}
                                 </div>
                              )}
                           </div>

                           <textarea value={tier.description} onChange={e => {
                              const n = [...(draft.tiers || [])]; n[idx] = { ...n[idx], description: e.target.value }; 
                              updateDraft({ tiers: n })
                           }} className="w-full bg-transparent text-xs text-neutral-500 border-none focus:outline-none resize-none h-16 leading-relaxed" />
                        </div>
                     )
                  })}
               </div>
               
               <div className="flex justify-between items-center bg-neutral-100/50 p-4 rounded-xl border border-neutral-200 shadow-sm mt-6">
                  <div className="text-xs text-neutral-500 flex gap-2 items-center">
                     <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                     Milestones currently based on: <strong>{draft.tiers?.find((t: any) => t.id === (draft.selectedTierId || draft.tiers.find((x:any)=>x.isPopular)?.id))?.name || 'Selected'} Tier</strong>
                  </div>
                  <p className="text-[10px] text-neutral-400 italic">Total value: {formatMoney(activeTotal)}</p>
               </div>
            </div>
         </div>

         <div className={cardClass}>
            <div className="flex justify-between items-center mb-6">
               <div className="flex gap-4 items-center">
                  <div className={labelClass}>Payment Milestone Structure</div>
                  <div className="text-[9px] uppercase tracking-wider font-bold bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Auto-Calculated</div>
               </div>
               <button onClick={addMilestone} className="text-[11px] font-bold px-3 py-1.5 bg-neutral-900 text-white hover:bg-black rounded-lg transition shadow-sm">+ Add Milestone</button>
            </div>

            <div className="space-y-3">
               {milestones.length === 0 && <p className="text-sm text-neutral-400 py-4">No payment schedule. Add booking/delivery milestones.</p>}
               {milestones.map((m: any, idx: number) => (
                  <div key={idx} className="flex gap-4 items-start group bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100/50">
                     <div className="flex-1 space-y-3">
                        <div className="flex gap-2">
                           <input value={m.label} onChange={e => updateM(idx, { label: e.target.value })} placeholder="e.g. Booking Advance" className="flex-1 bg-transparent px-0 py-1 border-b border-dashed border-neutral-200 text-sm font-bold focus:border-neutral-400 focus:outline-none placeholder:text-neutral-300" />
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 transition-all focus-within:ring-2 focus-within:ring-emerald-200">
                              <input type="number" value={m.percentage ?? 0} onChange={e => updateM(idx, { percentage: Number(e.target.value) || 0 })} className="w-10 bg-transparent text-sm font-black text-emerald-700 focus:outline-none" />
                              <span className="text-xs text-emerald-400 font-bold">% Percentage</span>
                           </div>
                        </div>
                     </div>
                     <button onClick={() => removeM(idx)} className="mt-2 text-neutral-300 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 px-2 transition">✕</button>
                  </div>
               ))}
            </div>

            <div className={`mt-6 p-4 rounded-xl border flex justify-between items-center transition-all ${totalPerc === 100 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100 animate-pulse'}`}>
                <div className="flex flex-col">
                   <div className={`text-[10px] font-black uppercase tracking-widest ${totalPerc === 100 ? 'text-emerald-500' : 'text-red-500'}`}>Current Split</div>
                   <div className={`text-2xl font-black ${totalPerc === 100 ? 'text-emerald-700' : 'text-red-700'}`}>{totalPerc}%</div>
                </div>
                {totalPerc !== 100 && (
                   <div className="text-[10px] font-bold text-red-500 bg-white/50 px-2 py-1 rounded">Sum must be exactly 100%</div>
                )}
                {totalPerc === 100 && (
                   <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200/50">✓</div>
                )}
            </div>
         </div>
      </div>
   )
}

const ConditionsTab = ({ draft, updateDraft }: any) => {
   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Special Conditions</h2>
            <p className="text-neutral-500 mt-1 text-sm">Add custom terms appended to the agreement for this client only.</p>
         </div>

         <div className={cardClass}>
            <div className="flex justify-between items-center mb-4 border-b border-neutral-100 pb-4">
               <div>
                  <div className={labelClass}>Special Conditions</div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Custom terms appended to the agreement for this client only.</p>
               </div>
               <button
                  onClick={() => {
                     const current = draft.additionalTerms || []
                     updateDraft({ additionalTerms: [...current, ''] })
                  }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition"
               >
                  + Add Condition
               </button>
            </div>

            {(!draft.additionalTerms || draft.additionalTerms.length === 0) ? (
               <div className="text-center py-8 text-neutral-400">
                  <div className="text-3xl mb-2">📝</div>
                  <div className="text-sm font-medium">No special conditions</div>
                  <div className="text-[11px] mt-1">Add client-specific terms that will appear in the agreement.</div>
               </div>
            ) : (
               <div className="space-y-3">
                  {(draft.additionalTerms || []).map((term: string, idx: number) => (
                     <div key={idx} className="flex items-start gap-2 group">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-500 flex items-center justify-center mt-1.5">{idx + 1}</span>
                        <textarea
                           value={term}
                           onChange={(e) => {
                              const updated = [...(draft.additionalTerms || [])]
                              updated[idx] = e.target.value
                              updateDraft({ additionalTerms: updated })
                           }}
                           placeholder="e.g. Drone coverage confirmed for Haldi ceremony at outdoor venue."
                           rows={2}
                           className="flex-1 px-3 py-2 border border-neutral-200 rounded-xl text-sm text-neutral-800 placeholder:text-neutral-300 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
                        />
                        <button
                           onClick={() => {
                              const updated = (draft.additionalTerms || []).filter((_: any, i: number) => i !== idx)
                              updateDraft({ additionalTerms: updated })
                           }}
                           className="shrink-0 mt-1.5 w-6 h-6 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                           title="Remove"
                        >
                           <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>
   )
}



const TestimonialsSelectionTab = ({ draft, updateDraft, apiFetch }: any) => {
   const [catalog, setCatalog] = useState<any[]>([])
   const [loading, setLoading] = useState(true)
   
   const selectedIds = new Set((draft.testimonials || []).map((t: any) => t.id))

   useEffect(() => {
      loadCatalog()
   }, [])

   const loadCatalog = async () => {
      try {
         const res = await apiFetch('/api/testimonials')
         if (res.ok) {
            const data = await res.json()
            setCatalog(data)
            
            // Auto-prune stale testimonials from draft that are no longer in catalog
            const currentIds = new Set(data.map((item: any) => item.id))
            const currentSelected = draft.testimonials || []
            const validSelected = currentSelected.filter((t: any) => currentIds.has(t.id))
            
            if (validSelected.length !== currentSelected.length) {
               updateDraft({ testimonials: validSelected })
            }

            // Auto-select 5 if none selected and catalog exists
            if (validSelected.length === 0 && data.length > 0) {
              const initial = data.slice(0, 5)
              updateDraft({ testimonials: initial })
            }
         }
      } finally {
         setLoading(false)
      }
   }

   const toggle = (t: any) => {
      const current = draft.testimonials || []
      const exists = current.find((item: any) => item.id === t.id)
      if (exists) {
         updateDraft({ testimonials: current.filter((item: any) => item.id !== t.id) })
      } else {
         updateDraft({ testimonials: [...current, t] })
      }
   }

   return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
         <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Client Testimonials</h2>
            <p className="text-neutral-500 mt-1 text-sm">Select which reviews from your global catalog should be featured in this proposal.</p>
         </div>

         {loading ? (
            <div className="py-20 text-center text-neutral-400 text-sm font-medium">Loading catalog...</div>
         ) : (
            <div className="grid grid-cols-2 gap-4">
               {catalog.map((t: any) => {
                  const isSelected = selectedIds.has(t.id)
                  const isVideo = t.media_url && (t.media_url.includes('.mp4') || t.media_url.includes('.webm') || t.media_url.includes('/api/videos/file'))
                  
                  return (
                     <div 
                        key={t.id} 
                        onClick={() => toggle(t)}
                        className={`group cursor-pointer rounded-2xl border-2 transition-all overflow-hidden bg-white flex h-32 ${isSelected ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-neutral-200 hover:border-neutral-300'}`}
                     >
                        <div className="w-24 bg-neutral-100 shrink-0 relative overflow-hidden">
                           {isVideo ? (
                              <video src={t.media_url} muted loop playsInline onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} className="w-full h-full object-cover" />
                           ) : (
                              <img src={t.media_url} className="w-full h-full object-cover" />
                           )}
                           {isSelected && (
                              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                 <div className="bg-emerald-500 text-white rounded-full p-1 shadow-xl">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                 </div>
                              </div>
                           )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-center min-w-0">
                           <div className="text-[10px] uppercase font-bold text-emerald-500 mb-1">{isSelected ? 'Included' : 'Click to select'}</div>
                           <h4 className="font-bold text-neutral-900 truncate mb-1">{t.couple_names}</h4>
                           <p className="text-[11px] text-neutral-500 line-clamp-2 italic leading-snug">"{t.testimonial_text}"</p>
                        </div>
                     </div>
                  )
               })}
            </div>
         )}
         
         <div className="mt-12 p-6 rounded-2xl bg-neutral-900 text-white flex justify-between items-center shadow-xl">
            <div>
               <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">Curation Summary</div>
               <div className="text-lg font-medium">{selectedIds.size} Reviews Selected</div>
            </div>
            <div className="text-white/40 text-xs italic max-w-[200px] text-right">These will appear in the "Client Love" slide of the Web Story.</div>
         </div>
      </div>
   )
}

export default QuoteBuilderPage
