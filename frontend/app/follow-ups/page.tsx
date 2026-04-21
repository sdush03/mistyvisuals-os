'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toISTISOString } from '@/lib/formatters'
import FollowUpActionPopup from '@/components/FollowUpActionPopup'
import { getAutoNegotiationPromptText, mapAutoNegotiationReasonToFocus } from '@/lib/autoNegotiation'

type FollowupLead = {
  id: number
  name: string
  status: string
  heat: 'Hot' | 'Warm' | 'Cold'
  source?: string | null
  created_at?: string | null
  next_followup_date?: string | null
  last_followup_outcome?: string | null
  last_not_connected_at?: string | null
  not_contacted_count?: number | null
  phone_primary?: string | null
  client_budget_amount?: number | null
  coverage_scope?: string | null
  amount_quoted?: number | null
}

type FollowupSuccessMeta = {
  outcome?: string
  status?: string
  discussedPricing?: boolean
}

type FollowupUpdatedLead = {
  id?: number | string
  status?: string
  next_followup_date?: string | null
  auto_contacted?: boolean
  intake_completed?: boolean
  auto_negotiation?: { attempted?: boolean; success?: boolean; reason?: string }
  last_followup_outcome?: string | null
  last_not_connected_at?: string | null
  not_contacted_count?: number | null
  [key: string]: unknown
}

const TERMINAL = ['Converted', 'Lost', 'Rejected']

const dateToYMD = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const toDateOnly = (value?: string | null) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return dateToYMD(parsed)
  }
  return value.split('T')[0].split(' ')[0]
}

const formatDateDisplay = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

