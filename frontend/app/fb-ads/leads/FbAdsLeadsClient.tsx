'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'

type FbLead = {
  id: number; lead_number: number; name: string; phone: string; email: string
  status: string; source_name: string; city: string; event_type: string
  budget: number; amount_quoted: number
  fb_lead_quality: string | null; fb_is_spam: boolean
  created_at: string; assigned_user_name: string
  campaign_name: string; ad_name: string; adset_name: string
}

const QUALITY = [
  { value: 'excellent', label: 'Excellent', tw: 'bg-emerald-50 text-emerald-700' },
  { value: 'good', label: 'Good', tw: 'bg-blue-50 text-blue-700' },
  { value: 'average', label: 'Average', tw: 'bg-amber-50 text-amber-700' },
  { value: 'poor', label: 'Poor', tw: 'bg-rose-50 text-rose-700' },
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

const STATUS_TW: Record<string, string> = {
  New: 'bg-indigo-50 text-indigo-700', Contacted: 'bg-blue-50 text-blue-700', Quoted: 'bg-amber-50 text-amber-700',
  'Follow Up': 'bg-pink-50 text-pink-700', Negotiation: 'bg-purple-50 text-purple-700', 'Awaiting Advance': 'bg-orange-50 text-orange-700',
  Converted: 'bg-emerald-50 text-emerald-700', Lost: 'bg-rose-50 text-rose-700', Rejected: 'bg-neutral-100 text-neutral-500',
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
      items = items.filter(l => l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.campaign_name?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || String(l.lead_number).includes(q))
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
    <div className="max-w-[1400px] px-6 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">FB Leads</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Rate quality, mark spam, and manage leads</p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
          {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? 'bg-white text-neutral-900 shadow-sm font-semibold' : 'text-neutral-500 hover:text-neutral-700'
            }`}>
            {t.label}
            <span className="ml-1.5 text-[10px] text-neutral-400">{(tabCounts as any)[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search name, phone, campaign..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLeads()}
            className="pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
        {campaigns.length > 1 && (
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
          <option value="">All Statuses</option>
          {['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted', 'Lost', 'Rejected'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[2.5px] border-neutral-200 border-t-[#1877F2] rounded-full animate-spin" /></div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/80">
                  {['#', 'Name', 'Phone', 'Status', 'Campaign / Ad', 'City', 'Budget', 'Quality', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={10} className="text-center py-16 text-neutral-400 text-sm">No leads found</td></tr>}
                {filtered.map(lead => {
                  const qOpt = QUALITY.find(q => q.value === lead.fb_lead_quality)
                  return (
                    <tr key={lead.id} className={`border-b border-neutral-100 hover:bg-neutral-50/50 transition ${lead.fb_is_spam ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/leads/${lead.id}`} className="text-[#1877F2] font-semibold text-xs hover:underline">{lead.lead_number}</Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-medium text-neutral-900 text-xs ${lead.fb_is_spam ? 'line-through' : ''}`}>{lead.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-neutral-500">{lead.phone || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_TW[lead.status] || 'bg-neutral-100 text-neutral-500'}`}>{lead.status}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <div className="text-xs font-medium text-neutral-800 truncate">{lead.campaign_name || '—'}</div>
                        {lead.ad_name && <div className="text-[10px] text-neutral-400 truncate">{lead.ad_name}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-500">{lead.city || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{lead.budget ? `₹${Math.round(lead.budget).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap relative">
                        <button onClick={() => setQualityDrop(qualityDrop === lead.id ? null : lead.id)}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition inline-flex items-center gap-1 ${
                            qOpt ? qOpt.tw : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                          }`}>
                          {qOpt ? qOpt.label : 'Rate'}
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {qualityDrop === lead.id && (
                          <div ref={dropRef} className="absolute top-full left-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-1 min-w-[110px] mt-1">
                            {QUALITY.map(q => (
                              <button key={q.value} onClick={() => updateQuality(lead.id, q.value)}
                                className={`block w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-neutral-50 transition ${
                                  lead.fb_lead_quality === q.value ? q.tw : 'text-neutral-600'
                                }`}>{q.label}</button>
                            ))}
                            {lead.fb_lead_quality && (
                              <button onClick={() => updateQuality(lead.id, null)}
                                className="block w-full text-left px-3 py-1.5 text-xs text-neutral-400 rounded-lg hover:bg-neutral-50 border-t border-neutral-100 mt-1">Clear</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-neutral-400">{timeAgo(lead.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <Link href={`/leads/${lead.id}`} className="text-[10px] font-medium text-[#1877F2] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition">View</Link>
                          <button onClick={() => toggleSpam(lead)}
                            className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition ${
                              lead.fb_is_spam ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-neutral-400 bg-neutral-100 hover:bg-neutral-200'
                            }`}>{lead.fb_is_spam ? 'Unspam' : 'Spam'}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-neutral-100 text-xs text-neutral-400 flex justify-between">
            <span>Showing {filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
            <span>{tabCounts.quality} quality · {tabCounts.spam} spam · {tabCounts.unrated} unrated</span>
          </div>
        </div>
      )}
    </div>
  )
}

function timeAgo(d: string) {
  if (!d) return '—'
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return `${m}m`; const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`; const days = Math.floor(h / 24)
  if (days < 30) return `${days}d`
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
