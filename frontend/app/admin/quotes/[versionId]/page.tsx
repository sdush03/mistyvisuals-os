'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CurrencyInput from '@/components/CurrencyInput'
import { useParams } from 'next/navigation'
import { create } from 'zustand'

type QuoteHero = {
  title: string
  subtitle: string
  location: string
  date: string
  coverImageUrl: string
}

type QuoteEvent = {
  name: string
  date: string
  location: string
}

type QuoteDeliverable = {
  label: string
  description: string
}

type QuoteTimelineItem = {
  title: string
  time: string
}

type QuotePricingItem = {
  label: string
  quantity: number
  unitPrice: number
}

type QuotePaymentScheduleItem = {
  label: string
  dueDate: string
  amount: number
}

type QuoteDraft = {
  hero: QuoteHero
  events: QuoteEvent[]
  deliverables: QuoteDeliverable[]
  timeline: QuoteTimelineItem[]
  pricingItems: QuotePricingItem[]
  paymentSchedule: QuotePaymentScheduleItem[]
  overridePrice: number | null
  overrideReason: string
  quoteGroupId: number | null
}

type PricingSummary = {
  calculatedPrice: number
  targetPrice: number
  minimumPrice: number
}

type QuoteBuilderState = {
  draft: QuoteDraft
  pricingSummary: PricingSummary
  isSaving: boolean
  lastSavedAt: string | null
  setDraft: (next: QuoteDraft) => void
  updateDraft: (patch: Partial<QuoteDraft>) => void
  setPricingSummary: (summary: Partial<PricingSummary>) => void
  setSaving: (value: boolean) => void
  setLastSavedAt: (value: string | null) => void
}

const emptyDraft: QuoteDraft = {
  hero: {
    title: 'Wedding Proposal',
    subtitle: 'Captured with care',
    location: '',
    date: '',
    coverImageUrl: '',
  },
  events: [],
  deliverables: [],
  timeline: [],
  pricingItems: [],
  paymentSchedule: [],
  overridePrice: null,
  overrideReason: '',
  quoteGroupId: null,
}

const useQuoteBuilderStore = create<QuoteBuilderState>((set) => ({
  draft: emptyDraft,
  pricingSummary: { calculatedPrice: 0, targetPrice: 0, minimumPrice: 0 },
  isSaving: false,
  lastSavedAt: null,
  setDraft: (draft) => set({ draft }),
  updateDraft: (patch) =>
    set((state) => ({ draft: { ...state.draft, ...patch } })),
  setPricingSummary: (summary) =>
    set((state) => ({ pricingSummary: { ...state.pricingSummary, ...summary } })),
  setSaving: (value) => set({ isSaving: value }),
  setLastSavedAt: (value) => set({ lastSavedAt: value }),
}))

const cardClass = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500'
const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none'

const formatMoney = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

