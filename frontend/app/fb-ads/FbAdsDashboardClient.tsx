'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'

type OverviewData = { lead_stats: Record<string, any>; ad_insights: Record<string, any> | null }
type DailyPoint = { date: string; spend: number; meta_leads: number }
type DbDailyPoint = { day: string; leads: number }

const RANGES = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'All Time', value: 'all' },
]

const METRIC_TIPS: Record<string, string> = {
  'Impressions': 'Total number of times your ads were shown on screen',
  'Reach': 'Number of unique people who saw your ad at least once',
  'Clicks': 'Number of times people clicked on your ad',
  'CTR': 'Click-Through Rate — percentage of people who clicked after seeing your ad',
  'CPC': 'Cost Per Click — average cost each time someone clicks your ad',
  'CPM': 'Cost Per Mille — cost to show your ad 1,000 times',
  'Frequency': 'Average number of times each person saw your ad',
  'Meta Leads': 'Lead count reported directly by Meta (may differ from CRM count)',
}

function dateRange(v: string) {
  const now = new Date(); const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (v === 'all') return { from: '', to: '' }
  if (v === 'this_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
  if (v === 'last_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) }
  const days = parseInt(v) || 30
  return { from: fmt(new Date(Date.now() - days * 86400000)), to: fmt(now) }
}

export default function FbAdsDashboard() {
  const [range, setRange] = useState('30')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [daily, setDaily] = useState<{ meta: DailyPoint[]; db: DbDailyPoint[] }>({ meta: [], db: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true); setError('')
    const qs = new URLSearchParams()
    if (from) qs.set('date_from', from); if (to) qs.set('date_to', to)
    const q = qs.toString()
    Promise.all([
      fetch(`/api/facebook-ads/overview?${q}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/facebook-ads/daily-insights?${q}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([ov, dl]) => {
      setOverview(ov); setDaily({ meta: dl?.meta || [], db: dl?.db || [] }); setLoading(false)
    }).catch(() => { setError('Failed to load dashboard data'); setLoading(false) })
  }, [from, to])

  const ls = overview?.lead_stats || {} as any
  const ai = overview?.ad_insights || {} as any
  const totalLeads = ls.total || 0
  const converted = ls.converted || 0
  const cvr = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'
  const spend = ai.spend || 0
  const cpl = totalLeads > 0 ? (spend / totalLeads) : (ai.cost_per_lead || 0)

  const chartData = useMemo(() => {
    const map: Record<string, { spend: number; leads: number }> = {}
    for (const d of daily.meta) { const k = d.date; if (!map[k]) map[k] = { spend: 0, leads: 0 }; map[k].spend = d.spend }
    for (const d of daily.db) {
      const k = typeof d.day === 'string' ? d.day.slice(0, 10) : new Date(d.day).toISOString().slice(0, 10)
      if (!map[k]) map[k] = { spend: 0, leads: 0 }; map[k].leads = d.leads
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))
  }, [daily])

  const qualityData = [
    { label: 'Excellent', count: ls.excellent || 0, color: 'bg-emerald-500' },
    { label: 'Good', count: ls.good_quality || 0, color: 'bg-blue-500' },
    { label: 'Average', count: ls.average_quality || 0, color: 'bg-amber-500' },
    { label: 'Poor', count: ls.poor_quality || 0, color: 'bg-rose-500' },
    { label: 'Spam', count: ls.spam || 0, color: 'bg-neutral-400' },
    { label: 'Unrated', count: Math.max(0, totalLeads - (ls.rated || 0) - (ls.spam || 0)), color: 'bg-neutral-200' },
  ].filter(d => d.count > 0)
  const qualityTotal = qualityData.reduce((s, d) => s + d.count, 0)

  const statusFunnel = [
    { label: 'New', count: ls.status_new || 0, color: 'bg-indigo-500' },
    { label: 'Contacted', count: ls.status_contacted || 0, color: 'bg-violet-500' },
    { label: 'Quoted', count: ls.status_quoted || 0, color: 'bg-purple-400' },
    { label: 'Follow Up', count: ls.status_followup || 0, color: 'bg-pink-400' },
    { label: 'Negotiation', count: ls.status_negotiation || 0, color: 'bg-fuchsia-400' },
    { label: 'Awaiting', count: ls.status_awaiting || 0, color: 'bg-orange-400' },
    { label: 'Converted', count: converted, color: 'bg-emerald-500' },
    { label: 'Lost', count: ls.status_lost || 0, color: 'bg-rose-400' },
    { label: 'Rejected', count: ls.status_rejected || 0, color: 'bg-neutral-300' },
  ].filter(d => d.count > 0)
  const funnelMax = Math.max(...statusFunnel.map(d => d.count), 1)

  if (error) return (
    <div className="max-w-[1400px] px-6 py-8">
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700 text-sm">{error}</div>
    </div>
  )

  return (
    <div className="max-w-[1400px] px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#1877F2] flex items-center justify-center shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Facebook Ads</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Campaign performance & lead insights</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={range} onChange={e => setRange(e.target.value)} className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
            {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <a href="https://adsmanager.facebook.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1877F2] text-white text-xs font-semibold hover:bg-[#166fe0] transition shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Ads Manager
          </a>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-[2.5px] border-neutral-200 border-t-[#1877F2] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label="Total Spend" value={`₹${fmtMoney(spend)}`} sub="Meta Ad Spend" />
            <KpiCard label="Total Leads" value={String(totalLeads)} sub={`${ls.this_month || 0} this month`} accent />
            <KpiCard label="Cost / Lead" value={cpl > 0 ? `₹${fmtMoney(cpl)}` : '—'} sub="Average CPL" tooltip="Average amount spent to get one lead" />
            <KpiCard label="Converted" value={String(converted)} sub={`${cvr}% conversion`} />
            <KpiCard label="Quality Leads" value={String(ls.quality || 0)} sub={`${ls.excellent || 0} excellent`} />
            <KpiCard label="Spam" value={String(ls.spam || 0)} sub={totalLeads > 0 ? `${((ls.spam || 0) / totalLeads * 100).toFixed(0)}% of total` : '—'} />
          </div>

          {/* Ad Performance Metrics */}
          {ai && !ai.error && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <h3 className="text-xs text-neutral-500 mb-4 uppercase tracking-widest font-bold">Ad Performance</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-y-4 gap-x-2">
                <PerfMetric label="Impressions" value={fmtNum(ai.impressions)} tip={METRIC_TIPS['Impressions']} />
                <PerfMetric label="Reach" value={fmtNum(ai.reach)} tip={METRIC_TIPS['Reach']} />
                <PerfMetric label="Clicks" value={fmtNum(ai.clicks)} tip={METRIC_TIPS['Clicks']} />
                <PerfMetric label="CTR" value={`${(ai.ctr || 0).toFixed(2)}%`} tip={METRIC_TIPS['CTR']} />
                <PerfMetric label="CPC" value={`₹${fmtMoney(ai.cpc)}`} tip={METRIC_TIPS['CPC']} />
                <PerfMetric label="CPM" value={`₹${fmtMoney(ai.cpm)}`} tip={METRIC_TIPS['CPM']} />
                <PerfMetric label="Frequency" value={(ai.frequency || 0).toFixed(1)} tip={METRIC_TIPS['Frequency']} />
                <PerfMetric label="Meta Leads" value={String(ai.meta_leads || 0)} tip={METRIC_TIPS['Meta Leads']} />
              </div>
            </div>
          )}

          {ai?.error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
              <strong>Meta Insights unavailable: </strong>{ai.error}
              <span className="block text-xs text-amber-600 mt-1">Go to Business Settings → System Users → Generate Token with <code className="bg-amber-100 px-1 rounded">ads_read</code> permission.</span>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Spend vs Leads Chart */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">Spend vs Leads</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Daily ad spend and leads received</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-neutral-400">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500/20 inline-block" /> Spend</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-emerald-500 inline-block rounded" /> Leads</span>
                </div>
              </div>
              {chartData.length > 0 ? <SpendLeadsChart data={chartData} /> : <p className="text-xs text-neutral-400 text-center py-12">No data for this period</p>}
            </div>

            {/* Quality + Status Sidebar */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Quality Distribution */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <h3 className="text-sm font-semibold text-neutral-900 mb-4">Lead Quality</h3>
                {qualityTotal > 0 ? (
                  <>
                    <div className="flex rounded-lg overflow-hidden h-3 mb-4">
                      {qualityData.map(d => (
                        <div key={d.label} className={`${d.color} transition-all`} style={{ width: `${(d.count / qualityTotal) * 100}%` }} title={`${d.label}: ${d.count}`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-y-2 gap-x-3">
                      {qualityData.map(d => (
                        <div key={d.label} className="flex items-center gap-2 text-xs">
                          <div className={`w-2 h-2 rounded-full ${d.color} shrink-0`} />
                          <span className="text-neutral-500">{d.label}</span>
                          <span className="font-semibold text-neutral-900 ml-auto">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-xs text-neutral-400 text-center py-6">No leads to display</p>}
              </div>

              {/* Status Funnel */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <h3 className="text-sm font-semibold text-neutral-900 mb-4">Lead Status</h3>
                <div className="space-y-2">
                  {statusFunnel.map(d => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="text-[11px] text-neutral-500 w-16 text-right shrink-0">{d.label}</span>
                      <div className="flex-1 h-4 bg-neutral-100 rounded overflow-hidden">
                        <div className={`h-full ${d.color} rounded transition-all duration-500`} style={{ width: `${Math.max(3, (d.count / funnelMax) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-neutral-900 w-6 text-right shrink-0">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NavCard href="/fb-ads/campaigns" title="Campaigns" desc="Campaign → Ad Set → Ad hierarchy" />
            <NavCard href="/fb-ads/leads" title="All FB Leads" desc="Rate quality, mark spam, manage leads" />
            <NavCard href="/fb-ads/audience" title="Audience Insights" desc="Demographics, locations & platforms" />
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Sub Components ─── */

function KpiCard({ label, value, sub, accent, tooltip }: { label: string; value: string; sub: string; accent?: boolean; tooltip?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] group relative hover:shadow-md transition-shadow">
      {tooltip && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-800 text-white text-[11px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal w-48 text-center z-50 shadow-lg">{tooltip}<div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" /></div>}
      <div className="text-xs text-neutral-500 mb-2">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${accent ? 'text-[#1877F2]' : 'text-neutral-900'}`}>{value}</div>
      <div className="text-[10px] text-neutral-400 mt-1">{sub}</div>
    </div>
  )
}

function PerfMetric({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <div className="group relative cursor-default">
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-800 text-white text-[11px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal w-48 text-center z-50 shadow-lg">{tip}<div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" /></div>
      <div className="text-xs text-neutral-500 mb-0.5">{label}</div>
      <div className="text-lg font-semibold text-neutral-900 tracking-tight">{value}</div>
    </div>
  )
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow flex items-center justify-between group">
      <div>
        <div className="text-sm font-semibold text-neutral-900 group-hover:text-[#1877F2] transition-colors">{title}</div>
        <div className="text-xs text-neutral-500 mt-0.5">{desc}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-neutral-300 group-hover:text-[#1877F2] transition-colors shrink-0 ml-3"><polyline points="9 18 15 12 9 6"/></svg>
    </Link>
  )
}

function SpendLeadsChart({ data }: { data: { date: string; spend: number; leads: number }[] }) {
  const maxS = Math.max(...data.map(d => d.spend), 1)
  const maxL = Math.max(...data.map(d => d.leads), 1)
  const H = 160, padL = 0, padB = 20
  const W = Math.max(500, data.length * 20)
  const bw = Math.min(14, Math.max(3, (W - padL) / data.length - 3))
  const step = (W - padL) / data.length

  return (
    <div className="overflow-x-auto -mx-1">
      <svg width={W} height={H + padB + 2} viewBox={`0 0 ${W} ${H + padB + 2}`} className="block">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={padL} x2={W} y1={H - H * f} y2={H - H * f} stroke="#f5f5f5" strokeWidth="1" />)}
        {data.map((d, i) => {
          const x = padL + i * step + (step - bw) / 2
          const h = (d.spend / maxS) * (H - 8)
          return <rect key={`b${i}`} x={x} y={H - h} width={bw} height={h} rx={bw / 3} fill="#3b82f6" opacity={0.12} />
        })}
        {data.length > 1 && (
          <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            points={data.map((d, i) => `${padL + i * step + step / 2},${H - (d.leads / maxL) * (H - 8)}`).join(' ')} />
        )}
        {data.map((d, i) => d.leads > 0 ? <circle key={`c${i}`} cx={padL + i * step + step / 2} cy={H - (d.leads / maxL) * (H - 8)} r={2.5} fill="#10b981" stroke="white" strokeWidth="1.5" /> : null)}
        {data.map((d, i) => {
          if (data.length > 14 && i % Math.ceil(data.length / 8) !== 0) return null
          return <text key={`t${i}`} x={padL + i * step + step / 2} y={H + 13} textAnchor="middle" fontSize="8" fill="#a3a3a3">{d.date.slice(5)}</text>
        })}
      </svg>
    </div>
  )
}

function fmtMoney(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
function fmtNum(n: number) { if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'; if (n >= 1e5) return (n/1e5).toFixed(1)+'L'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(Math.round(n||0)) }
