'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Proposal = {
  id: number
  proposal_token: string
  view_count: number
  last_viewed_at: string | null
  sent_at: string
  expires_at: string | null
  version_id: number
  version_number: number
  group_id: number
  quote_title: string
  lead_id: number
  lead_name: string
  lead_email: string | null
  status: string | null
  calculated_price: number | null
  override_price: number | null
  couple_names: string | null
  total_views: number
  unique_views: number
}

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
  return toIST(dateStr, { day: 'numeric', month: 'short' })
}

function getStatus(p: Proposal) {
  const s = typeof p.status === 'string' ? p.status : ''
  if (s === 'ACCEPTED') return { label: 'Accepted', dot: 'bg-emerald-400', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (p.expires_at && new Date(p.expires_at) < new Date() && s !== 'ACCEPTED') return { label: 'Expired', dot: 'bg-rose-400', color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' }
  if (p.total_views > 0) return { label: 'Viewed', dot: 'bg-amber-400', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
  return { label: 'Never Opened', dot: 'bg-neutral-400', color: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200' }
}

type LeadGroup = {
  leadId: number
  leadName: string
  coupleNames: string | null
  proposals: Proposal[]
  totalViews: number
  lastViewed: string | null
  hasAccepted: boolean
  latestPrice: number | null
}

export default function ProposalsDashboardPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedLead, setExpandedLead] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'viewed' | 'accepted' | 'expired' | 'never'>('all')
  const refreshRef = useRef<any>(null)

  const loadProposals = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await apiFetch('/api/proposals-dashboard')
      if (!res.ok) throw new Error('Failed to load')
      setProposals(await res.json())
      setError('')
    } catch (e: any) { if (!silent) setError(e.message) }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => {
    loadProposals()
    refreshRef.current = setInterval(() => loadProposals(true), 30000)
    const onFocus = () => loadProposals(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(refreshRef.current)
      window.removeEventListener('focus', onFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Group proposals by lead
  const groups: LeadGroup[] = []
  const leadMap = new Map<number, LeadGroup>()
  for (const p of proposals) {
    let g = leadMap.get(p.lead_id)
    if (!g) {
      g = {
        leadId: p.lead_id,
        leadName: p.lead_name,
        coupleNames: p.couple_names,
        proposals: [],
        totalViews: 0,
        lastViewed: null,
        hasAccepted: false,
        latestPrice: null,
      }
      leadMap.set(p.lead_id, g)
      groups.push(g)
    }
    g.proposals.push(p)
    g.totalViews += p.total_views
    if (p.last_viewed_at && (!g.lastViewed || new Date(p.last_viewed_at) > new Date(g.lastViewed))) {
      g.lastViewed = p.last_viewed_at
    }
    if ((typeof p.status === 'string' ? p.status : '') === 'ACCEPTED') g.hasAccepted = true
    if (!g.coupleNames && p.couple_names) g.coupleNames = p.couple_names
    const price = p.override_price ?? p.calculated_price
    if (price) g.latestPrice = Number(price)
  }

  // Filter
  const filteredGroups = groups.filter(g => {
    if (filter === 'all') return true
    if (filter === 'accepted') return g.hasAccepted
    if (filter === 'viewed') return g.totalViews > 0 && !g.hasAccepted
    if (filter === 'expired') return g.proposals.some(p => p.expires_at && new Date(p.expires_at) < new Date() && (typeof p.status === 'string' ? p.status : '') !== 'ACCEPTED')
    if (filter === 'never') return g.totalViews === 0
    return true
  })

  // Stats
  const totalSent = proposals.length
  const totalViewed = proposals.filter(p => p.total_views > 0).length
  const totalAccepted = proposals.filter(p => (typeof p.status === 'string' ? p.status : '') === 'ACCEPTED').length
  const neverOpened = proposals.filter(p => p.total_views === 0).length
  const totalExpired = proposals.filter(p => p.expires_at && new Date(p.expires_at) < new Date() && (typeof p.status === 'string' ? p.status : '') !== 'ACCEPTED').length

  return (
    <div className="min-h-screen bg-[#F5F5F7] px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-neutral-400 font-bold">Admin</div>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900">Proposals</h1>
          <p className="mt-1 text-sm text-neutral-500">Track engagement across all sent proposals, grouped by client.</p>
        </div>

        {error && <div className="text-rose-600 text-sm font-medium">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Sent', value: totalSent, icon: '📤', filterKey: 'all' as const },
            { label: 'Viewed', value: totalViewed, icon: '👁️', filterKey: 'viewed' as const },
            { label: 'Accepted', value: totalAccepted, icon: '✅', filterKey: 'accepted' as const },
            { label: 'Expired', value: totalExpired, icon: '⏰', filterKey: 'expired' as const },
            { label: 'Never Opened', value: neverOpened, icon: '🔴', filterKey: 'never' as const },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setFilter(s.filterKey)}
              className={`rounded-2xl border p-4 shadow-sm text-left transition ${filter === s.filterKey ? 'border-neutral-900 bg-white ring-1 ring-neutral-900' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-1">{s.icon} {s.label}</div>
              <div className="text-2xl font-bold text-neutral-900">{s.value}</div>
            </button>
          ))}
        </div>

        {/* Grouped List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center text-neutral-400 text-sm py-12">Loading...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center text-neutral-400 text-sm italic py-12">
              {filter === 'all' ? 'No proposals sent yet.' : `No proposals match "${filter}" filter.`}
            </div>
          ) : filteredGroups.map(g => {
            const isOpen = expandedLead === g.leadId
            return (
              <div key={g.leadId} className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                {/* Lead Row */}
                <button
                  onClick={() => setExpandedLead(isOpen ? null : g.leadId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-sm font-bold text-neutral-600 shrink-0">
                      {(g.coupleNames || g.leadName).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900 truncate">{g.coupleNames || g.leadName}</div>
                      {g.coupleNames && g.coupleNames !== g.leadName && (
                        <div className="text-[11px] text-neutral-400 truncate">{g.leadName}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-neutral-500">{g.proposals.length} {g.proposals.length === 1 ? 'quote' : 'quotes'}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-bold text-neutral-900">{g.totalViews}</div>
                      <div className="text-[10px] text-neutral-400">views</div>
                    </div>
                    <div className="text-right hidden md:block">
                      <div className={`text-xs ${g.lastViewed ? 'text-neutral-600' : 'text-neutral-300 italic'}`}>
                        {relativeTime(g.lastViewed)}
                      </div>
                      <div className="text-[10px] text-neutral-400">last opened</div>
                    </div>
                    {g.latestPrice && (
                      <div className="text-right font-mono text-xs text-neutral-600 w-20 hidden md:block">
                        {formatMoney(g.latestPrice)}
                      </div>
                    )}
                    {g.hasAccepted && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Accepted
                      </span>
                    )}
                    <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded: show all quotes for this lead */}
                {isOpen && (
                  <div className="border-t border-neutral-100">
                    {(() => {
                      const quoteGroups: { title: string; proposals: Proposal[] }[] = []
                      const qMap = new Map<string, Proposal[]>()
                      for (const p of g.proposals) {
                        const key = p.quote_title || 'Untitled'
                        if (!qMap.has(key)) { qMap.set(key, []); quoteGroups.push({ title: key, proposals: qMap.get(key)! }) }
                        qMap.get(key)!.push(p)
                      }
                      return quoteGroups.map((qg, qi) => (
                        <div key={qi}>
                          {quoteGroups.length > 1 && (
                            <div className="px-5 py-2 bg-neutral-50 border-b border-neutral-100 flex items-center gap-2">
                              <span className="w-1 h-4 rounded-full bg-neutral-300" />
                              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">{qg.title}</span>
                              <span className="text-[10px] text-neutral-400 ml-1">({qg.proposals.length} {qg.proposals.length === 1 ? 'version' : 'versions'})</span>
                            </div>
                          )}
                          {qg.proposals.map(p => {
                            const st = getStatus(p)
                            const price = p.override_price ?? p.calculated_price
                            return (
                              <Link
                                key={p.id}
                                href={`/admin/proposals/${p.id}`}
                                className="flex items-center justify-between px-5 py-3 hover:bg-neutral-50 transition border-b border-neutral-50 last:border-b-0 group"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-1.5 h-8 rounded-full ${st.dot} shrink-0 transition`} />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-neutral-800 truncate group-hover:text-neutral-900">
                                      {quoteGroups.length <= 1 ? p.quote_title : `v${p.version_number}`}
                                    </div>
                                    <div className="text-[11px] text-neutral-400 mt-0.5">
                                      Sent {relativeTime(p.sent_at)}{quoteGroups.length > 1 ? '' : ` · v${p.version_number}`}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-5 shrink-0">
                                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
                                    {st.label}
                                  </span>
                                  <div className="text-right w-12">
                                    <div className="text-sm font-bold text-neutral-900">{p.total_views}</div>
                                    <div className="text-[9px] text-neutral-400">views</div>
                                  </div>
                                  <div className="text-right font-mono text-xs text-neutral-600 w-20 hidden sm:block">
                                    {price ? formatMoney(price) : '—'}
                                  </div>
                                  <svg className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
