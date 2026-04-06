'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type ProposalDetail = {
  id: number; proposal_token: string; view_count: number; last_viewed_at: string | null
  sent_at: string; quote_title: string; lead_id: number; lead_name: string
  status: string | null; calculated_price: number | null; override_price: number | null
  couple_names: string | null; expires_at?: string | null
}
type ViewEntry = { id: number; ip: string; device: string; created_at: string }
type ActivityEntry = { id: number; activity_type: string; metadata: any; created_at: string }
type EventEntry = { id: number; session_id: string; event_type: string; event_data: any; ip: string; device?: string; referrer: string | null; created_at: string }
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
  <div className={`rounded-2xl border border-neutral-200 bg-white shadow-sm p-6 ${className}`}>{children}</div>
)

const SectionTitle = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="mb-4">
    <h3 className="text-sm font-bold text-neutral-900">{children}</h3>
    {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
  </div>
)

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
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

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

  const { proposal: p, views, activities, events = [], slideHeatmap = [] } = data
  const eng = data.engagement || { uniqueSessions: 0, uniqueDevices: 0, totalDwellMs: 0, pricingDwellMs: 0, addonRequested: false, accepted: false }
  const geoData = data.geoData || {}
  const price = p.override_price ?? p.calculated_price

  // Extract specific event types
  const ctaClicks = events.filter(e => e.event_type === 'cta_click')
  const tierSelects = events.filter(e => e.event_type === 'tier_select')
  const scrollDepths = events.filter(e => e.event_type === 'scroll_depth')
  const sessionStarts = events.filter(e => e.event_type === 'session_start')
  const screenshotAttempts = events.filter(e => e.event_type === 'screenshot_attempt')
  const contactClicks = events.filter(e => e.event_type === 'contact_click')
  const videoPlays = events.filter(e => e.event_type === 'testimonial_video_play' || e.event_type === 'testimonial_video_end' || e.event_type === 'testimonial_video_pause')
  const testimonialScrolls = events.filter(e => e.event_type === 'testimonial_scroll')
  const tabBlurs = events.filter(e => e.event_type === 'tab_blur')

  // Max scroll depth reached
  const maxScrollDepth = scrollDepths.reduce((max, e) => Math.max(max, e.event_data?.percent || 0), 0)

  // Group events by session
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

  // Unique IPs
  const uniqueIPs = new Set(views.map(v => v.ip)).size

  // Status text
  const statusStr = typeof p.status === 'string' ? p.status : ''
  const isExpired = p.expires_at && new Date(p.expires_at) < new Date() && statusStr !== 'ACCEPTED'
  const statusLabel = statusStr === 'ACCEPTED' ? 'Accepted' : isExpired ? 'Expired' : views.length > 0 ? 'Viewed' : 'Never Opened'
  const statusColors: Record<string, string> = {
    Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Expired: 'bg-rose-50 text-rose-600 border-rose-200',
    Viewed: 'bg-amber-50 text-amber-700 border-amber-200',
    'Never Opened': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Back + Header */}
        <div>
          <Link href="/admin/proposals" className="text-xs text-neutral-500 hover:text-neutral-800 transition mb-3 inline-block">
            ← Back to Proposals
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">{p.couple_names || p.lead_name}</h1>
              <p className="text-sm text-neutral-500 mt-1">{p.quote_title}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${statusColors[statusLabel] || ''}`}>
                {statusLabel}
              </span>
              <a href={`/p/${p.proposal_token}`} target="_blank" className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg px-3 py-1.5 bg-white transition">
                View Proposal ↗
              </a>
              <button
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${p.proposal_token}`); alert('Link copied!') }}
                className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg px-3 py-1.5 bg-white transition"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Views', value: views.length, sub: `${uniqueIPs} unique IPs`, icon: '👁️' },
            { label: 'Sessions', value: eng.uniqueSessions, icon: '🔄' },
            { label: 'Devices', value: eng.uniqueDevices, icon: '📱' },
            { label: 'Time Spent', value: formatDwell(eng.totalDwellMs), icon: '⏱️' },
            { label: 'Pricing Time', value: formatDwell(eng.pricingDwellMs), icon: '💰' },
            { label: 'Scroll Depth', value: maxScrollDepth > 0 ? `${maxScrollDepth}%` : '—', icon: '📜' },
            { label: 'Quote Value', value: price ? formatMoney(price) : '—', icon: '💎' },
          ].map(m => (
            <div key={m.label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-1">{m.icon} {m.label}</div>
              <div className="text-xl font-bold text-neutral-900">{m.value}</div>
              {'sub' in m && m.sub && <div className="text-[10px] text-neutral-400">{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Sent + Expiry Context Row */}
        <div className="text-[11px] text-neutral-400 px-1">
          Sent {formatDateTime(p.sent_at)} · Last opened: {relativeTime(p.last_viewed_at)}
          {p.expires_at && ` · Expires: ${formatDateTime(p.expires_at)}`}
        </div>

        {/* Forwarded Link Detection */}
        {data.isForwarded && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-center gap-3">
            <span className="text-xl">🔗</span>
            <div>
              <div className="text-sm font-bold text-violet-800">Link was forwarded</div>
              <div className="text-[11px] text-violet-600">
                Opened from {data.uniqueFingerprints || 0} different device+IP combinations — the client likely shared this with someone.
              </div>
            </div>
          </div>
        )}

        {/* GeoIP Locations */}
        {Object.keys(geoData).length > 0 && (
          <Card>
            <SectionTitle sub="Approximate locations resolved from viewer IP addresses">Viewer Locations</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(geoData).map(([ip, geo]) => (
                <div key={ip} className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-2.5 flex items-center gap-2.5">
                  <span className="text-base">📍</span>
                  <div>
                    <div className="text-xs font-semibold text-neutral-800">{geo.city}, {geo.region}</div>
                    <div className="text-[10px] text-neutral-400">{geo.country} · {ip}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Behavioral Signals Row */}
        {(tabBlurs.length > 0 || screenshotAttempts.length > 0 || contactClicks.length > 0 || videoPlays.length > 0 || testimonialScrolls.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {tabBlurs.length > 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-1">🔄 Tab Switches</div>
                <div className="text-xl font-bold text-neutral-900">{tabBlurs.length}</div>
                <div className="text-[10px] text-neutral-400">times they switched tabs</div>
              </div>
            )}
            {screenshotAttempts.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-rose-500 font-bold mb-1">📸 Screenshot Attempts</div>
                <div className="text-xl font-bold text-rose-700">{screenshotAttempts.length}</div>
                <div className="text-[10px] text-rose-400">
                  {screenshotAttempts.map(e => e.event_data?.method).filter(Boolean).join(', ')}
                </div>
              </div>
            )}
            {contactClicks.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-600 font-bold mb-1">📞 Contact Clicks</div>
                <div className="text-xl font-bold text-emerald-700">{contactClicks.length}</div>
                <div className="text-[10px] text-emerald-500">
                  {[...new Set(contactClicks.map(e => e.event_data?.type))].join(', ')}
                </div>
              </div>
            )}
            {videoPlays.length > 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-1">🎬 Video Views</div>
                <div className="text-xl font-bold text-neutral-900">{videoPlays.filter(e => e.event_type === 'testimonial_video_play').length}</div>
                <div className="text-[10px] text-neutral-400">
                  {formatDwell(videoPlays.filter(e => e.event_data?.watchedMs).reduce((sum, e) => sum + (e.event_data.watchedMs || 0), 0))} watched
                </div>
              </div>
            )}
            {testimonialScrolls.length > 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-1">⭐ Testimonial Scroll</div>
                <div className="text-xl font-bold text-neutral-900">{Math.max(...testimonialScrolls.map(e => e.event_data?.percent || 0))}%</div>
                <div className="text-[10px] text-neutral-400">depth reached</div>
              </div>
            )}
          </div>
        )}

        {/* Time Between Sessions */}
        {sessions.length > 1 && (
          <Card>
            <SectionTitle sub="Gaps between visits — short gaps may mean the client showed it to family, long gaps may mean comparison shopping">Time Between Sessions</SectionTitle>
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

        {/* CTA Clicks + Tier Selections */}
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
                return (
                  <div key={e.id || i} className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${ctaStyle[cta] || 'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                        {cta === 'reserve' ? '✅ Reserve' : cta === 'adjust' ? '🔧 Adjust' : cta === 'decline' ? '❌ Not a Fit' : cta}
                      </span>
                      <span className="text-xs text-neutral-500">CTA clicked</span>
                    </div>
                    <span className="text-[11px] text-neutral-400 shrink-0">{formatDateTime(e.created_at)}</span>
                  </div>
                )
              })}
              {tierSelects.map((e, i) => (
                <div key={e.id || `t${i}`} className="flex items-center justify-between gap-4 rounded-xl border border-neutral-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                      📦 {e.event_data?.tierName || 'Tier'}
                    </span>
                    <span className="text-xs text-neutral-500">Package selected</span>
                  </div>
                  <span className="text-[11px] text-neutral-400 shrink-0">{formatDateTime(e.created_at)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Slide Heatmap */}
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
                      <span className={`text-xs font-medium ${isPricing ? 'text-amber-700' : isConnect ? 'text-emerald-700' : 'text-neutral-700'}`}>
                        {slideName} {isPricing ? '💰' : isConnect ? '📞' : isTestimonial ? '⭐' : ''}
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
        </Card>

        {/* Scroll Depth Progress */}
        {scrollDepths.length > 0 && (
          <Card>
            <SectionTitle sub="How far they explored the proposal">Scroll Depth Milestones</SectionTitle>
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
          </Card>
        )}

        {/* Sessions Timeline */}
        <Card>
          <SectionTitle sub="Each time the proposal was opened">{`Sessions (${sessions.length})`}</SectionTitle>
          {sessions.length === 0 ? (
            <div className="text-neutral-300 text-sm italic py-4">No session data yet.</div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => {
                const isExpanded = expandedSession === s.sessionId
                return (
                <div key={s.sessionId} className="rounded-xl border border-neutral-100 bg-neutral-50/50 overflow-hidden">
                  <button onClick={() => setExpandedSession(isExpanded ? null : s.sessionId)} className="w-full p-4 text-left hover:bg-neutral-50 transition">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-neutral-800 flex items-center gap-2">
                          {s.deviceType === 'mobile' ? '📱' : s.deviceType === 'tablet' ? '📱' : '💻'} {s.browser} on {s.os}
                          {s.screenSize && <span className="text-[10px] text-neutral-400 font-normal">({s.screenSize})</span>}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">{formatDateTime(s.start)}</div>
                        {s.referrer && (
                          <div className="text-[10px] text-neutral-400 mt-1">
                            via: <span className="text-neutral-600 font-medium">{s.referrer.includes('wa.me') || s.referrer.includes('whatsapp') ? '💬 WhatsApp' : s.referrer.includes('instagram') ? '📸 Instagram' : new URL(s.referrer).hostname}</span>
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
                  {/* Expanded: Mini slide timeline */}
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
                      {/* Show other events */}
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

        {/* View Log (Spy Pixel) */}
        <Card>
          <SectionTitle sub="Raw spy pixel entries — every time the link was opened">{`View Log (${views.length})`}</SectionTitle>
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
                        <td className="py-2 px-3">{type === 'Mobile' ? '📱' : '💻'} {type}</td>
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
        </Card>

        {/* Activities */}
        {activities.length > 0 && (
          <Card>
            <SectionTitle>CRM Activity Log</SectionTitle>
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
          </Card>
        )}
      </div>
    </div>
  )
}