const QuoteBuilderPage = () => {
  const params = useParams() as { versionId: string }
  const versionId = params.versionId
  const {
    draft,
    pricingSummary,
    isSaving,
    lastSavedAt,
    setDraft,
    updateDraft,
    setPricingSummary,
    setSaving,
    setLastSavedAt,
  } = useQuoteBuilderStore()
  const [error, setError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null)
  const pricingTimer = useRef<NodeJS.Timeout | null>(null)

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

  useEffect(() => {
    let active = true
    apiFetch(`/api/quote-versions/${versionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        if (data?.draftDataJson && typeof data.draftDataJson === 'object') {
          setDraft({ ...emptyDraft, ...data.draftDataJson, quoteGroupId: data.quoteGroupId ?? null })
        } else {
          setDraft({ ...emptyDraft, quoteGroupId: data.quoteGroupId ?? null })
        }
        setPricingSummary({
          calculatedPrice: Number(data?.calculatedPrice || 0),
          targetPrice: Number(data?.targetPrice || 0),
          minimumPrice: Number(data?.minimumPrice || 0),
        })
      })
      .catch(() => setError('Unable to load quotation.'))
    return () => {
      active = false
    }
  }, [versionId, setDraft, setPricingSummary])

  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await apiFetch(`/api/quote-versions/${versionId}/draft`, {
          method: 'PATCH',
          body: JSON.stringify({ draftDataJson: draft }),
        })
        setLastSavedAt(new Date().toISOString())
      } catch {
        setError('Autosave failed. Please retry.')
      } finally {
        setSaving(false)
      }
    }, 2000)

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [draft, versionId, setSaving, setLastSavedAt])

  useEffect(() => {
    if (pricingTimer.current) clearTimeout(pricingTimer.current)
    pricingTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/quote-versions/${versionId}/calculate`, {
          method: 'POST',
        })
        const data = await res.json()
        setPricingSummary({
          calculatedPrice: Number(data?.calculatedPrice || 0),
          targetPrice: Number(data?.targetPrice || 0),
          minimumPrice: Number(data?.minimumPrice || 0),
        })
      } catch {
        // ignore pricing error for now
      }
    }, 400)

    return () => {
      if (pricingTimer.current) clearTimeout(pricingTimer.current)
    }
  }, [draft.pricingItems, versionId, setPricingSummary])

  const handleCreateVersion = async () => {
    if (!draft.quoteGroupId) {
      setError('Missing quote group.')
      return
    }
    setActionNotice(null)
    try {
      const res = await apiFetch(`/api/quote-groups/${draft.quoteGroupId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          targetPrice: pricingSummary.targetPrice,
          softDiscountPrice: null,
          minimumPrice: pricingSummary.minimumPrice,
          draftDataJson: draft,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Unable to create version')
      setActionNotice(`New version created (V${data.versionNumber}).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create version.')
    }
  }

  const handleSendProposal = async () => {
    setActionNotice(null)
    try {
      const res = await apiFetch(`/api/quote-versions/${versionId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Unable to send proposal')
      setActionNotice(`Proposal sent. Token: ${data.proposalToken}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send proposal.')
    }
  }

  const savingsLabel = useMemo(() => {
    if (isSaving) return 'Saving…'
    if (!lastSavedAt) return 'Not saved yet'
    const time = new Date(lastSavedAt)
    return `Saved ${time.toLocaleTimeString()}`
  }, [isSaving, lastSavedAt])

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">ADMIN</div>
          <h1 className="text-2xl font-semibold text-neutral-900">Quotation Builder</h1>
          <p className="text-sm text-neutral-600">Build and preview proposal in real time.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-neutral-500">{savingsLabel}</div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm" onClick={handleCreateVersion}>
              Create Version
            </button>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white" onClick={handleSendProposal}>
              Send Proposal
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {actionNotice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionNotice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <BuilderSidebar draft={draft} updateDraft={updateDraft} pricingSummary={pricingSummary} />
        <ProposalPreview draft={draft} pricingSummary={pricingSummary} />
      </div>
    </div>
  )
}

const BuilderSidebar = ({
  draft,
  updateDraft,
  pricingSummary,
}: {
  draft: QuoteDraft
  updateDraft: (patch: Partial<QuoteDraft>) => void
  pricingSummary: PricingSummary
}) => {
  return (
    <div className="space-y-4">
      <HeroEditor draft={draft} updateDraft={updateDraft} />
      <EventsEditor draft={draft} updateDraft={updateDraft} />
      <DeliverablesEditor draft={draft} updateDraft={updateDraft} />
      <TimelineEditor draft={draft} updateDraft={updateDraft} />
      <PricingEditor draft={draft} updateDraft={updateDraft} pricingSummary={pricingSummary} />
      <PaymentScheduleEditor draft={draft} updateDraft={updateDraft} />
    </div>
  )
}

const HeroEditor = ({ draft, updateDraft }: { draft: QuoteDraft; updateDraft: (patch: Partial<QuoteDraft>) => void }) => {
  const hero = draft.hero
  return (
    <section className={cardClass}>
      <div className={labelClass}>Hero</div>
      <div className="mt-4 space-y-3">
        <input className={inputClass} value={hero.title} onChange={(e) => updateDraft({ hero: { ...hero, title: e.target.value } })} placeholder="Proposal title" />
        <input className={inputClass} value={hero.subtitle} onChange={(e) => updateDraft({ hero: { ...hero, subtitle: e.target.value } })} placeholder="Subtitle" />
        <div className="grid gap-3 md:grid-cols-2">
          <input className={inputClass} value={hero.location} onChange={(e) => updateDraft({ hero: { ...hero, location: e.target.value } })} placeholder="Location" />
          <input className={inputClass} value={hero.date} onChange={(e) => updateDraft({ hero: { ...hero, date: e.target.value } })} placeholder="Event date" />
        </div>
        <input className={inputClass} value={hero.coverImageUrl} onChange={(e) => updateDraft({ hero: { ...hero, coverImageUrl: e.target.value } })} placeholder="Cover image URL" />
      </div>
    </section>
  )
}

const EventsEditor = ({ draft, updateDraft }: { draft: QuoteDraft; updateDraft: (patch: Partial<QuoteDraft>) => void }) => {
  const updateEvent = (idx: number, patch: Partial<QuoteEvent>) => {
    const next = [...draft.events]
    next[idx] = { ...next[idx], ...patch }
    updateDraft({ events: next })
  }

  const addEvent = () => updateDraft({ events: [...draft.events, { name: '', date: '', location: '' }] })
  const removeEvent = (idx: number) => updateDraft({ events: draft.events.filter((_, i) => i !== idx) })

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between">
        <div className={labelClass}>Events</div>
        <button className="text-xs font-medium text-neutral-600" onClick={addEvent}>
          + Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {draft.events.map((event, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="grid gap-2">
              <input className={inputClass} value={event.name} onChange={(e) => updateEvent(idx, { name: e.target.value })} placeholder="Event name" />
              <div className="grid gap-2 md:grid-cols-2">
                <input className={inputClass} value={event.date} onChange={(e) => updateEvent(idx, { date: e.target.value })} placeholder="Date" />
                <input className={inputClass} value={event.location} onChange={(e) => updateEvent(idx, { location: e.target.value })} placeholder="Location" />
              </div>
            </div>
            <button className="mt-2 text-xs text-rose-500" onClick={() => removeEvent(idx)}>
              Remove
            </button>
          </div>
        ))}
        {draft.events.length === 0 && <div className="text-sm text-neutral-500">Add events to show ceremony coverage.</div>}
      </div>
    </section>
  )
}

