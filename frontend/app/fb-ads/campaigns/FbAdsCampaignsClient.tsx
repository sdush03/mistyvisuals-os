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

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'All Time', value: 'all' },
]

function dateRange(value: string) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (value === 'all') return { from: '', to: '' }
  if (value === 'this_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) }
  if (value === 'last_month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) }
  }
  const days = parseInt(value) || 30
  return { from: fmt(new Date(Date.now() - days * 86400000)), to: fmt(now) }
}

export default function FbAdsCampaigns() {
  const [range, setRange] = useState('30')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (from) params.set('date_from', from)
    if (to) params.set('date_to', to)
    fetch(`/api/facebook-ads/campaigns?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setCampaigns(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load campaigns')
        setLoading(false)
      })
  }, [from, to])

  const filtered = useMemo(() => {
    let items = campaigns
    if (statusFilter !== 'all') {
      items = items.filter(c => c.status === statusFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.adsets?.some(as => as.name?.toLowerCase().includes(q) || as.ads?.some(ad => ad.name?.toLowerCase().includes(q)))
      )
    }
    return items
  }, [campaigns, statusFilter, search])

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAdset = (key: string) => {
    setExpandedAdsets(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const statuses = useMemo(() => {
    const s = new Set(campaigns.map(c => c.status).filter(Boolean))
    return Array.from(s)
  }, [campaigns])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 2 }}>
            Campaign → Ad Set → Ad hierarchy with performance metrics
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Search campaigns, ad sets, ads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', fontSize: 13, width: 240,
            }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)} style={selectStyle}>
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#1877F2',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Loading campaigns...
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

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 14 }}>
          No campaigns found
        </div>
      )}

      {/* Campaign Tree */}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(campaign => {
            const isOpen = expandedCampaigns.has(campaign.id)
            return (
              <div key={campaign.id} style={{
                background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                {/* Campaign Header */}
                <button
                  onClick={() => toggleCampaign(campaign.id)}
                  style={{
                    width: '100%', padding: '16px 20px', border: 'none', background: 'transparent',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Chevron open={isOpen} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{campaign.name || 'Unnamed Campaign'}</span>
                      <StatusPill status={campaign.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
                      <MetricChip label="Spent" value={`₹${fmt(campaign.spend)}`} />
                      <MetricChip label="Leads" value={String(campaign.db_leads)} highlight />
                      <MetricChip label="Quality" value={String(campaign.quality_leads)} color="#22c55e" />
                      <MetricChip label="Spam" value={String(campaign.spam_leads)} color="#94a3b8" />
                      <MetricChip label="Converted" value={String(campaign.converted)} color="#8b5cf6" />
                      <MetricChip label="CPL" value={campaign.cost_per_lead > 0 ? `₹${fmt(campaign.cost_per_lead)}` : '—'} />
                      <MetricChip label="Impressions" value={fmtK(campaign.impressions)} />
                      <MetricChip label="Clicks" value={fmtK(campaign.clicks)} />
                      <MetricChip label="CTR" value={`${(campaign.ctr || 0).toFixed(2)}%`} />
                    </div>
                  </div>
                  <a
                    href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${campaign.id?.replace('act_', '')}&selected_campaign_ids=${campaign.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      padding: '6px 10px', borderRadius: 8, background: '#f0f7ff', color: '#1877F2',
                      fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
                    }}
                  >
                    Open ↗
                  </a>
                </button>

                {/* Ad Sets */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingLeft: 24 }}>
                    {campaign.adsets && campaign.adsets.length > 0 ? campaign.adsets.map(adset => {
                      const asKey = `${campaign.id}:${adset.id}`
                      const asOpen = expandedAdsets.has(asKey)
                      return (
                        <div key={adset.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <button
                            onClick={() => toggleAdset(asKey)}
                            style={{
                              width: '100%', padding: '12px 16px', border: 'none', background: 'transparent',
                              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <Chevron open={asOpen} size={14} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                                <span style={{ color: '#9ca3af', fontWeight: 400, marginRight: 6, fontSize: 11 }}>AD SET</span>
                                {adset.name || 'Unnamed Ad Set'}
                              </div>
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                                <MetricChip label="Spent" value={`₹${fmt(adset.spend)}`} small />
                                <MetricChip label="Leads" value={String(adset.db_leads)} small highlight />
                                <MetricChip label="Quality" value={String(adset.quality_leads)} small color="#22c55e" />
                                <MetricChip label="CPL" value={adset.cost_per_lead > 0 ? `₹${fmt(adset.cost_per_lead)}` : '—'} small />
                                <MetricChip label="Clicks" value={fmtK(adset.clicks)} small />
                              </div>
                            </div>
                          </button>

                          {/* Ads */}
                          {asOpen && adset.ads && adset.ads.length > 0 && (
                            <div style={{ paddingLeft: 28, paddingBottom: 8 }}>
                              {adset.ads.map(ad => (
                                <div key={ad.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '10px 14px', borderRadius: 10, margin: '4px 8px 4px 0',
                                  background: 'var(--surface-muted)', fontSize: 13,
                                }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1877F2', flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, color: '#374151' }}>
                                      <span style={{ color: '#9ca3af', fontWeight: 400, marginRight: 6, fontSize: 10 }}>AD</span>
                                      {ad.name || 'Unnamed Ad'}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                                    <MetricChip label="₹" value={fmt(ad.spend)} small />
                                    <MetricChip label="Leads" value={String(ad.db_leads)} small highlight />
                                    <MetricChip label="Qlty" value={String(ad.quality_leads)} small color="#22c55e" />
                                    <MetricChip label="Spam" value={String(ad.spam_leads)} small color="#94a3b8" />
                                    <MetricChip label="Conv" value={String(ad.converted)} small color="#8b5cf6" />
                                    <MetricChip label="CPL" value={ad.cost_per_lead > 0 ? `₹${fmt(ad.cost_per_lead)}` : '—'} small />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {asOpen && (!adset.ads || adset.ads.length === 0) && (
                            <div style={{ padding: '12px 40px', color: '#d1d5db', fontSize: 12 }}>No ads with data</div>
                          )}
                        </div>
                      )
                    }) : (
                      <div style={{ padding: '16px 20px', color: '#d1d5db', fontSize: 13 }}>No ad sets found</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Sub Components ──────────────────── */

function Chevron({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: '#dcfce7', text: '#166534' },
    PAUSED: { bg: '#fef3c7', text: '#92400e' },
    ARCHIVED: { bg: '#f1f5f9', text: '#64748b' },
    DELETED: { bg: '#fef2f2', text: '#dc2626' },
  }
  const c = colors[status] || { bg: '#f1f5f9', text: '#64748b' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {status}
    </span>
  )
}

function MetricChip({ label, value, small, highlight, color }: {
  label: string; value: string; small?: boolean; highlight?: boolean; color?: string
}) {
  return (
    <span style={{
      fontSize: small ? 11 : 12,
      color: color || (highlight ? '#1877F2' : '#6b7280'),
      fontWeight: highlight ? 600 : 400,
    }}>
      <span style={{ color: '#9ca3af', marginRight: 3 }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || (highlight ? '#1877F2' : '#374151') }}>{value}</span>
    </span>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

function fmt(n: number) {
  if (!n && n !== 0) return '0'
  return Math.round(n).toLocaleString('en-IN')
}
function fmtK(n: number) {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr'
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(Math.round(n || 0))
}
