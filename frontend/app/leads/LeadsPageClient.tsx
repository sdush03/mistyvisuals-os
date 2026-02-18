'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SalesKanbanView } from '../sales/kanban/page'
import { SalesTableView } from '../sales/page'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneField from '@/components/PhoneField'
import DuplicateContactModal, { type DuplicateResults } from '@/components/DuplicateContactModal'
import { checkContactDuplicates, hasDuplicates } from '@/lib/contactDuplicates'
import { getRouteStateKey, readRouteState, shouldRestoreScroll, writeRouteState } from '@/lib/routeState'

export default function LeadsPage() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const router = useRouter()
  const searchParams = useSearchParams()

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [source, setSource] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [addError, setAddError] = useState('')
  const [addFieldErrors, setAddFieldErrors] = useState<{
    name?: string
    primaryPhone?: string
    source?: string
    sourceName?: string
  }>({})
  const [addShake, setAddShake] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicateData, setDuplicateData] = useState<DuplicateResults | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [pendingAddSave, setPendingAddSave] = useState<(() => void) | null>(null)
  const routeKey = typeof window !== 'undefined' ? getRouteStateKey(window.location.pathname) : ''

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

  useEffect(() => {
    const paramView = searchParams.get('view')
    const restoreAllowed = shouldRestoreScroll()
    if (paramView === 'kanban' || paramView === 'table') {
      setView(paramView)
      sessionStorage.setItem('leads_view', paramView)
    } else {
      const storedState = restoreAllowed && routeKey ? readRouteState(routeKey) : null
      const storedView = storedState?.activeTab
      if (restoreAllowed && (storedView === 'kanban' || storedView === 'table')) {
        setView(storedView)
        return
      }
      if (restoreAllowed) {
        const stored = sessionStorage.getItem('leads_view')
        if (stored === 'kanban' || stored === 'table') {
          setView(stored)
          return
        }
      }
      setView('kanban')
    }
  }, [searchParams, routeKey])

  useEffect(() => {
    sessionStorage.setItem('leads_view', view)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.replace(`/leads?${params.toString()}`)
    if (routeKey) {
      writeRouteState(routeKey, { activeTab: view })
    }
  }, [view, routeKey])

  // Scroll restore is handled globally by ScrollRestoration.

  useEffect(() => {
    refreshLeads()
  }, [])

  const refreshLeads = () => {
    setLoading(true)
    apiFetch('http://localhost:3001/leads')
      .then(res => res.json())
      .then(data => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setLoadError('Unable to load leads right now.')
        setLoading(false)
      })
  }

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

  const scrollToFirstError = () => {
    if (typeof document === 'undefined') return
    const target = document.querySelector('.field-error') as HTMLElement | null
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }


  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return leads
    const qDigits = q.replace(/\D/g, '')
    return leads.filter(l => {
      const fields = [
        l.name,
        l.bride_name,
        l.groom_name,
        l.primary_phone,
        l.phone_primary,
        l.phone_secondary,
        l.bride_phone_primary,
        l.bride_phone_secondary,
        l.groom_phone_primary,
        l.groom_phone_secondary,
      ]
        .filter(Boolean)
        .map((v: string) => v.toLowerCase())
      if (fields.some(v => v.includes(q))) return true
      if (!qDigits) return false
      const phoneDigits = fields.map(v => v.replace(/\D/g, ''))
      return phoneDigits.some(v => v.includes(qDigits))
    })
  }, [leads, search])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) {
      const key = lead.status || 'New'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [leads])

  const handleAddLead = async () => {
    setAddError('')
    const formattedName = formatName(name)
    const nextErrors: { name?: string; primaryPhone?: string; source?: string; sourceName?: string } = {}
    if (!formattedName) {
      nextErrors.name = 'Full name is required'
    }
    const normalized = normalizePhone(primaryPhone)
    if (!normalized) {
      nextErrors.primaryPhone = 'Valid contact number required'
    }
    if (!source) {
      nextErrors.source = 'Source is required'
    }
    const needsSourceName = ['Direct Call', 'WhatsApp', 'Reference'].includes(source)
    if (needsSourceName && !sourceName.trim()) {
      nextErrors.sourceName = 'Name is required for this source'
    }
    if (Object.keys(nextErrors).length) {
      setAddFieldErrors(nextErrors)
      setAddShake(true)
      setTimeout(() => setAddShake(false), 300)
      requestAnimationFrame(scrollToFirstError)
      return
    }
    setAddFieldErrors({})

    const doSave = async () => {
      setIsSubmitting(true)
    const res = await apiFetch('http://localhost:3001/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: formattedName,
        primary_phone: normalized,
        source,
          source_name: needsSourceName ? sourceName.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data?.error || 'Failed to add lead')
        setIsSubmitting(false)
        return
      }
      setLeads(prev => [data, ...prev])
      setName('')
      setPrimaryPhone('')
      setSource('')
      setSourceName('')
      setShowAdd(false)
      setIsSubmitting(false)
      if (data?.id) {
        const params = new URLSearchParams()
        params.set('from', `/leads?view=${view}`)
        router.push(`/leads/${data.id}/intake?${params.toString()}`)
      }
    }

    const phonesToCheck = normalized ? [normalized] : []
    if (phonesToCheck.length) {
      const duplicates = await checkContactDuplicates({
        phones: phonesToCheck,
      })
      if (hasDuplicates(duplicates)) {
        setDuplicateData(duplicates)
        setPendingAddSave(() => doSave)
        setShowDuplicateModal(true)
        return
      }
    }

    await doSave()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Sales
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold mt-2">Leads</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Track inquiries, manage status, and follow up without losing context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <input
            className="w-full md:w-72 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm"
            placeholder="Search Leads by Name or Phone"
            value={search}
            autoComplete="off"
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={() => {
              setAddFieldErrors({})
              setAddError('')
              setAddShake(false)
              setShowAdd(true)
            }}
            className="btn-pill rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800"
          >
            + Add Lead
          </button>
          <div className="inline-flex w-full md:w-auto rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 text-sm shadow-sm">
            <button
              onClick={() => setView('kanban')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-full transition ${
                view === 'kanban'
                  ? 'bg-neutral-900 text-white shadow'
                  : 'text-neutral-700 hover:bg-[var(--surface-muted)]'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-full transition ${
                view === 'table'
                  ? 'bg-neutral-900 text-white shadow'
                  : 'text-neutral-700 hover:bg-[var(--surface-muted)]'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-4 md:mx-0 px-4 md:px-0">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
            {STATUSES.map(s => (
              <div key={s} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1">
                <span>{s}</span>
                <span className="font-semibold text-neutral-900">{statusCounts[s] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        {view === 'kanban'
          ? <SalesKanbanView
              showHeader={false}
              leads={filteredLeads}
              loading={loading}
              loadError={loadError}
              onLeadsChange={setLeads}
              onRefresh={refreshLeads}
            />
          : <SalesTableView
              showHeader={false}
              leads={filteredLeads}
              loading={loading}
              loadError={loadError}
              onLeadsChange={setLeads}
            />}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Lead</h3>
              <button
                onClick={() => {
                  setAddFieldErrors({})
                  setAddError('')
                  setAddShake(false)
                  setShowAdd(false)
                }}
                className="text-sm text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <input
                className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] placeholder:text-neutral-400 ${addFieldErrors.name ? 'field-error' : ''} ${addFieldErrors.name && addShake ? 'shake' : ''}`}
                placeholder="Full Name*"
                value={name}
                autoComplete="new-password"
                onChange={e => {
                  setName(e.target.value)
                  if (addFieldErrors.name && e.target.value.trim()) {
                    setAddFieldErrors(prev => ({ ...prev, name: undefined }))
                  }
                }}
                onBlur={e => setName(formatName(e.target.value))}
              />
              {addFieldErrors.name && (
                <div className="text-xs text-red-600">{addFieldErrors.name}</div>
              )}
              <PhoneField
                className={`border-black ${addFieldErrors.primaryPhone ? 'field-error' : ''} ${addFieldErrors.primaryPhone && addShake ? 'shake' : ''}`}
                placeholder="Contact Number*"
                value={primaryPhone || null}
                onChange={v => {
                  setPrimaryPhone(String(v ?? ''))
                  if (addFieldErrors.primaryPhone && isValidPhone(String(v ?? ''))) {
                    setAddFieldErrors(prev => ({ ...prev, primaryPhone: undefined }))
                  }
                }}
              />
              {addFieldErrors.primaryPhone && (
                <div className="text-xs text-red-600">{addFieldErrors.primaryPhone}</div>
              )}
              <select
                className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] ${!source ? 'text-neutral-400' : ''} ${addFieldErrors.source ? 'field-error' : ''} ${addFieldErrors.source && addShake ? 'shake' : ''}`}
                value={source}
                onChange={e => {
                  setSource(e.target.value)
                  if (!['Direct Call', 'WhatsApp', 'Reference'].includes(e.target.value)) {
                    setSourceName('')
                  }
                  if (addFieldErrors.source && e.target.value) {
                    setAddFieldErrors(prev => ({ ...prev, source: undefined }))
                  }
                }}
              >
                <option value="" disabled>Source*</option>
                <option value="Instagram">Instagram</option>
                <option value="Direct Call">Direct Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Reference">Reference</option>
                <option value="Website">Website</option>
                <option value="Unknown">Unknown</option>
              </select>
              {['Direct Call', 'WhatsApp', 'Reference'].includes(source) && (
                <input
                  className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] placeholder:text-neutral-400 ${addFieldErrors.sourceName ? 'field-error' : ''} ${addFieldErrors.sourceName && addShake ? 'shake' : ''}`}
                  placeholder="Name *"
                  value={sourceName}
                  autoComplete="new-password"
                  onChange={e => {
                    setSourceName(e.target.value)
                    if (addFieldErrors.sourceName && e.target.value.trim()) {
                      setAddFieldErrors(prev => ({ ...prev, sourceName: undefined }))
                    }
                  }}
                />
              )}
              {addFieldErrors.sourceName && (
                <div className="text-xs text-red-600">{addFieldErrors.sourceName}</div>
              )}
              {addFieldErrors.source && (
                <div className="text-xs text-red-600">{addFieldErrors.source}</div>
              )}
            </div>
            {addError && (
              <div className="mt-3 text-sm text-red-600">{addError}</div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAddFieldErrors({})
                  setAddError('')
                  setAddShake(false)
                  setShowAdd(false)
                }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DuplicateContactModal
        open={showDuplicateModal}
        duplicates={duplicateData}
        onContinue={() => {
          const action = pendingAddSave
          setShowDuplicateModal(false)
          setDuplicateData(null)
          setPendingAddSave(null)
          if (action) action()
        }}
        onOpenLeads={(leadIds) => {
          if (typeof window !== 'undefined') {
            leadIds.forEach(idValue => {
              window.open(`/leads/${idValue}`, '_blank', 'noopener,noreferrer')
            })
          }
        }}
      />
    </div>
  )
}
