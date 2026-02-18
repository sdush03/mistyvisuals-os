'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

  const newLeads = useMemo(() => {
    return filtered
      .filter(l => l.status === 'New')
      .sort(
        (a, b) => {
          const aNotConnected = a.last_followup_outcome === 'Not connected' ? 1 : 0
          const bNotConnected = b.last_followup_outcome === 'Not connected' ? 1 : 0
          if (aNotConnected !== bNotConnected) return aNotConnected - bNotConnected
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        }
      )
  }, [filtered, todayStr])

  const actionItems = useMemo(() => {
    const items: { key: string; lead: FollowupLead }[] = []
    newLeads.forEach(lead => items.push({ key: `new-${lead.id}`, lead }))
    todayLeads.forEach(lead => items.push({ key: `due-${lead.id}`, lead }))
    overdueLeads.forEach(lead => items.push({ key: `overdue-${lead.id}`, lead }))
    return items
  }, [newLeads, todayLeads, overdueLeads])

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

  const allEmpty = newLeads.length === 0 && todayLeads.length === 0 && overdueLeads.length === 0

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

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Sales</div>
            <h2 className="text-2xl md:text-3xl font-semibold mt-2">Daily Actions</h2>
            <p className="text-sm text-neutral-600 mt-1">
              See what needs attention today and what’s overdue.
            </p>
            {actionFeedback && (
              <div className="mt-2 text-xs text-emerald-700">{actionFeedback}</div>
            )}
          </div>
          <button
            className="w-full sm:w-auto rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
            onClick={loadLeads}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-neutral-500">Loading follow-ups…</div>
      )}
      {!loading && error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && allEmpty && (
        <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-6 text-sm text-neutral-600">
          You’re all caught up for today.
        </div>
      )}

      {!loading && !error && !allEmpty && (
        <div className="space-y-10">
          <section className="space-y-4">
            <div className="text-sm font-semibold text-neutral-700">New leads to contact</div>
            {newLeads.length === 0 ? (
              <div className="text-sm text-neutral-500">No new leads to contact</div>
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
                {(() => {
                  const normalLeads = newLeads.filter(l => l.last_followup_outcome !== 'Not connected')
                  const attemptedLeads = newLeads.filter(l => l.last_followup_outcome === 'Not connected')

                  const renderLead = (lead: FollowupLead, actionKey: string) => (
                    <a
                      key={actionKey}
                      data-action-key={actionKey}
                      ref={el => {
                        itemRefs.current[actionKey] = el
                      }}
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
                      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 ${
                        focusedKey === actionKey ? 'ring-2 ring-neutral-900/10' : ''
                      }`}
                    >
                      <div className="min-w-[200px]">
                        <div className="font-medium text-neutral-900">
                          {lead.name || 'Unnamed Lead'}
                        </div>
                        {lead.not_contacted_count ? (
                          <div className="text-xs text-neutral-500">
                            Last attempted: {formatRelativeAttempt(lead.last_not_connected_at) || '—'} · Attempts: {lead.not_contacted_count ?? 0}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-neutral-600">{lead.source || '—'}</div>
                      <div className="text-neutral-600">{formatDateDisplay(lead.created_at)}</div>
                      <div className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">
                        New
                      </div>
                      <button
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
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

                  return (
                    <>
                      {normalLeads.map(lead => renderLead(lead, `new-${lead.id}`))}
                      {attemptedLeads.length > 0 && (
                        <div className="px-4 py-2 text-[11px] uppercase tracking-widest text-neutral-500 bg-[var(--surface-muted)]">
                          Not connected attempts
                        </div>
                      )}
                      {attemptedLeads.map(lead => renderLead(lead, `new-${lead.id}`))}
                    </>
                  )
                })()}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="text-sm font-semibold text-neutral-800">Follow-ups due today</div>
            {todayLeads.length === 0 ? (
              <div className="text-sm text-neutral-500">
                No follow-ups scheduled for today 🎉
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
                {todayLeads.map(lead => (
                  (() => {
                    const actionKey = `due-${lead.id}`
                    return (
                      <a
                        key={actionKey}
                        data-action-key={actionKey}
                        ref={el => {
                          itemRefs.current[actionKey] = el
                        }}
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
                        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 ${
                          focusedKey === actionKey ? 'ring-2 ring-neutral-900/10' : ''
                        }`}
                      >
                    <div className="min-w-[200px]">
                      <div className="font-medium text-neutral-900">
                        {lead.name || 'Unnamed Lead'}
                      </div>
                      {lead.not_contacted_count ? (
                        <div className="text-xs text-neutral-500">
                          Last attempted: {formatRelativeAttempt(lead.last_not_connected_at) || '—'} · Attempts: {lead.not_contacted_count ?? 0}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-neutral-600">{lead.status}</div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${heatPill(lead.heat)}`}>
                      {lead.heat}
                    </div>
                    <div className="text-neutral-600">{formatDateDisplay(lead.next_followup_date)}</div>
                    <button
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
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
                  })()
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="text-sm font-semibold text-amber-800">Overdue follow-ups</div>
            {overdueLeads.length === 0 ? (
              <div className="text-sm text-neutral-500">No overdue follow-ups</div>
            ) : (
              <div className="divide-y divide-amber-200 rounded-2xl border border-amber-200 bg-amber-50/50">
                {(() => {
                  const normalLeads = overdueLeads.filter(l => l.last_followup_outcome !== 'Not connected')
                  const attemptedLeads = overdueLeads.filter(l => l.last_followup_outcome === 'Not connected')

                  const renderLead = (lead: FollowupLead, actionKey: string) => (
                    <a
                      key={actionKey}
                      data-action-key={actionKey}
                      ref={el => {
                        itemRefs.current[actionKey] = el
                      }}
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
                      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-amber-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                        focusedKey === actionKey ? 'ring-2 ring-amber-200' : ''
                      }`}
                    >
                      <div className="min-w-[200px]">
                        <div className="font-medium text-neutral-900">
                          {lead.name || 'Unnamed Lead'}
                        </div>
                        <div className="text-xs text-amber-700">
                          {(() => {
                            const dateOnly = toDateOnly(lead.next_followup_date)
                            const days = dateOnly ? daysBetween(dateOnly, todayStr) : 0
                            const label = days === 1 ? 'day' : 'days'
                            return `Follow-up overdue by ${Math.max(1, days)} ${label}`
                          })()}
                        </div>
                        {lead.not_contacted_count ? (
                          <div className="text-xs text-amber-700">
                            Last attempted: {formatRelativeAttempt(lead.last_not_connected_at) || '—'} · Attempts: {lead.not_contacted_count ?? 0}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-neutral-600">{lead.status}</div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${heatPill(lead.heat)}`}>
                        {lead.heat}
                      </div>
                      <div className="text-neutral-600">{formatDateDisplay(lead.next_followup_date)}</div>
                      <div className="text-[11px] text-amber-700">Overdue</div>
                      <button
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
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

                  return (
                    <>
                      {normalLeads.map(lead => renderLead(lead, `overdue-${lead.id}`))}
                      {attemptedLeads.length > 0 && (
                        <div className="px-4 py-2 text-[11px] uppercase tracking-widest text-amber-700 bg-amber-100/70">
                          Not connected attempts
                        </div>
                      )}
                      {attemptedLeads.map(lead => renderLead(lead, `overdue-${lead.id}`))}
                    </>
                  )
                })()}
              </div>
            )}
          </section>
        </div>
      )}

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
                  next.last_not_connected_at = new Date().toISOString()
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
