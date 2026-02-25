'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAuth } from '@/lib/authClient'
import PhoneActions from '@/components/PhoneActions'
import FollowUpActionPopup from '@/components/FollowUpActionPopup'
import SwipeConfirmModal from '@/components/SwipeConfirmModal'
import { getAutoNegotiationPromptText, mapAutoNegotiationReasonToFocus } from '@/lib/autoNegotiation'
import { formatINR, formatDurationSeconds } from '@/lib/formatters'
import { fetchConversionSummary, type ConversionSummary } from '@/lib/conversionSummary'
import { sanitizeText } from '@/lib/sanitize'
import { getRouteStateKey, readRouteState, shouldRestoreScroll, writeRouteState } from '@/lib/routeState'

type Lead = {
  id: number
  name: string
  primary_phone: string
  phone_primary?: string
  full_name?: string
  bride_name?: string | null
  groom_name?: string | null
  status: string
  heat: 'Hot' | 'Warm' | 'Cold'
  next_followup_date?: string | null
  awaiting_advance_since?: string | null
  important?: boolean | string
  potential?: boolean | string
  events?: { event_type?: string | null; event_date?: string | null; slot?: string | null }[]
  last_followup_at?: string | null
  last_followup_mode?: string | null
  last_note_text?: string | null
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

const STATUSES = [
  'New',
  'Contacted',
  'Quoted',
  'Follow Up',
  'Negotiation',
  'Awaiting Advance',
  'Converted',
  'Lost',
  'Rejected',
]

const LOST_REASONS = [
  'Budget issue',
  'Client stopped responding',
  'Went with another photographer',
  'Date unavailable',
  'Requirement mismatch',
  'Other',
]

const REJECT_REASONS = [
  'Low budget',
  'Not our type of work',
  'Dates not available',
  'Client not responsive',
  'Other',
]

const heatDot = (heat: Lead['heat']) => {
  if (heat === 'Hot') return 'bg-red-500'
  if (heat === 'Cold') return 'bg-blue-500'
  return 'bg-yellow-500'
}

const dateToYMD = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const toDateOnly = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return dateToYMD(parsed)
  }
  return value.split('T')[0].split(' ')[0]
}

const firstName = (value?: string | null) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] || ''
}

const isPastDate = (value?: string | null) => {
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return false
  const todayStr = dateToYMD(new Date())
  return dateOnly < todayStr
}

const isTerminalStatus = (status?: string | null) =>
  ['Lost', 'Rejected', 'Converted'].includes(status || '')

const isHot = (heat?: string | null) => String(heat || '').toLowerCase() === 'hot'

const isTrue = (value: any) => {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false
  const v = String(value).trim().toLowerCase()
  return v === 'yes' || v === 'true'
}

