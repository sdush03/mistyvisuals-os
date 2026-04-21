'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'

/* ─── Types ────────────────────────────────────────────────── */
type OverviewData = { lead_stats: Record<string, any>; ad_insights: Record<string, any> | null }
type DailyPoint = { date: string; spend: number; meta_leads: number; impressions: number; clicks: number }
type DbDailyPoint = { day: string; leads: number }

/* ─── Date Ranges ──────────────────────────────────────────── */
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

/* ─── Metric Descriptions (for tooltips) ───────────────────── */
const METRIC_INFO: Record<string, string> = {
  'Total Spend': 'Total amount spent on Facebook ads in the selected period',
  'Total Leads': 'Number of people who filled your lead form through Facebook ads',
  'Cost / Lead': 'Average amount spent to get one lead (Total Spend ÷ Total Leads)',
  'Converted': 'Leads that became paying clients',
  'Quality Leads': 'Leads rated as Excellent or Good by your team',
  'Spam': 'Leads marked as spam or irrelevant',
  'Impressions': 'Total number of times your ads were shown on screen',
  'Reach': 'Number of unique people who saw your ad at least once',
  'Clicks': 'Number of times people clicked on your ad',
  'CTR': 'Click-Through Rate — percentage of people who clicked after seeing your ad',
  'CPC': 'Cost Per Click — average cost each time someone clicks your ad',
  'CPM': 'Cost Per Mille — cost to show your ad 1,000 times',
  'Frequency': 'Average number of times each person saw your ad',
  'Meta Leads': 'Lead count reported by Meta (may differ from your CRM count)',
}

