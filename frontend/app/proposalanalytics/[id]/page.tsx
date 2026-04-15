'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type ProposalDetail = {
  id: number; proposal_token: string; view_count: number; last_viewed_at: string | null
  sent_at: string; quote_title: string; lead_id: number; lead_name: string
  status: string | null; calculated_price: number | null; override_price: number | null
  couple_names: string | null; expires_at?: string | null
  tiers?: any[]; pricing_mode?: string; selected_tier_id?: string
}

function extractPrices(p: ProposalDetail): number[] {
  if (p.pricing_mode === 'TIERED' && Array.isArray(p.tiers) && p.tiers.length > 0) {
    return p.tiers.map(t => Number(t.discountedPrice || t.overridePrice || t.price || 0)).filter(v => v > 0).sort((a,b)=>a-b)
  }
  if (p.pricing_mode === 'SINGLE' && Array.isArray(p.tiers)) {
     const tier = p.tiers.find(t => t.id === p.selected_tier_id)
     if (tier) {
        const v = Number(tier.discountedPrice || tier.overridePrice || tier.price || 0)
        if (v > 0) return [v]
     }
  }
  const val = p.override_price ?? p.calculated_price
  return val ? [Number(val)] : []
}

type ViewEntry = { id: number; ip: string; device: string; created_at: string; is_current_version: boolean }
type ActivityEntry = { id: number; activity_type: string; metadata: any; created_at: string; is_current_version: boolean }
type EventEntry = { id: number; session_id: string; event_type: string; event_data: any; ip: string; device?: string; referrer: string | null; created_at: string; is_current_version: boolean }
type SlideHeat = { slide: string; views: number; totalDwellMs: number }

const apiFetch = (url: string) => fetch(url, { credentials: 'include' })
const formatMoney = (val: any) => `₹${Math.round(Number(val || 0)).toLocaleString('en-IN')}`

const toDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr)
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

const toIST = (dateStr: string | null, opts: Intl.DateTimeFormatOptions = {}) => {
  const d = toDate(dateStr)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts })
}

const relativeTime = (dateStr: string | null) => {
  const d = toDate(dateStr)
  if (!d || isNaN(d.getTime())) return 'Never'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return 'Just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return toIST(dateStr, { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatDwell = (ms: number) => {
  if (!ms || ms < 1000) return '<1s'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

const formatDateTime = (dateStr: string) => {
  const d = toDate(dateStr)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' +
    d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
}

const parseDevice = (ua: string) => {
  if (!ua) return { type: 'Unknown', browser: 'Unknown', os: 'Unknown' }
  const isMobile = /mobile|iphone|android/i.test(ua)
  const isTablet = /ipad|tablet/i.test(ua)
  let browser = 'Unknown'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome\//i.test(ua)) browser = 'Chrome'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = 'Safari'
  let os = 'Unknown'
  if (/mac os/i.test(ua)) os = 'macOS'
  else if (/windows/i.test(ua)) os = 'Windows'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad/i.test(ua)) os = 'iOS'
  else if (/linux/i.test(ua)) os = 'Linux'
  const type = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop'
  return { type, browser, os }
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[2rem] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] p-8 ${className}`}>{children}</div>
)

const SectionTitle = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="mb-4">
    <h3 className="text-sm font-bold text-neutral-900">{children}</h3>
    {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
  </div>
)

const CollapsibleCard = ({ title, sub, children, defaultOpen = false }: { title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-8 py-6 flex items-center justify-between hover:bg-neutral-50/50 transition text-left">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
          {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
        </div>
        <svg className={`w-5 h-5 text-neutral-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-8 pb-8 border-t border-neutral-100 pt-6">{children}</div>}
    </div>
  )
}

