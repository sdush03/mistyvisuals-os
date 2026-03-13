'use client'

import { useEffect, useMemo, useState } from 'react'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Category = {
  id: number
  name: string
}

type MoneySource = {
  id: number
  name: string
}

type Transaction = {
  id: number
  date: string
  amount: number | string
  category_id: number | null
  category_name?: string | null
}

type ScheduledSeed = {
  frequency: 'Monthly' | 'Yearly'
  expectedAmount?: number | null
  expectedMonth?: string | null
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

const formatMoney = (value: number | string | null | undefined) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num === 0) return '—'
  return `₹${formatIndian(Math.round(num))}`
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function OverheadsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [overheadTx, setOverheadTx] = useState<Transaction[]>([])

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentSourceId, setPaymentSourceId] = useState('')
  const [paymentNote, setPaymentNote] = useState('')

  const [oneTimeOpen, setOneTimeOpen] = useState(false)
  const [oneTimeCategoryId, setOneTimeCategoryId] = useState('')
  const [oneTimeAmount, setOneTimeAmount] = useState('')
  const [oneTimeDate, setOneTimeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [oneTimeSourceId, setOneTimeSourceId] = useState('')
  const [oneTimeNote, setOneTimeNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesRes, sourcesRes, txRes] = await Promise.all([
          apiFetch('/api/finance/categories'),
          apiFetch('/api/finance/money-sources'),
          apiFetch('/api/finance/transactions?is_overhead=true&direction=out'),
        ])
        const categoriesData = await categoriesRes.json().catch(() => [])
        const sourcesData = await sourcesRes.json().catch(() => [])
        const txData = await txRes.json().catch(() => [])
        setCategories(Array.isArray(categoriesData) ? categoriesData : [])
        setMoneySources(Array.isArray(sourcesData) ? sourcesData : [])
        setOverheadTx(Array.isArray(txData) ? txData : [])
      } catch {
        setCategories([])
        setMoneySources([])
        setOverheadTx([])
      }
    }
    void loadData()
  }, [])

  const scheduledRows = useMemo(() => {
    if (!categories.length) return []
    const txSorted = [...overheadTx].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return [...categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => {
        const lastTx = txSorted.find((tx) => tx.category_id === category.id) || null
        const seed: ScheduledSeed = { frequency: 'Monthly' }
        return {
          category,
          seed,
          lastPaidDate: lastTx?.date || null,
          lastPaidAmount: lastTx?.amount || null,
        }
      })
  }, [categories, overheadTx])

  const activeRow = scheduledRows.find((row) => row.category.id === activeCategoryId) || null

  const expectedAmount = useMemo(() => {
    if (!activeRow) return null
    if (activeRow.seed.expectedAmount) return activeRow.seed.expectedAmount
    if (activeRow.lastPaidAmount) return Number(activeRow.lastPaidAmount)
    return null
  }, [activeRow])

  useEffect(() => {
    if (!activeRow) return
    if (expectedAmount !== null && !paymentAmount) {
      setPaymentAmount(String(Math.round(expectedAmount)))
    }
  }, [activeRow, expectedAmount, paymentAmount])

  const resetPaymentPanel = () => {
    setActiveCategoryId(null)
    setPaymentAmount('')
    setPaymentSourceId('')
    setPaymentNote('')
    setError('')
    setSuccess('')
  }

  const submitPayment = async (categoryId: number | null, amountValue: string, dateValue: string, sourceId: string, noteValue: string) => {
    const amountNum = parseAmount(amountValue)
    if (!categoryId) return
    if (!dateValue) {
      setError('Please select a date')
      return
    }
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!sourceId) {
      setError('Select a money source')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: dateValue,
          amount: amountNum,
          direction: 'out',
          money_source_id: Number(sourceId),
          is_overhead: true,
          category_id: categoryId,
          note: noteValue,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to record overhead')
      }
      setSuccess('Expense recorded.')
      setPaymentAmount('')
      setPaymentNote('')
      const txRes = await apiFetch('/api/finance/transactions?is_overhead=true&direction=out')
      const txData = await txRes.json().catch(() => [])
      setOverheadTx(Array.isArray(txData) ? txData : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to record overhead')
    } finally {
      setSaving(false)
    }
  }

  const submitOneTime = async () => {
    const amountNum = parseAmount(oneTimeAmount)
    if (!oneTimeDate) {
      setError('Please select a date')
      return
    }
    if (!oneTimeCategoryId) {
      setError('Select a category')
      return
    }
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!oneTimeSourceId) {
      setError('Select a money source')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: oneTimeDate,
          amount: amountNum,
          direction: 'out',
          money_source_id: Number(oneTimeSourceId),
          is_overhead: true,
          category_id: Number(oneTimeCategoryId),
          note: oneTimeNote,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to record overhead')
      }
      setSuccess('Expense recorded.')
      setOneTimeAmount('')
      setOneTimeNote('')
      const txRes = await apiFetch('/api/finance/transactions?is_overhead=true&direction=out')
      const txData = await txRes.json().catch(() => [])
      setOverheadTx(Array.isArray(txData) ? txData : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to record overhead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Overheads</h1>
        <p className="mt-1 text-sm text-neutral-500">Record business expenses not tied to a project.</p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-neutral-900">Scheduled Overheads</div>
            <div className="mt-1 text-sm text-neutral-600">Pay recurring expenses on time.</div>
          </div>
        </div>

        {scheduledRows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-white p-4 text-sm text-neutral-600">
            No overhead categories found. Add finance categories to start scheduling payments.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Frequency</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Last Paid</th>
                  <th className="px-4 py-3 text-right">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {scheduledRows.map((row) => {
                  const expectedLabel = row.seed.expectedAmount
                    ? formatMoney(row.seed.expectedAmount)
                    : row.lastPaidAmount
                    ? formatMoney(row.lastPaidAmount)
                    : '—'
                  const frequencyLabel = row.seed.frequency === 'Yearly' && row.seed.expectedMonth
                    ? `Yearly (${row.seed.expectedMonth})`
                    : row.seed.frequency
                  const lastPaidLabel = row.lastPaidDate
                    ? `${formatMoney(row.lastPaidAmount || 0)} · ${formatDateShort(row.lastPaidDate)}`
                    : '—'
                  return (
                    <tr key={row.category.id}>
                      <td className="px-4 py-3 text-neutral-800">{row.category.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{frequencyLabel}</td>
                      <td className="px-4 py-3 text-neutral-700">{expectedLabel}</td>
                      <td className="px-4 py-3 text-neutral-600">{lastPaidLabel}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setActiveCategoryId(row.category.id)
                            setPaymentAmount('')
                            setPaymentNote('')
                            setSuccess('')
                            setError('')
                          }}
                        >
                          Pay
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeRow && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-800">Pay {activeRow.category.name}</div>
                <div className="text-xs text-neutral-500">This will record an overhead transaction.</div>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-700"
                onClick={resetPaymentPanel}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Date</label>
                <input
                  type="date"
                  className={fieldClass}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Amount</label>
                <CurrencyInput
                  value={paymentAmount}
                  onChange={setPaymentAmount}
                  className={fieldClass}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-neutral-700">Money Source</label>
                <select
                  className={fieldClass}
                  value={paymentSourceId}
                  onChange={(e) => setPaymentSourceId(e.target.value)}
                >
                  <option value="">Select account</option>
                  {moneySources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-neutral-700">Remarks (optional)</label>
                <textarea
                  className={`${fieldClass} min-h-[90px]`}
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Add notes for this payment"
                />
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
            {success && <div className="mt-3 text-sm text-emerald-600">{success}</div>}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                onClick={() => submitPayment(activeRow.category.id, paymentAmount, paymentDate, paymentSourceId, paymentNote)}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-neutral-900">One-Time Expense</div>
            <div className="mt-1 text-sm text-neutral-500">Add a one-off overhead cost.</div>
          </div>
          <button
            type="button"
            className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            onClick={() => setOneTimeOpen((prev) => !prev)}
          >
            + Add One-Time Expense
          </button>
        </div>

        {oneTimeOpen && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-neutral-700">Category</label>
              <select
                className={fieldClass}
                value={oneTimeCategoryId}
                onChange={(e) => setOneTimeCategoryId(e.target.value)}
              >
                <option value="">Uncategorised</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">Date</label>
              <input
                type="date"
                className={fieldClass}
                value={oneTimeDate}
                onChange={(e) => setOneTimeDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">Amount</label>
              <CurrencyInput
                value={oneTimeAmount}
                onChange={setOneTimeAmount}
                className={fieldClass}
                placeholder="0"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-neutral-700">Money Source</label>
              <select
                className={fieldClass}
                value={oneTimeSourceId}
                onChange={(e) => setOneTimeSourceId(e.target.value)}
              >
                <option value="">Select account</option>
                {moneySources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-neutral-700">Remarks (optional)</label>
              <textarea
                className={`${fieldClass} min-h-[90px]`}
                value={oneTimeNote}
                onChange={(e) => setOneTimeNote(e.target.value)}
                placeholder="Add notes for this expense"
              />
            </div>

            {error && <div className="md:col-span-2 text-sm text-rose-600">{error}</div>}
            {success && <div className="md:col-span-2 text-sm text-emerald-600">{success}</div>}

            <div className="md:col-span-2 flex items-center gap-3">
              <button
                type="button"
                className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-60"
                onClick={submitOneTime}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Record Expense'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
