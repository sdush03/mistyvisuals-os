'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneActions from '@/components/PhoneActions'
import PhoneField from '@/components/PhoneField'
import { formatINR, formatDurationSeconds } from '@/lib/formatters'
import { fetchConversionSummary, type ConversionSummary } from '@/lib/conversionSummary'
import { getRouteStateKey, readRouteState, shouldRestoreScroll, writeRouteState } from '@/lib/routeState'
import { getAuth } from '@/lib/authClient'

type Lead = {
  id: number
  lead_number?: number | null
  name: string
  primary_phone: string
  phone_primary?: string
  full_name?: string
  source: string
  status: string
  heat: 'Hot' | 'Warm' | 'Cold'
  next_followup_date?: string | null
  first_contacted_at?: string | null
  last_followup_at?: string | null
  event_type?: string | null
  events?: { event_type?: string | null; event_date?: string | null; slot?: string | null }[]
  client_budget_amount?: number | string | null
  amount_quoted?: number | string | null
  discounted_amount?: number | string | null
  client_offer_amount?: number | string | null
  potential?: boolean | string | null
  important?: boolean | string | null
}

export function SalesTableView({
  showHeader = true,
  leads,
  loading,
  loadError,
  onLeadsChange,
}: {
  showHeader?: boolean
  leads?: Lead[]
  loading?: boolean
  loadError?: string
  onLeadsChange?: (next: Lead[]) => void
}) {
  const [localLeads, setLocalLeads] = useState<Lead[]>([])
  const headerScrollRef = useRef<HTMLDivElement | null>(null)
  const bodyScrollRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })
  const [name, setName] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [source, setSource] = useState('Unknown')
  const [error, setError] = useState('')
  const [localLoading, setLocalLoading] = useState(true)
  const [localError, setLocalError] = useState('')
  const [actionError, setActionError] = useState('')
  const [convertConfirmLead, setConvertConfirmLead] = useState<Lead | null>(null)
  const [convertSummary, setConvertSummary] = useState<ConversionSummary | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertSaving, setConvertSaving] = useState(false)
  const [userName, setUserName] = useState('')

  const formatName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed
      .split(/\s+/)
      .map(part =>
        part
          ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          : ''
      )
      .join(' ')
  }

  function normalizePhone(value?: string | null) {
    if (!value) return null

    const parsed = parsePhoneNumberFromString(value, 'IN')
    if (!parsed || !parsed.isValid()) return null

    return parsed.format('E.164')
  }

  function isValidPhone(value?: string | null) {
    if (!value) return false
    const parsed = parsePhoneNumberFromString(value, 'IN')
    return Boolean(parsed && parsed.isValid())
  }

  const activeLeads = leads ?? localLeads
  const isLoading = loading ?? localLoading
  const errorText = loadError ?? localError

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

  const addLead = async () => {
    setError('')

    if (name.trim().length < 2) {
      setError('Name is required')
      return
    }

    const normalizedPrimary = normalizePhone(primaryPhone)
    if (!normalizedPrimary) {
      setError('Enter a valid phone number')
      return
    }

    const res = await apiFetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: formatName(name),
        primary_phone: normalizedPrimary,
        source,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to add lead')
      return
    }

    const next = [data, ...(activeLeads || [])]
    if (onLeadsChange) {
      onLeadsChange(next)
    } else {
      setLocalLeads(next)
    }
    setName('')
    setPrimaryPhone('')
    if (data?.id) {
      const params = new URLSearchParams()
      params.set('from', '/leads?view=table')
      router.push(`/leads/${data.id}/intake?${params.toString()}`)
    }
  }

  const updateHeat = async (id: number, heat: Lead['heat']) => {
    const res = await apiFetch(
      `/api/leads/${id}/heat`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ heat }),
      }
    )

    const updated = await res.json().catch(() => null)
    if (!res.ok) {
      setActionError(updated?.error || updated?.message || 'Failed to update heat')
      return
    }
    const next = activeLeads.map(l => (l.id === id ? updated : l))
    if (onLeadsChange) {
      onLeadsChange(next)
    } else {
      setLocalLeads(next)
    }
  }

  const heatColor = (heat: Lead['heat']) => {
    if (heat === 'Hot') return 'bg-red-100 text-red-700'
    if (heat === 'Cold') return 'bg-blue-100 text-blue-700'
    return 'bg-yellow-100 text-yellow-700'
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
    const dateOnly = toDateOnly(value)
    if (!dateOnly) return false
    const todayStr = dateToYMD(new Date())
    return dateOnly < todayStr
  }

  const isTerminalStatus = (status?: string | null) =>
    ['Lost', 'Rejected', 'Converted'].includes(status || '')

  useEffect(() => {
    const headerEl = headerScrollRef.current
    const bodyEl = bodyScrollRef.current
    if (!headerEl || !bodyEl) return
    let syncing = false
    const syncFromBody = () => {
      if (syncing) return
      syncing = true
      headerEl.scrollLeft = bodyEl.scrollLeft
      syncing = false
    }
    const syncFromHeader = () => {
      if (syncing) return
      syncing = true
      bodyEl.scrollLeft = headerEl.scrollLeft
      syncing = false
    }
    bodyEl.addEventListener('scroll', syncFromBody, { passive: true })
    headerEl.addEventListener('scroll', syncFromHeader, { passive: true })
    return () => {
      bodyEl.removeEventListener('scroll', syncFromBody)
      headerEl.removeEventListener('scroll', syncFromHeader)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getRouteStateKey(window.location.pathname)
    const stored = readRouteState(key)
    if (!shouldRestoreScroll()) return
    if (!stored || !bodyScrollRef.current || !headerScrollRef.current) return
    const scrollX = typeof stored.scrollX === 'number' ? stored.scrollX : 0
    const timer = window.setTimeout(() => {
      if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = scrollX
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollX
    }, 50)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !bodyScrollRef.current) return
    const key = getRouteStateKey(window.location.pathname)
    let throttle: number | null = null
    const saveScroll = () => {
      writeRouteState(key, { scrollX: bodyScrollRef.current?.scrollLeft || 0 })
    }
    const onScroll = () => {
      if (throttle) return
      throttle = window.setTimeout(() => {
        throttle = null
        saveScroll()
      }, 120)
    }
    const el = bodyScrollRef.current
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (throttle) window.clearTimeout(throttle)
    }
  }, [bodyScrollRef])

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

  const formatEventDate = (value?: string | null) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit' })
    const month = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', month: 'short' })
    return `${day} ${month}`
  }

  const formatShortDate = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatStageDuration = (days?: number | null) => {
    if (days === null || days === undefined) return '—'
    const num = Number(days)
    if (!Number.isFinite(num)) return '—'
    return formatDurationSeconds(num * 24 * 60 * 60, '—')
  }

  const toBool = (value: any) => String(value || '').toLowerCase() === 'yes' || value === true

  const updateStatus = async (id: number, status: string, advanceReceived?: boolean) => {
    const current = activeLeads.find(l => l.id === id)
    if (current?.status === status) return
    setActionError('')
    const res = await apiFetch(`/api/leads/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        status,
        advance_received: advanceReceived === true ? true : undefined,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err?.code === 'ADVANCE_REQUIRED') {
        setConvertError('Please collect the advance amount before marking this lead as Converted.')
        return
      }
      setActionError(err?.error || err?.message || 'Failed to update status')
      return
    }
    const updated = await res.json()
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
    await updateStatus(leadId, 'Converted', true)
    setConvertSaving(false)
    setConvertSummary(null)
    if (viewProject && leadId) {
      window.location.href = `/leads/${leadId}`
    }
  }

  return (
    <div className="max-w-7xl">
      {showHeader && (
        <h2 className="text-2xl font-semibold mb-6">
          Sales
        </h2>
      )}

      {/* TABLE */}
      <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm">
        {actionError && (
          <div className="px-4 py-3 text-sm text-red-600 border-b border-[var(--border)]">
            {actionError}
          </div>
        )}

        <div className="sticky top-0 z-20 bg-[var(--surface-muted)] border-b border-[var(--border)] overflow-x-hidden">
          <div className="overflow-x-hidden" ref={headerScrollRef}>
            <table className="w-full text-sm min-w-[1400px] table-fixed border-separate border-spacing-0">
              <thead className="text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-left w-20">Lead #</th>
                  <th className="px-4 py-3 text-left w-32">Event Type</th>
                  <th className="px-4 py-3 text-left w-56">Name</th>
                  <th className="px-4 py-3 text-left w-44">Contact</th>
                  <th className="px-4 py-3 text-left w-32">Source</th>
                  <th className="px-4 py-3 text-left w-36">Stage</th>
                  <th className="px-4 py-3 text-left w-36">Last Contacted</th>
                  <th className="px-4 py-3 text-left w-36">Next Follow-up</th>
                  <th className="px-4 py-3 text-left w-28">Lead Heat</th>
                  <th className="px-4 py-3 text-left w-64">Events</th>
                  <th className="px-4 py-3 text-left w-36">Amount Quoted</th>
                  <th className="px-4 py-3 text-left w-28">Budget</th>
                  <th className="px-4 py-3 text-left w-36">Discounted Price</th>
                  <th className="px-4 py-3 text-left w-32">Client Offer</th>
                </tr>
              </thead>
            </table>
          </div>
        </div>

        <div className="overflow-x-auto" ref={bodyScrollRef}>
          <table className="w-full text-sm min-w-[1400px] table-fixed border-separate border-spacing-0">
            <tbody>
            {isLoading && (
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-6 text-sm text-neutral-500" colSpan={14}>
                  Loading leads…
                </td>
              </tr>
            )}
            {!isLoading && errorText && (
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-6 text-sm text-red-600" colSpan={14}>
                  {errorText}
                </td>
              </tr>
            )}
            {!isLoading && !errorText && activeLeads.length === 0 && (
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-6 text-sm text-neutral-600" colSpan={14}>
                  No leads yet. Add your first lead using the form above.
                </td>
              </tr>
            )}
            {!isLoading && !errorText && activeLeads.map(lead => {
              const rawName = (lead.name || (lead as any).full_name || '').trim()
              const rawPhone = (lead.primary_phone || lead.phone_primary || '').trim()
              const displayName = rawName || 'Unnamed Lead'
              const leadNumber = lead.lead_number ?? lead.id
              const overdue =
                !!lead.next_followup_date &&
                isPastDate(lead.next_followup_date) &&
                !isTerminalStatus(lead.status)

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
              const leadHref = `/leads/${lead.id}?${params.toString()}`

              return (
                <tr
                  key={lead.id}
                  className="border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-muted)] transition"
                  onClick={() => {
                    window.location.href = leadHref
                  }}
                >
                  <td className="px-4 py-3 text-neutral-700 w-20">#{leadNumber}</td>
                  <td className="px-4 py-3 w-32">{lead.event_type || '—'}</td>
                  <td className="px-4 py-3 font-medium w-56">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{displayName}</span>
                      <div className="ml-auto flex flex-col items-end gap-1">
                      {String(lead.status || '').toLowerCase() === 'new' && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          New
                        </span>
                      )}
                      {toBool(lead.important) && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                          Important
                        </span>
                      )}
                        {toBool(lead.potential) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Potential
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-44">
                    <PhoneActions phone={rawPhone} leadId={lead.id} stopPropagation />
                  </td>
                  <td className="px-4 py-3 w-32">{lead.source}</td>
                  <td className="px-4 py-3 w-36">
                    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-neutral-700">
                      {lead.status}
                    </span>
                    {overdue && (
                      <div className="text-[11px] text-amber-700">Follow-up overdue</div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-36">
                    {formatShortDate(lead.last_followup_at || lead.first_contacted_at || null)}
                  </td>
                  <td className="px-4 py-3 w-36">
                    <span className={overdue ? 'text-amber-700' : 'text-neutral-700'}>
                      {formatShortDate(lead.next_followup_date || null)}
                    </span>
                  </td>
                  <td className="px-4 py-3 w-28">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${heatColor(
                      lead.heat
                    )}`}>
                      {lead.heat}
                    </span>
                  </td>
                  <td className="px-4 py-3 w-64">
                    {lead.events && lead.events.length > 0 ? (
                      <div className="space-y-1 text-[11px] text-neutral-600">
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
                    ) : (
                      <div className="text-xs text-neutral-400">—</div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-36">
                    {lead.amount_quoted != null && lead.amount_quoted !== ''
                      ? formatINR(lead.amount_quoted)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 w-28">
                    {lead.client_budget_amount != null && lead.client_budget_amount !== ''
                      ? formatINR(lead.client_budget_amount)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 w-36">
                    {lead.discounted_amount != null && lead.discounted_amount !== ''
                      ? formatINR(lead.discounted_amount)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 w-32">
                    {lead.client_offer_amount != null && lead.client_offer_amount !== ''
                      ? formatINR(lead.client_offer_amount)
                      : '—'}
                  </td>
                </tr>
              )
            })}
            </tbody>
          </table>
        </div>
      </div>

      {convertConfirmLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Confirm Conversion</div>
            <div className="mt-2 text-sm text-neutral-700">Has the advance amount been credited?</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                onClick={() => {
                  setConvertConfirmLead(null)
                  setConvertError('Please collect the advance amount before marking this lead as Converted.')
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
    </div>
  )
}

export default function SalesPage() {
  return <SalesTableView />
}
