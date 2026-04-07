"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import CalendarInput from '@/components/CalendarInput'

export type FollowupSuccessMeta = {
  outcome?: string
  status?: string
  discussedPricing?: boolean
}

export type FollowupUpdatedLead = {
  id?: number | string
  status?: string
  next_followup_date?: string | null
  auto_contacted?: boolean
  intake_completed?: boolean
  auto_negotiation?: { attempted?: boolean; success?: boolean; reason?: string }
  last_followup_outcome?: string | null
  last_not_connected_at?: string | null
  not_contacted_count?: number
  [key: string]: unknown
}

export interface FollowUpActionPopupProps {
  open: boolean
  leadId: number | string
  status: string
  nextFollowupDate?: string | null
  defaultToDone?: boolean
  onClose: () => void
  onSuccess?: (
    updatedLead: FollowupUpdatedLead,
    meta?: FollowupSuccessMeta
  ) => void | Promise<void>
  onRequestNegotiationEdit?: () => void
  useInlineNegotiationPrompt?: boolean
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

const isPastDate = (value?: string | null) => {
  if (!value) return false
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return false
  const todayStr = dateToYMD(new Date())
  return dateOnly < todayStr
}

const suggestFollowupDate = (status?: string | null) => {
  if (!status) return ''
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let offset = 0
  if (status === 'Contacted') offset = 2
  if (status === 'Quoted') offset = 3
  if (status === 'Negotiation') offset = 1
  if (status === 'Follow Up') offset = 2
  if (status === 'Awaiting Advance') offset = 3
  if (offset === 0) return ''
  const next = new Date(start)
  next.setDate(start.getDate() + offset)
  return dateToYMD(next)
}

const DEFAULT_DISCUSSION_TOPICS = [
  'Proposal review',
  'Deliverables / coverage',
  'Team / logistics',
  'Pricing / negotiation',
  'Timeline / dates',
  'Client questions',
  'Other',
]

const NEW_LEAD_DISCUSSION_TOPICS = [
  'Initial requirements',
  'Wedding dates',
  'Location / venue',
  'Coverage expectations',
  'Next steps',
  'Other',
]

const suggestNextFollowupFromOutcome = (status: string, outcome: string, reason?: string) => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let offset = 0
  if (outcome === 'Not connected') {
    if (reason === 'Busy / asked to call later') offset = 0
    else offset = 1
  }
  if (outcome === 'Connected') {
    if (status === 'Awaiting Advance') offset = 3
    else if (status === 'Quoted') offset = 3
    else if (status === 'Negotiation') offset = 1
    else if (status === 'Contacted') offset = 2
    else offset = 2
  }
  if (status === 'Awaiting Advance' && offset === 1) offset = 3
  
  const next = new Date(start)
  next.setDate(start.getDate() + offset)
  return dateToYMD(next)
}