const formatRelativeAttempt = (value?: string | null) => {
  if (!value) return ''
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return ''
  const today = dateToYMD(new Date())
  if (dateOnly === today) return 'Today'
  if (dateOnly < today) {
    const days = daysBetween(dateOnly, today)
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  const days = daysBetween(today, dateOnly)
  return days === 1 ? 'In 1 day' : `In ${days} days`
}

const daysBetween = (fromDate: string, toDate: string) => {
  const start = new Date(`${fromDate}T00:00:00`)
  const end = new Date(`${toDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

const heatPill = (heat: FollowupLead['heat']) => {
  if (heat === 'Hot') return 'bg-red-100 text-red-700'
  if (heat === 'Cold') return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-700'
}

const statusPriority = (status?: string | null) => (status === 'Awaiting Advance' ? 0 : 1)

export default function FollowupsPage() {
  const [leads, setLeads] = useState<FollowupLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [popupLead, setPopupLead] = useState<FollowupLead | null>(null)
  const [popupDefaultDone, setPopupDefaultDone] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [autoNegotiationError, setAutoNegotiationError] = useState<{
    reason: string
    focus: string | null
    leadId: number
  } | null>(null)
  const [autoNegotiationFixDialog, setAutoNegotiationFixDialog] = useState<{
    reason: string
    focus: string | null
    leadId: number
  } | null>(null)
  const [autoContactedPrompt, setAutoContactedPrompt] = useState<{
    message: string
    leadId: number
    forceIntake: boolean
  } | null>(null)
  const [negotiationStatusNotice, setNegotiationStatusNotice] = useState<{
    message: string
    leadId: number
  } | null>(null)
  const [showNegotiationEditPrompt, setShowNegotiationEditPrompt] = useState<number | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const fromParam =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/follow-ups'
  const buildLeadHref = (leadId: number) => {
    const params = new URLSearchParams()
    params.set('tab', 'dashboard')
    params.set('from', fromParam)
    return `/leads/${leadId}?${params.toString()}`
  }

  const loadLeads = () => {
    setLoading(true)
    setError('')
    fetch('/api/follow-ups', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load follow-ups right now.')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadLeads()
  }, [])

  // Scroll restore is handled globally by ScrollRestoration.

  useEffect(() => {
    if (!actionFeedback) return
    const timer = window.setTimeout(() => setActionFeedback(null), 2200)
    return () => window.clearTimeout(timer)
  }, [actionFeedback])

  const todayStr = dateToYMD(new Date())

  const filtered = useMemo(() => {
    return leads.filter(l => !TERMINAL.includes(l.status))
  }, [leads])

  const todayLeads = useMemo(() => {
    return filtered
      .filter(l => {
        if (l.status === 'New') return false
        const nextDate = toDateOnly(l.next_followup_date)
        if (!nextDate) return false
        return nextDate === todayStr
      })
      .sort((a, b) => {
        const aPriority = statusPriority(a.status)
        const bPriority = statusPriority(b.status)
        if (aPriority !== bPriority) return aPriority - bPriority
        return toDateOnly(a.next_followup_date).localeCompare(toDateOnly(b.next_followup_date))
      })
  }, [filtered, todayStr])

  const overdueLeads = useMemo(() => {
    return filtered
      .filter(l =>
        l.status !== 'New' &&
        l.next_followup_date &&
        toDateOnly(l.next_followup_date) < todayStr
      )
      .sort((a, b) => {
        const aNotConnected = a.last_followup_outcome === 'Not connected' ? 1 : 0
        const bNotConnected = b.last_followup_outcome === 'Not connected' ? 1 : 0
        if (aNotConnected !== bNotConnected) return aNotConnected - bNotConnected
        const aPriority = statusPriority(a.status)
        const bPriority = statusPriority(b.status)
        if (aPriority !== bPriority) return aPriority - bPriority
        return toDateOnly(a.next_followup_date).localeCompare(toDateOnly(b.next_followup_date))
      })
  }, [filtered, todayStr])

  const newUntouchedLeads = useMemo(() => {
    return filtered
      .filter(l => l.status === 'New' && !toDateOnly(l.next_followup_date))
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
  }, [filtered])

  const newNotContactedLeads = useMemo(() => {
    return filtered
      .filter(l => l.status === 'New')
      .filter(l => {
        const nextDate = toDateOnly(l.next_followup_date)
        if (!nextDate) return false
        return nextDate <= todayStr
      })
      .sort((a, b) => {
        const aDate = toDateOnly(a.next_followup_date)
        const bDate = toDateOnly(b.next_followup_date)
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      })
  }, [filtered, todayStr])

  const actionItems = useMemo(() => {
    const items: { key: string; lead: FollowupLead }[] = []
    newUntouchedLeads.forEach(lead => items.push({ key: `new-${lead.id}`, lead }))
    newNotContactedLeads.forEach(lead => items.push({ key: `new-${lead.id}`, lead }))
    todayLeads.forEach(lead => items.push({ key: `due-${lead.id}`, lead }))
    overdueLeads.forEach(lead => items.push({ key: `overdue-${lead.id}`, lead }))
    return items
  }, [newUntouchedLeads, newNotContactedLeads, todayLeads, overdueLeads])

  useEffect(() => {
    if (!focusedKey) return
    if (!actionItems.find(item => item.key === focusedKey)) {
      setFocusedKey(null)
    }
  }, [actionItems, focusedKey])

  const openFollowupPopup = (lead: FollowupLead) => {
    setPopupLead(lead)
    setPopupDefaultDone(true)
  }

  const allEmpty =
    newUntouchedLeads.length === 0 &&
    newNotContactedLeads.length === 0 &&
    todayLeads.length === 0 &&
    overdueLeads.length === 0

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return target.isContentEditable
    }
    const focusByIndex = (index: number) => {
      const item = actionItems[index]
      if (!item) return
      const node = itemRefs.current[item.key]
      node?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if (e.key === '?') {
        e.preventDefault()
        setShowShortcuts(true)
        return
      }

      if (showShortcuts) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowShortcuts(false)
        }
        return
      }

      if (popupLead) return

      if (e.key === 'Escape') {
        setFocusedKey(null)
        return
      }

      if (!actionItems.length) return

      const currentIndex = focusedKey
        ? actionItems.findIndex(item => item.key === focusedKey)
        : -1

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        const nextIndex = Math.min(actionItems.length - 1, currentIndex + 1)
        focusByIndex(nextIndex)
        return
      }

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const prevIndex = Math.max(0, currentIndex > -1 ? currentIndex - 1 : 0)
        focusByIndex(prevIndex)
        return
      }

      if (e.key === 'Enter') {
        if (currentIndex === -1) return
        const item = actionItems[currentIndex]
        if (!item) return
        e.preventDefault()
        openFollowupPopup(item.lead)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actionItems, focusedKey, popupLead, showShortcuts])

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="max-w-[1400px] px-2 md:px-6 py-8 space-y-6">
      {/* Hero Header */}
      <div className="relative bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-amber-50/40 via-orange-50/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-emerald-50/30 via-teal-50/10 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-8 md:p-10">
          <div>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-neutral-900">Daily Actions</h2>
            <p className="text-sm text-neutral-500 font-light mt-2 max-w-md">
              {allEmpty && !loading
                ? "You're all caught up — no pending actions today!"
                : "See what needs attention today and clear your queue."
              }
            </p>
            {actionFeedback && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {actionFeedback}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              className="rounded-full bg-white/80 backdrop-blur-sm border border-neutral-200 px-3 py-1.5 text-[11px] font-medium text-neutral-600 hover:border-neutral-300 transition shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              onClick={() => setShowShortcuts(true)}
            >
              Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] font-bold mx-0.5">?</kbd> for shortcuts
            </button>
            <button
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 transition"
              onClick={loadLeads}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-xs text-neutral-500 mb-2">New to Contact</div>
          <div className="text-2xl font-semibold text-blue-600 tracking-tight">
            {loading ? '-' : newUntouchedLeads.length + newNotContactedLeads.length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-xs text-neutral-500 mb-2">Due Today</div>
          <div className="text-2xl font-semibold text-neutral-900 tracking-tight">
            {loading ? '-' : todayLeads.length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-xs text-neutral-500 mb-2">Overdue</div>
          <div className="text-2xl font-semibold text-neutral-900 tracking-tight">
            {loading ? '-' : overdueLeads.length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-xs text-neutral-500 mb-2">Total Queue</div>
          <div className="text-2xl font-semibold text-neutral-900 tracking-tight">
            {loading ? '-' : actionItems.length}
          </div>
          {!loading && actionItems.length > 0 && (
            <div className="mt-2 w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, Math.min(100, ((actionItems.length - (newUntouchedLeads.length + newNotContactedLeads.length + todayLeads.length + overdueLeads.length)) / Math.max(1, actionItems.length)) * 100))}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {loading && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center text-sm text-neutral-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          Loading follow-ups…
        </div>
      )}
      {!loading && error && (
        <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-600 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          {error}
        </div>
      )}

      {!loading && !error && allEmpty && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-4xl mb-4">🎉</div>
          <div className="text-lg font-semibold text-neutral-900">You're all caught up!</div>
          <p className="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
            No pending actions for today. Great work keeping your pipeline clean.
          </p>
        </div>
      )}

      {!loading && !error && !allEmpty && (
        <div className="space-y-6">

          {/* ── Section: New Leads ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
            <button
              onClick={() => toggleSection('new')}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50/50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-neutral-900">New Leads to Contact</div>
                  <div className="text-xs text-neutral-500">First-time outreach needed</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-blue-600">{newUntouchedLeads.length + newNotContactedLeads.length}</span>
                <svg className={`w-4 h-4 text-neutral-400 transition-transform ${collapsedSections['new'] ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {!collapsedSections['new'] && (
              <div className="border-t border-neutral-100">
                {newUntouchedLeads.length === 0 && newNotContactedLeads.length === 0 ? (
                  <div className="px-6 py-5 text-sm text-neutral-400 text-center">No new leads to contact — nice work!</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {newUntouchedLeads.map(lead => {
                      const actionKey = `new-${lead.id}`
                      return (
                        <a
                          key={actionKey}
                          data-action-key={actionKey}
                          ref={el => { itemRefs.current[actionKey] = el }}
                          href={buildLeadHref(lead.id)}
                          onFocus={() => setFocusedKey(actionKey)}
                          onBlur={() => {
                            requestAnimationFrame(() => {
                              const active = document.activeElement as HTMLElement | null
                              const activeKey = active?.closest?.('[data-action-key]')?.getAttribute('data-action-key')
                              if (activeKey) return
                              if (focusedKey === actionKey) setFocusedKey(null)
                            })
                          }}
                          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm hover:bg-neutral-50 transition focus-visible:outline-none ${
                            focusedKey === actionKey ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-200/60' : ''
                          }`}
                        >
                          <div className="min-w-[200px]">
                            <div className="font-medium text-neutral-900">{lead.name || 'Unnamed Lead'}</div>
                            {lead.not_contacted_count ? (
                              <div className="text-xs text-neutral-500 mt-0.5">
                                Last attempted: {formatRelativeAttempt(lead.last_not_connected_at) || '—'} · Attempts: {lead.not_contacted_count ?? 0}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-xs text-neutral-500">{lead.source || '—'}</div>
                          <div className="text-xs text-neutral-500">{formatDateDisplay(lead.created_at)}</div>
                          <div className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-700">New</div>
                          <button
                            className="rounded-full bg-blue-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-blue-700 transition shadow-sm"
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              openFollowupPopup(lead)
                            }}
                          >
                            Contact
                          </button>
                        </a>
                      )
                    })}
                    {newNotContactedLeads.length > 0 && (
                      <div className="px-6 py-2 text-[10px] uppercase tracking-widest text-neutral-400 font-bold bg-neutral-50">
                        Pending outreach
                      </div>
                    )}
                    {newNotContactedLeads.map(lead => {
                      const actionKey = `new-${lead.id}`
                      return (
                        <a
                          key={actionKey}
                          data-action-key={actionKey}
                          ref={el => { itemRefs.current[actionKey] = el }}
                          href={buildLeadHref(lead.id)}
                          onFocus={() => setFocusedKey(actionKey)}
                          onBlur={() => {
                            requestAnimationFrame(() => {
                              const active = document.activeElement as HTMLElement | null
                              const activeKey = active?.closest?.('[data-action-key]')?.getAttribute('data-action-key')
                              if (activeKey) return
                              if (focusedKey === actionKey) setFocusedKey(null)
                            })
                          }}
                          className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm hover:bg-neutral-50 transition focus-visible:outline-none ${
                            focusedKey === actionKey ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-200/60' : ''
                          }`}
                        >
                          <div className="min-w-[200px]">
                            <div className="font-medium text-neutral-900 flex items-center gap-2">
                              {lead.name || 'Unnamed Lead'}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {lead.phone_primary && (
                                <span className="flex items-center gap-1 text-neutral-700">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                  {lead.phone_primary}
                                </span>
                              )}

                              {lead.not_contacted_count ? (
                                <span className="text-neutral-500">
                                  · Attempted {lead.not_contacted_count}x
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                              {lead.amount_quoted ? (
                                <span>Quoted: ₹{Number(lead.amount_quoted).toLocaleString('en-IN')}</span>
                              ) : lead.client_budget_amount ? (
                                <span>Budget: ₹{Number(lead.client_budget_amount).toLocaleString('en-IN')}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-xs text-neutral-500">{lead.source || '—'}</div>
                          <div className="text-xs text-neutral-500">{formatDateDisplay(lead.created_at)}</div>
                          <div className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-700">New</div>
                          <button
                            className="rounded-full bg-blue-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-blue-700 transition shadow-sm"
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              openFollowupPopup(lead)
                            }}
                          >
                            Contact
                          </button>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Section: Due Today ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
            <button
              onClick={() => toggleSection('today')}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50/50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-neutral-900">Follow-ups Due Today</div>
                  <div className="text-xs text-neutral-500">Scheduled for today</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-600">{todayLeads.length}</span>
                <svg className={`w-4 h-4 text-neutral-400 transition-transform ${collapsedSections['today'] ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {!collapsedSections['today'] && (
              <div className="border-t border-neutral-100">
                {todayLeads.length === 0 ? (
                  <div className="px-6 py-5 text-sm text-neutral-400 text-center">No follow-ups scheduled for today 🎉</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {(() => {
                      const connected = todayLeads.filter(l => l.last_followup_outcome !== 'Not connected')
                      const notConnected = todayLeads.filter(l => l.last_followup_outcome === 'Not connected')
                      const renderLead = (lead: FollowupLead) => {
                        const actionKey = `due-${lead.id}`
                        return (
                          <a
                            key={actionKey}
                            data-action-key={actionKey}
                            ref={el => { itemRefs.current[actionKey] = el }}
                            href={buildLeadHref(lead.id)}
                            onFocus={() => setFocusedKey(actionKey)}
                            onBlur={() => {
                              requestAnimationFrame(() => {
                                const active = document.activeElement as HTMLElement | null
                                const activeKey = active?.closest?.('[data-action-key]')?.getAttribute('data-action-key')
                                if (activeKey) return
                                if (focusedKey === actionKey) setFocusedKey(null)
                              })
                            }}
                            className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm hover:bg-neutral-50 transition focus-visible:outline-none ${
                              focusedKey === actionKey ? 'bg-emerald-50/30 ring-1 ring-inset ring-emerald-200/60' : ''
                            }`}
                          >
                            <div className="min-w-[200px]">
                              <div className="font-medium text-neutral-900 flex items-center gap-2">
                                {lead.name || 'Unnamed Lead'}
                              </div>
                              <div className="text-xs text-neutral-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {lead.phone_primary && (
                                  <span className="flex items-center gap-1 text-neutral-700">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    {lead.phone_primary}
                                  </span>
                                )}

                                {lead.not_contacted_count ? (
                                  <span className="text-neutral-500">
                                    · Attempted {lead.not_contacted_count}x
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">
                                {lead.amount_quoted ? (
                                  <span>Quoted: ₹{Number(lead.amount_quoted).toLocaleString('en-IN')}</span>
                                ) : lead.client_budget_amount ? (
                                  <span>Budget: ₹{Number(lead.client_budget_amount).toLocaleString('en-IN')}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-xs text-neutral-600">{lead.status}</div>
                            <div className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${heatPill(lead.heat)} ${
                              lead.heat === 'Hot' ? 'border-red-200' : lead.heat === 'Cold' ? 'border-blue-200' : 'border-amber-200'
                            }`}>
                              {lead.heat}
                            </div>
                            <div className="text-xs text-neutral-500">{formatDateDisplay(lead.next_followup_date)}</div>
                            <button
                              className="rounded-full bg-emerald-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-emerald-700 transition shadow-sm"
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                openFollowupPopup(lead)
                              }}
                            >
                              Do Follow-up
                            </button>
                          </a>
                        )
                      }
                      return (
                        <>
                          {connected.map(renderLead)}
                          {notConnected.length > 0 && (
                            <div className="px-6 py-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold bg-neutral-50">
                              Not connected attempts
                            </div>
                          )}
                          {notConnected.map(renderLead)}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Section: Overdue ── */}
          <div id="section-overdue" className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
            <button
              onClick={() => toggleSection('overdue')}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50/50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-neutral-900">Overdue Follow-ups</div>
                  <div className="text-xs text-neutral-500">Missed their scheduled date</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {overdueLeads.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{overdueLeads.length}</span>
                )}
                <svg className={`w-4 h-4 text-neutral-400 transition-transform ${collapsedSections['overdue'] ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {!collapsedSections['overdue'] && (
              <div className="border-t border-neutral-100">
                {overdueLeads.length === 0 ? (
                  <div className="px-6 py-5 text-sm text-neutral-400 text-center">No overdue follow-ups — you're on track!</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {(() => {
                      const connected = overdueLeads.filter(l => l.last_followup_outcome !== 'Not connected')
                      const notConnected = overdueLeads.filter(l => l.last_followup_outcome === 'Not connected')
                      const renderLead = (lead: FollowupLead) => {
                        const actionKey = `overdue-${lead.id}`
                        return (
                          <a
                            key={actionKey}
                            data-action-key={actionKey}
                            ref={el => { itemRefs.current[actionKey] = el }}
                            href={buildLeadHref(lead.id)}
                            onFocus={() => setFocusedKey(actionKey)}
                            onBlur={() => {
                              requestAnimationFrame(() => {
                                const active = document.activeElement as HTMLElement | null
                                const activeKey = active?.closest?.('[data-action-key]')?.getAttribute('data-action-key')
                                if (activeKey) return
                                if (focusedKey === actionKey) setFocusedKey(null)
                              })
                            }}
                            className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm hover:bg-neutral-50 transition focus-visible:outline-none ${
                              focusedKey === actionKey ? 'bg-neutral-50 ring-1 ring-inset ring-neutral-200' : ''
                            }`}
                          >
                            <div className="min-w-[200px]">
                              <div className="font-medium text-neutral-900 flex items-center gap-2">
                                {lead.name || 'Unnamed Lead'}
                              </div>
                              <div className="text-xs text-amber-700 mt-0.5 mb-1 font-medium">
                                {(() => {
                                  const dateOnly = toDateOnly(lead.next_followup_date)
                                  const days = dateOnly ? daysBetween(dateOnly, todayStr) : 0
                                  const label = days === 1 ? 'day' : 'days'
                                  return `Overdue by ${Math.max(1, days)} ${label}`
                                })()}
                              </div>
                              <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {lead.phone_primary && (
                                  <span className="flex items-center gap-1 text-neutral-700">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    {lead.phone_primary}
                                  </span>
                                )}

                                {lead.not_contacted_count ? (
                                  <span className="text-amber-600">
                                    · Attempted {lead.not_contacted_count}x
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">
                                {lead.amount_quoted ? (
                                  <span>Quoted: ₹{Number(lead.amount_quoted).toLocaleString('en-IN')}</span>
                                ) : lead.client_budget_amount ? (
                                  <span>Budget: ₹{Number(lead.client_budget_amount).toLocaleString('en-IN')}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-xs text-neutral-600">{lead.status}</div>
                            <div className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${heatPill(lead.heat)} ${
                              lead.heat === 'Hot' ? 'border-red-200' : lead.heat === 'Cold' ? 'border-blue-200' : 'border-amber-200'
                            }`}>
                              {lead.heat}
                            </div>
                            <div className="text-xs text-neutral-500">{formatDateDisplay(lead.next_followup_date)}</div>
                            <button
                              className="rounded-full bg-amber-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-amber-700 transition shadow-sm"
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                openFollowupPopup(lead)
                              }}
                            >
                              Do Follow-up
                            </button>
                          </a>
                        )
                      }
                      return (
                        <>
                          {connected.map(renderLead)}
                          {notConnected.length > 0 && (
                            <div className="px-6 py-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold bg-neutral-50">
                              Not connected attempts
                            </div>
                          )}
                          {notConnected.map(renderLead)}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Popups & Dialogs outside main stack */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-neutral-900">Keyboard shortcuts</div>
            <div className="mt-3 space-y-2 text-sm text-neutral-700">
              <div><span className="font-medium">J / K</span> — Move between actions</div>
              <div><span className="font-medium">Enter</span> — Open follow-up</div>
              <div><span className="font-medium">Esc</span> — Close popup or this panel</div>
              <div><span className="font-medium">?</span> — Show shortcuts</div>
            </div>
            <div className="mt-3 text-xs text-neutral-500">Press Esc or click outside to close.</div>
          </div>
        </div>
      )}

      {popupLead && (
        <FollowUpActionPopup
          open={!!popupLead}
          leadId={popupLead.id}
          status={popupLead.status}
          nextFollowupDate={popupLead.next_followup_date}
          defaultToDone={popupDefaultDone}
          onClose={() => setPopupLead(null)}
          onSuccess={async (updated: FollowupUpdatedLead, meta?: FollowupSuccessMeta) => {
            const outcome = meta?.outcome
            const leadId = Number(updated?.id ?? popupLead.id)
            const stageUpdatedToNegotiation =
              meta?.status !== 'Negotiation' && updated?.status === 'Negotiation'
            setLeads(prev =>
              prev.map(l => {
                if (l.id !== leadId) return l
                const next: FollowupLead = {
                  ...l,
                  ...(updated as Partial<FollowupLead>),
                  id: l.id,
                }
                if (outcome === 'Not connected') {
                  next.last_followup_outcome = 'Not connected'
                  next.last_not_connected_at = toISTISOString(new Date())
                  next.not_contacted_count = (l.not_contacted_count || 0) + 1
                } else if (outcome === 'Connected') {
                  next.last_followup_outcome = 'Connected'
                  next.last_not_connected_at = null
                  next.not_contacted_count = 0
                }
                return next
              })
            )
            setPopupLead(null)
            if (updated?.auto_contacted) {
              const needsIntake = !updated?.intake_completed
              setAutoContactedPrompt({
                message: needsIntake
                  ? 'Status changed to Contacted. Please fill the Lead intake form.'
                  : 'Status changed to Contacted.',
                leadId,
                forceIntake: needsIntake,
              })
              return
            }
            if (updated?.auto_negotiation?.attempted && !updated?.auto_negotiation?.success) {
              const reason = updated?.auto_negotiation?.reason || 'Unable to change status to Negotiation'
              setAutoNegotiationError({
                reason,
                focus: mapAutoNegotiationReasonToFocus(reason),
                leadId,
              })
              return
            } else if (
              outcome === 'Connected' &&
              meta?.discussedPricing &&
              updated?.status === 'Negotiation'
            ) {
              setNegotiationStatusNotice({
                message:
                  meta?.status === 'Negotiation'
                    ? 'Status already Negotiation'
                    : 'Status changed to Negotiation',
                leadId,
              })
              return
            } else {
              setActionFeedback(stageUpdatedToNegotiation ? 'Stage updated to Negotiation' : 'Action completed')
            }
          }}
        />
      )}

      {autoNegotiationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Unable to change status to Negotiation</div>
            <div className="mt-2 text-sm text-neutral-700">{autoNegotiationError.reason}</div>
            <div className="mt-4 flex justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium"
                onClick={() => {
                  const current = autoNegotiationError
                  setAutoNegotiationError(null)
                  if (current) {
                    setAutoNegotiationFixDialog({
                      reason: current.reason,
                      focus: current.focus,
                      leadId: current.leadId,
                    })
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {autoNegotiationFixDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">{getAutoNegotiationPromptText(autoNegotiationFixDialog.reason).title}</div>
            {autoNegotiationFixDialog.reason ? (
              <div className="mt-2 text-sm text-neutral-700">{autoNegotiationFixDialog.reason}</div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => setAutoNegotiationFixDialog(null)}
              >
                No
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const focus = autoNegotiationFixDialog.focus || 'amount_quoted'
                  setAutoNegotiationFixDialog(null)
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('pending_negotiation_prompt', '1')
                  }
                  const qs = new URLSearchParams()
                  qs.set('focus', focus)
                  qs.set('desired_status', 'Negotiation')
                  qs.set('origin', 'lead')
                  window.location.href = `/leads/${autoNegotiationFixDialog.leadId}?${qs.toString()}`
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {negotiationStatusNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">{negotiationStatusNotice.message}</div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const leadId = negotiationStatusNotice.leadId
                  setNegotiationStatusNotice(null)
                  setShowNegotiationEditPrompt(leadId)
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {autoContactedPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Status Changed</div>
            <div className="mt-2 text-sm text-neutral-700">{autoContactedPrompt.message}</div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const prompt = autoContactedPrompt
                  setAutoContactedPrompt(null)
                  if (!prompt.forceIntake) return
                  const qs = new URLSearchParams()
                  qs.set('from', fromParam)
                  qs.set('force_intake', '1')
                  window.location.href = `/leads/${prompt.leadId}/intake?${qs.toString()}`
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showNegotiationEditPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold text-neutral-900">Update Negotiations?</div>
            <div className="mt-2 text-sm text-neutral-700">
              <div className="mb-1">Status changed to Negotiation.</div>
              <div>Do you want to update the Negotiations tab?</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => setShowNegotiationEditPrompt(null)}
              >
                No
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const leadId = showNegotiationEditPrompt
                  setShowNegotiationEditPrompt(null)
                  const params = new URLSearchParams()
                  params.set('tab', 'negotiation')
                  params.set('edit', 'pricing')
                  params.set('from', fromParam)
                  window.location.href = `/leads/${leadId}?${params.toString()}`
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
