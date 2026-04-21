'use client'

import { useEffect, useState, useMemo } from 'react'

type CreativeInsight = {
  ad_id: string; ad_name: string
  spend: number; impressions: number; reach: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; converted: number
  creative_id: string; creative_name: string
  thumbnail_url: string; body: string
}

const RANGES = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All Time', value: 'all' },
]

function dateRange(v: string) {
  if (v === 'all') return { from: '', to: '' }
  const days = parseInt(v) || 30
  return { from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }
}

export default function FbAdsCreatives() {
  const [range, setRange] = useState('30')
  const [creatives, setCreatives] = useState<CreativeInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState<'spend' | 'cpl' | 'leads' | 'ctr' | 'converted'>('spend')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (from) p.set('date_from', from); if (to) p.set('date_to', to)
    fetch(`/api/facebook-ads/creatives?${p}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setCreatives(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setError('Failed to load creatives'); setLoading(false) })
  }, [from, to])

  const sorted = useMemo(() => {
    return [...creatives].sort((a, b) => {
      if (sortBy === 'spend') return b.spend - a.spend
      if (sortBy === 'leads') return b.db_leads - a.db_leads
      if (sortBy === 'ctr') return b.ctr - a.ctr
      if (sortBy === 'converted') return b.converted - a.converted
      if (sortBy === 'cpl') {
        const aCpl = a.db_leads > 0 ? a.spend / a.db_leads : Infinity
        const bCpl = b.db_leads > 0 ? b.spend / b.db_leads : Infinity
        return aCpl - bCpl // Ascending for CPL (cheaper is better)
      }
      return 0
    })
  }, [creatives, sortBy])

  return (
    <div className="max-w-[1400px] px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ad Creatives</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Which images and videos are bringing the cheapest leads?</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="spend">Sort by Spend (Highest)</option>
            <option value="leads">Sort by Leads (Most)</option>
            <option value="cpl">Sort by CPL (Cheapest)</option>
            <option value="ctr">Sort by CTR (Highest)</option>
            <option value="converted">Sort by Converted (Most)</option>
          </select>
          <select value={range} onChange={e => setRange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
            {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[2.5px] border-neutral-200 border-t-[#1877F2] rounded-full animate-spin" /></div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">{error}</div>}
      {!loading && !error && creatives.length === 0 && <p className="text-center text-neutral-400 text-sm py-16">No creatives found for this period</p>}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {sorted.map((cr, i) => {
          const actualCpl = cr.db_leads > 0 ? cr.spend / cr.db_leads : cr.cost_per_lead || 0
          return (
            <div key={`${cr.ad_id}-${i}`} className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              {/* Image / Thumbnail */}
              <div className="relative aspect-square bg-neutral-100 border-b border-neutral-100 flex items-center justify-center overflow-hidden">
                {cr.thumbnail_url ? (
                  <img src={cr.thumbnail_url} alt={cr.ad_name} className="object-cover w-full h-full" />
                ) : (
                  <svg className="w-10 h-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                )}
                {/* Ranking Badge */}
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur text-neutral-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
                  #{i + 1}
                </div>
              </div>

              {/* Content */}
              <div className="p-5 flex-1 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-neutral-900 line-clamp-1" title={cr.ad_name}>{cr.ad_name}</h3>
                  {cr.body && <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2" title={cr.body}>{cr.body}</p>}
                </div>
                
                <div className="mt-auto grid grid-cols-2 gap-x-2 gap-y-3">
                  <Metric label="Spend" value={`₹${fmt(cr.spend)}`} />
                  <Metric label="Leads" value={String(cr.db_leads)} primary />
                  <Metric label="CPL" value={actualCpl > 0 ? `₹${fmt(actualCpl)}` : '—'} />
                  <Metric label="Converted" value={String(cr.converted)} green={cr.converted > 0} />
                  <Metric label="CTR" value={`${(cr.ctr || 0).toFixed(2)}%`} small />
                  <Metric label="Quality" value={String(cr.quality_leads)} small />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value, primary, green, small }: { label: string; value: string; primary?: boolean; green?: boolean; small?: boolean }) {
  const color = primary ? 'text-[#1877F2]' : green ? 'text-emerald-600' : 'text-neutral-900'
  return (
    <div>
      <div className="text-[10px] text-neutral-400 mb-0.5">{label}</div>
      <div className={`font-semibold tracking-tight ${color} ${small ? 'text-sm' : 'text-base'}`}>{value}</div>
    </div>
  )
}

function fmt(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
