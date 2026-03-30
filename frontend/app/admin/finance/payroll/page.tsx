'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useMemo, useState } from 'react'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type MoneySource = { id: number; name: string }

type PayrollRow = {
  user_id: number
  user_name: string
  role?: string | null
  employment_type?: string
  base_salary: number
  incentives: number
  leave_deduction: number
  manual_adjustment: number
  carry_forward: number
  net_due: number
  amount_paid: number
  carry_forward_next: number
  advance_next: number
  payout_exists: boolean
  carry_settled: boolean
  payout_date?: string | null
}

const fieldClass =
  'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-400'

const formatMoney = (value: number | string | null | undefined) => {
  const num = Number(value || 0)
  const rounded = Math.round(num)
  const absVal = Math.abs(rounded)
  const formatted = formatIndian(absVal)
  return rounded < 0 ? `-₹${formatted}` : `₹${formatted}`
}

const parseAmount = (value: string) => {
  if (!value) return null
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num
}

const formatMonthLabel = (value: string) => {
  const d = new Date(`${value}-01`)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const formatDateShort = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FinancePayrollPage() {
  const [monthInput, setMonthInput] = useState(() => new Date().toISOString().slice(0, 7))
  const [summary, setSummary] = useState<PayrollRow[]>([])
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overrides, setOverrides] = useState<Record<number, { leave: string; adjustment: string }>>({})
  const [draftSaving, setDraftSaving] = useState<number | null>(null)
  const [draftMessage, setDraftMessage] = useState('')

  const [showPayModal, setShowPayModal] = useState(false)
  const [activeRow, setActiveRow] = useState<PayrollRow | null>(null)
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payAmount, setPayAmount] = useState('')
  const [moneySourceId, setMoneySourceId] = useState('')
  const [advanceReason, setAdvanceReason] = useState('')
  const [deductionReason, setDeductionReason] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [success, setSuccess] = useState('')

  const monthStart = useMemo(() => `${monthInput}-01`, [monthInput])

  const computeNetDue = (row: PayrollRow) => {
    const override = overrides[row.user_id] || { leave: '', adjustment: '' }
    const leaveVal = parseAmount(override.leave) || 0
    const adjustmentVal = parseAmount(override.adjustment) || 0
    return Number(row.base_salary || 0) + Number(row.incentives || 0) - leaveVal + adjustmentVal + Number(row.carry_forward || 0)
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryRes, sourcesRes] = await Promise.all([
        apiFetch(`/api/finance/payroll/summary?month=${monthStart}`),
        apiFetch('/api/finance/money-sources'),
      ])
      const summaryData = await summaryRes.json().catch(() => [])
      const sourcesData = await sourcesRes.json().catch(() => [])
      if (!summaryRes.ok) throw new Error(summaryData?.error || 'Failed to load payroll')
      setSummary(Array.isArray(summaryData) ? summaryData : [])
      setMoneySources(Array.isArray(sourcesData) ? sourcesData : [])
      const nextOverrides: Record<number, { leave: string; adjustment: string }> = {}
      ;(Array.isArray(summaryData) ? summaryData : []).forEach((row: PayrollRow) => {
        nextOverrides[row.user_id] = {
          leave: row.leave_deduction ? String(Math.round(row.leave_deduction)) : '',
          adjustment: row.manual_adjustment ? String(Math.round(row.manual_adjustment)) : '',
        }
      })
      setOverrides(nextOverrides)
    } catch (err: any) {
      setError(err?.message || 'Failed to load payroll data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [monthStart])

  const openPayModal = (row: PayrollRow) => {
    const override = overrides[row.user_id] || { leave: '', adjustment: '' }
    const leaveVal = parseAmount(override.leave) || 0
    const adjustmentVal = parseAmount(override.adjustment) || 0
    const netDue = Number(row.base_salary || 0) + Number(row.incentives || 0) - leaveVal + adjustmentVal + Number(row.carry_forward || 0)
    setActiveRow(row)
    setShowPayModal(true)
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayAmount(netDue > 0 ? String(Math.round(netDue)) : '')
    setMoneySourceId('')
    setAdvanceReason('')
    setDeductionReason('')
    setAdjustmentReason('')
    setNotes('')
    setModalError('')
    setSuccess('')
  }

  const closePayModal = () => {
    setShowPayModal(false)
    setActiveRow(null)
  }

  const paymentDiff = useMemo(() => {
    if (!activeRow) return { carryNext: 0, advanceNext: 0 }
    const override = overrides[activeRow.user_id] || { leave: '', adjustment: '' }
    const leaveVal = parseAmount(override.leave) || 0
    const adjustmentVal = parseAmount(override.adjustment) || 0
    const netDue = Number(activeRow.base_salary || 0) + Number(activeRow.incentives || 0) - leaveVal + adjustmentVal + Number(activeRow.carry_forward || 0)
    const amountNum = parseAmount(payAmount) || 0
    const diff = netDue - amountNum
    return {
      carryNext: diff > 0 ? diff : 0,
      advanceNext: diff < 0 ? Math.abs(diff) : 0,
    }
  }, [activeRow, payAmount, overrides])

  const submitPayment = async () => {
    if (!activeRow) return
    const amountNum = parseAmount(payAmount)
    if (!payDate) {
      setModalError('Select a date')
      return
    }
    if (!amountNum || amountNum <= 0) {
      setModalError('Enter a valid amount')
      return
    }
    if (!moneySourceId) {
      setModalError('Select a money source')
      return
    }
    const override = overrides[activeRow.user_id] || { leave: '', adjustment: '' }
    const leaveVal = parseAmount(override.leave) || 0
    const adjustmentVal = parseAmount(override.adjustment) || 0
    if (leaveVal > 0 && !deductionReason.trim()) {
      setModalError('Deduction reason is required')
      return
    }
    if (adjustmentVal !== 0 && !adjustmentReason.trim()) {
      setModalError('Manual adjustment reason is required')
      return
    }
    if (paymentDiff.advanceNext > 0 && !advanceReason.trim()) {
      setModalError('Advance reason is required when payment exceeds net due')
      return
    }

    setSaving(true)
    setModalError('')
    try {
      const noteParts = [] as string[]
      if (notes.trim()) noteParts.push(notes.trim())
      if (deductionReason.trim()) noteParts.push(`Deduction reason: ${deductionReason.trim()}`)
      if (adjustmentReason.trim()) noteParts.push(`Adjustment reason: ${adjustmentReason.trim()}`)
      const payload = {
        user_id: activeRow.user_id,
        month: monthStart,
        date: payDate,
        amount_paid: amountNum,
        money_source_id: Number(moneySourceId),
        leave_deduction: leaveVal,
        manual_adjustment: adjustmentVal,
        leave_deduction_reason: deductionReason.trim() || null,
        manual_adjustment_reason: adjustmentReason.trim() || null,
        advance_reason: advanceReason.trim() || null,
        note: noteParts.join(' | '),
      }

      const res = await apiFetch('/api/finance/payroll/payouts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to record payment')
      setSuccess('Payment recorded.')
      closePayModal()
      await loadData()
    } catch (err: any) {
      setModalError(err?.message || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async (row: PayrollRow) => {
    const override = overrides[row.user_id] || { leave: '', adjustment: '' }
    const leaveVal = parseAmount(override.leave) || 0
    const adjustmentVal = parseAmount(override.adjustment) || 0
    setDraftSaving(row.user_id)
    setDraftMessage('')
    setError('')
    try {
      const res = await apiFetch('/api/finance/payroll/draft', {
        method: 'POST',
        body: JSON.stringify({
          user_id: row.user_id,
          month: monthStart,
          leave_deduction: leaveVal,
          manual_adjustment: adjustmentVal,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save draft')
      setDraftMessage(`Draft saved for ${row.user_name}.`)
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to save draft')
    } finally {
      setDraftSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Payroll</h1>
          <p className="mt-1 text-sm text-neutral-500">Review payroll and record payments.</p>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-neutral-500">Month</label>
          <input
            type="month"
            className={`${fieldClass} mt-1 min-w-[180px]`}
            value={monthInput}
            onChange={(e) => setMonthInput(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {draftMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{draftMessage}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-right">Base Salary</th>
              <th className="px-4 py-3 text-right">Incentives</th>
              <th className="px-4 py-3 text-right">Leave Deduction</th>
              <th className="px-4 py-3 text-right">Manual Adjustment</th>
              <th className="px-4 py-3 text-right">Carry Forward</th>
              <th className="px-4 py-3 text-right">Net Due</th>
              <th className="px-4 py-3 text-right">Carry Fwd (Next)</th>
              <th className="px-4 py-3 text-right">Advance (Next)</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {loading && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-neutral-500">Loading payroll…</td>
              </tr>
            )}
            {!loading && summary.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-neutral-500">No active employees found.</td>
              </tr>
            )}
            {!loading && summary.map((row) => (
              <tr key={row.user_id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-semibold text-neutral-900">{row.user_name}</td>
                <td className="px-4 py-3 text-neutral-600">{row.role || '—'}</td>
                <td className="px-4 py-3 text-right text-neutral-800">{formatMoney(row.base_salary)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{row.incentives ? `+${formatMoney(row.incentives)}` : '—'}</td>
                <td className="px-4 py-3">
                  <CurrencyInput
                    value={overrides[row.user_id]?.leave ?? ''}
                    onChange={(value) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [row.user_id]: { leave: value, adjustment: prev[row.user_id]?.adjustment ?? '' },
                      }))
                    }
                    className={fieldClass}
                    placeholder="0"
                  />
                </td>
                <td className="px-4 py-3">
                  <CurrencyInput
                    value={overrides[row.user_id]?.adjustment ?? ''}
                    onChange={(value) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [row.user_id]: { leave: prev[row.user_id]?.leave ?? '', adjustment: value },
                      }))
                    }
                    className={fieldClass}
                    placeholder="0"
                  />
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {row.carry_forward ? formatMoney(row.carry_forward) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                  {(() => {
                    const override = overrides[row.user_id] || { leave: '', adjustment: '' }
                    const leaveVal = parseAmount(override.leave) || 0
                    const adjustmentVal = parseAmount(override.adjustment) || 0
                    const netDue = Number(row.base_salary || 0) + Number(row.incentives || 0) - leaveVal + adjustmentVal + Number(row.carry_forward || 0)
                    return formatMoney(netDue)
                  })()}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {row.amount_paid > 0 ? (row.carry_forward_next ? formatMoney(row.carry_forward_next) : '—') : '—'}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {row.amount_paid > 0 ? (row.advance_next ? formatMoney(row.advance_next) : '—') : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {(() => {
                    const netDue = computeNetDue(row)
                    if ((row.amount_paid >= netDue && netDue > 0) || row.carry_settled) {
                      return (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Paid
                        </span>
                      )
                    }
                    if (row.amount_paid > 0) {
                      return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Partial</span>
                    }
                    if (row.payout_exists) {
                      return <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Draft</span>
                    }
                    return <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-500">Unpaid</span>
                  })()}
                </td>
                <td className="px-4 py-3 text-center space-y-2">
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-wide text-neutral-700 hover:text-neutral-900"
                    onClick={() => openPayModal(row)}
                  >
                    Pay
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700"
                    onClick={() => saveDraft(row)}
                    disabled={draftSaving === row.user_id}
                  >
                    {draftSaving === row.user_id ? 'Saving…' : 'Save Draft'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPayModal && activeRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">Pay {activeRow.user_name}</h2>
                <p className="text-sm text-neutral-500">{formatMonthLabel(monthInput)} · Net Due {formatMoney(computeNetDue(activeRow))}</p>
              </div>
              <button className="text-xs font-semibold text-neutral-500" onClick={closePayModal}>Close</button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Date</label>
                <CalendarInput className={fieldClass} value={payDate} onChange={val => setPayDate(val)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Amount Paid</label>
                <CurrencyInput value={payAmount} onChange={setPayAmount} className={fieldClass} placeholder="0" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-neutral-700">Money Source</label>
                <select className={fieldClass} value={moneySourceId} onChange={(e) => setMoneySourceId(e.target.value)}>
                  <option value="">Select account</option>
                  {moneySources.map((source) => (
                    <option key={source.id} value={source.id}>{source.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const override = overrides[activeRow.user_id] || { leave: '', adjustment: '' }
                const leaveVal = parseAmount(override.leave) || 0
                if (leaveVal <= 0) return null
                return (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-neutral-700">Deduction Reason</label>
                  <input className={fieldClass} value={deductionReason} onChange={(e) => setDeductionReason(e.target.value)} placeholder="Reason for leave deduction" />
                </div>
                )
              })()}
              {(() => {
                const override = overrides[activeRow.user_id] || { leave: '', adjustment: '' }
                const adjustmentVal = parseAmount(override.adjustment) || 0
                if (adjustmentVal === 0) return null
                return (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-neutral-700">Adjustment Reason</label>
                  <input className={fieldClass} value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="Reason for manual adjustment" />
                </div>
                )
              })()}
              {paymentDiff.advanceNext > 0 && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-neutral-700">Advance Reason</label>
                  <input className={fieldClass} value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} placeholder="Why was extra paid?" />
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-neutral-700">Notes (optional)</label>
                <textarea className={`${fieldClass} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any additional notes" />
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              {paymentDiff.carryNext > 0 && <>Carry forward next: <span className="text-neutral-800 font-semibold">{formatMoney(paymentDiff.carryNext)}</span></>}
              {paymentDiff.advanceNext > 0 && <>Advance next: <span className="text-neutral-800 font-semibold">{formatMoney(paymentDiff.advanceNext)}</span></>}
            </div>

            {modalError && <div className="mt-3 text-sm text-rose-600">{modalError}</div>}
            {success && <div className="mt-3 text-sm text-emerald-600">{success}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700" onClick={closePayModal}>Cancel</button>
              <button className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800" onClick={submitPayment} disabled={saving}>
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
