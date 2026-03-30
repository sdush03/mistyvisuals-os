'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useState } from 'react'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type MoneySource = {
  id: number
  name: string
}

const fieldClass =
  'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-400'

const parseAmount = (value: string) => {
  if (!value) return null
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num
}

const formatMoney = (value: number | string) => {
  const rounded = Math.round(Number(value || 0))
  return `₹${formatIndian(rounded)}`
}

export default function TransferPage() {
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadSources = async () => {
      try {
        const res = await apiFetch('/api/finance/money-sources')
        const data = await res.json().catch(() => [])
        setMoneySources(Array.isArray(data) ? data : [])
      } catch {
        setMoneySources([])
      }
    }
    void loadSources()
  }, [])

  useEffect(() => {
    if (fromId && toId && fromId === toId) {
      setToId('')
    }
  }, [fromId, toId])

  const handleSubmit = async () => {
    const amountNum = parseAmount(amount)
    if (!fromId) {
      setError('Select a from account')
      return
    }
    if (!toId) {
      setError('Select a to account')
      return
    }
    if (fromId === toId) {
      setError('From and To accounts must be different')
      return
    }
    if (!date) {
      setError('Select a date')
      return
    }
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch('/api/finance/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_money_source_id: Number(fromId),
          to_money_source_id: Number(toId),
          date,
          amount: amountNum,
          note: note.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to record transfer')
      }
      setSuccess(`Transfer recorded successfully: ${formatMoney(amountNum)}`)
      setAmount('')
      setNote('')
    } catch (err: any) {
      setError(err?.message || 'Failed to record transfer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Transfer</h1>
        <p className="mt-1 text-sm text-neutral-500">Move money between accounts.</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">From Account</label>
            <select
              className={fieldClass}
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <option value="">Select account</option>
              {moneySources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">To Account</label>
            <select
              className={fieldClass}
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">Select account</option>
              {moneySources.map((source) => (
                <option key={source.id} value={source.id} disabled={fromId === String(source.id)}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Date</label>
            <CalendarInput
              className={fieldClass}
              value={date}
              onChange={val => setDate(val)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Amount</label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              className={fieldClass}
              placeholder="0"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Remarks (optional)</label>
            <textarea
              className={`${fieldClass} min-h-[90px]`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for this transfer"
            />
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
        {success && <div className="mt-3 text-sm text-emerald-600">{success}</div>}

        <div className="mt-4">
          <button
            type="button"
            className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Recording…' : 'Transfer Money'}
          </button>
        </div>
      </div>
    </div>
  )
}