const DeliverablesEditor = ({ draft, updateDraft }: { draft: QuoteDraft; updateDraft: (patch: Partial<QuoteDraft>) => void }) => {
  const add = () => updateDraft({ deliverables: [...draft.deliverables, { label: '', description: '' }] })
  const updateRow = (idx: number, patch: Partial<QuoteDeliverable>) => {
    const next = [...draft.deliverables]
    next[idx] = { ...next[idx], ...patch }
    updateDraft({ deliverables: next })
  }
  const remove = (idx: number) => updateDraft({ deliverables: draft.deliverables.filter((_, i) => i !== idx) })

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between">
        <div className={labelClass}>Deliverables</div>
        <button className="text-xs font-medium text-neutral-600" onClick={add}>
          + Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {draft.deliverables.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <input className={inputClass} value={item.label} onChange={(e) => updateRow(idx, { label: e.target.value })} placeholder="Deliverable" />
            <textarea className={`${inputClass} mt-2`} value={item.description} onChange={(e) => updateRow(idx, { description: e.target.value })} placeholder="Description" />
            <button className="mt-2 text-xs text-rose-500" onClick={() => remove(idx)}>
              Remove
            </button>
          </div>
        ))}
        {draft.deliverables.length === 0 && <div className="text-sm text-neutral-500">No deliverables added yet.</div>}
      </div>
    </section>
  )
}

