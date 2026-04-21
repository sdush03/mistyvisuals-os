'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type QuoteRow = {
  version_id: number
  version_number: number
  status: string
  calculated_price: number | null
  sales_override_price: number | null
  draft_data_json: any
  submitted_at: string
  approved_at?: string
  group_id: number
  quote_title: string
  lead_id: number
  lead_name: string
  lead_email: string | null
}

type ApiResponse = {
  pending: QuoteRow[]
  approved: QuoteRow[]
  rejected: QuoteRow[]
}

const apiFetch = (url: string, opts?: RequestInit) => fetch(url, { credentials: 'include', ...opts })
const formatMoney = (val: any) => `₹${Math.round(Number(val || 0)).toLocaleString('en-IN')}`

const toDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr)
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

const relativeTime = (dateStr: string | null) => {
  const d = toDate(dateStr)
  if (!d || isNaN(d.getTime())) return 'Unknown'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return 'Just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function extractTierInfo(draft: any) {
  if (!draft || !draft.tiers || draft.tiers.length === 0) return null
  const mode = draft.pricingMode || 'TIERED'
  let tiers = draft.tiers || []

  if (mode === 'SINGLE' && tiers.length > 0) {
    const activeId = draft.selectedTierId || tiers[0]?.id
    const sel = tiers.find((t: any) => t.id === activeId) || tiers[0]
    tiers = [sel]
  }

  return { mode, tiers }
}

function getDiscountBadge(systemPrice: number, clientPrice: number) {
  if (!systemPrice || clientPrice >= systemPrice) return null
  const pct = Math.round(((systemPrice - clientPrice) / systemPrice) * 100)
  if (pct <= 0) return null
  const color = pct > 10 ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'
  return { pct, color }
}

type SectionConfig = {
  key: 'pending' | 'approved' | 'rejected'
  title: string
  subtitle: string
  emptyIcon: string
  emptyTitle: string
  emptyDesc: string
  badgeColor: string
  badgeLabel: string
  badgeDot?: string
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'pending',
    title: 'Awaiting Approval',
    subtitle: 'Quotes submitted for admin review',
    emptyIcon: '⏳',
    emptyTitle: 'No pending quotes',
    emptyDesc: 'All submissions have been reviewed.',
    badgeColor: 'text-amber-600 bg-amber-50 border-amber-200',
    badgeLabel: 'Pending',
    badgeDot: 'bg-amber-400',
  },
  {
    key: 'approved',
    title: 'Recently Approved',
    subtitle: 'Approved quotes not yet sent to client',
    emptyIcon: '✅',
    emptyTitle: 'All clear',
    emptyDesc: 'No approved quotes waiting to be sent.',
    badgeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    badgeLabel: 'Approved',
    badgeDot: 'bg-emerald-400',
  },
  {
    key: 'rejected',
    title: 'Disapproved',
    subtitle: 'Quotes that need revision before resubmission',
    emptyIcon: '🔁',
    emptyTitle: 'Nothing here',
    emptyDesc: 'No disapproved quotes pending revision.',
    badgeColor: 'text-rose-500 bg-rose-50 border-rose-200',
    badgeLabel: 'Disapproved',
  },
]