const startOfToday = () => {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

const formatShortDate = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const MS_DAY = 24 * 60 * 60 * 1000
const getAwaitingAdvanceDays = (value?: string | null) => {
  if (!value) return null
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return null
  const start = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.floor((todayStart.getTime() - start.getTime()) / MS_DAY)
  return diff < 0 ? 0 : diff
}

const awaitingAdvanceClass = (days: number) => {
  if (days >= 7) return 'bg-red-100 text-red-700'
  if (days >= 4) return 'bg-amber-100 text-amber-700'
  return 'bg-neutral-100 text-neutral-700'
}

const formatEventDate = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const daysBetween = (from: Date, to: Date) => {
  const ms = to.getTime() - from.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

const formatRelativeDays = (value?: string | null) => {
  if (!value) return ''
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return ''
  const today = dateToYMD(new Date())
  if (dateOnly === today) return 'Today'
  if (dateOnly < today) {
    const diff = daysBetween(new Date(`${dateOnly}T00:00:00`), new Date(`${today}T00:00:00`))
    return diff === 1 ? '1 day ago' : `${diff} days ago`
  }
  const diff = daysBetween(new Date(`${today}T00:00:00`), new Date(`${dateOnly}T00:00:00`))
  return diff === 1 ? 'In 1 day' : `In ${diff} days`
}

const formatLastContactSummary = (lead: Lead) => {
  if (!lead.last_followup_at) return ''
  const timeLabel = formatRelativeDays(lead.last_followup_at)
  const mode = lead.last_followup_mode ? String(lead.last_followup_mode) : ''
  if (!timeLabel && !mode) return ''
  return `Last contact: ${timeLabel || '—'}${mode ? ` · ${mode}` : ''}`
}

const formatNextFollowupPreview = (date?: string | null) => {
  if (!date) return ''
  const dateOnly = toDateOnly(date)
  if (!dateOnly) return ''
  const today = dateToYMD(new Date())
  if (dateOnly === today) return 'Next follow-up: Today'
  if (dateOnly < today) {
    const diff = daysBetween(new Date(`${dateOnly}T00:00:00`), new Date(`${today}T00:00:00`))
    const label = diff === 1 ? '1 day' : `${diff} days`
    return `Next follow-up: Overdue by ${label}`
  }
  const diff = daysBetween(new Date(`${today}T00:00:00`), new Date(`${dateOnly}T00:00:00`))
  const label = diff === 1 ? '1 day' : `${diff} days`
  return `Next follow-up: In ${label}`
}

const formatStageDuration = (days?: number | null) => {
  if (days === null || days === undefined) return '—'
  const num = Number(days)
  if (!Number.isFinite(num)) return '—'
  return formatDurationSeconds(num * 24 * 60 * 60, '—')
}

const previewNote = (value?: string | null) => {
  if (!value) return ''
  const cleaned = sanitizeText(String(value))
  const firstLine = cleaned.split('\n')[0].trim()
  if (!firstLine) return ''
  if (firstLine.length <= 80) return firstLine
  return `${firstLine.slice(0, 80)}…`
}

export function SalesKanbanView({
  showHeader = true,
  leads,
  loading,
  loadError,
  onLeadsChange,
  onRefresh,
}: {
  showHeader?: boolean
  leads?: Lead[]
  loading?: boolean
  loadError?: string
  onLeadsChange?: (next: Lead[]) => void
  onRefresh?: () => void
}) {
  const [localLeads, setLocalLeads] = useState<Lead[]>([])
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [localError, setLocalError] = useState('')

  const [showLostModal, setShowLostModal] = useState(false)
  const [lostLeadId, setLostLeadId] = useState<number | null>(null)
  const [lostReason, setLostReason] = useState('Client stopped responding')
  const [lostNote, setLostNote] = useState('')
  const [statusError, setStatusError] = useState<{
    message: string
    code?: string
    leadId?: number
    targetStatus?: string
  } | null>(null)

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectedLeadId, setRejectedLeadId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('Low budget')
  const [rejectOther, setRejectOther] = useState('')
  const [confirmConverted, setConfirmConverted] = useState<{
    leadId: number
    targetStatus: string
  } | null>(null)
  const [convertConfirmLead, setConvertConfirmLead] = useState<Lead | null>(null)
  const [awaitingAdvancePromptLead, setAwaitingAdvancePromptLead] = useState<Lead | null>(null)
  const [convertSummary, setConvertSummary] = useState<ConversionSummary | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertSaving, setConvertSaving] = useState(false)
  const [popupLead, setPopupLead] = useState<Lead | null>(null)
  const [popupDefaultDone, setPopupDefaultDone] = useState(false)
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
  const [stageMenuLeadId, setStageMenuLeadId] = useState<number | null>(null)
  const [stageMenuLead, setStageMenuLead] = useState<any | null>(null)
  const [stageMenuPosition, setStageMenuPosition] = useState<{ top: number; left: number; openUp: boolean } | null>(null)
  const stageMenuTimerRef = useRef<number | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const hoverHideTimerRef = useRef<number | null>(null)
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null)
  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const [isHoveringPreview, setIsHoveringPreview] = useState(false)
  const [canHover, setCanHover] = useState(false)
  const [hoverPreview, setHoverPreview] = useState<{
    leadId: number
    x: number
    right?: number
    y: number
    lastContactSummary: string
    nextFollowupPreview: string
    notePreview: string
    important: boolean
    potential: boolean
    visible: boolean
  } | null>(null)

  useEffect(() => {
    if (!stageMenuLeadId) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-kanban-stage-menu="true"]')) return
      setStageMenuLeadId(null)
      setStageMenuLead(null)
      setStageMenuPosition(null)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [stageMenuLeadId])
  const [userName, setUserName] = useState('')

  const buildLeadHref = (leadId: number) => {
    const params = new URLSearchParams()
    params.set('tab', 'dashboard')
    if (typeof window !== 'undefined') {
      let from = `${window.location.pathname}${window.location.search}`
      if (window.location.pathname === '/leads') {
        const stored = sessionStorage.getItem('leads_view')
        if (stored === 'kanban' || stored === 'table') {
          from = `/leads?view=${stored}`
        }
      }
      params.set('from', from)
    }
    return `/leads/${leadId}?${params.toString()}`
  }

  const fromParam =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/leads?view=kanban'

  const activeLeads = leads ?? localLeads
  const isLoading = loading ?? localLoading
  const errorText = loadError ?? localError
  const [density, setDensity] = useState<'compact' | 'comfort'>('compact')

  useEffect(() => {
    if (leads) return
    apiFetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        setLocalLeads(Array.isArray(data) ? data : [])
        setLocalLoading(false)
      })
      .catch(() => {
        setLocalError('Unable to load leads right now.')
        setLocalLoading(false)
      })
  }, [leads])

  useEffect(() => {
    let active = true
    getAuth()
      .then(data => {
        if (!active) return
        const name =
          data?.user?.name?.trim() ||
          data?.user?.email?.split('@')[0] ||
          ''
        setUserName(name)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem('kanban_density')
    if (stored === 'compact' || stored === 'comfort') {
      setDensity(stored)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem('kanban_density', density)
  }, [density])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRouteStateKey(window.location.pathname)
    const stored = readRouteState(key)
    if (!shouldRestoreScroll()) return
    if (!stored || !kanbanScrollRef.current) return
    const scrollX = typeof stored.scrollX === 'number' ? stored.scrollX : 0
    const timer = window.setTimeout(() => {
      if (kanbanScrollRef.current) {
        kanbanScrollRef.current.scrollLeft = scrollX
      }
    }, 50)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !kanbanScrollRef.current) return
    const key = getRouteStateKey(window.location.pathname)
    let throttle: number | null = null
    const saveScroll = () => {
      writeRouteState(key, { scrollX: kanbanScrollRef.current?.scrollLeft || 0 })
    }
    const onScroll = () => {
      if (throttle) return
      throttle = window.setTimeout(() => {
        throttle = null
        saveScroll()
      }, 120)
    }
    const el = kanbanScrollRef.current
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (throttle) window.clearTimeout(throttle)
    }
  }, [kanbanScrollRef])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const todayStr = dateToYMD(new Date())

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const status of STATUSES) counts[status] = 0
    for (const lead of activeLeads) {
      const key = lead.status || 'New'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [activeLeads])

  const hotCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const status of STATUSES) counts[status] = 0
    for (const lead of activeLeads) {
      const key = lead.status || 'New'
      if (isHot(lead.heat)) counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [activeLeads])

  const overdueCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const status of STATUSES) counts[status] = 0
    for (const lead of activeLeads) {
      const key = lead.status || 'New'
      if (!isTerminalStatus(lead.status) && isPastDate(lead.next_followup_date)) {
        counts[key] = (counts[key] || 0) + 1
      }
    }
    return counts
  }, [activeLeads])

  const updateStatus = async (id: number, status: string, rejectedReason?: string, advanceReceived?: boolean) => {
    const current = activeLeads.find(l => l.id === id)
    if (current?.status === status) return
    const res = await apiFetch(
      `/api/leads/${id}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status,
          rejected_reason: rejectedReason,
          advance_received: advanceReceived === true ? true : undefined,
        }),
      }
    )

    // 🔒 HARD BLOCK HANDLING
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err?.code === 'ADVANCE_REQUIRED') {
        setConvertError('Please collect the advance amount before marking this lead as Converted.')
        return
      }
      setStatusError({
        message: err?.error || err?.message || 'Failed to update status',
        code: err?.code,
        leadId: id,
        targetStatus: status,
      })
      return
    }

    const updated = await res.json()
    setStatusError(null)
    const next = activeLeads.map(l => (l.id === id ? { ...l, ...updated } : l))
    if (onLeadsChange) {
      onLeadsChange(next)
    } else {
      setLocalLeads(next)
    }
    if (status === 'Converted' && advanceReceived) {
      return
    }
  }

  const openConversionSummary = async (lead: Lead) => {
    setConvertSaving(true)
    const summary = await fetchConversionSummary(lead)
    setConvertSummary(summary)
    setConvertConfirmLead(null)
    setConvertSaving(false)
  }

  const finalizeConversion = async (viewProject: boolean) => {
    if (!convertSummary) return
    setConvertSaving(true)
    const leadId = convertSummary.leadId
    await updateStatus(leadId, 'Converted', undefined, true)
    setConvertSaving(false)
    setConvertSummary(null)
    if (viewProject && leadId) {
      window.location.href = `/leads/${leadId}`
    }
  }

  const requestStatusChange = (lead: Lead, status: string) => {
    if (!lead?.id) return
    if (lead.status === status) return
    if (lead.status === 'Converted' && status !== 'Converted') {
      setConfirmConverted({
        leadId: lead.id,
        targetStatus: status,
      })
      return
    }
    if (status === 'Converted') {
      setConvertConfirmLead(lead)
      return
    }
    if (status === 'Lost') {
      setLostLeadId(lead.id)
      setLostReason('Client stopped responding')
      setLostNote('')
      setShowLostModal(true)
      return
    }
    if (status === 'Rejected') {
      setRejectedLeadId(lead.id)
      setRejectReason('Low budget')
      setRejectOther('')
      setShowRejectModal(true)
      return
    }
    updateStatus(lead.id, status)
  }

  const buildPreviewPayload = (lead: Lead) => {
    const lastContactSummary = formatLastContactSummary(lead)
    const nextFollowupPreview = formatNextFollowupPreview(lead.next_followup_date)
    const notePreview = previewNote(lead.last_note_text)
    const important = isTrue(lead.important)
    const potential = isTrue(lead.potential)
    const hasPreview =
      !!lastContactSummary ||
      !!nextFollowupPreview ||
      !!notePreview ||
      important ||
      potential

    return {
      hasPreview,
      lastContactSummary,
      nextFollowupPreview,
      notePreview,
      important,
      potential,
    }
  }

  const schedulePreview = (lead: Lead, rect?: DOMRect | null) => {
    if (!canHover) return
    const payload = buildPreviewPayload(lead)
    if (!payload.hasPreview) {
      setHoverPreview(null)
      return
    }
    const computedRight = rect
      ? Math.max(12, window.innerWidth - rect.right)
      : undefined
    const computedX = 12
    const computedY = rect ? rect.bottom + 8 : 12
    setHoverPreview(prev =>
      prev && prev.leadId === lead.id
        ? {
            ...prev,
            x: computedX,
            right: computedRight,
            y: computedY,
            lastContactSummary: payload.lastContactSummary,
            nextFollowupPreview: payload.nextFollowupPreview,
            notePreview: payload.notePreview,
            important: payload.important,
            potential: payload.potential,
          }
        : {
            leadId: lead.id,
            x: computedX,
            right: computedRight,
            y: computedY,
            lastContactSummary: payload.lastContactSummary,
            nextFollowupPreview: payload.nextFollowupPreview,
            notePreview: payload.notePreview,
            important: payload.important,
            potential: payload.potential,
            visible: false,
          }
    )
    if (hoverTimerRef.current && hoverPreview?.leadId !== lead.id) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (!hoverTimerRef.current) {
      hoverTimerRef.current = window.setTimeout(() => {
        setHoverPreview(prev =>
          prev && prev.leadId === lead.id ? { ...prev, visible: true } : prev
        )
        hoverTimerRef.current = null
      }, 2000)
    }
  }

  const hidePreview = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current)
      hoverHideTimerRef.current = null
    }
    setHoverPreview(null)
  }



  const markLost = async () => {
    if (!lostLeadId || !lostReason) return

    const res = await apiFetch(
      `/api/leads/${lostLeadId}/lost`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: lostReason,
          note: lostNote,
        }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err?.error || 'Failed to mark lost')
      return
    }

    if (onRefresh) {
      onRefresh()
    } else {
      const refreshed = await apiFetch('/api/leads')
        .then(res => res.json())
      setLocalLeads(refreshed)
    }
    setShowLostModal(false)
    setLostLeadId(null)
    setLostReason('')
    setLostNote('')
  }

  return (
    <div className="min-h-[calc(100svh-220px)] md:min-h-[calc(100vh-220px)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        {showHeader && (
          <h2 className="text-2xl font-semibold">
            Sales Kanban
          </h2>
        )}
        <div className="inline-flex w-full sm:w-auto rounded-full border border-[var(--border)] bg-white p-1 text-sm shadow-sm">
          {(['compact', 'comfort'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDensity(mode)}
              className={`flex-1 px-4 py-1.5 rounded-full transition ${
                density === mode
                  ? 'bg-neutral-900 text-white shadow'
                  : 'text-neutral-700 hover:bg-[var(--surface-muted)]'
              }`}
            >
              {mode === 'compact' ? 'Compact' : 'Comfort'}
            </button>
          ))}
        </div>
      </div>

      <div ref={kanbanScrollRef} className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
        {STATUSES.map(status => (
          <div
            key={status}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (!draggingId) return
              const dragged = activeLeads.find(l => l.id === draggingId)
              if (dragged?.status === status) {
                setDraggingId(null)
                return
              }
              if (dragged) {
                requestStatusChange(dragged, status)
              }

              setDraggingId(null)
            }}
            className="min-w-[280px] bg-[var(--surface-muted)] rounded-2xl p-3 border border-[var(--border)] snap-start"
          >
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-neutral-800">
                  {status} · {statusCounts[status] || 0}
                </h3>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500"></div>
            </div>

            {isLoading && (
              <div className="text-xs text-neutral-500 px-2 py-3">
                Loading leads…
              </div>
            )}
            {!isLoading && errorText && (
              <div className="text-xs text-red-600 px-2 py-3">
                {errorText}
              </div>
            )}
            {!isLoading && !errorText && activeLeads.filter(l => l.status === status).length === 0 && (
              <div className="text-xs text-neutral-500 px-2 py-3">
                No leads in this stage yet.
              </div>
            )}
            {!isLoading && !errorText && activeLeads
              .filter(l => l.status === status)
              .map((lead, idx) => {
                const rawName = (lead.name || (lead as any).full_name || '').trim()
                const rawPhone = (lead.primary_phone || lead.phone_primary || '').trim()
                const displayName = rawName || 'Unnamed Lead'
                const brideFirst = firstName(lead.bride_name)
                const groomFirst = firstName(lead.groom_name)
                const overdue =
                  !!lead.next_followup_date &&
                  isPastDate(lead.next_followup_date) &&
                  !isTerminalStatus(lead.status)
                const isNew = lead.status === 'New'
                const important = isTrue(lead.important)
                const potential = isTrue(lead.potential)
                const awaitingDays =
                  lead.status === 'Awaiting Advance'
                    ? (getAwaitingAdvanceDays(lead.awaiting_advance_since) ?? 0)
                    : null
                const followupLabel = (() => {
                  if (!lead.next_followup_date) return ''
                  const dateOnly = toDateOnly(lead.next_followup_date)
                  if (!dateOnly) return ''
                  if (overdue) {
                    const parsed = new Date(`${dateOnly}T00:00:00`)
                    const days = Math.max(1, daysBetween(parsed, startOfToday()))
                    return `Overdue: ${days}d`
                  }
                  return `Next Follow Up: ${formatShortDate(lead.next_followup_date)}`
                })()
                const leadNumber = (lead as any)?.lead_number ?? lead.id
                const key = lead?.id != null ? `${lead.id}-${status}` : `lead-${status}-${idx}`

                return (
                  <a
                    key={key}
                    draggable
                    onDragStart={() =>
                      setDraggingId(lead.id)
                    }
                    onMouseEnter={e => {
                      if (stageMenuTimerRef.current) {
                        window.clearTimeout(stageMenuTimerRef.current)
                        stageMenuTimerRef.current = null
                      }
                      if (canHover) {
                        if (hoverHideTimerRef.current) {
                          window.clearTimeout(hoverHideTimerRef.current)
                          hoverHideTimerRef.current = null
                        }
                        setIsHoveringCard(true)
                        const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.()
                        schedulePreview(lead, rect || null)
                      }
                    }}
                    onMouseLeave={() => {
                      if (stageMenuTimerRef.current) {
                        window.clearTimeout(stageMenuTimerRef.current)
                      }
                      if (stageMenuLeadId !== lead.id) {
                        stageMenuTimerRef.current = window.setTimeout(() => {
                          setStageMenuLeadId(null)
                          setStageMenuLead(null)
                          setStageMenuPosition(null)
                          stageMenuTimerRef.current = null
                        }, 500)
                      }
                      if (canHover) {
                        setIsHoveringCard(false)
                        if (hoverHideTimerRef.current) {
                          window.clearTimeout(hoverHideTimerRef.current)
                        }
                        hoverHideTimerRef.current = window.setTimeout(() => {
                          if (!isHoveringPreview) {
                            hidePreview()
                          }
                        }, 500)
                      }
                    }}
                    href={buildLeadHref(lead.id)}
                    className={`kanban-card group relative block bg-white rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-[var(--border)] mb-3 cursor-pointer hover:bg-[var(--surface)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition ${
                      stageMenuLeadId === lead.id ? 'z-10' : ''
                    }`}
                  >
                    <div className="kanban-hover-actions absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        className="h-7 w-7 rounded-full border border-[var(--border)] bg-white text-xs text-neutral-700 hover:bg-[var(--surface-muted)]"
                        aria-label="Follow-up"
                        title="Follow-up"
                        tabIndex={-1}
                        onClick={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          setPopupLead(lead)
                          setPopupDefaultDone(true)
                        }}
                      >
                        ⏱
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-[var(--border)] bg-white text-xs text-neutral-700 hover:bg-[var(--surface-muted)]"
                          aria-label="Move stage"
                          title="Move stage"
                          tabIndex={-1}
                          onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            const nextOpen = stageMenuLeadId !== lead.id
                            if (nextOpen) {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              const menuHeight = 220
                              const menuWidth = 170
                              const spaceBelow = window.innerHeight - rect.bottom
                              const openUp = spaceBelow < menuHeight + 12
                              const top = openUp ? rect.top - menuHeight - 8 : rect.bottom + 8
                              const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8)
                              setStageMenuPosition({ top, left, openUp })
                              setStageMenuLeadId(lead.id)
                              setStageMenuLead(lead)
                            } else {
                              setStageMenuLeadId(null)
                              setStageMenuLead(null)
                              setStageMenuPosition(null)
                            }
                          }}
                        >
                          ⇄
                        </button>
                        {stageMenuLeadId === lead.id && stageMenuPosition && stageMenuLead && createPortal(
                          <div
                            data-kanban-stage-menu="true"
                            className="fixed z-50 w-36 rounded-lg border border-[var(--border)] bg-white shadow-md"
                            style={{ top: stageMenuPosition.top, left: stageMenuPosition.left }}
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                          >
                            <div className="flex flex-col p-2 text-xs text-neutral-600">
                              {STATUSES.map(option => (
                                <button
                                  key={option}
                                  type="button"
                                  className={`rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--surface-muted)] ${
                                    option === stageMenuLead.status ? 'text-neutral-900 font-medium' : 'text-neutral-700'
                                  }`}
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setStageMenuLeadId(null)
                                    setStageMenuLead(null)
                                    setStageMenuPosition(null)
                                    requestStatusChange(stageMenuLead, option)
                                  }}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      {/* HEAT DOT */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${heatDot(
                              lead.heat
                            )}`}
                          />
                          <span className="font-medium truncate">
                            {displayName}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          Lead #{leadNumber}
                        </div>
                        <div className="text-xs text-neutral-500 mt-2">
                          <PhoneActions phone={rawPhone} leadId={lead.id} stopPropagation />
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {isNew && (
                          <span className="text-[11px] rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">New</span>
                        )}
                        {important && (
                          <span className="text-[11px] rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Important</span>
                        )}
                        {potential && (
                          <span className="text-[11px] rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Potential</span>
                        )}
                        {(lead?.not_contacted_count ?? 0) >= 5 && (
                          <span className="text-[11px] rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Non Responsive</span>
                        )}
                        {overdue && (
                          <span className="text-[11px] rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Overdue</span>
                        )}
                        {lead.status === 'Awaiting Advance' && awaitingDays != null && (
                          <span
                            className={`text-[11px] rounded-full px-2 py-0.5 ${awaitingAdvanceClass(
                              awaitingDays
                            )}`}
                          >
                            {awaitingDays}d pending
                          </span>
                        )}
                      </div>
                    </div>

                    {density === 'comfort' && (brideFirst || groomFirst) && (
                      <div className="mt-2 text-[11px] text-neutral-600">
                        {brideFirst && groomFirst
                          ? `Bride ${brideFirst} • Groom ${groomFirst}`
                          : brideFirst
                            ? `Bride ${brideFirst}`
                            : `Groom ${groomFirst}`}
                      </div>
                    )}

                    {density === 'comfort' && lead.events && lead.events.length > 0 && (
                      <div className="mt-2 space-y-1 text-[11px] text-neutral-600">
                        {lead.events.map((event, idx) => {
                          const name = event.event_type || 'Event'
                          const date = formatEventDate(event.event_date)
                          const slot = event.slot || ''
                          return (
                            <div key={`${lead.id}-event-${idx}`} className="truncate">
                              {date || 'Date'}{slot ? ` • ${slot}` : ''} • {name}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {density === 'comfort' && followupLabel && (
                      <div className={`mt-1 text-[11px] ${overdue ? 'text-amber-700' : 'text-neutral-500'}`}>
                        {followupLabel}
                      </div>
                    )}
                  </a>
                )
              })}
          </div>
        ))}
      </div>

      {canHover && hoverPreview?.visible && (
        <div
          className="fixed z-[60] max-w-[240px] rounded-lg border border-[var(--border)] bg-white/95 p-2 text-[11px] text-neutral-700 shadow-md pointer-events-auto"
          style={{
            left: hoverPreview.right != null ? 'auto' : hoverPreview.x,
            right: hoverPreview.right != null ? hoverPreview.right : 'auto',
            top: hoverPreview.y,
          }}
          onMouseEnter={() => {
            setIsHoveringPreview(true)
            if (hoverHideTimerRef.current) {
              window.clearTimeout(hoverHideTimerRef.current)
              hoverHideTimerRef.current = null
            }
          }}
          onMouseLeave={() => {
            setIsHoveringPreview(false)
            if (!isHoveringCard) {
              if (hoverHideTimerRef.current) {
                window.clearTimeout(hoverHideTimerRef.current)
              }
              hoverHideTimerRef.current = window.setTimeout(() => {
                hidePreview()
              }, 500)
            }
          }}
        >
          {hoverPreview.lastContactSummary && (
            <div className="truncate">{hoverPreview.lastContactSummary}</div>
          )}
          {hoverPreview.nextFollowupPreview && (
            <div className="truncate">{hoverPreview.nextFollowupPreview}</div>
          )}
          {hoverPreview.notePreview && (
            <div className="mt-1 truncate text-neutral-600">{hoverPreview.notePreview}</div>
          )}
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
            const updatedId = Number(updated?.id ?? popupLead.id)
            const normalizedUpdated = { ...updated, id: updatedId }
            const next: Lead[] = activeLeads.map((l): Lead => {
              if (Number(l.id) === updatedId) {
                return {
                  ...l,
                  ...normalizedUpdated,
                  id: Number(l.id),
                }
              }
              return l
            })
            if (onLeadsChange) {
              onLeadsChange(next)
            } else {
              setLocalLeads(next)
            }
            setPopupLead(null)
            if (updated?.auto_contacted) {
              const needsIntake = !updated?.intake_completed
              setAutoContactedPrompt({
                message: needsIntake
                  ? 'Status changed to Contacted. Please fill the Lead intake form.'
                  : 'Status changed to Contacted.',
                leadId: updatedId,
                forceIntake: needsIntake,
              })
              return
            }
            if (updated?.auto_negotiation?.attempted && !updated?.auto_negotiation?.success) {
              const reason = updated?.auto_negotiation?.reason || 'Unable to change status to Negotiation'
              setAutoNegotiationError({
                reason,
                focus: mapAutoNegotiationReasonToFocus(reason),
                leadId: updatedId,
              })
              return
            } else if (
              meta?.outcome === 'Connected' &&
              meta?.discussedPricing &&
              updated?.status === 'Negotiation'
            ) {
              setNegotiationStatusNotice({
                message:
                  meta?.status === 'Negotiation'
                    ? 'Status already Negotiation'
                    : 'Status changed to Negotiation',
                leadId: updatedId,
              })
              return
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
                  qs.set('origin', 'kanban')
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
                  const from = typeof window !== 'undefined'
                    ? `${window.location.pathname}${window.location.search}`
                    : '/leads?view=kanban'
                  const qs = new URLSearchParams()
                  qs.set('from', from)
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

      {convertConfirmLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Confirm Conversion</div>
            <div className="mt-2 text-sm text-neutral-700">Has the advance amount been credited?</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => {
                  const current = convertConfirmLead
                  setConvertConfirmLead(null)
                  if (current?.status === 'Awaiting Advance') return
                  setAwaitingAdvancePromptLead(current || null)
                }}
              >
                Not yet
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  if (convertConfirmLead) openConversionSummary(convertConfirmLead)
                }}
                disabled={convertSaving}
              >
                Yes, advance received
              </button>
            </div>
          </div>
        </div>
      )}

      {awaitingAdvancePromptLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Advance Not Received</div>
            <div className="mt-2 text-sm text-neutral-700">
              This lead cannot be marked as Converted without receiving the advance.
              Would you like to move it to Awaiting Advance instead?
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => setAwaitingAdvancePromptLead(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const current = awaitingAdvancePromptLead
                  setAwaitingAdvancePromptLead(null)
                  if (current?.id) {
                    updateStatus(current.id, 'Awaiting Advance')
                  }
                }}
              >
                Move to Awaiting Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {convertSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Deal Closed 🎉</div>
            <div className="mt-2 text-sm text-neutral-700">
              {`Congratulations, ${userName || 'there'}!`}
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {`You’ve successfully converted this lead at ${
                convertSummary.finalAmount != null ? formatINR(convertSummary.finalAmount) : '—'
              }.`}
            </div>
            <div className="mt-4 space-y-1 text-xs text-neutral-600">
              <div className="flex items-center justify-between">
                <span>Stage duration</span>
                <span>{formatStageDuration(convertSummary.stageDurationDays)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total follow-ups</span>
                <span>{convertSummary.followupCount}</span>
              </div>
              {convertSummary.discountValue != null && (
                <div className="flex items-center justify-between">
                  <span>Discount applied</span>
                  <span>{formatINR(convertSummary.discountValue)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => finalizeConversion(false)}
                disabled={convertSaving}
              >
                Continue
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => finalizeConversion(true)}
                disabled={convertSaving}
              >
                View Project
              </button>
            </div>
          </div>
        </div>
      )}

      {convertError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Confirm Conversion</div>
            <div className="mt-2 text-sm text-neutral-700">{convertError}</div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => setConvertError(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOST MODAL */}
      {showLostModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[420px]">
            <h3 className="text-lg font-medium mb-4">
              Mark Lead as Lost
            </h3>

            <select
              className="border rounded-md w-full px-3 py-2 mb-3"
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
            >
              <option value="">Select reason</option>
              {LOST_REASONS.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>

            <textarea
              className="border rounded-md w-full px-3 py-2 mb-4"
              placeholder="Optional Note"
              autoComplete="off"
              value={lostNote}
              onChange={e => setLostNote(e.target.value)}
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLostModal(false)}
                className="px-4 py-2 border rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={markLost}
                disabled={!lostReason}
                className="px-4 py-2 bg-black text-white rounded-md disabled:opacity-50"
              >
                Mark Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[420px]">
            <h3 className="text-lg font-medium mb-4">
              Reason for rejection
            </h3>

            <select
              className="border rounded-md w-full px-3 py-2 mb-3"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            >
              {REJECT_REASONS.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>

            {rejectReason === 'Other' && (
              <input
                className="border rounded-md w-full px-3 py-2 mb-4"
                placeholder="Enter reason"
                autoComplete="off"
                value={rejectOther}
                onChange={e => setRejectOther(e.target.value)}
              />
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectedLeadId(null)
                }}
                className="px-4 py-2 border rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  if (!rejectedLeadId) return
                  const finalReason =
                    rejectReason === 'Other'
                      ? rejectOther.trim()
                      : rejectReason
                  if (rejectReason === 'Other' && !finalReason) return
                  await updateStatus(rejectedLeadId, 'Rejected', finalReason)
                  setShowRejectModal(false)
                  setRejectedLeadId(null)
                  setRejectOther('')
                }}
                disabled={rejectReason === 'Other' && !rejectOther.trim()}
                className="px-4 py-2 bg-black text-white rounded-md disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <SwipeConfirmModal
        open={Boolean(confirmConverted)}
        title="Reopen Converted Lead"
        body="This lead is currently marked as Converted. Changing the stage may affect revenue reports and performance metrics."
        subtext="Only proceed if this conversion was marked incorrectly."
        confirmLabel="Swipe right to reopen lead"
        onClose={() => setConfirmConverted(null)}
        onConfirm={() => {
          const next = confirmConverted
          setConfirmConverted(null)
          if (!next) return
          const { leadId, targetStatus } = next
          if (targetStatus === 'Lost') {
            setLostLeadId(leadId)
            setLostReason('Client stopped responding')
            setShowLostModal(true)
            return
          }
          if (targetStatus === 'Rejected') {
            setRejectedLeadId(leadId)
            setRejectReason('Low budget')
            setRejectOther('')
            setShowRejectModal(true)
            return
          }
          updateStatus(leadId, targetStatus)
        }}
      />

      {statusError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[420px]">
            <h3 className="text-lg font-medium mb-2">
              Unable to change status
            </h3>
            <div className="text-sm text-neutral-700">
              {statusError.message}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setStatusError(null)}
                className="px-4 py-2 border rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const code = statusError.code
                  const leadId = statusError.leadId
                  const targetStatus = statusError.targetStatus
                  setStatusError(null)
                  if (!leadId || !code) return
                  const focusMap: Record<string, string> = {
                    AMOUNT_QUOTED_REQUIRED: 'amount_quoted',
                    PRIMARY_CITY_REQUIRED: 'primary_city',
                    EVENT_REQUIRED: 'events',
                    PRIMARY_CITY_EVENT_REQUIRED: 'all_cities_event',
                    ALL_CITIES_EVENT_REQUIRED: 'all_cities_event',
                    EVENT_TIME_REQUIRED: 'event_time',
                  }
                  const focus = focusMap[code]
                  if (focus) {
                    const qs = new URLSearchParams()
                    qs.set('focus', focus)
                    if (targetStatus) qs.set('desired_status', targetStatus)
                    qs.set('origin', 'kanban')
                    window.location.href = `/leads/${leadId}?${qs.toString()}`
                  }
                }}
                className="px-4 py-2 bg-black text-white rounded-md"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SalesKanbanPage() {
  return <SalesKanbanView />
}