export default function FollowUpActionPopup({
  open,
  leadId,
  status,
  nextFollowupDate,
  defaultToDone = false,
  onClose,
  onSuccess,
  onRequestNegotiationEdit,
  useInlineNegotiationPrompt = false,
}: FollowUpActionPopupProps) {
  const [followupOriginal, setFollowupOriginal] = useState('')
  const [followupDraft, setFollowupDraft] = useState('')
  const [followupError, setFollowupError] = useState<string | null>(null)
  const [isSavingFollowup, setIsSavingFollowup] = useState(false)

  const [showDone, setShowDone] = useState(false)
  const [followupOutcome, setFollowupOutcome] = useState('')
  const [followupMode, setFollowupMode] = useState('')
  const [followupTopics, setFollowupTopics] = useState<string[]>([])
  const [followupNote, setFollowupNote] = useState('')
  const [followupNotConnectedReason, setFollowupNotConnectedReason] = useState('')
  const [followupNextDate, setFollowupNextDate] = useState('')
  const [followupDoneError, setFollowupDoneError] = useState<string | null>(null)
  const [isSavingFollowupDone, setIsSavingFollowupDone] = useState(false)
  const [showNegotiationPrompt, setShowNegotiationPrompt] = useState(false)
  const [negotiationStatusUpdated, setNegotiationStatusUpdated] = useState(false)
  const showNegotiationPromptRef = useRef(false)
  const appliedConnectedDefaultsRef = useRef(false)
  const discussionTopics =
    status === 'New' ? NEW_LEAD_DISCUSSION_TOPICS : DEFAULT_DISCUSSION_TOPICS

  const todayIso = useMemo(() => dateToYMD(new Date()), [])

  useEffect(() => {
    showNegotiationPromptRef.current = showNegotiationPrompt
  }, [showNegotiationPrompt])

  useEffect(() => {
    if (!open) return
    if (showNegotiationPromptRef.current) return
    const baseDate = nextFollowupDate ? toDateOnly(nextFollowupDate) : ''
    setFollowupOriginal(baseDate)
    setFollowupDraft(baseDate || suggestFollowupDate(status))
    setFollowupError(null)
    setShowDone(defaultToDone)
    setFollowupOutcome('')
    setFollowupMode('')
    setFollowupTopics([])
    setFollowupNote('')
    setFollowupNotConnectedReason('')
    setFollowupNextDate('')
    setFollowupDoneError(null)
    setShowNegotiationPrompt(false)
    setNegotiationStatusUpdated(false)
    appliedConnectedDefaultsRef.current = false
  }, [open, nextFollowupDate, status, defaultToDone])

  useEffect(() => {
    if (!open) return
    if (followupOutcome !== 'Connected') {
      appliedConnectedDefaultsRef.current = false
      return
    }
    if (appliedConnectedDefaultsRef.current) return
    if (!followupMode) setFollowupMode('Call')
    if (followupTopics.length === 0) {
      setFollowupTopics(status === 'New' ? ['Initial requirements'] : ['Other'])
    }
    appliedConnectedDefaultsRef.current = true
  }, [open, followupOutcome, status, followupMode, followupTopics.length])

  useEffect(() => {
    if (!open) return
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return target.isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Enter') return
      if (isTypingTarget(e.target)) return
      if (showNegotiationPrompt) return

      if (showDone) {
        const canSaveDone =
          !!followupOutcome &&
          (followupOutcome !== 'Connected' || !!followupMode) &&
          (followupOutcome !== 'Not connected' || !!followupNotConnectedReason) &&
          !!followupNextDate &&
          !isPastDate(followupNextDate) &&
          !isSavingFollowupDone
        if (canSaveDone) {
          e.preventDefault()
          void saveFollowupDone()
        }
        return
      }

      const canSaveDate =
        followupDraft !== followupOriginal &&
        !isPastDate(followupDraft) &&
        !isSavingFollowup
      if (canSaveDate) {
        e.preventDefault()
        void saveFollowupDate(followupDraft)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    onClose,
    showDone,
    followupOutcome,
    followupMode,
    followupNotConnectedReason,
    followupNextDate,
    followupDraft,
    followupOriginal,
    isSavingFollowup,
    isSavingFollowupDone,
    showNegotiationPrompt,
  ])

  const saveFollowupDate = async (date: string) => {
    if (date && isPastDate(date)) {
      setFollowupError('Follow-up date cannot be in the past')
      return
    }
    setFollowupError(null)
    setIsSavingFollowup(true)
    const res = await fetch(`/api/leads/${leadId}/followup-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ next_followup_date: date || null }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFollowupError(err?.error || 'Unable to save follow-up date')
      setIsSavingFollowup(false)
      return
    }
    const updated: FollowupUpdatedLead = await res.json().catch(() => ({}))
    onSuccess?.(updated)
    setFollowupOriginal(date || '')
    setIsSavingFollowup(false)
  }

  const saveFollowupDone = async () => {
    if (!followupOutcome) {
      setFollowupDoneError('Select an outcome')
      return
    }
    if (followupOutcome === 'Connected' && !followupMode) {
      setFollowupDoneError('Select follow-up mode')
      return
    }
    if (followupOutcome === 'Not connected' && !followupNotConnectedReason) {
      setFollowupDoneError('Select a reason')
      return
    }
    if (!followupNextDate) {
      setFollowupDoneError('Select a follow-up date')
      return
    }
    if (isPastDate(followupNextDate)) {
      setFollowupDoneError('Follow-up date cannot be in the past')
      return
    }

    setIsSavingFollowupDone(true)
    setFollowupDoneError(null)
    const res = await fetch(`/api/leads/${leadId}/followup-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        outcome: followupOutcome,
        follow_up_mode: followupOutcome === 'Connected' ? followupMode : null,
        discussed_topics: followupOutcome === 'Connected' && followupTopics.length ? followupTopics : null,
        note:
          followupOutcome === 'Connected'
            ? followupNote || null
            : followupNotConnectedReason === 'Other'
              ? followupNote || null
              : null,
        not_connected_reason: followupOutcome === 'Not connected' ? followupNotConnectedReason : null,
        next_followup_date: followupNextDate,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFollowupDoneError(err?.error || 'Unable to save follow-up')
      setIsSavingFollowupDone(false)
      return
    }

    const updated: FollowupUpdatedLead = await res.json().catch(() => ({}))
    setIsSavingFollowupDone(false)
    await Promise.resolve(
      onSuccess?.(updated, {
        outcome: followupOutcome,
        status,
        discussedPricing: followupTopics.includes('Pricing / negotiation'),
      })
    )
    const autoNegotiationFailed =
      updated?.auto_negotiation?.attempted && !updated?.auto_negotiation?.success
    const statusUpdated =
      updated?.status === 'Negotiation' && status !== 'Negotiation'
    const shouldPromptNegotiation =
      useInlineNegotiationPrompt &&
      followupOutcome === 'Connected' &&
      followupTopics.includes('Pricing / negotiation') &&
      typeof onRequestNegotiationEdit === 'function' &&
      !autoNegotiationFailed &&
      (statusUpdated || updated?.auto_negotiation?.success)
    if (shouldPromptNegotiation) {
      setNegotiationStatusUpdated(statusUpdated)
      setShowNegotiationPrompt(true)
      return
    }
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (showNegotiationPrompt) return
        onClose()
      }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-neutral-900">Follow-up</div>
          <button
            className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
            onClick={() => {
              if (showNegotiationPrompt) return
              onClose()
            }}
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="text-xs uppercase tracking-widest text-neutral-500">Next follow-up</div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarInput
              className="h-8 cursor-pointer rounded-md border border-[var(--border)] bg-white px-2 text-sm"
              value={followupDraft}
              min={todayIso}
              onChange={v => {
                setFollowupDraft(v)
                if (v && isPastDate(v)) {
                  setFollowupError('Follow-up date cannot be in the past')
                  return
                }
                setFollowupError(null)
              }}
              disabled={isSavingFollowup}
            />
            <button
              className="btn-pill bg-neutral-900 text-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-neutral-800 disabled:opacity-60"
              disabled={isSavingFollowup || followupDraft === followupOriginal}
              onClick={() => void saveFollowupDate(followupDraft)}
            >
              {isSavingFollowup ? 'Saving…' : 'Save'}
            </button>
            <button
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
              disabled={isSavingFollowup}
              onClick={() => {
                setFollowupDraft(followupOriginal)
                setFollowupError(null)
              }}
            >
              Cancel
            </button>
          </div>
          {followupError && <div className="text-xs text-red-600">{followupError}</div>}
        </div>

        {!showDone && (
          <div className="mt-4">
            <button
              className="btn-pill bg-neutral-900 text-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-neutral-800"
              onClick={() => {
                setShowDone(true)
                setFollowupOutcome('')
                setFollowupMode('')
                setFollowupTopics([])
                setFollowupNote('')
                setFollowupNotConnectedReason('')
                setFollowupNextDate('')
                setFollowupDoneError(null)
              }}
            >
              Mark Follow-up Done
            </button>
          </div>
        )}

        {showDone && (
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-white/95 px-3 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">Follow-up outcome</div>
            <div className="flex flex-wrap gap-2">
              {['Connected', 'Not connected'].map(option => (
                <button
                  key={option}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    followupOutcome === option
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-[var(--border)] bg-white text-neutral-700'
                  }`}
                  onClick={() => {
                    setFollowupOutcome(option)
                    if (option !== 'Connected') {
                      setFollowupMode('')
                      setFollowupTopics([])
                    }
                    if (option !== 'Not connected') {
                      setFollowupNotConnectedReason('')
                    }
                    setFollowupNote('')
                    const suggested = suggestNextFollowupFromOutcome(status, option)
                    if (suggested) setFollowupNextDate(suggested)
                    setFollowupDoneError(null)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
            {followupOutcome === 'Connected' && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">Follow-up mode</div>
                <div className="flex flex-wrap gap-2">
                  {['Call', 'WhatsApp', 'Email', 'In-person', 'Other'].map(option => (
                    <button
                      key={option}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        followupMode === option
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-[var(--border)] bg-white text-neutral-700'
                      }`}
                      onClick={() => {
                        setFollowupMode(option)
                        setFollowupDoneError(null)
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {followupOutcome === 'Not connected' && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">Reason</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Did not pick up',
                    'Phone switched off',
                    'Busy / asked to call later',
                    'Number unreachable',
                    'Wrong number',
                    'Other',
                  ].map(option => (
                    <button
                      key={option}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        followupNotConnectedReason === option
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-[var(--border)] bg-white text-neutral-700'
                      }`}
                      onClick={() => {
                        setFollowupNotConnectedReason(option)
                        setFollowupDoneError(null)
                        if (option === 'Busy / asked to call later') {
                          setFollowupNextDate(suggestNextFollowupFromOutcome(status, 'Not connected', option))
                        }
                        if (option !== 'Other') {
                          setFollowupNote('')
                        }
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {followupOutcome === 'Connected' && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">What was discussed?</div>
                <div className="flex flex-wrap gap-2">
                  {discussionTopics.map(topic => {
                    const active = followupTopics.includes(topic)
                    return (
                      <button
                        key={topic}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          active
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-[var(--border)] bg-white text-neutral-700'
                        }`}
                        onClick={() => {
                          setFollowupTopics(prev =>
                            prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
                          )
                        }}
                      >
                        {topic}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {(followupOutcome === 'Connected' ||
              (followupOutcome === 'Not connected' && followupNotConnectedReason === 'Other')) && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">Note</div>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-2 text-sm"
                  rows={2}
                  placeholder={
                    followupOutcome === 'Not connected'
                      ? 'Any additional context (optional)'
                      : 'Client wants revised quote without album.'
                  }
                  value={followupNote}
                  onChange={e => setFollowupNote(e.target.value)}
                  maxLength={1000}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Next follow-up</div>
              <div className="flex flex-wrap items-center gap-2">
                <CalendarInput
                  className="h-8 cursor-pointer rounded-md border border-[var(--border)] bg-white px-2 text-sm"
                  value={followupNextDate}
                  min={todayIso}
                  onChange={v => {
                    setFollowupNextDate(v)
                    if (v && isPastDate(v)) {
                      setFollowupDoneError('Follow-up date cannot be in the past')
                    } else {
                      setFollowupDoneError(null)
                    }
                  }}
                  disabled={!followupOutcome || isSavingFollowupDone}
                />
                <button
                  className="btn-pill bg-neutral-900 text-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-neutral-800"
                  disabled={!followupOutcome || isSavingFollowupDone}
                  onClick={saveFollowupDone}
                >
                  {isSavingFollowupDone ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
                  onClick={() => {
                    setShowDone(false)
                    setFollowupOutcome('')
                    setFollowupMode('')
                    setFollowupTopics([])
                    setFollowupNote('')
                    setFollowupNotConnectedReason('')
                    setFollowupNextDate('')
                    setFollowupDoneError(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
            {followupDoneError && <div className="text-[11px] text-red-600">{followupDoneError}</div>}
          </div>
        )}
      </div>

      {showNegotiationPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-neutral-900">Update Negotiations?</div>
            <div className="mt-2 text-sm text-neutral-700">
              {negotiationStatusUpdated && (
                <div className="mb-1">Status changed to Negotiation.</div>
              )}
              <div>You marked “Pricing / negotiation” during this follow-up. Do you want to update the Negotiations tab now?</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-[var(--surface-muted)]"
                onClick={() => {
                  setShowNegotiationPrompt(false)
                  onClose()
                }}
              >
                No
              </button>
              <button
                className="btn-pill bg-neutral-900 text-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-neutral-800"
                onClick={() => {
                  setShowNegotiationPrompt(false)
                  onRequestNegotiationEdit?.()
                  onClose()
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
