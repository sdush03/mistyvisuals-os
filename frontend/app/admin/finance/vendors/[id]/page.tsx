'use client'


import CalendarInput from '@/components/CalendarInput'
import { toISTDateInput } from '@/lib/formatters'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Vendor = {
  id: number
  name: string
  vendor_type: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  is_active?: boolean
  user_id?: number | null
}

type RateCard = {
  id: number
  vendor_id: number
  rate_type: 'per_day' | 'per_function' | 'flat'
  rates: any
  effective_from?: string | null
  is_active: boolean
  created_at?: string
}

const formatMoney = (value: number | string) => `₹${formatIndian(value)}`

const rateTypeLabel = (value?: string | null) => {
  if (value === 'per_day') return 'Per Day'
  if (value === 'per_function') return 'Per Function'
  if (value === 'flat') return 'Flat'
  return value || '—'
}

export default function VendorDetailPage() {
  const params = useParams() as { id?: string }
  const vendorId = params?.id

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [rateCard, setRateCard] = useState<RateCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [rateLoading, setRateLoading] = useState(true)
  const [error, setError] = useState('')
  const [rateError, setRateError] = useState('')

  const [activeTab, setActiveTab] = useState<'details' | 'rate-card'>('details')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [rateType, setRateType] = useState<'per_day' | 'per_function' | 'flat'>('per_day')
  const [effectiveFrom, setEffectiveFrom] = useState(() => toISTDateInput())
  const [perDay, setPerDay] = useState({ half_day: '', full_day: '' })
  const [perFunction, setPerFunction] = useState({ small_function: '', big_function: '', full_day: '' })
  const [flatRate, setFlatRate] = useState({ amount: '', unit: '' })

  useEffect(() => {
    if (!vendorId) return
    void loadVendor()
  }, [vendorId])

  useEffect(() => {
    if (vendor && vendor.vendor_type === 'freelancer') {
      void loadRateCard()
    } else {
      setRateCard(null)
      setRateLoading(false)
    }
  }, [vendor])

  const loadVendor = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/vendors/${vendorId}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load vendor')
      setVendor(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load vendor')
    } finally {
      setLoading(false)
    }
  }

  const loadRateCard = async () => {
    setRateLoading(true)
    setRateError('')
    try {
      const res = await apiFetch(`/api/vendors/${vendorId}/rate-card`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load rate card')
      setRateCard(data?.rate_card || null)
      if (data?.rate_card) {
        const card = data.rate_card
        setRateType(card.rate_type)
        setEffectiveFrom(card.effective_from || toISTDateInput())
        if (card.rate_type === 'per_day') {
          setPerDay({
            half_day: String(card.rates?.half_day ?? ''),
            full_day: String(card.rates?.full_day ?? ''),
          })
        } else if (card.rate_type === 'per_function') {
          setPerFunction({
            small_function: String(card.rates?.small_function ?? ''),
            big_function: String(card.rates?.big_function ?? ''),
            full_day: String(card.rates?.full_day ?? ''),
          })
        } else if (card.rate_type === 'flat') {
          setFlatRate({
            amount: String(card.rates?.amount ?? ''),
            unit: String(card.rates?.unit ?? ''),
          })
        }
      }
    } catch (err: any) {
      setRateError(err?.message || 'Failed to load rate card')
    } finally {
      setRateLoading(false)
    }
  }

  const openUpdate = () => {
    if (rateCard) {
      setRateType(rateCard.rate_type)
    }
    setShowForm(true)
  }

  const buildRatesPayload = () => {
    if (rateType === 'per_day') {
      return {
        half_day: Number(perDay.half_day || 0),
        full_day: Number(perDay.full_day || 0),
      }
    }
    if (rateType === 'per_function') {
      return {
        small_function: Number(perFunction.small_function || 0),
        big_function: Number(perFunction.big_function || 0),
        full_day: Number(perFunction.full_day || 0),
      }
    }
    return {
      amount: Number(flatRate.amount || 0),
      unit: flatRate.unit.trim(),
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setRateError('')
    try {
      const payload = {
        rate_type: rateType,
        rates: buildRatesPayload(),
        effective_from: effectiveFrom,
      }
      const res = await apiFetch(`/api/vendors/${vendorId}/rate-card`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to save rate card')
      setRateCard(data?.rate_card || null)
      setShowForm(false)
    } catch (err: any) {
      setRateError(err?.message || 'Failed to save rate card')
    } finally {
      setSaving(false)
    }
  }

  const formattedRates = useMemo(() => {
    if (!rateCard) return [] as { label: string; value: string }[]
    if (rateCard.rate_type === 'per_day') {
      return [
        { label: 'Half Day', value: formatMoney(rateCard.rates?.half_day || 0) },
        { label: 'Full Day', value: formatMoney(rateCard.rates?.full_day || 0) },
      ]
    }
    if (rateCard.rate_type === 'per_function') {
      return [
        { label: 'Small Function', value: formatMoney(rateCard.rates?.small_function || 0) },
        { label: 'Big Function', value: formatMoney(rateCard.rates?.big_function || 0) },
        { label: 'Full Day', value: formatMoney(rateCard.rates?.full_day || 0) },
      ]
    }
    return [
      { label: 'Amount', value: formatMoney(rateCard.rates?.amount || 0) },
      { label: 'Unit', value: rateCard.rates?.unit || '—' },
    ]
  }, [rateCard])

  const showRateTab = vendor?.vendor_type === 'freelancer'

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Vendor</h1>
        <p className="text-sm text-neutral-600 mt-1">Details and rate cards for freelancers.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        {loading && <div className="text-sm text-neutral-500">Loading vendor…</div>}
        {!loading && vendor && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{vendor.name}</div>
                <div className="text-xs text-neutral-500 capitalize">{vendor.vendor_type}</div>
              </div>
              <Link className={buttonOutline} href="/admin/finance/accounts#vendors">Back to Accounts</Link>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <button className={activeTab === 'details' ? buttonPrimary : buttonOutline} onClick={() => setActiveTab('details')}>Details</button>
              {showRateTab && (
                <button className={activeTab === 'rate-card' ? buttonPrimary : buttonOutline} onClick={() => setActiveTab('rate-card')}>Rate Card</button>
              )}
            </div>

            {activeTab === 'details' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider">Contact</div>
                  <div className="mt-2">Email: {vendor.email || '—'}</div>
                  <div className="mt-1">Phone: {vendor.phone || '—'}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider">Status</div>
                  <div className="mt-2">{vendor.is_active ? 'Active' : 'Inactive'}</div>
                  <div className="mt-1">Linked User: {vendor.user_id ? `User #${vendor.user_id}` : '—'}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm md:col-span-2">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider">Notes</div>
                  <div className="mt-2">{vendor.notes || '—'}</div>
                </div>
              </div>
            )}

            {activeTab === 'rate-card' && showRateTab && (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Rate cards apply only to freelancers and are used for forecasting and bill validation. Actual bills may differ.
                </div>

                {rateError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {rateError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Active Rate Card</div>
                    <div className="text-xs text-neutral-500">{rateCard ? `Effective from ${rateCard.effective_from || '—'}` : 'No active rate card yet.'}</div>
                  </div>
                  <button className={buttonPrimary} onClick={openUpdate}>
                    Update Rate Card
                  </button>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  {rateLoading && <div className="text-sm text-neutral-500">Loading rate card…</div>}
                  {!rateLoading && !rateCard && <div className="text-sm text-neutral-500">No rate card found.</div>}
                  {!rateLoading && rateCard && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider">Rate Type</div>
                        <div className="mt-1 font-semibold">{rateTypeLabel(rateCard.rate_type)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider">Effective From</div>
                        <div className="mt-1 font-semibold">{rateCard.effective_from || '—'}</div>
                      </div>
                      {formattedRates.map(item => (
                        <div key={item.label}>
                          <div className="text-xs text-neutral-500 uppercase tracking-wider">{item.label}</div>
                          <div className="mt-1 font-semibold">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {showForm && (
                  <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Rate Type</div>
                        <select className={fieldClass} value={rateType} onChange={e => setRateType(e.target.value as any)}>
                          <option value="per_day">Per Day</option>
                          <option value="per_function">Per Function</option>
                          <option value="flat">Flat</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 mb-1">Effective From</div>
                        <CalendarInput className={fieldClass} value={effectiveFrom} onChange={val => setEffectiveFrom(val)} />
                      </div>
                    </div>

                    {rateType === 'per_day' && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Half Day Rate</div>
                          <CurrencyInput className={fieldClass} value={perDay.half_day} onChange={val => setPerDay({ ...perDay, half_day: val })} />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Full Day Rate</div>
                          <CurrencyInput className={fieldClass} value={perDay.full_day} onChange={val => setPerDay({ ...perDay, full_day: val })} />
                        </div>
                      </div>
                    )}

                    {rateType === 'per_function' && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Small Function</div>
                          <CurrencyInput className={fieldClass} value={perFunction.small_function} onChange={val => setPerFunction({ ...perFunction, small_function: val })} />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Big Function</div>
                          <CurrencyInput className={fieldClass} value={perFunction.big_function} onChange={val => setPerFunction({ ...perFunction, big_function: val })} />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Full Day</div>
                          <CurrencyInput className={fieldClass} value={perFunction.full_day} onChange={val => setPerFunction({ ...perFunction, full_day: val })} />
                        </div>
                      </div>
                    )}

                    {rateType === 'flat' && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Amount</div>
                          <CurrencyInput className={fieldClass} value={flatRate.amount} onChange={val => setFlatRate({ ...flatRate, amount: val })} />
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500 mb-1">Unit Label</div>
                          <input className={fieldClass} value={flatRate.unit} onChange={e => setFlatRate({ ...flatRate, unit: e.target.value })} placeholder="per day" />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button className={buttonPrimary} type="submit" disabled={saving}>
                        {saving ? 'Saving...' : 'Save Rate Card'}
                      </button>
                      <button className={buttonOutline} type="button" onClick={() => setShowForm(false)} disabled={saving}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
