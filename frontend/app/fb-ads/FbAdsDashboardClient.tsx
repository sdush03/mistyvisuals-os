'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'

type OverviewData = {
  lead_stats: Record<string, any>
  ad_insights: Record<string, any> | null
}
type DailyPoint = { date: string; spend: number; meta_leads: number; impressions: number; clicks: number }
type DbDailyPoint = { day: string; leads: number }

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
]

function dateRange(value: string) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (value === 'this_month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
  }
  if (value === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: fmt(first), to: fmt(last) }
  }
  const days = parseInt(value) || 30
  return { from: fmt(new Date(Date.now() - days * 86400000)), to: fmt(now) }
}

export default function FbAdsDashboard() {
  const [range, setRange] = useState('30')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [daily, setDaily] = useState<{ meta: DailyPoint[]; db: DbDailyPoint[] }>({ meta: [], db: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const apiFetch = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true)
    setError('')
    const qs = `date_from=${from}&date_to=${to}`
    Promise.all([
      apiFetch(`/api/facebook-ads/overview?${qs}`),
      apiFetch(`/api/facebook-ads/daily-insights?${qs}`),
    ])
      .then(([ov, dl]) => {
        setOverview(ov)
        setDaily({ meta: dl?.meta || [], db: dl?.db || [] })
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load dashboard data')
        setLoading(false)
      })
  }, [from, to])

  const ls = overview?.lead_stats || {} as any
  const ai = overview?.ad_insights || {} as any

  const totalLeads = ls.total || 0
  const converted = ls.converted || 0
  const cvr = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'
  const spend = ai.spend || 0
  const cpl = totalLeads > 0 ? (spend / totalLeads) : (ai.cost_per_lead || 0)

  // Chart data: merge meta daily spend with db daily leads
  const chartData = useMemo(() => {
    const map: Record<string, { spend: number; leads: number; impressions: number }> = {}
    for (const d of daily.meta) {
      const key = d.date
      if (!map[key]) map[key] = { spend: 0, leads: 0, impressions: 0 }
      map[key].spend = d.spend
      map[key].impressions = d.impressions
    }
    for (const d of daily.db) {
      const key = typeof d.day === 'string' ? d.day.slice(0, 10) : new Date(d.day).toISOString().slice(0, 10)
      if (!map[key]) map[key] = { spend: 0, leads: 0, impressions: 0 }
      map[key].leads = d.leads
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }))
  }, [daily])

  // Quality distribution for donut
  const qualityData = [
    { label: 'Excellent', count: ls.excellent || 0, color: '#22c55e' },
    { label: 'Good', count: ls.good_quality || 0, color: '#3b82f6' },
    { label: 'Average', count: ls.average_quality || 0, color: '#f59e0b' },
    { label: 'Poor', count: ls.poor_quality || 0, color: '#ef4444' },
    { label: 'Spam', count: ls.spam || 0, color: '#94a3b8' },
    { label: 'Unrated', count: Math.max(0, totalLeads - (ls.rated || 0) - (ls.spam || 0)), color: '#e2e8f0' },
  ].filter(d => d.count > 0)

  // Status funnel
  const statusFunnel = [
    { label: 'New', count: ls.status_new || 0, color: '#6366f1' },
    { label: 'Contacted', count: ls.status_contacted || 0, color: '#8b5cf6' },
    { label: 'Quoted', count: ls.status_quoted || 0, color: '#a855f7' },
    { label: 'Follow Up', count: ls.status_followup || 0, color: '#c084fc' },
    { label: 'Negotiation', count: ls.status_negotiation || 0, color: '#d946ef' },
    { label: 'Awaiting', count: ls.status_awaiting || 0, color: '#f0abfc' },
    { label: 'Converted', count: converted, color: '#22c55e' },
    { label: 'Lost', count: ls.status_lost || 0, color: '#ef4444' },
    { label: 'Rejected', count: ls.status_rejected || 0, color: '#94a3b8' },
  ].filter(d => d.count > 0)

  const funnelMax = Math.max(...statusFunnel.map(d => d.count), 1)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #1877F2 0%, #0C5DC7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Facebook Ads</h1>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 2 }}>Campaign performance & lead insights</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 13, cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {RANGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <a
            href="https://adsmanager.facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '8px 16px', borderRadius: 10, background: '#1877F2', color: '#fff',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Ads Manager
          </a>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#1877F2',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Loading dashboard...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
          border: '1px solid #fecaca', color: '#dc2626', fontSize: 14, marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 28,
          }}>
            <KpiCard label="Total Spend" value={`₹${formatMoney(spend)}`} sub="Meta Ad Spend" color="#1877F2" icon="💰" />
            <KpiCard label="Total Leads" value={String(totalLeads)} sub={`${ls.this_month || 0} this month`} color="#8b5cf6" icon="👥" />
            <KpiCard label="Cost / Lead" value={cpl > 0 ? `₹${formatMoney(cpl)}` : '—'} sub="Average CPL" color="#f59e0b" icon="📊" />
            <KpiCard label="Converted" value={String(converted)} sub={`${cvr}% conversion rate`} color="#22c55e" icon="✅" />
            <KpiCard label="Quality Leads" value={String(ls.quality || 0)} sub={`${ls.excellent || 0} excellent`} color="#3b82f6" icon="⭐" />
            <KpiCard label="Spam" value={String(ls.spam || 0)} sub={totalLeads > 0 ? `${((ls.spam || 0) / totalLeads * 100).toFixed(0)}% of total` : '—'} color="#94a3b8" icon="🚫" />
          </div>

          {/* Meta Performance Cards */}
          {ai && !ai.error && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              marginBottom: 28,
            }}>
              <MiniCard label="Impressions" value={formatCompact(ai.impressions)} />
              <MiniCard label="Reach" value={formatCompact(ai.reach)} />
              <MiniCard label="Clicks" value={formatCompact(ai.clicks)} />
              <MiniCard label="CTR" value={`${(ai.ctr || 0).toFixed(2)}%`} />
              <MiniCard label="CPC" value={`₹${formatMoney(ai.cpc)}`} />
              <MiniCard label="CPM" value={`₹${formatMoney(ai.cpm)}`} />
              <MiniCard label="Frequency" value={(ai.frequency || 0).toFixed(1)} />
              <MiniCard label="Meta Leads" value={String(ai.meta_leads || 0)} />
            </div>
          )}

          {ai?.error && (
            <div style={{
              padding: '14px 20px', borderRadius: 12, background: '#fffbeb',
              border: '1px solid #fde68a', color: '#92400e', fontSize: 13, marginBottom: 28,
              lineHeight: 1.5,
            }}>
              <strong>⚠️ Meta Insights unavailable:</strong> {ai.error}
              <br />
              <span style={{ fontSize: 12, color: '#a16207' }}>
                Your token may need <code>ads_read</code> permission. Go to Business Settings → System Users → Generate Token with ads_read.
              </span>
            </div>
          )}

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20, marginBottom: 28 }}>
            {/* Spend & Leads Chart */}
            <div style={{
              background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
              padding: '24px 24px 16px', minHeight: 300,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Spend vs Leads</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
                Daily advertising spend and leads received
              </div>
              {chartData.length > 0 ? (
                <DualBarChart data={chartData} />
              ) : (
                <div style={{ color: '#d1d5db', textAlign: 'center', paddingTop: 60 }}>No data for this period</div>
              )}
            </div>

            {/* Quality & Status */}
            <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 20 }}>
              {/* Quality Donut */}
              <div style={{
                background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
                padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24,
              }}>
                <DonutChart data={qualityData} size={110} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Lead Quality</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                    {qualityData.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ color: '#6b7280' }}>{d.label}</span>
                        <span style={{ fontWeight: 600 }}>{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Funnel */}
              <div style={{
                background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
                padding: '20px 24px',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Lead Status Funnel</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {statusFunnel.map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 72, fontSize: 11, color: '#6b7280', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
                      <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          height: '100%', borderRadius: 6,
                          background: d.color,
                          width: `${Math.max(2, (d.count / funnelMax) * 100)}%`,
                          transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                        }} />
                        <span style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 10, fontWeight: 600, color: '#374151',
                        }}>{d.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
            <QuickLink href="/fb-ads/campaigns" title="Campaigns" desc="View campaign → ad set → ad hierarchy with performance" icon="📈" />
            <QuickLink href="/fb-ads/leads" title="All FB Leads" desc="Rate quality, mark spam, filter and search" icon="👥" />
            <QuickLink href="/fb-ads/audience" title="Audience Insights" desc="Demographics, locations, platforms & placements" icon="🌍" />
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Sub Components ────────────────────────────────────────── */

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
      padding: '18px 20px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -8, right: -8, width: 60, height: 60,
        borderRadius: '50%', background: color, opacity: 0.06,
      }} />
      <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--foreground)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
      padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function QuickLink({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: string }) {
  return (
    <Link href={href} style={{
      background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
      padding: '20px 22px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = '#1877F2'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 1px #1877F2'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{desc}</div>
      </div>
      <svg style={{ marginLeft: 'auto', flexShrink: 0, color: '#d1d5db' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </Link>
  )
}

/* ─── Charts ────────────────────────────────────────────────── */

function DualBarChart({ data }: { data: { date: string; spend: number; leads: number }[] }) {
  if (!data.length) return null
  const maxSpend = Math.max(...data.map(d => d.spend), 1)
  const maxLeads = Math.max(...data.map(d => d.leads), 1)
  const H = 200
  const W = Math.max(600, data.length * 28)
  const barW = Math.min(20, Math.max(6, (W - 60) / data.length - 4))
  const padL = 50
  const padB = 32

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <svg width={W} height={H + padB + 4} viewBox={`0 0 ${W} ${H + padB + 4}`} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(frac => (
          <line key={frac} x1={padL} x2={W} y1={H - H * frac} y2={H - H * frac} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {/* Spend bars */}
        {data.map((d, i) => {
          const x = padL + i * ((W - padL) / data.length) + 2
          const h = (d.spend / maxSpend) * (H - 10)
          return (
            <g key={`spend-${i}`}>
              <rect x={x} y={H - h} width={barW} height={h} rx={3} fill="#1877F2" opacity={0.25} />
              <rect x={x} y={H - h} width={barW} height={Math.min(h, 4)} rx={2} fill="#1877F2" opacity={0.6} />
            </g>
          )
        })}
        {/* Leads line */}
        {data.length > 1 && (
          <polyline
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={data.map((d, i) => {
              const x = padL + i * ((W - padL) / data.length) + barW / 2 + 2
              const y = H - (d.leads / maxLeads) * (H - 10)
              return `${x},${y}`
            }).join(' ')}
          />
        )}
        {/* Lead dots */}
        {data.map((d, i) => {
          const x = padL + i * ((W - padL) / data.length) + barW / 2 + 2
          const y = H - (d.leads / maxLeads) * (H - 10)
          return d.leads > 0 ? (
            <circle key={`dot-${i}`} cx={x} cy={y} r={3.5} fill="#22c55e" stroke="var(--surface)" strokeWidth="2" />
          ) : null
        })}
        {/* X labels */}
        {data.map((d, i) => {
          if (data.length > 14 && i % Math.ceil(data.length / 10) !== 0) return null
          const x = padL + i * ((W - padL) / data.length) + barW / 2 + 2
          return (
            <text key={`lbl-${i}`} x={x} y={H + 16} textAnchor="middle" fontSize="9" fill="#9ca3af">
              {d.date.slice(5)}
            </text>
          )
        })}
        {/* Y labels */}
        <text x={padL - 6} y={12} textAnchor="end" fontSize="9" fill="#9ca3af">₹{formatCompact(maxSpend)}</text>
        <text x={padL - 6} y={H} textAnchor="end" fontSize="9" fill="#9ca3af">0</text>
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
          <div style={{ width: 12, height: 8, borderRadius: 2, background: '#1877F2', opacity: 0.35 }} />
          Spend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
          <div style={{ width: 12, height: 3, borderRadius: 2, background: '#22c55e' }} />
          Leads
        </div>
      </div>
    </div>
  )
}

function DonutChart({ data, size = 120 }: { data: { label: string; count: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 12 }}>No data</div>
  const r = size / 2 - 6
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const segments = data.map(d => {
    const pct = d.count / total
    const dashArray = `${pct * circumference} ${circumference}`
    const dashOffset = -offset * circumference
    offset += pct
    return { ...d, dashArray, dashOffset }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={14}
          strokeDasharray={seg.dashArray}
          strokeDashoffset={seg.dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--foreground)">
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#9ca3af">
        leads
      </text>
    </svg>
  )
}

/* ─── Formatters ────────────────────────────────────────────── */

function formatMoney(n: number) {
  if (!n && n !== 0) return '0'
  return Math.round(n).toLocaleString('en-IN')
}

function formatCompact(n: number) {
  if (n == null) return '0'
  if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr'
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(Math.round(n))
}
