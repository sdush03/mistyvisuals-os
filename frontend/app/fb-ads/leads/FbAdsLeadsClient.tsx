'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'

type FbLead = {
  id: number; lead_number: number; name: string; phone: string; email: string
  status: string; source_name: string; city: string; event_type: string
  budget: number; amount_quoted: number
  fb_lead_quality: string | null; fb_is_spam: boolean
  created_at: string; assigned_user_name: string
  campaign_id: string; campaign_name: string
  adset_id: string; adset_name: string
  ad_id: string; ad_name: string
}

const QUALITY = [
  { value: 'excellent', label: 'Excellent', color: '#10b981', bg: '#dcfce7' },
  { value: 'good', label: 'Good', color: '#3b82f6', bg: '#dbeafe' },
  { value: 'average', label: 'Average', color: '#f59e0b', bg: '#fef3c7' },
  { value: 'poor', label: 'Poor', color: '#ef4444', bg: '#fef2f2' },
]

const TABS = [
  { key: 'all', label: 'All Leads' },
  { key: 'unrated', label: 'Unrated' },
  { key: 'quality', label: 'Quality' },
  { key: 'spam', label: 'Spam' },
]

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

export default function FbAdsLeads() {
  const [leads, setLeads] = useState<FbLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [range, setRange] = useState('30')
  const [statusFilter, setStatusFilter] = useState('')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [qualityDrop, setQualityDrop] = useState<number | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const { from, to } = useMemo(() => dateRange(range), [range])

  const fetchLeads = () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set('date_from', from); if (to) p.set('date_to', to)
    if (tab === 'unrated') p.set('quality', 'unrated')
    else if (tab === 'quality') p.set('quality', 'excellent,good')
    if (tab === 'spam') p.set('spam', 'only'); else p.set('spam', 'hide')
    if (statusFilter) p.set('status', statusFilter)
    if (search) p.set('search', search)
    fetch(`/api/facebook-ads/leads?${p}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setLeads(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setError('Failed to load leads'); setLoading(false) })
  }

  useEffect(() => { fetchLeads() }, [from, to, tab, statusFilter])

  useEffect(() => {
    if (!qualityDrop) return
    const handler = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setQualityDrop(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [qualityDrop])

  const filtered = useMemo(() => {
    let items = leads
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(l => l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.campaign_name?.toLowerCase().includes(q) || l.ad_name?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || String(l.lead_number).includes(q))
    }
    if (campaignFilter) items = items.filter(l => l.campaign_name === campaignFilter)
    return items
  }, [leads, search, campaignFilter])

  const campaigns = useMemo(() => Array.from(new Set(leads.map(l => l.campaign_name).filter(Boolean))).sort(), [leads])

  const updateQuality = async (id: number, quality: string | null) => {
    setQualityDrop(null)
    try {
      await fetch(`/api/facebook-ads/leads/${id}/quality`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }) })
      setLeads(prev => prev.map(l => l.id === id ? { ...l, fb_lead_quality: quality } : l))
    } catch {}
  }

  const toggleSpam = async (lead: FbLead) => {
    const next = !lead.fb_is_spam
    try {
      await fetch(`/api/facebook-ads/leads/${lead.id}/spam`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_spam: next }) })
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, fb_is_spam: next } : l))
    } catch {}
  }

  const tabCounts = useMemo(() => ({
    all: leads.length,
    unrated: leads.filter(l => !l.fb_lead_quality && !l.fb_is_spam).length,
    quality: leads.filter(l => l.fb_lead_quality === 'excellent' || l.fb_lead_quality === 'good').length,
    spam: leads.filter(l => l.fb_is_spam).length,
  }), [leads])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        @keyframes fbspin { to { transform: rotate(360deg) } }
        .fb-leads-tbl tr:hover td { background: #fafbfc; }
        .fb-leads-tbl .q-dropdown { position: absolute; top: 100%; left: 0; z-index: 50; background: var(--surface); border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 4px; min-width: 120px; }
        .fb-leads-tbl .q-dropdown button:hover { background: #f1f5f9; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>FB Leads</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, marginTop: 2 }}>Rate quality, mark spam, and manage leads</p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} style={selSt}>
          {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 14, background: '#f4f5f7', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
            background: tab === t.key ? 'var(--surface)' : 'transparent',
            color: tab === t.key ? 'var(--foreground)' : '#6b7280',
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}>
            {t.label}
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 500, color: '#9ca3af', background: tab === t.key ? '#f1f5f9' : 'transparent', padding: '1px 5px', borderRadius: 4 }}>
              {(tabCounts as any)[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search name, phone, campaign..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLeads()} style={{ ...selSt, width: 260, paddingLeft: 30 }} />
        </div>
        {campaigns.length > 1 && (
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} style={selSt}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selSt}>
          <option value="">All Statuses</option>
          {['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted', 'Lost', 'Rejected'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 70, color: '#9ca3af' }}><div style={{ width: 28, height: 28, border: '2.5px solid #e5e7eb', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'fbspin 0.7s linear infinite', margin: '0 auto 10px' }} />Loading leads…</div>}
      {error && <div style={{ padding: '14px 20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fb-leads-tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['#', 'Name', 'Phone', 'Status', 'Campaign / Ad', 'City', 'Budget', 'Quality', 'Created', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: '#fafbfc' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#d1d5db', fontSize: 13 }}>No leads found</td></tr>}
                {filtered.map(lead => {
                  const qOpt = QUALITY.find(q => q.value === lead.fb_lead_quality)
                  return (
                    <tr key={lead.id} style={{ opacity: lead.fb_is_spam ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                      <td style={tdSt}>
                        <Link href={`/leads/${lead.id}`} style={{ color: '#1877F2', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>{lead.lead_number}</Link>
                      </td>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: lead.fb_is_spam ? 'line-through' : 'none' }}>{lead.name || '—'}</div>
                      </td>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{lead.phone || '—'}</td>
                      <td style={tdSt}>
                        <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: stBg(lead.status), color: stFg(lead.status) }}>{lead.status}</span>
                      </td>
                      <td style={tdSt}>
                        <div style={{ maxWidth: 180 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.campaign_name || '—'}</div>
                          {lead.ad_name && <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.ad_name}</div>}
                        </div>
                      </td>
                      <td style={{ ...tdSt, color: '#6b7280' }}>{lead.city || '—'}</td>
                      <td style={tdSt}>{lead.budget ? `₹${Math.round(lead.budget).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ ...tdSt, position: 'relative' }}>
                        <button onClick={() => setQualityDrop(qualityDrop === lead.id ? null : lead.id)} style={{
                          padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: qOpt ? qOpt.bg : '#f4f5f7', color: qOpt ? qOpt.color : '#9ca3af',
                          fontSize: 10, fontWeight: 600,
                        }}>
                          {qOpt ? qOpt.label : 'Rate'}
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ marginLeft: 4, verticalAlign: 'middle' }}><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {qualityDrop === lead.id && (
                          <div ref={dropRef} className="q-dropdown">
                            {QUALITY.map(q => (
                              <button key={q.value} onClick={() => updateQuality(lead.id, q.value)} style={{
                                display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                                background: lead.fb_lead_quality === q.value ? q.bg : 'transparent',
                                color: q.color, fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 6, textAlign: 'left',
                              }}>{q.label}</button>
                            ))}
                            {lead.fb_lead_quality && (
                              <button onClick={() => updateQuality(lead.id, null)} style={{
                                display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                                background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer',
                                borderRadius: 6, textAlign: 'left', borderTop: '1px solid var(--border)', marginTop: 2,
                              }}>Clear</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdSt, fontSize: 10, color: '#9ca3af' }}>{timeAgo(lead.created_at)}</td>
                      <td style={tdSt}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Link href={`/leads/${lead.id}`} style={{ padding: '3px 8px', borderRadius: 5, background: '#f0f7ff', color: '#1877F2', fontSize: 10, fontWeight: 500, textDecoration: 'none' }}>View</Link>
                          <button onClick={() => toggleSpam(lead)} style={{
                            padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                            background: lead.fb_is_spam ? '#fef2f2' : '#f4f5f7',
                            color: lead.fb_is_spam ? '#dc2626' : '#9ca3af',
                            fontSize: 10, fontWeight: 500,
                          }}>{lead.fb_is_spam ? 'Unspam' : 'Spam'}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
            <span>Showing {filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
            <span>{tabCounts.quality} quality · {tabCounts.spam} spam · {tabCounts.unrated} unrated</span>
          </div>
        </div>
      )}
    </div>
  )
}

const tdSt: React.CSSProperties = { padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }
const selSt: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }

function stBg(s: string) { return ({ New: '#ede9fe', Contacted: '#dbeafe', Quoted: '#fef3c7', 'Follow Up': '#fce7f3', Negotiation: '#f3e8ff', 'Awaiting Advance': '#ffedd5', Converted: '#dcfce7', Lost: '#fef2f2', Rejected: '#f1f5f9' } as any)[s] || '#f1f5f9' }
function stFg(s: string) { return ({ New: '#6d28d9', Contacted: '#1d4ed8', Quoted: '#92400e', 'Follow Up': '#be185d', Negotiation: '#7c3aed', 'Awaiting Advance': '#c2410c', Converted: '#166534', Lost: '#dc2626', Rejected: '#475569' } as any)[s] || '#475569' }

function timeAgo(d: string) {
  if (!d) return '—'
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return `${m}m`; const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`; const days = Math.floor(h / 24)
  if (days < 30) return `${days}d`
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
