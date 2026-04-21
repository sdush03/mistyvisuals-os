'use client'

import { useEffect, useState, useMemo } from 'react'

type Campaign = {
  id: string; name: string; status: string; objective: string
  daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string
  spend: number; impressions: number; reach: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number
  adsets: AdSet[]
}
type AdSet = {
  id: string; name: string
  spend: number; impressions: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number
  ads: Ad[]
}
type Ad = {
  id: string; name: string
  spend: number; impressions: number; clicks: number; ctr: number
  meta_leads: number; cost_per_lead: number
  db_leads: number; quality_leads: number; spam_leads: number; converted: number
}

const METRIC_TIPS: Record<string, string> = {
  'Spend': 'Amount spent on this campaign/ad set/ad',
  'Leads': 'Leads received in your CRM from this ad',
  'Quality': 'Leads rated as Excellent or Good',
  'Spam': 'Leads marked as unwanted or irrelevant',
  'Converted': 'Leads that became paying clients',
  'CPL': 'Cost Per Lead — average spend to get one lead',
  'Impressions': 'Total times this ad was shown',
  'Clicks': 'Number of clicks on this ad',
  'CTR': 'Click-Through Rate — % who clicked after seeing',
  'Reach': 'Unique people who saw this ad',
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
    campaigns: filtered.length,
  }), [filtered])

  return (
    <div className="fb-camp" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .fb-camp .tip-wrap { position: relative; }
        .fb-camp .tip-wrap .tip-box {
          display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          background: #1e293b; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-size: 11px;
          white-space: normal; width: 180px; text-align: center; z-index: 50; pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .fb-camp .tip-wrap .tip-box::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #1e293b; }
        .fb-camp .tip-wrap:hover .tip-box { display: block; }
        .fb-camp .card { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); transition: box-shadow 0.2s; }
        @keyframes fbspin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Campaigns</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, marginTop: 2 }}>Campaign → Ad Set → Ad performance breakdown</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...selSt, width: 200 }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selSt}>
            <option value="all">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)} style={selSt}>
            {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Strip */}
      {!loading && !error && (
        <div className="card" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <span><span style={{ color: '#9ca3af' }}>Campaigns </span><strong>{totals.campaigns}</strong></span>
          <span><span style={{ color: '#9ca3af' }}>Total Spend </span><strong>₹{fmt(totals.spend)}</strong></span>
          <span><span style={{ color: '#9ca3af' }}>Total Leads </span><strong style={{ color: '#1877F2' }}>{totals.leads}</strong></span>
          <span><span style={{ color: '#9ca3af' }}>Avg CPL </span><strong>{totals.leads > 0 ? `₹${fmt(totals.spend / totals.leads)}` : '—'}</strong></span>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 70, color: '#9ca3af' }}><div style={{ width: 28, height: 28, border: '2.5px solid #e5e7eb', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'fbspin 0.7s linear infinite', margin: '0 auto 10px' }} />Loading campaigns…</div>}
      {error && <div style={{ padding: '14px 20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af', fontSize: 13 }}>No campaigns found</div>}

      {/* Campaign Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(c => {
          const open = expanded.has(c.id)
          return (
            <div key={c.id} className="card" style={{ overflow: 'hidden' }}>
              {/* Campaign Row */}
              <div onClick={() => toggle(c.id)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Chevron open={open} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{c.name || 'Unnamed Campaign'}</span>
                    <StatusBadge status={c.status} />
                    {c.objective && <span style={{ fontSize: 10, color: '#9ca3af', padding: '1px 6px', background: '#f8fafc', borderRadius: 4 }}>{c.objective.replace(/_/g, ' ')}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Metric label="Spend" value={`₹${fmt(c.spend)}`} />
                    <Metric label="Leads" value={String(c.db_leads)} primary />
                    <Metric label="Quality" value={String(c.quality_leads)} color="#10b981" />
                    <Metric label="Spam" value={String(c.spam_leads)} color="#94a3b8" />
                    <Metric label="Converted" value={String(c.converted)} color="#8b5cf6" />
                    <Metric label="CPL" value={c.cost_per_lead > 0 ? `₹${fmt(c.cost_per_lead)}` : '—'} />
                    <Metric label="Impressions" value={fmtK(c.impressions)} />
                    <Metric label="Clicks" value={fmtK(c.clicks)} />
                    <Metric label="CTR" value={`${(c.ctr || 0).toFixed(2)}%`} />
                  </div>
                </div>
                <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.id?.replace('act_', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: '5px 10px', borderRadius: 7, background: '#f0f7ff', color: '#1877F2', fontSize: 11, fontWeight: 500, textDecoration: 'none', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open
                </a>
              </div>

              {/* Ad Sets */}
              {open && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {c.adsets?.length ? c.adsets.map(as => {
                    const asKey = `${c.id}:${as.id}`
                    const asOpen = expandedAs.has(asKey)
                    return (
                      <div key={as.id}>
                        <div onClick={() => toggleAs(asKey)} style={{
                          padding: '12px 20px 12px 44px', cursor: 'pointer',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)',
                        }}>
                          <Chevron open={asOpen} size={13} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ad Set</span>
                              {as.name || 'Unnamed'}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <Metric label="Spend" value={`₹${fmt(as.spend)}`} small />
                              <Metric label="Leads" value={String(as.db_leads)} small primary />
                              <Metric label="Quality" value={String(as.quality_leads)} small color="#10b981" />
                              <Metric label="CPL" value={as.cost_per_lead > 0 ? `₹${fmt(as.cost_per_lead)}` : '—'} small />
                              <Metric label="Clicks" value={fmtK(as.clicks)} small />
                              <Metric label="CTR" value={`${(as.ctr || 0).toFixed(2)}%`} small />
                            </div>
                          </div>
                        </div>

                        {/* Ads */}
                        {asOpen && (
                          <div style={{ paddingLeft: 68, paddingRight: 20, paddingTop: 4, paddingBottom: 8, background: 'var(--surface)' }}>
                            {as.ads?.length ? as.ads.map(ad => (
                              <div key={ad.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                borderRadius: 10, margin: '3px 0', border: '1px solid var(--border)',
                                background: 'var(--surface)',
                              }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1877F2', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 9, fontWeight: 600, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ad</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name || 'Unnamed'}</span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                                  <Metric label="Spend" value={`₹${fmt(ad.spend)}`} small />
                                  <Metric label="Leads" value={String(ad.db_leads)} small primary />
                                  <Metric label="Quality" value={String(ad.quality_leads)} small color="#10b981" />
                                  <Metric label="Spam" value={String(ad.spam_leads)} small color="#94a3b8" />
                                  <Metric label="Conv" value={String(ad.converted)} small color="#8b5cf6" />
                                  <Metric label="CPL" value={ad.cost_per_lead > 0 ? `₹${fmt(ad.cost_per_lead)}` : '—'} small />
                                </div>
                              </div>
                            )) : (
                              <div style={{ padding: '10px 0', color: '#d1d5db', fontSize: 12 }}>No ads with data</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }) : (
                    <div style={{ padding: '16px 44px', color: '#d1d5db', fontSize: 12 }}>No ad sets found</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Components ──────────────────────── */

function Chevron({ open, size = 15 }: { open: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0)', flexShrink: 0, marginTop: 2 }}><polyline points="9 18 15 12 9 6" /></svg>
}

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, [string, string]> = { ACTIVE: ['#dcfce7', '#166534'], PAUSED: ['#fef3c7', '#92400e'], ARCHIVED: ['#f1f5f9', '#64748b'], DELETED: ['#fef2f2', '#dc2626'] }
  const [bg, fg] = c[status] || ['#f1f5f9', '#64748b']
  return <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 9, fontWeight: 600, background: bg, color: fg, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{status}</span>
}

function Metric({ label, value, small, primary, color }: { label: string; value: string; small?: boolean; primary?: boolean; color?: string }) {
  const tip = METRIC_TIPS[label]
  return (
    <span className={tip ? 'tip-wrap' : ''} style={{ fontSize: small ? 10 : 11, lineHeight: 1 }}>
      {tip && <span className="tip-box">{tip}</span>}
      <span style={{ color: '#9ca3af', marginRight: 3 }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || (primary ? '#1877F2' : '#374151') }}>{value}</span>
    </span>
  )
}

const selSt: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }
function fmt(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
function fmtK(n: number) { if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'; if (n >= 1e5) return (n/1e5).toFixed(1)+'L'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(Math.round(n||0)) }
