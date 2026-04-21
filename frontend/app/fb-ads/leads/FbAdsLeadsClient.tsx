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
  form_id: string; leadgen_id: string
}

const QUALITY_OPTIONS = [
  { value: 'excellent', label: 'Excellent', color: '#22c55e', bg: '#dcfce7' },
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

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All Time', value: 'all' },
]

function dateRange(value: string) {
  if (value === 'all') return { from: '', to: '' }
  const days = parseInt(value) || 30
  const now = new Date()
  return { from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
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
  const [qualityDropdown, setQualityDropdown] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { from, to } = useMemo(() => dateRange(range), [range])

  const fetchLeads = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('date_from', from)
    if (to) params.set('date_to', to)
    if (tab === 'unrated') params.set('quality', 'unrated')
    else if (tab === 'quality') params.set('quality', 'excellent,good')
    if (tab === 'spam') params.set('spam', 'only')
    else params.set('spam', 'hide')
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)
    
    fetch(`/api/facebook-ads/leads?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => { setError('Failed to load leads'); setLoading(false) })
  }

  useEffect(() => { fetchLeads() }, [from, to, tab, statusFilter])

  useEffect(() => {
    if (!qualityDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setQualityDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [qualityDropdown])

  const filtered = useMemo(() => {
    if (!search) return leads
    const q = search.toLowerCase()
    return leads.filter(l =>
      l.name?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.campaign_name?.toLowerCase().includes(q) ||
      l.ad_name?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      String(l.lead_number).includes(q)
    )
  }, [leads, search])

  // Also filter by campaign if campaign filter set
  const finalLeads = useMemo(() => {
    if (!campaignFilter) return filtered
    return filtered.filter(l => l.campaign_name === campaignFilter)
  }, [filtered, campaignFilter])

  const campaigns = useMemo(() => {
    const set = new Set(leads.map(l => l.campaign_name).filter(Boolean))
    return Array.from(set).sort()
  }, [leads])

  const updateQuality = async (leadId: number, quality: string | null) => {
    setQualityDropdown(null)
    try {
      await fetch(`/api/facebook-ads/leads/${leadId}/quality`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      })
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, fb_lead_quality: quality } : l))
    } catch {}
  }

  const toggleSpam = async (lead: FbLead) => {
    const next = !lead.fb_is_spam
    try {
      await fetch(`/api/facebook-ads/leads/${lead.id}/spam`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_spam: next }),
      })
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, fb_is_spam: next } : l))
    } catch {}
  }

  const tabCounts = useMemo(() => {
    const all = leads.length
    const unrated = leads.filter(l => !l.fb_lead_quality && !l.fb_is_spam).length
    const quality = leads.filter(l => l.fb_lead_quality === 'excellent' || l.fb_lead_quality === 'good').length
    const spam = leads.filter(l => l.fb_is_spam).length
    return { all, unrated, quality, spam }
  }, [leads])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>FB Leads</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 2 }}>
            Rate quality, mark spam, and manage Facebook ad leads
          </p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} style={selectStyle}>
          {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? 'var(--surface-strong)' : 'transparent',
              color: tab === t.key ? 'var(--foreground)' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af' }}>
              {(tabCounts as any)[t.key] ?? ''}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search name, phone, campaign, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchLeads()}
          style={{ ...selectStyle, width: 280 }}
        />
        {campaigns.length > 1 && (
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} style={selectStyle}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          {['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted', 'Lost', 'Rejected'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#1877F2',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Loading leads...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {error && <div style={{ padding: '16px 20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 14 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Campaign / Ad</th>
                  <th style={thStyle}>City</th>
                  <th style={thStyle}>Budget</th>
                  <th style={thStyle}>Quality</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {finalLeads.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#d1d5db' }}>No leads found</td></tr>
                )}
                {finalLeads.map(lead => {
                  const qOpt = QUALITY_OPTIONS.find(q => q.value === lead.fb_lead_quality)
                  return (
                    <tr key={lead.id} style={{
                      borderBottom: '1px solid var(--border)',
                      opacity: lead.fb_is_spam ? 0.5 : 1,
                      textDecoration: lead.fb_is_spam ? 'line-through' : 'none',
                      transition: 'opacity 0.2s',
                    }}>
                      <td style={tdStyle}>
                        <Link href={`/leads/${lead.id}`} style={{ color: '#1877F2', fontWeight: 600, textDecoration: 'none' }}>
                          {lead.lead_number}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{lead.name || '—'}</div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{lead.phone || '—'}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          background: statusBg(lead.status), color: statusColor(lead.status),
                        }}>
                          {lead.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 12, maxWidth: 200 }}>
                          <div style={{ color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.campaign_name || '—'}
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.ad_name || lead.adset_name || ''}
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>{lead.city || '—'}</td>
                      <td style={tdStyle}>{lead.budget ? `₹${Math.round(lead.budget).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ ...tdStyle, position: 'relative' }}>
                        <button
                          onClick={() => setQualityDropdown(qualityDropdown === lead.id ? null : lead.id)}
                          style={{
                            padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            background: qOpt ? qOpt.bg : 'var(--surface-muted)', color: qOpt ? qOpt.color : '#9ca3af',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {qOpt ? qOpt.label : 'Rate'}
                        </button>
                        {qualityDropdown === lead.id && (
                          <div ref={dropdownRef} style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 50,
                            background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 120,
                          }}>
                            {QUALITY_OPTIONS.map(q => (
                              <button key={q.value} onClick={() => updateQuality(lead.id, q.value)} style={{
                                display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                                background: lead.fb_lead_quality === q.value ? q.bg : 'transparent',
                                color: q.color, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                borderRadius: 6, textAlign: 'left',
                              }}>
                                {q.label}
                              </button>
                            ))}
                            {lead.fb_lead_quality && (
                              <button onClick={() => updateQuality(lead.id, null)} style={{
                                display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                                background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer',
                                borderRadius: 6, textAlign: 'left', borderTop: '1px solid var(--border)', marginTop: 2,
                              }}>
                                Clear
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: '#9ca3af' }}>
                        {timeAgo(lead.created_at)}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Link href={`/leads/${lead.id}`} style={{
                            padding: '4px 8px', borderRadius: 6, background: '#f0f7ff', color: '#1877F2',
                            fontSize: 11, fontWeight: 500, textDecoration: 'none',
                          }}>
                            View
                          </Link>
                          <button onClick={() => toggleSpam(lead)} style={{
                            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: lead.fb_is_spam ? '#fef2f2' : '#f1f5f9',
                            color: lead.fb_is_spam ? '#dc2626' : '#64748b',
                            fontSize: 11, fontWeight: 500,
                          }}>
                            {lead.fb_is_spam ? 'Unspam' : 'Spam'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: '#9ca3af' }}>
            Showing {finalLeads.length} lead{finalLeads.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ──────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 14px', whiteSpace: 'nowrap' }
const selectStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

function statusBg(s: string) {
  const map: Record<string, string> = {
    New: '#ede9fe', Contacted: '#dbeafe', Quoted: '#fef3c7', 'Follow Up': '#fce7f3',
    Negotiation: '#f3e8ff', 'Awaiting Advance': '#ffedd5', Converted: '#dcfce7', Lost: '#fef2f2', Rejected: '#f1f5f9',
  }
  return map[s] || '#f1f5f9'
}
function statusColor(s: string) {
  const map: Record<string, string> = {
    New: '#6d28d9', Contacted: '#1d4ed8', Quoted: '#92400e', 'Follow Up': '#be185d',
    Negotiation: '#7c3aed', 'Awaiting Advance': '#c2410c', Converted: '#166534', Lost: '#dc2626', Rejected: '#475569',
  }
  return map[s] || '#475569'
}

function timeAgo(dateStr: string) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