const TimelineEditor = ({ draft, updateDraft }: { draft: QuoteDraft; updateDraft: (patch: Partial<QuoteDraft>) => void }) => {
  const add = () => updateDraft({ timeline: [...draft.timeline, { title: '', time: '' }] })
  const updateRow = (idx: number, patch: Partial<QuoteTimelineItem>) => {
    const next = [...draft.timeline]
    next[idx] = { ...next[idx], ...patch }
    updateDraft({ timeline: next })
  }
  const remove = (idx: number) => updateDraft({ timeline: draft.timeline.filter((_, i) => i !== idx) })

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between">
        <div className={labelClass}>Timeline</div>
        <button className="text-xs font-medium text-neutral-600" onClick={add}>
          + Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {draft.timeline.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
              <input className={inputClass} value={item.title} onChange={(e) => updateRow(idx, { title: e.target.value })} placeholder="Moment" />
              <input className={inputClass} value={item.time} onChange={(e) => updateRow(idx, { time: e.target.value })} placeholder="Time" />
            </div>
            <button className="mt-2 text-xs text-rose-500" onClick={() => remove(idx)}>
              Remove
            </button>
          </div>
        ))}
        {draft.timeline.length === 0 && <div className="text-sm text-neutral-500">Add timeline steps for coverage flow.</div>}
      </div>
    </section>
  )
}

const PricingEditor = ({
  draft,
  updateDraft,
  pricingSummary,
}: {
  draft: QuoteDraft
  updateDraft: (patch: Partial<QuoteDraft>) => void
  pricingSummary: PricingSummary
}) => {
  const add = () => updateDraft({ pricingItems: [...draft.pricingItems, { label: '', quantity: 1, unitPrice: 0 }] })
  const updateRow = (idx: number, patch: Partial<QuotePricingItem>) => {
    const next = [...draft.pricingItems]
    next[idx] = { ...next[idx], ...patch }
    updateDraft({ pricingItems: next })
  }
  const remove = (idx: number) => updateDraft({ pricingItems: draft.pricingItems.filter((_, i) => i !== idx) })

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between">
        <div className={labelClass}>Pricing</div>
        <button className="text-xs font-medium text-neutral-600" onClick={add}>
          + Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {draft.pricingItems.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <input className={inputClass} value={item.label} onChange={(e) => updateRow(idx, { label: e.target.value })} placeholder="Pricing item" />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input className={inputClass} type="number" value={item.quantity} onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })} placeholder="Quantity" />
              <CurrencyInput className={inputClass} value={item.unitPrice} onChange={(val) => updateRow(idx, { unitPrice: Number(val) || 0 })} placeholder="Unit price" />
            </div>
            <button className="mt-2 text-xs text-rose-500" onClick={() => remove(idx)}>
              Remove
            </button>
          </div>
        ))}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Calculated</div>
          <div className="mt-2 text-lg font-semibold">{formatMoney(pricingSummary.calculatedPrice)}</div>
          <div className="mt-2 grid gap-2 text-xs text-neutral-500 md:grid-cols-2">
            <span>Target: {formatMoney(pricingSummary.targetPrice)}</span>
            <span>Minimum: {formatMoney(pricingSummary.minimumPrice)}</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <CurrencyInput
            className={inputClass}
            value={draft.overridePrice ?? ''}
            onChange={(val) => updateDraft({ overridePrice: val ? Number(val) : null })}
            placeholder="Override price"
          />
          <input
            className={inputClass}
            value={draft.overrideReason}
            onChange={(e) => updateDraft({ overrideReason: e.target.value })}
            placeholder="Override reason"
          />
        </div>
      </div>
    </section>
  )
}