export default function ApprovalsPage() {
  const [data, setData] = useState<ApiResponse>({ pending: [], approved: [], rejected: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const refreshRef = useRef<any>(null)
  const router = useRouter()

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [quotesRes, authRes] = await Promise.all([
        apiFetch('/api/pending-approvals'),
        apiFetch('/api/auth/me')
      ])
      if (!quotesRes.ok) throw new Error('Failed to load')
      const raw = await quotesRes.json()
      setData({
        pending: raw.pending || [],
        approved: raw.approved || [],
        rejected: raw.rejected || [],
      })
      const authData = await authRes.json()
      setRoles(Array.isArray(authData?.user?.roles) ? authData.user.roles : authData?.user?.role ? [authData.user.role] : [])
      setError('')
    } catch (e: any) { if (!silent) setError(e.message) }
    finally { if (!silent) setLoading(false) }
  }

  useEffect(() => {
    loadData()
    refreshRef.current = setInterval(() => loadData(true), 5000)
    return () => clearInterval(refreshRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAdmin = roles.includes('admin')

  const handleAction = async (versionId: number, action: 'approve' | 'reject', reason?: string) => {
    setBusy(versionId)
    try {
      const endpoint = action === 'approve'
        ? `/api/quote-versions/${versionId}/approve`
        : `/api/quote-versions/${versionId}/reject`
      const body = action === 'reject' ? { note: reason } : {}
      await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      await loadData(true)
    } catch {}
    finally { setBusy(null) }
  }

  const coupleNames = (q: QuoteRow) => {
    const draft = q.draft_data_json
    return draft?.hero?.coupleNames || q.lead_name
  }

  const totalCount = (data.pending?.length || 0) + (data.approved?.length || 0) + (data.rejected?.length || 0)

  const renderTiers = (q: QuoteRow) => {
    const tierInfo = extractTierInfo(q.draft_data_json)
    if (tierInfo) {
      return (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {tierInfo.tiers.map((t: any, idx: number) => {
            const sysPrice = Math.round(Number(t.price || 0))
            const clientPrice = Math.round(Number(t.discountedPrice ?? t.overridePrice ?? t.price ?? 0))
            const displayPrice = Math.round(Number(t.overridePrice ?? t.price ?? 0))
            const badge = getDiscountBadge(sysPrice, clientPrice)
            const isPopular = t.isPopular || String(t.name || '').toLowerCase().includes('signature')
            
            return (
              <div key={idx} className={`flex-1 min-w-[130px] max-w-[200px] bg-white border rounded-xl p-2.5 space-y-1 ${isPopular ? 'border-amber-200 ring-1 ring-amber-100' : 'border-neutral-200'}`}>
                <div className="flex items-center gap-1.5">
                  {isPopular && <span className="text-amber-500 text-[10px]">★</span>}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{t.name || `Tier ${idx + 1}`}</span>
                </div>
                <div className="text-[11px] text-neutral-400">
                  System: <span className="font-semibold text-neutral-600">{formatMoney(sysPrice)}</span>
                </div>
                {displayPrice !== sysPrice && (
                  <div className="text-[11px] text-neutral-400">
                    Display: <span className="font-semibold text-neutral-600">{formatMoney(displayPrice)}</span>
                  </div>
                )}
                {t.discountedPrice != null && (
                  <div className="text-[11px] text-neutral-400">
                    Client: <span className="font-bold text-neutral-900">{formatMoney(clientPrice)}</span>
                    {badge && (
                      <span className={`ml-1 inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.color}`}>
                        {badge.pct}% off
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }
    if (q.calculated_price) {
      return (
        <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
          <span>System: <span className="font-semibold text-neutral-700">{formatMoney(q.calculated_price)}</span></span>
          {q.sales_override_price && (
            <span>Override: <span className="font-semibold text-neutral-700">{formatMoney(q.sales_override_price)}</span></span>
          )}
        </div>
      )
    }
    return null
  }

  const renderRow = (q: QuoteRow, section: SectionConfig) => {
    const isBusy = busy === q.version_id
    const display = coupleNames(q)

    return (
      <div key={q.version_id} className="group/row hover:bg-neutral-50/80 transition">
        <div className="flex items-start gap-4 px-6 py-5">
          {/* Avatar */}
          <Link href={`/leads/${q.lead_id}/quotes/${q.version_id}`} className="shrink-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold shadow-sm group-hover/row:shadow-md transition border ${
              section.key === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' :
              section.key === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
              'bg-rose-50 text-rose-500 border-rose-100'
            }`}>
              {display.charAt(0).toUpperCase()}
            </div>
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <Link href={`/leads/${q.lead_id}/quotes/${q.version_id}`} className="min-w-0 flex-1">
                <div className="font-semibold text-neutral-900 text-[15px] truncate group-hover/row:text-blue-600 transition">
                  {display}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{q.quote_title || 'Untitled Quote'}</span>
                  <span className="bg-neutral-100 px-1.5 py-0.5 rounded text-[10px] font-mono">v{q.version_number}</span>
                  <span>· {section.key === 'approved' && q.approved_at ? `Approved ${relativeTime(q.approved_at)}` : relativeTime(q.submitted_at)}</span>
                </div>
              </Link>
              
              <div className="shrink-0">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${section.badgeColor}`}>
                  {section.badgeDot && <div className={`w-1.5 h-1.5 rounded-full ${section.badgeDot} animate-pulse`}></div>}
                  {section.badgeLabel}
                </span>
              </div>
            </div>

            {renderTiers(q)}

            {/* Admin Actions — only for pending */}
            {isAdmin && section.key === 'pending' && (
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  disabled={isBusy}
                  onClick={() => handleAction(q.version_id, 'approve')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition shadow-sm disabled:opacity-50"
                >
                  {isBusy ? '...' : '✓ Approve'}
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => {
                    const reason = window.prompt('Reason for disapproval:')
                    if (reason) handleAction(q.version_id, 'reject', reason)
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200 hover:bg-rose-100 transition disabled:opacity-50"
                >
                  ✗ Disapprove
                </button>
                <Link
                  href={`/leads/${q.lead_id}/quotes/${q.version_id}`}
                  className="px-3.5 py-1.5 rounded-xl bg-neutral-100 text-neutral-600 text-xs font-bold border border-neutral-200 hover:bg-neutral-200 transition"
                >
                  Open Builder
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6 animate-fade-in">
      {/* Hero Header */}
      <div className="relative bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-amber-50/50 via-orange-50/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-rose-50/40 via-pink-50/10 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-8 md:p-10">
          <div>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-neutral-900">Approvals</h2>
            <p className="text-sm text-neutral-500 font-light mt-2 max-w-md">
              {isAdmin 
                ? 'Review, approve, or disapprove sales quotations requiring authorization.'
                : 'Track the approval lifecycle of your submitted quotations.'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {data.pending.length > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></div>
                <span className="text-sm font-semibold text-amber-700">{data.pending.length} Pending</span>
              </div>
            )}
            <button
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition"
              onClick={() => loadData()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="text-rose-600 text-sm font-medium bg-rose-50 px-4 py-3 rounded-xl border border-rose-100">{error}</div>}

      {/* Tab Selector */}
      <div className="flex gap-2">
        {SECTIONS.map((s) => {
          const count = data[s.key]?.length || 0
          const isActive = activeTab === s.key
          return (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all border ${
                isActive
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {s.title}
              {count > 0 && (
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active Section */}
      {SECTIONS.filter(s => s.key === activeTab).map((section) => {
        const quotes = data[section.key] || []
        return (
          <div key={section.key} className="bg-white rounded-[2rem] border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
              <h3 className="text-base font-semibold text-neutral-900 mb-0.5">{section.title}</h3>
              <p className="text-xs text-neutral-500">{section.subtitle}</p>
            </div>

            <div className="divide-y divide-neutral-100 min-h-[180px]">
              {loading && quotes.length === 0 ? (
                <div className="text-center text-sm text-neutral-400 py-16">Loading…</div>
              ) : quotes.length === 0 ? (
                <div className="text-center py-14">
                  <div className="text-3xl mb-2">{section.emptyIcon}</div>
                  <div className="text-sm font-medium text-neutral-600">{section.emptyTitle}</div>
                  <div className="text-xs text-neutral-400 mt-1">{section.emptyDesc}</div>
                </div>
              ) : quotes.map((q) => renderRow(q, section))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
