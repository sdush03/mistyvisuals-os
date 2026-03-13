'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type MoneySource = {
  id: number
  name: string
}

type InvoiceRow = {
  id: number
  invoice_number?: string | null
  total_amount: number | string
  paid_amount: number | string
  status: string
  due_date?: string | null
}

type InvoicePayment = {
  id: number
  amount_applied: number | string
  transaction_date?: string | null
  money_source_name?: string | null
}

type InvoiceScheduleRow = {
  id: number
  label?: string | null
  amount?: number | string | null
  due_date?: string | null
  step_order?: number | null
}

type InvoiceDetail = InvoiceRow & {
  payments?: InvoicePayment[]
  payment_schedule?: InvoiceScheduleRow[]
}

const fieldClass = 'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-400'

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

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ReceiveMoneyPage() {
  const [leadId, setLeadId] = useState('')
  const [leadName, setLeadName] = useState('')
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [invoiceId, setInvoiceId] = useState('')
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [fetchError, setFetchError] = useState('')

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [moneySourceId, setMoneySourceId] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [attachmentLink, setAttachmentLink] = useState('')
  const [overpayChoice, setOverpayChoice] = useState<'other_invoice' | 'credit'>('other_invoice')
  const [carryAmount, setCarryAmount] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showOverpayConfirm, setShowOverpayConfirm] = useState(false)

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
    if (!leadId) {
      setInvoices([])
      setInvoiceId('')
      setInvoiceDetail(null)
      setFetchError('')
      return
    }
    const loadInvoices = async () => {
      setLoadingInvoices(true)
      setFetchError('')
      try {
        const res = await apiFetch(`/api/finance/invoices?lead_id=${leadId}`)
        const data = await res.json().catch(() => [])
        const list = Array.isArray(data) ? data : []
        setInvoices(list)
        setInvoiceId((prev) => {
          if (prev && list.some(inv => String(inv.id) === prev)) return prev
          const usable = list.filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled')
          const open = usable.find(inv => inv.status !== 'paid')
          const next = open || usable[0]
          return next ? String(next.id) : ''
        })
      } catch (err: any) {
        setFetchError(err?.message || 'Unable to load invoices')
        setInvoices([])
        setInvoiceId('')
        setInvoiceDetail(null)
      } finally {
        setLoadingInvoices(false)
      }
    }
    void loadInvoices()
  }, [leadId])

  useEffect(() => {
    if (!invoiceId) {
      setInvoiceDetail(null)
      return
    }
    const loadDetail = async () => {
      setLoadingDetail(true)
      try {
        const res = await apiFetch(`/api/finance/invoices/${invoiceId}`)
        const data = await res.json().catch(() => null)
        setInvoiceDetail(data || null)
      } catch {
        setInvoiceDetail(null)
      } finally {
        setLoadingDetail(false)
      }
    }
    void loadDetail()
  }, [invoiceId])

  const activeInvoice = useMemo(() => {
    if (!invoiceId) return null
    return invoices.find(inv => String(inv.id) === invoiceId) || null
  }, [invoices, invoiceId])

  const invoiceChoices = useMemo(() => {
    return invoices.filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled')
  }, [invoices])

  const totals = useMemo(() => {
    if (!activeInvoice) return null
    const total = Number(activeInvoice.total_amount || 0)
    const paidFromDetail = invoiceDetail?.payments?.reduce((sum, p) => sum + Number(p.amount_applied || 0), 0) || 0
    const paid = paidFromDetail || Number(activeInvoice.paid_amount || 0)
    const outstanding = Math.max(total - paid, 0)
    return { total, paid, outstanding }
  }, [activeInvoice, invoiceDetail])

  const scheduleRows = useMemo(() => {
    const rows = invoiceDetail?.payment_schedule || []
    return rows.filter(row => row.amount !== null && row.amount !== undefined)
  }, [invoiceDetail])

  const schedulePreview = useMemo(() => {
    if (!totals || scheduleRows.length === 0) return []
    const paidSoFar = totals.paid
    let remainingPaid = paidSoFar
    const currentPayment = parseAmount(amount) || 0
    const applyMap: Record<number, number> = {}

    let remainingApply = currentPayment
    for (const row of scheduleRows) {
      const stepAmount = Number(row.amount || 0)
      const stepPaid = Math.min(stepAmount, remainingPaid)
      const outstanding = Math.max(stepAmount - stepPaid, 0)
      const applyNow = Math.min(outstanding, remainingApply)
      applyMap[row.id] = applyNow
      remainingApply -= applyNow
      remainingPaid = Math.max(remainingPaid - stepAmount, 0)
      if (remainingApply <= 0) break
    }

    remainingPaid = paidSoFar
    return scheduleRows.map((row) => {
      const stepAmount = Number(row.amount || 0)
      const stepPaid = Math.min(stepAmount, remainingPaid)
      remainingPaid = Math.max(remainingPaid - stepAmount, 0)
      const outstanding = Math.max(stepAmount - stepPaid, 0)
      const applyNow = applyMap[row.id] || 0
      return {
        id: row.id,
        label: row.label || `Milestone ${row.step_order || ''}`.trim(),
        due_date: row.due_date,
        amount: stepAmount,
        paid: stepPaid,
        outstanding,
        applyNow,
      }
    })
  }, [scheduleRows, totals, amount])

  const disableSubmit = !leadId || !invoiceId || !moneySourceId || !parseAmount(amount) || !activeInvoice || !totals || totals.outstanding <= 0

  const buildFinalNote = () => {
    const tags: string[] = []
    if (paymentMethod) tags.push(`Method: ${paymentMethod}`)
    const amountNum = parseAmount(amount)
    if (amountNum && totals && amountNum > totals.outstanding) {
      tags.push(`Overpay: ${overpayChoice === 'other_invoice' ? 'Other invoice' : 'Unapplied credit'}`)
    }
    if (attachmentLink.trim()) tags.push(`Proof: ${attachmentLink.trim()}`)
    const meta = tags.length ? `[${tags.join('] [')}]` : ''
    const remark = note.trim()
    return [remark, meta].filter(Boolean).join(' ')
  }

  const submitPayment = async (forceOverpay = false) => {
    setError('')
    setSuccess('')
    if (!activeInvoice || !totals) {
      setError('Select a project with an active invoice.')
      return
    }

    const amountNum = parseAmount(amount)
    if (!amountNum) {
      setError('Amount is required.')
      return
    }

    if (totals.outstanding <= 0) {
      setError('Invoice already fully paid')
      return
    }

    if (amountNum > totals.outstanding && !forceOverpay) {
      setShowOverpayConfirm(true)
      return
    }

    setSaving(true)
    try {
      const amountToApply =
        amountNum > totals.outstanding && overpayChoice === 'other_invoice' ? totals.outstanding : amountNum
      const res = await apiFetch(`/api/finance/invoices/${activeInvoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount_applied: amountToApply,
          money_source_id: Number(moneySourceId),
          date,
          note: buildFinalNote() || null,
        }),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || 'Failed to record payment')
      }
      setSuccess('Payment recorded and invoice updated.')
      const remaining = Math.max(amountNum - totals.outstanding, 0)
      if (remaining > 0 && overpayChoice === 'other_invoice') {
        setCarryAmount(remaining)
        setAmount(String(remaining))
        setInvoiceId('')
        setSuccess('Payment recorded. Select another invoice to apply the remaining amount.')
      } else {
        setCarryAmount(null)
        setAmount('')
      }
      setNote('')
      setPaymentMethod('')
      setAttachmentLink('')
      setOverpayChoice('other_invoice')
      if (leadId) {
        const refresh = await apiFetch(`/api/finance/invoices?lead_id=${leadId}`)
        const data = await refresh.json().catch(() => [])
        setInvoices(Array.isArray(data) ? data : [])
      }
      if (invoiceId) {
        const detail = await apiFetch(`/api/finance/invoices/${invoiceId}`)
        const detailData = await detail.json().catch(() => null)
        setInvoiceDetail(detailData || null)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Receive Money</h1>
        <p className="mt-1 text-sm text-neutral-500">Record client payment against a project</p>
      </div>

      <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Project</label>
          <LeadAsyncSearch
            value={leadId}
            onChange={(id, name) => {
              setLeadId(id)
              setLeadName(name || '')
              setInvoiceId('')
              setCarryAmount(null)
              setSuccess('')
              setError('')
            }}
            selectedLabel={leadName}
            placeholder="Search by name, phone, or ID..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Invoice</label>
          <select
            className={fieldClass}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            disabled={!leadId || loadingInvoices || invoiceChoices.length === 0}
          >
            <option value="">
              {leadId ? (loadingInvoices ? 'Loading invoices…' : 'Select invoice') : 'Select project first'}
            </option>
            {invoiceChoices.map((inv) => {
              const total = Number(inv.total_amount || 0)
              const paid = Number(inv.paid_amount || 0)
              const outstanding = Math.max(total - paid, 0)
              const statusLabel = inv.status.replace('_', ' ')
              return (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number || `Invoice #${inv.id}`} · {statusLabel} · Outstanding {formatMoney(outstanding)}
                </option>
              )
            })}
          </select>
          {carryAmount !== null && (
            <div className="text-xs text-amber-600">
              Remaining {formatMoney(carryAmount)} ready for another invoice.
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Date</label>
            <input
              type="date"
              className={fieldClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
            <label className="text-sm font-medium text-neutral-700">Money Source</label>
            <select
              className={fieldClass}
              value={moneySourceId}
              onChange={(e) => setMoneySourceId(e.target.value)}
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
            <label className="text-sm font-medium text-neutral-700">Payment Method (optional)</label>
            <select
              className={fieldClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">Select method</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Attach Proof (link)</label>
            <input
              type="url"
              className={fieldClass}
              value={attachmentLink}
              onChange={(e) => setAttachmentLink(e.target.value)}
              placeholder="Paste receipt or drive link"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Remarks (optional)</label>
            <textarea
              className={`${fieldClass} min-h-[90px]`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add notes for this payment"
            />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm font-medium text-neutral-700">Invoice Snapshot</div>
          {loadingInvoices ? (
            <div className="mt-2 text-sm text-neutral-500">Loading invoice…</div>
          ) : fetchError ? (
            <div className="mt-2 text-sm text-rose-600">{fetchError}</div>
          ) : !leadId ? (
            <div className="mt-2 text-sm text-neutral-500">Select a project to view invoice details.</div>
          ) : !activeInvoice ? (
            <div className="mt-2 text-sm text-neutral-500">No issued invoice found for this project.</div>
          ) : (
            <div className="mt-3 grid gap-2 text-sm text-neutral-700 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase text-neutral-500">Invoice Total</div>
                <div className="font-semibold text-neutral-900">{formatMoney(totals?.total || 0)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-neutral-500">Received</div>
                <div className="font-semibold text-neutral-900">{formatMoney(totals?.paid || 0)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-neutral-500">Outstanding</div>
                <div className="font-semibold text-neutral-900">{formatMoney(totals?.outstanding || 0)}</div>
              </div>
            </div>
          )}
          {totals && totals.outstanding <= 0 && (
            <div className="mt-3 text-sm text-rose-600">Invoice already fully paid</div>
          )}
        </div>

        {activeInvoice && loadingDetail && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            Loading payment schedule…
          </div>
        )}

        {activeInvoice && !loadingDetail && scheduleRows.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-medium text-neutral-700">Allocation Preview</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Milestone</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                    <th className="px-3 py-2 text-right">Will Apply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {schedulePreview.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-neutral-700">{row.label}</td>
                      <td className="px-3 py-2 text-neutral-500">{row.due_date || '—'}</td>
                      <td className="px-3 py-2 text-right text-neutral-700">{formatMoney(row.amount)}</td>
                      <td className="px-3 py-2 text-right text-neutral-700">{formatMoney(row.outstanding)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600">{formatMoney(row.applyNow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeInvoice && !loadingDetail && scheduleRows.length === 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            No payment schedule found. This payment will be applied to the invoice outstanding amount.
          </div>
        )}

        {invoiceDetail?.payments?.length ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-medium text-neutral-700">Recent Payments</div>
            <div className="mt-3 space-y-2 text-sm text-neutral-600">
              {invoiceDetail.payments.slice(-5).reverse().map((payment) => (
                <div key={payment.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-neutral-700">{formatMoney(payment.amount_applied)}</div>
                    <div className="text-xs text-neutral-500">{payment.money_source_name || '—'}</div>
                  </div>
                  <div className="text-xs text-neutral-500">{formatDateShort(payment.transaction_date)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-sm text-neutral-500">This payment will be recorded against the project invoice.</div>

        {error && <div className="text-sm text-rose-600">{error}</div>}
        {success && <div className="text-sm text-emerald-600">{success}</div>}

        <button
          type="button"
          className="btn-pill bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          disabled={disableSubmit || saving}
          onClick={() => submitPayment(false)}
        >
          {saving ? 'Recording…' : 'Record Payment'}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showOverpayConfirm}
        title="Overpayment detected"
        message={
          <div>
            <div className="text-sm text-neutral-600">
              The amount exceeds the outstanding balance for {leadName || 'this project'}. Choose how to handle the
              excess.
            </div>
            <div className="mt-3 space-y-2 text-sm text-neutral-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overpay"
                  value="other_invoice"
                  checked={overpayChoice === 'other_invoice'}
                  onChange={() => setOverpayChoice('other_invoice')}
                />
                Payment for other invoice
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overpay"
                  value="credit"
                  checked={overpayChoice === 'credit'}
                  onChange={() => setOverpayChoice('credit')}
                />
                Unapplied credit
              </label>
            </div>
          </div>
        }
        confirmText="Record Payment"
        onConfirm={() => submitPayment(true)}
        onClose={() => setShowOverpayConfirm(false)}
      />
    </div>
  )
}