const PaymentScheduleEditor = ({ draft, updateDraft }: { draft: QuoteDraft; updateDraft: (patch: Partial<QuoteDraft>) => void }) => {
  const add = () => updateDraft({ paymentSchedule: [...draft.paymentSchedule, { label: '', dueDate: '', amount: 0 }] })
  const updateRow = (idx: number, patch: Partial<QuotePaymentScheduleItem>) => {
    const next = [...draft.paymentSchedule]
    next[idx] = { ...next[idx], ...patch }
    updateDraft({ paymentSchedule: next })
  }
  const remove = (idx: number) => updateDraft({ paymentSchedule: draft.paymentSchedule.filter((_, i) => i !== idx) })

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between">
        <div className={labelClass}>Payment Schedule</div>
        <button className="text-xs font-medium text-neutral-600" onClick={add}>
          + Add
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {draft.paymentSchedule.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <input className={inputClass} value={item.label} onChange={(e) => updateRow(idx, { label: e.target.value })} placeholder="Milestone" />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input className={inputClass} value={item.dueDate} onChange={(e) => updateRow(idx, { dueDate: e.target.value })} placeholder="Due date" />
              <CurrencyInput className={inputClass} value={item.amount} onChange={(val) => updateRow(idx, { amount: Number(val) || 0 })} placeholder="Amount" />
            </div>
            <button className="mt-2 text-xs text-rose-500" onClick={() => remove(idx)}>
              Remove
            </button>
          </div>
        ))}
        {draft.paymentSchedule.length === 0 && <div className="text-sm text-neutral-500">No payment milestones added.</div>}
      </div>
    </section>
  )
}

const ProposalPreview = ({ draft, pricingSummary }: { draft: QuoteDraft; pricingSummary: PricingSummary }) => {
  const total = pricingSummary.calculatedPrice
  const override = draft.overridePrice
  const final = override ?? total

  return (
    <div className="space-y-4">
      <section className={`${cardClass} sticky top-6`}>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Live Preview</div>
        <div className="mt-4 space-y-6">
          <div>
            <div className="text-2xl font-semibold text-neutral-900">{draft.hero.title}</div>
            <div className="text-sm text-neutral-600">{draft.hero.subtitle}</div>
            <div className="mt-2 text-sm text-neutral-500">
              {draft.hero.location} {draft.hero.date && `• ${draft.hero.date}`}
            </div>
          </div>

          <PreviewSection title="Events" items={draft.events.map((event) => `${event.name} • ${event.date} • ${event.location}`)} />
          <PreviewSection title="Deliverables" items={draft.deliverables.map((d) => `${d.label} — ${d.description}`)} />
          <PreviewSection title="Timeline" items={draft.timeline.map((t) => `${t.title} • ${t.time}`)} />

          <div>
            <div className="text-sm font-semibold text-neutral-800">Investment</div>
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              <div>Calculated: {formatMoney(total)}</div>
              {override !== null && <div>Override: {formatMoney(override)}</div>}
              <div className="text-base font-semibold text-neutral-900">Total: {formatMoney(final)}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-neutral-800">Payment Schedule</div>
            <div className="mt-2 space-y-2 text-sm text-neutral-600">
              {draft.paymentSchedule.length === 0 && <div>No payment schedule added.</div>}
              {draft.paymentSchedule.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span>{item.label}</span>
                  <span>{formatMoney(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const PreviewSection = ({ title, items }: { title: string; items: string[] }) => (
  <div>
    <div className="text-sm font-semibold text-neutral-800">{title}</div>
    <div className="mt-2 space-y-1 text-sm text-neutral-600">
      {items.length === 0 && <div>None added yet.</div>}
      {items.map((item, idx) => (
        <div key={`${title}-${idx}`}>{item}</div>
      ))}
    </div>
  </div>
)

export default QuoteBuilderPage