export default function ProposalDetailPage() {
  const params = useParams()
  const id = Number(params?.id)
  const [data, setData] = useState<{
    proposal: ProposalDetail; views: ViewEntry[]; activities: ActivityEntry[]
    events?: EventEntry[]; slideHeatmap?: SlideHeat[]
    engagement?: { uniqueSessions: number; uniqueDevices: number; totalDwellMs: number; pricingDwellMs: number; addonRequested: boolean; accepted: boolean }
    geoData?: Record<string, { city: string; region: string; country: string }>
    isForwarded?: boolean
    uniqueFingerprints?: number
    internalIPs?: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'combined' | 'current' | 'previous'>('combined')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch(`/api/proposals-dashboard/${id}/analytics`)
      .then(async res => {
        if (!res.ok) throw new Error('Failed to load')
        setData(await res.json())
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center text-neutral-400">Loading...</div>
  if (error) return <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center text-rose-500">{error}</div>
  if (!data) return null

  const { proposal: p } = data
  const internalIPSet = new Set(data.internalIPs || [])
  const geoData = data.geoData || {}
  const prices = extractPrices(p)

  // Filter out internal IPs from views and events
  const allEvents = (data.events || []).filter(e => !internalIPSet.has(e.ip))
  const allViews = (data.views || []).filter(v => !internalIPSet.has(v.ip))
  const allActivities = data.activities || []

  // Version filtering
  const filterByVersion = <T extends { is_current_version: boolean }>(items: T[]) => {
    if (viewMode === 'combined') return items
    if (viewMode === 'current') return items.filter(i => i.is_current_version)
    return items.filter(i => !i.is_current_version)
  }

  const events = filterByVersion(allEvents)
  const views = filterByVersion(allViews)
  const activities = filterByVersion(allActivities)

  // Compute heatmap + engagement from filtered events
  const slideMap: Record<string, SlideHeat> = {}
  let totalDwellMs = 0
  events.forEach(e => {
    if (e.event_type === 'slide_view' && e.event_data) {
      const slide = e.event_data.slide || 'unknown'
      const dwell = Number(e.event_data.dwellMs || 0)
      if (!slideMap[slide]) slideMap[slide] = { slide, views: 0, totalDwellMs: 0 }
      slideMap[slide].views++
      slideMap[slide].totalDwellMs += dwell
      totalDwellMs += dwell
    }
  })
  const slideHeatmap = Object.values(slideMap)
  const pricingDwellMs = (slideMap['pricing']?.totalDwellMs || 0) + (slideMap['Pricing']?.totalDwellMs || 0) + (slideMap['Investment']?.totalDwellMs || 0) + (slideMap['investment']?.totalDwellMs || 0)

  const uniqueIPs = new Set(views.map(v => v.ip)).size
  const uniqueDevices = new Set(views.map(v => v.device)).size

  // Extract event types
  const ctaClicks = events.filter(e => e.event_type === 'cta_click')
  const tierSelects = events.filter(e => e.event_type === 'tier_select')
  const scrollDepths = events.filter(e => e.event_type === 'scroll_depth')
  const screenshotAttempts = events.filter(e => e.event_type === 'screenshot_attempt')
  const contactClicks = events.filter(e => e.event_type === 'contact_click')
  const videoPlays = events.filter(e => e.event_type === 'testimonial_video_play' || e.event_type === 'testimonial_video_end' || e.event_type === 'testimonial_video_pause')
  const testimonialScrolls = events.filter(e => e.event_type === 'testimonial_scroll')
  const tabBlurs = events.filter(e => e.event_type === 'tab_blur')
  const maxScrollDepth = scrollDepths.reduce((max, e) => Math.max(max, e.event_data?.percent || 0), 0)

  // Sessions
  const sessionMap = new Map<string, EventEntry[]>()
  for (const e of events) {
    const arr = sessionMap.get(e.session_id) || []
    arr.push(e)
    sessionMap.set(e.session_id, arr)
  }
  const sessions = [...sessionMap.entries()].map(([sessionId, evts]) => {
    evts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const start = evts[0]
    const end = evts[evts.length - 1]
    const totalDwell = evts.filter(e => e.event_type === 'slide_view').reduce((sum, e) => sum + (e.event_data?.dwellMs || 0), 0)
    const slidesViewed = new Set(evts.filter(e => e.event_type === 'slide_view').map(e => e.event_data?.slide)).size
    const { type, browser, os } = parseDevice(start.device || '')
    const sessionStart = evts.find(e => e.event_type === 'session_start')
    const referrer = sessionStart?.event_data?.referrer || start.referrer || null
    const deviceType = sessionStart?.event_data?.deviceType || type.toLowerCase()
    const screenSize = sessionStart?.event_data?.screenSize || null
    const sessionCtaClicks = evts.filter(e => e.event_type === 'cta_click')
    const sessionDepth = evts.filter(e => e.event_type === 'scroll_depth').reduce((max, e) => Math.max(max, e.event_data?.percent || 0), 0)
    return { sessionId, start: start.created_at, end: end.created_at, totalDwell, slidesViewed, ip: start.ip, type, browser, os, referrer, deviceType, screenSize, ctaClicks: sessionCtaClicks, scrollDepth: sessionDepth, events: evts }
  }).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  // Status
  const statusStr = typeof p.status === 'string' ? p.status : ''
  const isExpired = p.expires_at && new Date(p.expires_at) < new Date() && statusStr !== 'ACCEPTED'
  const statusLabel = statusStr === 'ACCEPTED' ? 'Accepted' : isExpired ? 'Expired' : views.length > 0 ? 'Viewed' : 'Never Opened'
  const statusColors: Record<string, string> = {
    Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Expired: 'bg-rose-50 text-rose-600 border-rose-200',
    Viewed: 'bg-amber-50 text-amber-700 border-amber-200',
    'Never Opened': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  }

  // Forwarded detection (on client-only views)
  const viewFingerprints = new Set(views.map(v => `${v.ip}|||${(v.device || '').substring(0, 50)}`))
  const isForwarded = viewFingerprints.size > 1

  // Pricing re-visits (high intent signal)
  const pricingReVisits = (slideMap['pricing']?.views || 0) + (slideMap['Pricing']?.views || 0) + (slideMap['Investment']?.views || 0) + (slideMap['investment']?.views || 0)

  // Quick summary
  const daySpan = views.length > 1
    ? Math.ceil(Math.abs(new Date(views[0].created_at).getTime() - new Date(views[views.length - 1].created_at).getTime()) / 86400000)
    : 0

  const summaryParts: string[] = []
  if (views.length === 0) {
    summaryParts.push('Proposal has not been opened yet')
  } else {
    summaryParts.push(`Viewed ${views.length} time${views.length !== 1 ? 's' : ''} across ${uniqueDevices} device${uniqueDevices !== 1 ? 's' : ''}${daySpan > 0 ? ` over ${daySpan} day${daySpan !== 1 ? 's' : ''}` : ''}`)
    if (totalDwellMs > 0) summaryParts.push(`Spent ${formatDwell(totalDwellMs)} total`)
    if (pricingDwellMs > 5000) summaryParts.push(`${formatDwell(pricingDwellMs)} on pricing`)
    if (ctaClicks.length > 0) {
      const ctas = ctaClicks.map(e => e.event_data?.cta).filter(Boolean)
      if (ctas.includes('reserve')) summaryParts.push('Client clicked Reserve ✅')
      else if (ctas.includes('adjust')) summaryParts.push('Client requested adjustments')
      else if (ctas.includes('decline')) summaryParts.push('Client declined')
    }
    if (isForwarded) summaryParts.push('Link was forwarded to someone')
  }
  const quickSummary = summaryParts.join(' · ')

  // Intent scoring for visual indicator
  let intentLevel: 'high' | 'medium' | 'low' | 'none' = 'none'
  if (views.length === 0) intentLevel = 'none'
  else if (ctaClicks.some(e => e.event_data?.cta === 'reserve') || contactClicks.length > 0) intentLevel = 'high'
  else if (pricingDwellMs > 20000 || sessions.length >= 3 || totalDwellMs > 120000) intentLevel = 'high'
  else if (pricingDwellMs > 5000 || sessions.length >= 2 || totalDwellMs > 30000) intentLevel = 'medium'
  else intentLevel = 'low'

  const intentConfig = {
    high: { label: 'High Intent', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
    medium: { label: 'Interested', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    low: { label: 'Browsing', color: 'text-neutral-600 bg-neutral-100 border-neutral-200', dot: 'bg-neutral-400' },
    none: { label: 'Not Opened', color: 'text-neutral-500 bg-neutral-50 border-neutral-200', dot: 'bg-neutral-300' },
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6 animate-fade-in">
      {/* Back Link */}
      <div>
        <Link href="/proposalanalytics" className="text-xs text-neutral-500 hover:text-neutral-800 transition mb-3 inline-flex items-center gap-1 font-medium bg-white px-3 py-1.5 rounded-full border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-sm">
          ← Back to Analytics
        </Link>
      </div>

      {/* ═══════════════════════ HERO HEADER ═══════════════════════ */}
      <div className="relative bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-indigo-50/50 via-sky-50/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-50/30 via-teal-50/5 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="relative z-10 p-8 md:p-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-900 truncate">
                {p.couple_names || p.lead_name}
              </h2>
              <p className="text-sm text-neutral-500 font-light mt-2 truncate max-w-md">{p.quote_title}</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch justify-center flex-wrap gap-3 shrink-0 w-full lg:w-auto mt-2 lg:mt-0">
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${statusColors[statusLabel] || ''}`}>
                  {statusLabel}
                </span>
                <span className={`text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border ${intentConfig[intentLevel].color}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${intentConfig[intentLevel].dot}`} />
                  {intentConfig[intentLevel].label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <a href={`/p/${p.proposal_token}`} target="_blank" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-full px-5 py-2.5 hover:bg-neutral-50 transition shadow-[0_1px_3px_rgba(0,0,0,0.04)] bg-white/80 backdrop-blur-sm flex items-center gap-1.5">
                  View <span className="opacity-50">↗</span>
                </a>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${p.proposal_token}`); alert('Link copied!') }}
                  className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition"
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>

          {/* Sub-info row */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-neutral-400">
            <span>Sent {formatDateTime(p.sent_at)}</span>
            <span>Last opened: {relativeTime(p.last_viewed_at)}</span>
            {p.expires_at && <span>Expires: {formatDateTime(p.expires_at)}</span>}
            {prices.length > 0 ? <span className="font-semibold text-neutral-600">Quote: {prices.map(p => formatMoney(p)).join(' / ')}</span> : null}
          </div>
        </div>
      </div>

      {/* ═══════════════════════ QUICK SUMMARY ═══════════════════════ */}
      <div className="rounded-2xl bg-neutral-900 text-white px-6 py-4 text-sm font-medium tracking-wide flex items-center gap-3">
        <span className="text-lg">📊</span>
        <span>{quickSummary}</span>
      </div>

      {/* ═══════════════════════ VIEW MODE TOGGLE ═══════════════════════ */}
      <div className="flex bg-neutral-900/5 p-1 rounded-2xl w-fit border border-neutral-200/50">
        {(['combined', 'current', 'previous'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all capitalize ${
              viewMode === mode ? 'bg-white shadow-sm text-neutral-900 ring-1 ring-black/5' : 'text-neutral-500 hover:text-neutral-700 hover:bg-black/5'
            }`}
          >
            {mode === 'combined' && <svg className={`w-4 h-4 ${viewMode === mode ? 'text-neutral-800' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>}
            {mode === 'current' && <svg className={`w-4 h-4 ${viewMode === mode ? 'text-blue-500' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {mode === 'previous' && <svg className={`w-4 h-4 ${viewMode === mode ? 'text-neutral-600' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            {mode === 'combined' ? 'All Versions' : mode === 'current' ? 'Current Version' : 'Previous Versions'}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ AT A GLANCE ═══════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Views', value: views.length, sub: `${uniqueIPs} unique IP${uniqueIPs !== 1 ? 's' : ''}`, icon: <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> },
          { label: 'Sessions', value: sessions.length, sub: `${uniqueDevices} device${uniqueDevices !== 1 ? 's' : ''}`, icon: <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
          { label: 'Time Spent', value: formatDwell(totalDwellMs), sub: `${formatDwell(pricingDwellMs)} on pricing`, icon: <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          { label: 'Scroll Depth', value: maxScrollDepth > 0 ? `${maxScrollDepth}%` : '—', sub: pricingReVisits > 1 ? `Pricing viewed ${pricingReVisits}×` : '', icon: <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg> },
        ].map(m => (
          <div key={m.label} className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all hover:border-neutral-300">
            <div className="flex items-center gap-2 mb-3">
              {m.icon}
              <span className="text-xs font-semibold text-neutral-500">{m.label}</span>
            </div>
            <div className="text-2xl font-semibold text-neutral-900 tracking-tight mb-1">{m.value}</div>
            {m.sub && <div className="text-[10px] text-neutral-400">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* ═══════════════════════ INTENT SIGNALS ═══════════════════════ */}
      {views.length > 0 && (
        <Card>
          <SectionTitle sub="Key indicators of how serious the client is">Intent Signals</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {/* Pricing time */}
            <div className={`rounded-xl p-4 border ${pricingDwellMs > 20000 ? 'bg-emerald-50 border-emerald-200' : pricingDwellMs > 5000 ? 'bg-amber-50 border-amber-200' : 'bg-neutral-50 border-neutral-100'}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Pricing Time</div>
              <div className="text-lg font-bold text-neutral-900">{formatDwell(pricingDwellMs)}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{pricingReVisits > 1 ? `${pricingReVisits} revisits` : 'viewed once'}</div>
            </div>

            {/* Contact clicks */}
            <div className={`rounded-xl p-4 border ${contactClicks.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-neutral-50 border-neutral-100'}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Contact</div>
              <div className="text-lg font-bold text-neutral-900">{contactClicks.length > 0 ? `${contactClicks.length} click${contactClicks.length !== 1 ? 's' : ''}` : '—'}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{contactClicks.length > 0 ? [...new Set(contactClicks.map(e => e.event_data?.type))].join(', ') : 'no taps'}</div>
            </div>

            {/* Screenshots */}
            <div className={`rounded-xl p-4 border ${screenshotAttempts.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-neutral-50 border-neutral-100'}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Screenshots</div>
              <div className="text-lg font-bold text-neutral-900">{screenshotAttempts.length || '—'}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{screenshotAttempts.length > 0 ? 'attempted' : 'none detected'}</div>
            </div>

            {/* Tab switches */}
            <div className={`rounded-xl p-4 border bg-neutral-50 border-neutral-100`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Tab Switches</div>
              <div className="text-lg font-bold text-neutral-900">{tabBlurs.length || '—'}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{tabBlurs.length > 3 ? 'distracted' : tabBlurs.length > 0 ? 'slight' : 'fully focused'}</div>
            </div>

            {/* Videos */}
            <div className={`rounded-xl p-4 border ${videoPlays.length > 0 ? 'bg-violet-50 border-violet-200' : 'bg-neutral-50 border-neutral-100'}`}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-1">Videos</div>
              <div className="text-lg font-bold text-neutral-900">{videoPlays.filter(e => e.event_type === 'testimonial_video_play').length || '—'}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {videoPlays.length > 0
                  ? formatDwell(videoPlays.filter(e => e.event_data?.watchedMs).reduce((sum, e) => sum + (e.event_data.watchedMs || 0), 0)) + ' watched'
                  : 'not played'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ═══════════════════════ FORWARDED ALERT ═══════════════════════ */}
      {isForwarded && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </div>
          <div>
            <div className="text-sm font-bold text-violet-800">Link was forwarded</div>
            <div className="text-[11px] text-violet-600">Opened from {viewFingerprints.size} different device+IP combinations — the client likely shared this with someone.</div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ CLIENT ACTIONS ═══════════════════════ */}
      {(ctaClicks.length > 0 || tierSelects.length > 0) && (
        <Card>
          <SectionTitle sub="Clicks on Reserve, Adjust, Decline buttons and tier/package selections">Client Actions</SectionTitle>
          <div className="space-y-2">
            {ctaClicks.map((e, i) => {
              const cta = e.event_data?.cta || 'unknown'
              const ctaStyle: Record<string, string> = {
                reserve: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                adjust: 'bg-amber-50 text-amber-700 border-amber-200',
                decline: 'bg-rose-50 text-rose-600 border-rose-200',
              }
              const label = cta === 'reserve' ? 'Reserve' : cta === 'adjust' ? 'Adjust' : cta === 'decline' ? 'Not a Fit' : cta
              return (
                <div key={e.id || i} className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${ctaStyle[cta] || 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>{label}</span>
                    <span className="text-xs text-neutral-500">CTA clicked</span>
                  </div>
                  <span className="text-[11px] text-neutral-400 shrink-0">{formatDateTime(e.created_at)}</span>
                </div>
              )
            })}
            {tierSelects.map((e, i) => (
              <div key={e.id || `t${i}`} className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border bg-violet-50 text-violet-700 border-violet-200">
                    {e.event_data?.tierName || 'Tier'}
                  </span>
                  <span className="text-xs text-neutral-500">Package selected</span>
                </div>
                <span className="text-[11px] text-neutral-400 shrink-0">{formatDateTime(e.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══════════════════════ SLIDE HEATMAP + SCROLL ═══════════════════════ */}
      <Card>
        <SectionTitle sub="Time spent on each section of the proposal">Slide Engagement Heatmap</SectionTitle>
        {slideHeatmap.length === 0 ? (
          <div className="text-neutral-300 text-sm italic py-4">No slide interaction data yet.</div>
        ) : (
          <div className="space-y-2">
            {[...slideHeatmap].sort((a, b) => b.totalDwellMs - a.totalDwellMs).map(s => {
              const maxDwell = Math.max(...slideHeatmap.map(x => x.totalDwellMs), 1)
              const pct = Math.round((s.totalDwellMs / maxDwell) * 100)
              const isPricing = s.slide.toLowerCase().includes('pricing') || s.slide.toLowerCase().includes('investment')
              const isConnect = s.slide.toLowerCase().includes('connect')
              const isTestimonial = s.slide.toLowerCase().includes('testimonial')
              const slideName = s.slide
                .replace(/^event-/, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase())
              const barColor = isPricing ? 'bg-amber-400' : isConnect ? 'bg-emerald-400' : isTestimonial ? 'bg-violet-400' : 'bg-neutral-800'
              return (
                <div key={s.slide} className="flex items-center gap-4">
                  <div className="w-32 shrink-0 text-right">
                    <span className={`text-xs font-semibold ${isPricing ? 'text-amber-700' : isConnect ? 'text-emerald-700' : 'text-neutral-700'}`}>
                      {slideName}
                    </span>
                  </div>
                  <div className="flex-1 h-6 bg-neutral-100 rounded-lg overflow-hidden relative">
                    <div className={`h-full rounded-lg transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <span className="text-xs text-neutral-600 font-mono">{formatDwell(s.totalDwellMs)}</span>
                    <span className="text-[10px] text-neutral-400 ml-1">({s.views}×)</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Scroll Depth inline */}
        {scrollDepths.length > 0 && (
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <div className="text-xs font-bold text-neutral-900 mb-3">Scroll Depth Milestones</div>
            <div className="flex items-center gap-2">
              {[25, 50, 75, 100].map(m => {
                const reached = scrollDepths.some(e => (e.event_data?.percent || 0) >= m)
                return (
                  <div key={m} className="flex-1">
                    <div className={`h-3 rounded-full transition-all ${reached ? 'bg-neutral-900' : 'bg-neutral-100'}`} />
                    <div className={`text-[10px] font-bold text-center mt-1.5 ${reached ? 'text-neutral-900' : 'text-neutral-300'}`}>{m}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════════════════ SESSIONS TIMELINE ═══════════════════════ */}
      <Card>
        <SectionTitle sub="Each time the proposal was opened — latest first">{`Sessions (${sessions.length})`}</SectionTitle>
        {sessions.length === 0 ? (
          <div className="text-neutral-300 text-sm italic py-4">No session data yet.</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s, sIdx) => {
              const isExpanded = expandedSession === s.sessionId
              return (
              <div key={s.sessionId} className="rounded-xl border border-neutral-100 bg-neutral-50/50 overflow-hidden">
                <button onClick={() => setExpandedSession(isExpanded ? null : s.sessionId)} className="w-full p-4 text-left hover:bg-neutral-50 transition">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-neutral-800 flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-neutral-200 text-neutral-600 rounded px-1.5 py-0.5">#{sessions.length - sIdx}</span>
                        <span className="font-medium text-neutral-600">{s.deviceType === 'mobile' ? 'Mobile' : s.deviceType === 'tablet' ? 'Tablet' : 'Desktop'}</span>
                        <span>• {s.browser} on {s.os}</span>
                        {s.screenSize && <span className="text-[10px] text-neutral-400 font-normal">({s.screenSize})</span>}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{formatDateTime(s.start)}</div>
                      {s.referrer && (
                        <div className="text-[10px] text-neutral-400 mt-1">
                          via: <span className="text-neutral-600 font-medium">
                            {s.referrer.includes('wa.me') || s.referrer.includes('whatsapp') ? 'WhatsApp' :
                             s.referrer.includes('instagram') ? 'Instagram' : (() => { try { return new URL(s.referrer).hostname } catch { return s.referrer } })()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs font-bold text-neutral-900">{formatDwell(s.totalDwell)}</div>
                        <div className="text-[9px] text-neutral-400">duration</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-neutral-900">{s.slidesViewed}</div>
                        <div className="text-[9px] text-neutral-400">slides</div>
                      </div>
                      {s.scrollDepth > 0 && (
                        <div className="text-right">
                          <div className="text-xs font-bold text-neutral-900">{s.scrollDepth}%</div>
                          <div className="text-[9px] text-neutral-400">depth</div>
                        </div>
                      )}
                      {s.ctaClicks.length > 0 && (
                        <div className="flex gap-1">
                          {s.ctaClicks.map((c, ci) => {
                            const cta = c.event_data?.cta || ''
                            return <span key={ci} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cta === 'reserve' ? 'bg-emerald-100 text-emerald-700' : cta === 'adjust' ? 'bg-amber-100 text-amber-700' : cta === 'decline' ? 'bg-rose-100 text-rose-600' : 'bg-neutral-100 text-neutral-600'}`}>{cta}</span>
                          })}
                        </div>
                      )}
                      <div className="text-right hidden sm:block">
                        <div className="text-[11px] text-neutral-500 font-mono">{s.ip}</div>
                      </div>
                      <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-2">Slide Journey</div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.events.filter(e => e.event_type === 'slide_view').map((e, j) => {
                        const name = (e.event_data?.slide || '').replace(/^event-/, '').replace(/-/g, ' ')
                        const dwell = e.event_data?.dwellMs || 0
                        const isPricingSlide = name.toLowerCase().includes('pricing') || name.toLowerCase().includes('investment')
                        return (
                          <span
                            key={j}
                            className={`inline-block text-[9px] rounded px-2 py-1 font-medium ${isPricingSlide ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}
                            title={`${name}: ${formatDwell(dwell)}`}
                          >
                            {name.length > 15 ? name.slice(0, 15) + '…' : name} {formatDwell(dwell)}
                          </span>
                        )
                      })}
                    </div>
                    {s.events.filter(e => !['slide_view', 'session_start', 'session_end', 'scroll_depth'].includes(e.event_type)).length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5">Actions</div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.events.filter(e => !['slide_view', 'session_start', 'session_end', 'scroll_depth'].includes(e.event_type)).map((e, j) => (
                            <span key={j} className="inline-block text-[9px] rounded px-2 py-1 font-medium bg-violet-50 text-violet-700 border border-violet-100">
                              {e.event_type.replace(/_/g, ' ')} {e.event_data?.cta || e.event_data?.tierName || ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </Card>

      {/* ═══════════════════════ TIME BETWEEN SESSIONS ═══════════════════════ */}
      {sessions.length > 1 && (
        <Card>
          <SectionTitle sub="Gaps between visits — short gaps mean they showed it to family, long gaps mean comparison shopping">Time Between Sessions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {sessions.slice(0, -1).map((s, i) => {
              const next = sessions[i + 1]
              const gap = new Date(s.start).getTime() - new Date(next.start).getTime()
              const formatGap = (ms: number) => {
                const mins = Math.floor(ms / 60000)
                if (mins < 60) return `${mins}m`
                const hrs = Math.floor(mins / 60)
                if (hrs < 24) return `${hrs}h ${mins % 60}m`
                const days = Math.floor(hrs / 24)
                return `${days}d ${hrs % 24}h`
              }
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-[10px] text-neutral-500">Session {sessions.length - i}</div>
                  <div className={`rounded-lg px-2.5 py-1 text-xs font-bold ${gap < 3600000 ? 'bg-emerald-50 text-emerald-700' : gap < 86400000 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}>
                    {formatGap(gap)} gap
                  </div>
                  <div className="text-[10px] text-neutral-500">Session {sessions.length - i - 1}</div>
                  {i < sessions.length - 2 && <span className="text-neutral-300 mx-1">→</span>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ═══════════════════════ GEO LOCATIONS ═══════════════════════ */}
      {Object.keys(geoData).length > 0 && (
        <Card>
          <SectionTitle sub="Approximate locations resolved from viewer IP addresses">Viewer Locations</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {Object.entries(geoData).filter(([ip]) => !internalIPSet.has(ip)).map(([ip, geo]) => (
              <div key={ip} className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-2.5 flex items-center gap-2.5">
                <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <div>
                  <div className="text-xs font-semibold text-neutral-800">{geo.city}, {geo.region}</div>
                  <div className="text-[10px] text-neutral-400">{geo.country} · {ip}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══════════════════════ VIEW LOG (COLLAPSED) ═══════════════════════ */}
      <CollapsibleCard title={`View Log (${views.length})`} sub="Raw spy pixel entries — every time the link was opened">
        {views.length === 0 ? (
          <div className="text-neutral-300 text-sm italic py-4">No views recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">#</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Time</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Device</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Browser</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">OS</th>
                  <th className="py-2 px-3 text-left text-[10px] uppercase tracking-widest text-neutral-500 font-bold">IP</th>
                </tr>
              </thead>
              <tbody>
                {views.map((v, i) => {
                  const { type, browser, os } = parseDevice(v.device)
                  return (
                    <tr key={v.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="py-2 px-3 text-neutral-400">{views.length - i}</td>
                      <td className="py-2 px-3 text-neutral-700">{formatDateTime(v.created_at)}</td>
                      <td className="py-2 px-3 text-neutral-700">{type}</td>
                      <td className="py-2 px-3 text-neutral-600">{browser}</td>
                      <td className="py-2 px-3 text-neutral-600">{os}</td>
                      <td className="py-2 px-3 font-mono text-neutral-500">{v.ip}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {/* ═══════════════════════ CRM ACTIVITY LOG (COLLAPSED) ═══════════════════════ */}
      {activities.length > 0 && (
        <CollapsibleCard title="CRM Activity Log" sub="Internal CRM events related to this proposal">
          <div className="space-y-2">
            {activities.map(a => {
              const label = a.activity_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
              return (
                <div key={a.id} className="flex items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-neutral-800">{label}</div>
                    {a.metadata?.summary && <div className="text-[11px] text-neutral-400 mt-0.5">{a.metadata.summary}</div>}
                  </div>
                  <div className="text-[11px] text-neutral-400 shrink-0">{formatDateTime(a.created_at)}</div>
                </div>
              )
            })}
          </div>
        </CollapsibleCard>
      )}
    </div>
  )
}
