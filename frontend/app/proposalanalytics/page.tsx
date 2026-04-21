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
  lead_status: string | null
  calculated_price: number | null
  override_price: number | null
  couple_names: string | null
  total_views: number
  unique_views: number
  tiers?: any[]
  pricing_mode?: string
  selected_tier_id?: string
}

function extractPrices(p: Proposal): number[] {
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

function isExpired(p: Proposal) {
  const s = typeof p.status === 'string' ? p.status : ''
  if (s === 'EXPIRED') return true
  if (p.lead_status === 'Lost' || p.lead_status === 'Rejected') return true
  if (p.expires_at && new Date(p.expires_at) < new Date() && s !== 'ACCEPTED') return true
  return false
}

function getStatus(p: Proposal) {
  const s = typeof p.status === 'string' ? p.status : ''
  if (s === 'ACCEPTED') return { label: 'Accepted', dot: 'bg-emerald-400', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  if (isExpired(p)) return { label: 'Expired', dot: 'bg-rose-400', color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' }
  if (p.total_views > 0) return { label: 'Viewed', dot: 'bg-amber-400', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
  return { label: 'Never Opened', dot: 'bg-neutral-400', color: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200' }
}

type QuoteGroupInfo = {
  groupId: number
  title: string
  proposals: Proposal[]
  latestVersion: Proposal
  isGroupExpired: boolean
  isGroupAccepted: boolean
  totalViews: number
  neverOpened: boolean
}

type LeadGroup = {
  leadId: number
  leadName: string
  coupleNames: string | null
  quoteGroups: QuoteGroupInfo[]
  totalViews: number
  lastViewed: string | null
  hasAccepted: boolean
  latestPrices: number[]
}

// Helper: build quote group info and determine its status from the latest version
function buildQuoteGroupInfo(groupId: number, title: string, proposals: Proposal[]): QuoteGroupInfo {
  const sorted = [...proposals].sort((a, b) => b.version_number - a.version_number)
  const latest = sorted[0]
  const views = proposals.reduce((sum, p) => sum + p.total_views, 0)
  return {
    groupId,
    title,
    proposals,
    latestVersion: latest,
    isGroupExpired: isExpired(latest),
    isGroupAccepted: proposals.some(p => (typeof p.status === 'string' ? p.status : '') === 'ACCEPTED'),
    totalViews: views,
    neverOpened: views === 0,
  }
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

  // Step 1: Build quote groups from flat proposals
  const allQuoteGroups: QuoteGroupInfo[] = []
  const qgMap = new Map<number, { title: string; proposals: Proposal[] }>()
  for (const p of proposals) {
    if (!qgMap.has(p.group_id)) qgMap.set(p.group_id, { title: p.quote_title || 'Untitled', proposals: [] })
    qgMap.get(p.group_id)!.proposals.push(p)
  }
  for (const [gid, data] of qgMap) {
    allQuoteGroups.push(buildQuoteGroupInfo(gid, data.title, data.proposals))
  }

  // Step 2: Stats at the quote group level
  const totalSent = allQuoteGroups.filter(qg => !qg.isGroupExpired).length
  const totalAccepted = allQuoteGroups.filter(qg => qg.isGroupAccepted).length
  const neverOpened = allQuoteGroups.filter(qg => qg.neverOpened && !qg.isGroupExpired).length
  const totalExpired = allQuoteGroups.filter(qg => qg.isGroupExpired).length

  // Step 3: Group quote groups by lead, filtering based on the active tab
  const groups: LeadGroup[] = []
  const leadMap = new Map<number, LeadGroup>()
  for (const qg of allQuoteGroups) {
    const p0 = qg.proposals[0]
    // Filter at the quote group level
    if (filter === 'all' && qg.isGroupExpired) continue       // "Sent" hides expired groups
    if (filter === 'expired' && !qg.isGroupExpired) continue   // "Expired" only shows expired groups
    if (filter === 'accepted' && !qg.isGroupAccepted) continue
    if (filter === 'never' && (!qg.neverOpened || qg.isGroupExpired)) continue

    let g = leadMap.get(p0.lead_id)
    if (!g) {
      g = {
        leadId: p0.lead_id,
        leadName: p0.lead_name,
        coupleNames: p0.couple_names,
        quoteGroups: [],
        totalViews: 0,
        lastViewed: null,
        hasAccepted: false,
        latestPrices: [],
      }
      leadMap.set(p0.lead_id, g)
      groups.push(g)
    }
    g.quoteGroups.push(qg)
    g.totalViews += qg.totalViews
    for (const p of qg.proposals) {
      if (p.last_viewed_at && (!g.lastViewed || new Date(p.last_viewed_at) > new Date(g.lastViewed))) {
        g.lastViewed = p.last_viewed_at
      }
    }
    if (qg.isGroupAccepted) g.hasAccepted = true
    if (!g.coupleNames && p0.couple_names) g.coupleNames = p0.couple_names
    const prices = extractPrices(qg.latestVersion)
    if (prices.length > 0) g.latestPrices = prices
  }
  const filteredGroups = groups

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8 animate-fade-in">
      {/* Hero Header */}
      <div className="relative bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-indigo-50/50 via-sky-50/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-50/40 via-teal-50/10 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-8 md:p-10">
          <div>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-neutral-900">Proposal Analytics</h2>
            <p className="text-sm text-neutral-500 font-light mt-2 max-w-md">
              Track engagement across all sent proposals. See exactly who's viewing your quotes and identify the hottest leads.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition"
              onClick={() => loadProposals()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-rose-600 text-sm font-medium bg-rose-50 px-4 py-3 rounded-xl border border-rose-100">{error}</div>}

      {/* Stats Selectors Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Sent', value: totalSent, filterKey: 'all', desc: 'Total tracked quotes' },
          { label: 'Accepted', value: totalAccepted, filterKey: 'accepted', desc: 'Successfully signed' },
          { label: 'Never Opened', value: neverOpened, filterKey: 'never', desc: 'Needs a follow-up' },
          { label: 'Expired', value: totalExpired, filterKey: 'expired', desc: 'Missed deadline' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setFilter(s.filterKey as typeof filter)}
            className={`text-left bg-white rounded-2xl border p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all ${filter === s.filterKey ? 'border-neutral-900 ring-1 ring-neutral-900 bg-neutral-50/50' : 'border-neutral-200 hover:border-neutral-300'}`}
          >
            <div className="text-xs text-neutral-500 mb-3">{s.label}</div>
            <div className="text-2xl font-semibold text-neutral-900 tracking-tight mb-1">{s.value}</div>
            <div className="text-[10px] text-neutral-400">{s.desc}</div>
          </button>
        ))}
      </div>

      {/* Grouped List */}
      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
        <div className="p-8 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 mb-1">Proposal Activity</h3>
            <p className="text-xs text-neutral-500">
               {filter === 'all' ? 'All active clients' : `Showing "${filter}" clients`}
            </p>
          </div>
        </div>

        <div className="divide-y divide-neutral-100 min-h-[300px]">
          {loading ? (
            <div className="text-center text-sm text-neutral-400 py-16">Loading analytics...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center text-sm text-neutral-400 py-16">
              {filter === 'all' ? 'No proposals sent yet.' : `No proposals match "${filter}" filter.`}
            </div>
          ) : filteredGroups.map((g) => {
            const isOpen = expandedLead === g.leadId
            return (
              <div key={g.leadId} className="group/row">
                {/* Lead Row */}
                <button
                  onClick={() => setExpandedLead(isOpen ? null : g.leadId)}
                  className={`w-full flex items-center justify-between px-8 py-5 transition text-left ${isOpen ? 'bg-indigo-50/30' : 'hover:bg-neutral-50/80 bg-white'}`}
                >
                  <div className="flex items-center gap-5 min-w-0 flex-1">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 shadow-sm border ${
                      g.hasAccepted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      g.totalViews > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                    }`}>
                      {(g.coupleNames || g.leadName).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 pr-4">
                      <div className="font-semibold text-neutral-900 text-base truncate">{g.coupleNames || g.leadName}</div>
                      <div className="text-xs text-neutral-400 mt-0.5 truncate flex items-center gap-3">
                         <span>{g.quoteGroups.length} {g.quoteGroups.length === 1 ? 'quote' : 'quotes'}</span>
                         {g.coupleNames && g.coupleNames !== g.leadName && (
                           <span className="hidden sm:inline">· {g.leadName}</span>
                         )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-[17px] font-bold text-neutral-900">{g.totalViews}</div>
                      <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mt-0.5">Views</div>
                    </div>
                    
                    <div className="text-right hidden md:block w-28">
                      <div className={`text-[13px] font-medium leading-tight ${g.lastViewed ? 'text-neutral-900' : 'text-neutral-400 italic'}`}>
                        {relativeTime(g.lastViewed)}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Last opened</div>
                    </div>

                    {g.latestPrices && g.latestPrices.length > 0 && (
                       <div className="text-right hidden md:block lg:w-40 w-24">
                         <div className="text-[14px] font-semibold text-neutral-900 truncate">
                           {g.latestPrices.map(p => formatMoney(p)).join(' / ')}
                         </div>
                         <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mt-1">Value</div>
                       </div>
                    )}

                    <div className="w-20 text-right">
                      {g.hasAccepted ? (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                          Accepted
                        </span>
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ml-auto ${isOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-400 group-hover/row:bg-neutral-200 group-hover/row:text-neutral-600'}`}>
                          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded: show all quote groups for this lead */}
                {isOpen && (
                  <div className="bg-indigo-50/10 border-t border-neutral-100">
                    {g.quoteGroups.map((qg, qi) => (
                      <div key={qg.groupId}>
                        {g.quoteGroups.length > 1 && (
                          <div className="px-8 py-3 bg-neutral-100/50 border-y border-neutral-100 flex items-center gap-3">
                            <span className="w-1 h-3 rounded-full bg-neutral-300" />
                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">{qg.title}</span>
                            <span className="text-[10px] font-medium text-neutral-400 ml-1">({qg.proposals.length} {qg.proposals.length === 1 ? 'version' : 'versions'})</span>
                          </div>
                        )}
                        <div className="divide-y divide-neutral-100/40">
                           {qg.proposals.map(p => {
                             const st = getStatus(p)
                             return (
                               <Link
                                 key={p.id}
                                 href={`/proposalanalytics/${p.id}`}
                                 className="flex items-center justify-between px-8 py-4 hover:bg-white transition group/item"
                               >
                                 <div className="flex items-center gap-4 min-w-0 flex-1 ml-4 border-l-2 border-neutral-200 pl-4 group-hover/item:border-blue-300 transition-colors">
                                   <div className={`w-2.5 h-2.5 rounded-full ${st.dot} shrink-0 shadow-sm`} />
                                   <div className="min-w-0">
                                     <div className="text-[15px] font-semibold text-neutral-800 truncate group-hover/item:text-blue-600 transition">
                                       {g.quoteGroups.length <= 1 ? p.quote_title : `Version ${p.version_number}`}
                                     </div>
                                     <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-2">
                                       <span>Sent {relativeTime(p.sent_at)}</span>
                                       {g.quoteGroups.length <= 1 && <span className="bg-neutral-100 px-1.5 py-0.5 rounded-md text-[10px] font-mono leading-none">v{p.version_number}</span>}
                                     </div>
                                   </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-8 shrink-0">
                                   <div className="text-right w-16">
                                     <div className="text-[15px] font-bold text-neutral-900">{p.total_views}</div>
                                     <div className="text-[10px] tracking-widest uppercase font-bold text-neutral-400 mt-0.5">views</div>
                                   </div>
                                   
                                   {extractPrices(p).length > 0 && (
                                     <div className="text-right font-mono text-[12px] font-semibold text-neutral-600 lg:w-40 w-24 hidden lg:block truncate">
                                       {extractPrices(p).map(p => formatMoney(p)).join(' / ')}
                                     </div>
                                   )}

                                   <span className={`w-28 text-center inline-flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md border ${st.bg} ${st.color} ${st.border}`}>
                                     {st.label}
                                   </span>
                                   
                                   <div className="w-8 flex justify-end">
                                      <svg className="w-4 h-4 text-neutral-300 group-hover/item:text-blue-500 transition group-hover/item:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                      </svg>
                                   </div>
                                 </div>
                               </Link>
                             )
                           })}
                        </div>
                      </div>
                    ))}
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