/* ─── Component ────────────────────────────────────────────── */
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
    if (from) qs.set('date_from', from)
    if (to) qs.set('date_to', to)
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
    { label: 'Excellent', count: ls.excellent || 0, color: '#10b981' },
    { label: 'Good', count: ls.good_quality || 0, color: '#3b82f6' },
    { label: 'Average', count: ls.average_quality || 0, color: '#f59e0b' },
    { label: 'Poor', count: ls.poor_quality || 0, color: '#ef4444' },
    { label: 'Spam', count: ls.spam || 0, color: '#94a3b8' },
    { label: 'Unrated', count: Math.max(0, totalLeads - (ls.rated || 0) - (ls.spam || 0)), color: '#e2e8f0' },
  ].filter(d => d.count > 0)

  const statusFunnel = [
    { label: 'New', count: ls.status_new || 0, color: '#6366f1' },
    { label: 'Contacted', count: ls.status_contacted || 0, color: '#8b5cf6' },
    { label: 'Quoted', count: ls.status_quoted || 0, color: '#a78bfa' },
    { label: 'Follow Up', count: ls.status_followup || 0, color: '#c084fc' },
    { label: 'Negotiation', count: ls.status_negotiation || 0, color: '#d8b4fe' },
    { label: 'Awaiting', count: ls.status_awaiting || 0, color: '#f0abfc' },
    { label: 'Converted', count: converted, color: '#10b981' },
    { label: 'Lost', count: ls.status_lost || 0, color: '#f87171' },
    { label: 'Rejected', count: ls.status_rejected || 0, color: '#94a3b8' },
  ].filter(d => d.count > 0)
  const funnelMax = Math.max(...statusFunnel.map(d => d.count), 1)

  return (
    <div className="fb-dash" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .fb-dash .tip-wrap { position: relative; }
        .fb-dash .tip-wrap .tip-box {
          display: none; position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
          background: #1e293b; color: #f8fafc; padding: 8px 12px; border-radius: 8px; font-size: 12px;
          line-height: 1.4; white-space: normal; width: 220px; text-align: center; z-index: 99;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2); pointer-events: none;
        }
        .fb-dash .tip-wrap .tip-box::after {
          content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          border: 6px solid transparent; border-top-color: #1e293b;
        }
        .fb-dash .tip-wrap:hover .tip-box { display: block; }
        .fb-dash .card { background: var(--surface); border-radius: 16px; border: 1px solid var(--border); transition: box-shadow 0.2s; }
        .fb-dash .card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
        .fb-dash .metric-row { display: flex; align-items: center; gap: 6px; }
        @keyframes fbspin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fb-dash .anim { animation: fadeUp 0.4s ease both; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #1877F2 0%, #0a5dc2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(24,119,242,0.3)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>Facebook Ads</h1>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Campaign performance & lead insights</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={range} onChange={e => setRange(e.target.value)} style={selectSt}>
            {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <a href="https://adsmanager.facebook.com" target="_blank" rel="noopener noreferrer" style={{
            padding: '8px 16px', borderRadius: 10, background: '#1877F2', color: '#fff',
            fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Ads Manager
          </a>
        </div>
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} />}

      {!loading && !error && (
        <>
          {/* KPI Cards */}
          <div className="anim" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
            <KpiCard label="Total Spend" value={`₹${fmtMoney(spend)}`} sub="Meta Ad Spend" gradient="linear-gradient(135deg, #1877F2, #0a5dc2)" icon={<IconWallet />} />
            <KpiCard label="Total Leads" value={String(totalLeads)} sub={`${ls.this_month || 0} this month`} gradient="linear-gradient(135deg, #8b5cf6, #6d28d9)" icon={<IconUsers />} />
            <KpiCard label="Cost / Lead" value={cpl > 0 ? `₹${fmtMoney(cpl)}` : '—'} sub="Average CPL" gradient="linear-gradient(135deg, #f59e0b, #d97706)" icon={<IconTarget />} />
            <KpiCard label="Converted" value={String(converted)} sub={`${cvr}% conversion`} gradient="linear-gradient(135deg, #10b981, #059669)" icon={<IconCheck />} />
            <KpiCard label="Quality Leads" value={String(ls.quality || 0)} sub={`${ls.excellent || 0} excellent`} gradient="linear-gradient(135deg, #3b82f6, #2563eb)" icon={<IconStar />} />
            <KpiCard label="Spam" value={String(ls.spam || 0)} sub={totalLeads > 0 ? `${((ls.spam || 0) / totalLeads * 100).toFixed(0)}% of total` : '—'} gradient="linear-gradient(135deg, #94a3b8, #64748b)" icon={<IconBan />} />
          </div>

          {/* Meta Performance Row */}
          {ai && !ai.error && (
            <div className="anim card" style={{ padding: '16px 20px', marginBottom: 24, animationDelay: '0.05s' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Ad Performance
              </div>
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                <PerfMetric label="Impressions" value={fmtNum(ai.impressions)} desc={METRIC_INFO['Impressions']} />
                <PerfMetric label="Reach" value={fmtNum(ai.reach)} desc={METRIC_INFO['Reach']} />
                <PerfMetric label="Clicks" value={fmtNum(ai.clicks)} desc={METRIC_INFO['Clicks']} />
                <PerfMetric label="CTR" value={`${(ai.ctr || 0).toFixed(2)}%`} desc={METRIC_INFO['CTR']} />
                <PerfMetric label="CPC" value={`₹${fmtMoney(ai.cpc)}`} desc={METRIC_INFO['CPC']} />
                <PerfMetric label="CPM" value={`₹${fmtMoney(ai.cpm)}`} desc={METRIC_INFO['CPM']} />
                <PerfMetric label="Frequency" value={(ai.frequency || 0).toFixed(1)} desc={METRIC_INFO['Frequency']} />
                <PerfMetric label="Meta Leads" value={String(ai.meta_leads || 0)} desc={METRIC_INFO['Meta Leads']} />
              </div>
            </div>
          )}

          {ai?.error && (
            <div style={{ padding: '14px 20px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
              <strong>Meta Insights unavailable:</strong> {ai.error}<br />
              <span style={{ fontSize: 11, color: '#a16207' }}>Go to Business Settings → System Users → Generate Token with <code>ads_read</code> permission.</span>
            </div>
          )}

          {/* Charts */}
          <div className="anim" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 24, animationDelay: '0.1s' }}>
            {/* Spend vs Leads */}
            <div className="card" style={{ padding: '22px 24px 14px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Spend vs Leads</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 14 }}>Daily ad spend and leads received</div>
              {chartData.length > 0 ? <SpendLeadsChart data={chartData} /> : <EmptyState />}
            </div>

            {/* Quality + Status */}
            <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 16 }}>
              <div className="card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
                <DonutChart data={qualityData} size={100} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Lead Quality</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px' }}>
                    {qualityData.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                        <span style={{ color: '#6b7280' }}>{d.label}</span>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: '18px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Lead Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {statusFunnel.map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 64, fontSize: 10, color: '#6b7280', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
                      <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', borderRadius: 5, background: d.color, width: `${Math.max(3, (d.count / funnelMax) * 100)}%`, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                      </div>
                      <div style={{ width: 24, fontSize: 10, fontWeight: 600, color: '#374151', textAlign: 'right' }}>{d.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="anim" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, animationDelay: '0.15s' }}>
            <NavCard href="/fb-ads/campaigns" title="Campaigns" desc="Campaign → Ad Set → Ad hierarchy" icon={<IconLayers />} />
            <NavCard href="/fb-ads/leads" title="All FB Leads" desc="Rate quality, mark spam, manage leads" icon={<IconUsers />} />
            <NavCard href="/fb-ads/audience" title="Audience Insights" desc="Demographics, locations & platforms" icon={<IconGlobe />} />
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Sub Components ──────────────────────────────────────── */

function KpiCard({ label, value, sub, gradient, icon }: { label: string; value: string; sub: string; gradient: string; icon: React.ReactNode }) {
  return (
    <div className="tip-wrap card" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div className="tip-box">{METRIC_INFO[label] || label}</div>
      <div style={{ position: 'absolute', top: -6, right: -6, width: 52, height: 52, borderRadius: '50%', background: gradient, opacity: 0.08 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label}</div>
        <div style={{ opacity: 0.5, color: '#6b7280' }}>{icon}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function PerfMetric({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="tip-wrap" style={{ flex: '1 1 100px', padding: '6px 14px', borderRight: '1px solid var(--border)', minWidth: 90 }}>
      <div className="tip-box">{desc}</div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function NavCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="card" style={{
      padding: '18px 20px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1877F2', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{desc}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </Link>
  )
}

function Loader() {
  return (
    <div style={{ textAlign: 'center', padding: 70, color: '#9ca3af' }}>
      <div style={{ width: 28, height: 28, border: '2.5px solid #e5e7eb', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'fbspin 0.7s linear infinite', margin: '0 auto 10px' }} />
      <div style={{ fontSize: 13 }}>Loading dashboard…</div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ padding: '14px 20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{msg}</div>
}

function EmptyState() {
  return <div style={{ color: '#d1d5db', textAlign: 'center', paddingTop: 50, paddingBottom: 30, fontSize: 12 }}>No data for this period</div>
}

/* ─── Charts (inline SVG) ──────────────────────────────────── */

function SpendLeadsChart({ data }: { data: { date: string; spend: number; leads: number }[] }) {
  const maxS = Math.max(...data.map(d => d.spend), 1)
  const maxL = Math.max(...data.map(d => d.leads), 1)
  const H = 180, padL = 44, padB = 24
  const W = Math.max(500, data.length * 24)
  const bw = Math.min(16, Math.max(4, (W - padL) / data.length - 3))
  const step = (W - padL) / data.length

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <svg width={W} height={H + padB + 4} viewBox={`0 0 ${W} ${H + padB + 4}`} style={{ display: 'block' }}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={padL} x2={W} y1={H - H * f} y2={H - H * f} stroke="#f1f5f9" strokeWidth="1" />)}
        {data.map((d, i) => {
          const x = padL + i * step + (step - bw) / 2
          const h = (d.spend / maxS) * (H - 8)
          return <rect key={i} x={x} y={H - h} width={bw} height={h} rx={bw / 3} fill="#1877F2" opacity={0.18} />
        })}
        {data.length > 1 && (
          <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            points={data.map((d, i) => `${padL + i * step + step / 2},${H - (d.leads / maxL) * (H - 8)}`).join(' ')} />
        )}
        {data.map((d, i) => d.leads > 0 ? (
          <circle key={i} cx={padL + i * step + step / 2} cy={H - (d.leads / maxL) * (H - 8)} r={3} fill="#10b981" stroke="var(--surface)" strokeWidth="1.5" />
        ) : null)}
        {data.map((d, i) => {
          if (data.length > 14 && i % Math.ceil(data.length / 8) !== 0) return null
          return <text key={i} x={padL + i * step + step / 2} y={H + 14} textAnchor="middle" fontSize="8" fill="#9ca3af">{d.date.slice(5)}</text>
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 4 }}>
        <Legend color="#1877F2" opacity={0.25} label="Spend" />
        <Legend color="#10b981" label="Leads" />
      </div>
    </div>
  )
}

function Legend({ color, label, opacity }: { color: string; label: string; opacity?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#6b7280' }}>
      <div style={{ width: 10, height: label === 'Leads' ? 2.5 : 7, borderRadius: 2, background: color, opacity: opacity || 1 }} />
      {label}
    </div>
  )
}

function DonutChart({ data, size = 100 }: { data: { label: string; count: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (!total) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 11 }}>—</div>
  const r = size / 2 - 5, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r
  let off = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {data.map((d, i) => {
        const pct = d.count / total; const da = `${pct * C} ${C}`; const doff = -off * C; off += pct
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={12} strokeDasharray={da} strokeDashoffset={doff} transform={`rotate(-90 ${cx} ${cy})`} />
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--foreground)">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="#9ca3af">leads</text>
    </svg>
  )
}

/* ─── SVG Icons (minimalist) ──────────────────────────────── */
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconWallet() { return <svg {...iconProps}><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="16" cy="14" r="1"/></svg> }
function IconUsers() { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function IconTarget() { return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function IconCheck() { return <svg {...iconProps}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> }
function IconStar() { return <svg {...iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> }
function IconBan() { return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> }
function IconLayers() { return <svg {...iconProps}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function IconGlobe() { return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }

/* ─── Formatters ──────────────────────────────────────────── */
const selectSt: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }
function fmtMoney(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
function fmtNum(n: number) { if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'; if (n >= 1e5) return (n/1e5).toFixed(1)+'L'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(Math.round(n||0)) }
