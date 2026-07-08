'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatProposalLink } from '@/lib/formatters'
import { getAuth } from '@/lib/authClient'

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

const apiFetch = (url: string, init?: RequestInit) => fetch(url, { credentials: 'include', ...init })
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
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [convertingProject, setConvertingProject] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getAuth().then(auth => {
      if (auth?.authenticated && auth.user) {
        const roles = Array.isArray(auth.user.roles) ? auth.user.roles : auth.user.role ? [auth.user.role] : []
        setIsAdmin(roles.includes('admin'))
      }
    })
  }, [])

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

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value
    if (!confirm(`Are you sure you want to change the quote status to ${newStatus}?`)) return
    try {
      const res = await apiFetch(`/api/proposals-dashboard/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData?.error || 'Failed to change status')
      alert('Status changed successfully!')
      window.location.reload()
    } catch (err: any) {
      alert(err.message || 'Error changing status')
    }
  }

  const handleConvertToProject = async () => {
    if (!confirm('Are you sure you want to manually convert this lead to a project and generate the booking contract?')) return
    setConvertingProject(true)
    try {
      const res = await apiFetch(`/api/proposals-dashboard/${id}/convert-to-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData?.error || 'Failed to convert project')
      alert(respData.message || 'Converted to project successfully!')
      window.location.reload()
    } catch (err: any) {
      alert(err.message || 'Error converting project')
    } finally {
      setConvertingProject(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!confirm('Are you sure you want to manually mark this proposal as paid and confirm the booking?')) return
    setConfirmingPayment(true)
    try {
      const res = await apiFetch(`/api/proposals/${p.proposal_token}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData?.error || 'Failed to confirm payment')
      alert('Payment confirmed successfully!')
      window.location.reload()
    } catch (err: any) {
      alert(err.message || 'Error confirming payment')
    } finally {
      setConfirmingPayment(false)
    }
  }
  const geoData = data.geoData || {}
  const prices = extractPrices(p)

  // Filter out internal IPs from views and events
  const allEvents = (data.events || []).filter(e => !internalIPSet.has(e.ip))
  const allViews = (data.views || []).filter(v => !internalIPSet.has(v.ip))
  const allActivities = data.activities || []
  const hasNotifiedTransfer = allActivities.some(a => a.activity_type === 'PROPOSAL_BANK_TRANSFER_NOTIFIED')

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
  // Prefer real read time (duration_seconds) over slide dwell events
  const totalReadSeconds = views.reduce((sum, v) => sum + (Number((v as any).duration_seconds) || 0), 0)
  const bestTimeMs = totalReadSeconds > 0 ? totalReadSeconds * 1000 : totalDwellMs

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

  // Live status
  const isLive = p.last_viewed_at && (new Date().getTime() - new Date(p.last_viewed_at).getTime() < 120000)

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

  // Combine views and sessions so we don't lose any data
  const combinedOpens: Array<{ id: string, view?: ViewEntry, session?: typeof sessions[0], time: number }> = []
  const usedSessions = new Set<string>()

  for (const v of views) {
    const vTime = new Date(v.created_at).getTime()
    // Find closest session from same IP within 1 hour
    let s = sessions.find(sess => sess.ip === v.ip && !usedSessions.has(sess.sessionId) && Math.abs(new Date(sess.start).getTime() - vTime) < 3600000)
    // Fallback: match strictly by time (within 5 mins) to handle IPv4 vs IPv6 mismatches
    if (!s) {
      s = sessions.find(sess => !usedSessions.has(sess.sessionId) && Math.abs(new Date(sess.start).getTime() - vTime) < 300000)
    }
    if (s) usedSessions.add(s.sessionId)
    combinedOpens.push({ id: `view-${v.id}`, view: v, session: s, time: vTime })
  }

  // Add remaining sessions that didn't match a view
  for (const s of sessions) {
    if (!usedSessions.has(s.sessionId)) {
      combinedOpens.push({ id: `session-${s.sessionId}`, session: s, time: new Date(s.start).getTime() })
    }
  }

  combinedOpens.sort((a, b) => b.time - a.time)

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
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-neutral-900 truncate">
                {p.couple_names || p.lead_name}
              </h2>
              <p className="text-sm text-neutral-500 font-light mt-2 truncate max-w-md">{p.quote_title}</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch justify-center flex-wrap gap-3 shrink-0 w-full lg:w-auto mt-2 lg:mt-0">
              <div className="flex items-center gap-3">
                {isLive && (
                  <span className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border border-green-500/30 bg-green-50 text-green-700 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Reading Now
                  </span>
                )}
                {isAdmin ? (
                  <select
                    value={statusStr}
                    onChange={handleStatusChange}
                    className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border border-neutral-300 bg-white text-neutral-800 shadow-[0_2px_12px_rgba(0,0,0,0.03)] cursor-pointer focus:outline-none focus:ring-1 focus:ring-neutral-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PENDING_APPROVAL">Pending Approval</option>
                    <option value="APPROVED">Approved</option>
                    <option value="SENT">Sent</option>
                    <option value="ADVANCE_AWAITING">Advance Awaiting</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ADMIN_REJECTED">Admin Rejected</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                ) : (
                  <span className={`text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${statusColors[statusLabel] || ''}`}>
                    {statusLabel}
                  </span>
                )}
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
                  onClick={() => { navigator.clipboard.writeText(formatProposalLink(p.proposal_token)); alert('Link copied!') }}
                  className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition"
                >
                  Copy Link
                </button>
                {isAdmin && statusStr !== 'ACCEPTED' && (
                  <button
                    onClick={handleMarkAsPaid}
                    disabled={confirmingPayment}
                    className="rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition flex items-center gap-1.5 focus:outline-none"
                  >
                    {confirmingPayment ? 'Confirming...' : 'Mark as Paid ✓'}
                  </button>
                )}
                {isAdmin && statusStr === 'ACCEPTED' && (
                  <button
                    onClick={handleConvertToProject}
                    disabled={convertingProject}
                    className="rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition flex items-center gap-1.5 focus:outline-none"
                  >
                    {convertingProject ? 'Converting...' : 'Convert to Project 💼'}
                  </button>
                )}
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

      {/* ═══════════════════════ OFFICIAL ACTIONS BANNER ═══════════════════════ */}
      {activities.filter(a => a.activity_type.startsWith('PROPOSAL_') && a.activity_type !== 'PROPOSAL_VIEWED' && a.activity_type !== 'PROPOSAL_SENT').length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-800">Official Actions Submitted</h2>
          </div>
          <div className="space-y-3">
            {activities
              .filter(a => a.activity_type.startsWith('PROPOSAL_') && !['PROPOSAL_VIEWED', 'PROPOSAL_SENT'].includes(a.activity_type))
              .map(a => {
                const label = a.activity_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
                let isNegative = a.activity_type === 'PROPOSAL_DECLINED'
                let isWarning = a.activity_type === 'PROPOSAL_ADJUSTMENT_REQUESTED'
                let colorClass = isNegative ? 'text-rose-700 bg-rose-100 border-rose-200' : isWarning ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-emerald-700 bg-emerald-100 border-emerald-200'
                
                return (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 rounded-xl border border-white/50 bg-white/60 px-5 py-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${colorClass}`}>{label}</span>
                        <span className="text-[11px] text-emerald-700/60 font-medium">{formatDateTime(a.created_at)}</span>
                      </div>
                      <div className="text-sm font-medium text-neutral-800 mt-2">
                        {a.metadata?.summary && <div className="leading-relaxed"><span className="font-bold opacity-75 mr-1">Items:</span> {a.metadata.summary}</div>}
                        {a.metadata?.reason && <div className="leading-relaxed"><span className="font-bold opacity-75 mr-1">Reason:</span> {a.metadata.reason}</div>}
                        {a.metadata?.note && !a.metadata?.reason && <div className="leading-relaxed whitespace-pre-line">{a.metadata.note}</div>}
                        
                        {a.metadata?.screenshotUrl && (
                          <div className="mt-3.5 pt-3 border-t border-neutral-200/50 flex flex-col md:flex-row gap-5">
                            <div>
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">Payment Screenshot</span>
                              <a 
                                href={a.metadata.screenshotUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-block group relative rounded-xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-md transition max-w-[240px] bg-white cursor-pointer"
                              >
                                <img 
                                  src={a.metadata.screenshotUrl} 
                                  alt="Payment Screenshot" 
                                  className="w-full max-h-48 object-cover group-hover:scale-[1.02] transition duration-300"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition duration-300">
                                  <span className="opacity-0 group-hover:opacity-100 bg-white/95 text-neutral-900 text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-md transition transform scale-90 group-hover:scale-100 flex items-center gap-1">
                                    View Full Receipt ↗
                                  </span>
                                </div>
                              </a>
                            </div>

                            {a.metadata.aiAnalysis && (
                              <div className="flex-1 min-w-[240px] bg-neutral-50 rounded-xl border border-neutral-200/60 p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.01)] text-left">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">AI Assistant Scan</span>
                                    {a.metadata.aiAnalysis.legit ? (
                                      <span className="text-[9px] font-bold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded">
                                        Seems Fine ✓
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded animate-pulse">
                                        Suspicious ⚠️
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                    Confidence: {a.metadata.aiAnalysis.confidence || 'Low'}
                                  </span>
                                </div>

                                <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                                  {a.metadata.aiAnalysis.reason}
                                </p>

                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 pt-2.5 border-t border-neutral-200/50 text-[10px]">
                                  <div>
                                    <span className="text-neutral-400 block">Extracted Amount</span>
                                    <span className="font-bold text-neutral-700">
                                      {a.metadata.aiAnalysis.extractedAmount ? `₹${a.metadata.aiAnalysis.extractedAmount.toLocaleString('en-IN')}` : 'N/A'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-neutral-400 block">Transaction ID</span>
                                    <span className="font-mono font-bold text-neutral-700 select-all">
                                      {a.metadata.aiAnalysis.extractedTxnId || 'N/A'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-neutral-400 block">Txn Date</span>
                                    <span className="font-bold text-neutral-700">
                                      {a.metadata.aiAnalysis.extractedDate || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}


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
          { label: 'Total Opens', value: views.length, sub: uniqueIPs > 0 ? `${uniqueIPs} different ${uniqueIPs === 1 ? 'person' : 'people'} viewed this` : '', icon: <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> },
          { label: 'Different Viewers', value: uniqueIPs > 0 ? uniqueIPs : (sessions.length || 0), sub: sessions.length > 0 ? `${uniqueDevices} device${uniqueDevices !== 1 ? 's' : ''} · ${views.length - sessions.length > 0 ? `${views.length - sessions.length} quick glance${views.length - sessions.length !== 1 ? 's' : ''}` : 'all engaged'}` : 'No session data', icon: <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
          { label: 'Time Spent Reading', value: formatDwell(bestTimeMs > 0 ? bestTimeMs : totalDwellMs), sub: pricingDwellMs > 0 ? `${formatDwell(pricingDwellMs)} on pricing` : bestTimeMs > 0 ? 'across all opens' : 'from slide tracking', icon: <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
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

      {/* ═══════════════════════ OPENS & SESSIONS ═══════════════════════ */}
      <Card>
        <SectionTitle sub="Every time the link was opened — device, location, what they did. Click to see slide journey.">{`Opens (${combinedOpens.length})${sessions.length > 0 ? ` · ${sessions.length} with session detail` : ''}`}</SectionTitle>
        {combinedOpens.length === 0 ? (
          <div className="text-neutral-300 text-sm italic py-4">No views recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {combinedOpens.map((item, i) => {
              const { view: v, session: s, id: rowKey, time } = item
              const ip = v?.ip || s?.ip || ''
              const deviceStr = v?.device || s?.deviceType || s?.browser || ''
              const { type, browser, os } = parseDevice(deviceStr)
              const readSecs = v ? (Number((v as any).duration_seconds) || 0) : Math.round((s?.totalDwell || 0) / 1000)
              const geo = geoData[ip] as any
              
              const isExpanded = expandedSession === rowKey
              const hasEvents = !!s && s.events.length > 0
              
              return (
                <div key={rowKey} className="rounded-xl border border-neutral-100 bg-neutral-50/50 overflow-hidden">
                  <button
                    onClick={() => hasEvents ? setExpandedSession(isExpanded ? null : rowKey) : undefined}
                    className={`w-full p-4 text-left ${hasEvents ? 'hover:bg-neutral-50 cursor-pointer' : 'cursor-default'} transition`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Left: index + device + datetime + location + referrer */}
                      <div>
                        <div className="text-xs font-semibold text-neutral-800 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold bg-neutral-200 text-neutral-600 rounded px-1.5 py-0.5">#{combinedOpens.length - i}</span>
                          <span className="font-medium text-neutral-600">{type}</span>
                          <span>· {browser} on {s?.screenSize ? `${os} (${s.screenSize})` : os}</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">{formatDateTime(new Date(time).toISOString())}</div>
                        {/* Location */}
                        {geo && (
                          <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1">
                            <svg className="w-3 h-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <span>{geo.city}, {geo.region}, {geo.country}</span>
                          </div>
                        )}
                        {/* Referrer */}
                        {s?.referrer && (
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            via <span className="text-neutral-600 font-medium">
                              {s.referrer.includes('wa.me') || s.referrer.includes('whatsapp') ? 'WhatsApp'
                                : s.referrer.includes('instagram') ? 'Instagram'
                                : (() => { try { return new URL(s.referrer).hostname } catch { return s.referrer } })()}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Right: metrics */}
                      <div className="flex items-center gap-4">
                        {readSecs > 0 && (
                          <div className="text-right">
                            <div className={`text-xs font-bold ${readSecs >= 60 ? 'text-emerald-600' : readSecs >= 20 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {readSecs >= 60 ? `${Math.floor(readSecs / 60)}m ${readSecs % 60}s` : `${readSecs}s`}
                            </div>
                            <div className="text-[9px] text-neutral-400">read</div>
                          </div>
                        )}
                        {s && s.slidesViewed > 0 && (
                          <div className="text-right">
                            <div className="text-xs font-bold text-neutral-900">{s.slidesViewed}</div>
                            <div className="text-[9px] text-neutral-400">slides</div>
                          </div>
                        )}
                        {s && s.scrollDepth > 0 && (
                          <div className="text-right">
                            <div className="text-xs font-bold text-neutral-900">{s.scrollDepth}%</div>
                            <div className="text-[9px] text-neutral-400">scroll</div>
                          </div>
                        )}
                        {s && s.ctaClicks.length > 0 && (
                          <div className="flex gap-1">
                            {s.ctaClicks.map((c: any, ci: number) => {
                              const cta = c.event_data?.cta || ''
                              return <span key={ci} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cta === 'reserve' ? 'bg-emerald-100 text-emerald-700' : cta === 'adjust' ? 'bg-amber-100 text-amber-700' : cta === 'decline' ? 'bg-rose-100 text-rose-600' : 'bg-neutral-100 text-neutral-600'}`}>{cta}</span>
                            })}
                          </div>
                        )}
                        <div className="text-right hidden sm:block">
                          <div className="text-[11px] text-neutral-500 font-mono">{ip}</div>
                        </div>
                        {hasEvents && (
                          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                  {/* Expanded: slide journey */}
                  {isExpanded && s && (
                    <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
                      <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-2">Slide Journey</div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.events.filter((e: any) => e.event_type === 'slide_view').map((e: any, j: number) => {
                          const name = (e.event_data?.slide || '').replace(/^event-/, '').replace(/-/g, ' ')
                          const dwell = e.event_data?.dwellMs || 0
                          const isPricingSlide = name.toLowerCase().includes('pricing') || name.toLowerCase().includes('investment')
                          return (
                            <span key={j} className={`inline-block text-[9px] rounded px-2 py-1 font-medium ${isPricingSlide ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`} title={`${name}: ${formatDwell(dwell)}`}>
                              {name.length > 15 ? name.slice(0, 15) + '…' : name} {formatDwell(dwell)}
                            </span>
                          )
                        })}
                      </div>
                      {s.events.filter((e: any) => !['slide_view', 'session_start', 'session_end', 'scroll_depth'].includes(e.event_type)).length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5">Actions</div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.events.filter((e: any) => !['slide_view', 'session_start', 'session_end', 'scroll_depth'].includes(e.event_type)).map((e: any, j: number) => (
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
              )
            })}
          </div>
        )}
      </Card>

      {/* ═══════════════════════ CRM ACTIVITY LOG (COLLAPSED) ═══════════════════════ */}
      {activities.length > 0 && (
        <CollapsibleCard title="CRM Activity Log" sub="Internal CRM events related to this proposal">
          <div className="space-y-2">
            {activities.map(a => {
              const label = a.activity_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
              return (
                <div key={a.id} className="flex items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3">
                  <div>
                    <div className="text-xs font-bold text-neutral-800">{label}</div>
                    {a.metadata?.summary && <div className="text-[11px] text-neutral-500 mt-1">{a.metadata.summary}</div>}
                    {a.metadata?.note && <div className="text-[11px] text-neutral-500 mt-1 whitespace-pre-line">{a.metadata.note}</div>}
                    {a.metadata?.screenshotUrl && (
                      <div className="mt-2">
                        <a href={a.metadata.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none">
                          View Receipt Screenshot ↗
                        </a>
                      </div>
                    )}
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
