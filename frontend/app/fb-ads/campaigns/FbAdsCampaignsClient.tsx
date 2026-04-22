'use client'

import { useEffect, useState, useMemo } from 'react'

type Campaign = {
  id: string; name: string; status: string; objective: string
  daily_budget?: string; lifetime_budget?: string
  spend: number; impressions: number; reach: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number; converted_revenue?: number
  adsets: AdSet[]
}
type AdSet = {
  id: string; name: string; spend: number; impressions: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number; converted_revenue?: number
  ads: Ad[]
}
type Ad = {
  id: string; name: string; spend: number; impressions: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number; converted_revenue?: number
}

const TIPS: Record<string, string> = {
  Spend: 'Amount spent on this item',
  Leads: 'Leads received in your CRM',
  Quality: 'Leads rated Excellent or Good',
  Spam: 'Leads marked as unwanted',
  Converted: 'Leads that became clients',
  CPL: 'Cost Per Lead — spend ÷ leads',
  Impressions: 'Total times shown',
  Clicks: 'Number of clicks',
  CTR: 'Click-Through Rate',
  ROAS: 'Return on Ad Spend — converted revenue ÷ spend',
}

const RANGES = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'All Time', value: 'all' },
]

function dateRange(v: string) {
  const now = new Date(); const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (v === 'all') return { from: '', to: '' }
  if (v === 'this_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
  if (v === 'last_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) }
  const days = parseInt(v) || 30
  return { from: fmt(new Date(Date.now() - days * 86400000)), to: fmt(now) }
}

export default function FbAdsCampaigns() {
  const [range, setRange] = useState('30')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedAs, setExpandedAs] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (from) p.set('date_from', from); if (to) p.set('date_to', to)
    fetch(`/api/facebook-ads/campaigns?${p}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setCampaigns(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setError('Failed to load campaigns'); setLoading(false) })
  }, [from, to])

  const filtered = useMemo(() => {
    let items = campaigns
    if (statusFilter !== 'all') items = items.filter(c => c.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(c => c.name?.toLowerCase().includes(q) || c.adsets?.some(as => as.name?.toLowerCase().includes(q) || as.ads?.some(ad => ad.name?.toLowerCase().includes(q))))
    }
    return items
  }, [campaigns, statusFilter, search])

  const statuses = useMemo(() => Array.from(new Set(campaigns.map(c => c.status).filter(Boolean))), [campaigns])
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAs = (k: string) => setExpandedAs(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })

  const totals = useMemo(() => ({
    spend: filtered.reduce((s, c) => s + (c.spend || 0), 0),
    leads: filtered.reduce((s, c) => s + (c.db_leads || 0), 0),
    count: filtered.length,
  }), [filtered])

  return (
    <div className="max-w-[1400px] px-6 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Campaigns</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Campaign → Ad Set → Ad performance breakdown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
            <option value="all">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
            {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1 truncate">Campaigns</div>
            <div className="text-xl font-semibold text-neutral-900 truncate">{totals.count}</div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1 truncate">Total Spend</div>
            <div className="text-xl font-semibold text-neutral-900 truncate">₹{fmt(totals.spend)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1 truncate">Total Leads</div>
            <div className="text-xl font-semibold text-[#1877F2] truncate">{totals.leads}</div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1 truncate">Avg CPL</div>
            <div className="text-xl font-semibold text-neutral-900 truncate">{totals.leads > 0 ? `₹${fmt(totals.spend / totals.leads)}` : '—'}</div>
          </div>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[2.5px] border-neutral-200 border-t-[#1877F2] rounded-full animate-spin" /></div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">{error}</div>}
      {!loading && !error && filtered.length === 0 && <p className="text-center text-neutral-400 text-sm py-16">No campaigns found</p>}

      {/* Campaign Cards */}
      <div className="space-y-3">
        {filtered.map(c => {
          const open = expanded.has(c.id)
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden hover:shadow-md transition-shadow">
              {/* Campaign */}
              <button onClick={() => toggle(c.id)} className="w-full text-left p-5 flex items-start gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`mt-1 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold text-neutral-900">{c.name || 'Unnamed Campaign'}</span>
                    <StatusBadge status={c.status} />
                    {c.objective && <span className="text-[10px] text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded">{c.objective.replace(/_/g, ' ')}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Metric label="Spend" value={`₹${fmt(c.spend)}`} />
                    <Metric label="Leads" value={String(c.db_leads)} primary />
                    <Metric label="Quality" value={String(c.quality_leads)} green />
                    <Metric label="Spam" value={String(c.spam_leads)} />
                    <Metric label="Converted" value={String(c.converted)} purple />
                    <Metric label="ROAS" value={c.spend > 0 ? `${((c.converted_revenue || 0) / c.spend).toFixed(1)}x` : '0x'} green />
                    <Metric label="CPL" value={c.cost_per_lead > 0 ? `₹${fmt(c.cost_per_lead)}` : '—'} />
                    <Metric label="Impressions" value={fmtK(c.impressions)} />
                    <Metric label="CTR" value={`${(c.ctr || 0).toFixed(2)}%`} />
                  </div>
                </div>
                <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.id?.replace('act_', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="shrink-0 text-[11px] font-medium text-[#1877F2] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open
                </a>
              </button>

              {/* Ad Sets */}
              {open && (
                <div className="border-t border-neutral-100">
                  {c.adsets?.length ? c.adsets.map(as => {
                    const asKey = `${c.id}:${as.id}`
                    const asOpen = expandedAs.has(asKey)
                    return (
                      <div key={as.id}>
                        <button onClick={() => toggleAs(asKey)}
                          className="w-full text-left px-5 py-3 pl-12 flex items-start gap-2.5 bg-neutral-50/50 border-b border-neutral-100 hover:bg-neutral-50 transition">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            className={`mt-0.5 shrink-0 transition-transform duration-200 ${asOpen ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Ad Set</span>
                              <span className="text-xs font-medium text-neutral-800">{as.name || 'Unnamed'}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              <Metric label="Spend" value={`₹${fmt(as.spend)}`} small />
                              <Metric label="Leads" value={String(as.db_leads)} primary small />
                              <Metric label="Quality" value={String(as.quality_leads)} green small />
                              <Metric label="ROAS" value={as.spend > 0 ? `${((as.converted_revenue || 0) / as.spend).toFixed(1)}x` : '0x'} green small />
                              <Metric label="CPL" value={as.cost_per_lead > 0 ? `₹${fmt(as.cost_per_lead)}` : '—'} small />
                              <Metric label="CTR" value={`${(as.ctr || 0).toFixed(2)}%`} small />
                            </div>
                          </div>
                        </button>

                        {/* Ads */}
                        {asOpen && (
                          <div className="pl-16 pr-5 py-2 space-y-1.5 bg-white">
                            {as.ads?.length ? as.ads.map(ad => (
                              <div key={ad.id} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 hover:border-neutral-200 transition bg-white">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#1877F2] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest">Ad</span>
                                    <span className="text-xs text-neutral-800 truncate">{ad.name || 'Unnamed'}</span>
                                  </div>
                                </div>
                                <div className="flex gap-x-3 shrink-0 flex-wrap">
                                  <Metric label="Spend" value={`₹${fmt(ad.spend)}`} small />
                                  <Metric label="Leads" value={String(ad.db_leads)} primary small />
                                  <Metric label="Quality" value={String(ad.quality_leads)} green small />
                                  <Metric label="Conv" value={String(ad.converted)} purple small />
                                  <Metric label="ROAS" value={ad.spend > 0 ? `${((ad.converted_revenue || 0) / ad.spend).toFixed(1)}x` : '0x'} green small />
                                  <Metric label="CPL" value={ad.cost_per_lead > 0 ? `₹${fmt(ad.cost_per_lead)}` : '—'} small />
                                </div>
                              </div>
                            )) : <p className="text-xs text-neutral-400 py-2">No ads with data</p>}
                          </div>
                        )}
                      </div>
                    )
                  }) : <p className="text-xs text-neutral-400 p-5 pl-12">No ad sets found</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = { ACTIVE: 'bg-emerald-50 text-emerald-700', PAUSED: 'bg-amber-50 text-amber-700', ARCHIVED: 'bg-neutral-100 text-neutral-500', DELETED: 'bg-rose-50 text-rose-600' }
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${c[status] || 'bg-neutral-100 text-neutral-500'}`}>{status}</span>
}

function Metric({ label, value, small, primary, green, purple }: { label: string; value: string; small?: boolean; primary?: boolean; green?: boolean; purple?: boolean }) {
  const tip = TIPS[label]
  const color = primary ? 'text-[#1877F2]' : green ? 'text-emerald-600' : purple ? 'text-violet-600' : 'text-neutral-900'
  return (
    <span className={`${small ? 'text-[10px]' : 'text-[11px]'} group relative cursor-default`}>
      {tip && <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">{tip}</span>}
      <span className="text-neutral-400 mr-1">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </span>
  )
}

function fmt(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
function fmtK(n: number) { if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'; if (n >= 1e5) return (n/1e5).toFixed(1)+'L'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(Math.round(n||0)) }
