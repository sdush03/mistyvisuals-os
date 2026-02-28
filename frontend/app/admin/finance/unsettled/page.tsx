'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type UnsettledTx = {
  id: number
  date: string
  amount: number | string
  money_source: string
  note?: string | null
  created_at?: string
  suggested_vendor_bill_id?: number | null
  suggested_employee_payout_id?: number | null
}

type ApprovedBill = {
  id: number
  vendor_id: number
  vendor_name: string
  bill_amount: number | string
  remaining_amount: number | string
}

type OpenPayout = {
  id: number
  user_id: number
  user_name: string
  month: string
  total_payable: number | string
  total_paid: number | string
  remaining_amount: number | string
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatAmount = (value: number | string) => {
  const num = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const monthLabel = (value: string) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export default function UnsettledTransactionsPage() {
  const [transactions, setTransactions] = useState<UnsettledTx[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'unsettled' | 'suggested'>('unsettled')

  const [selectedTx, setSelectedTx] = useState<UnsettledTx | null>(null)
  const [settleType, setSettleType] = useState<'vendor' | 'payout' | ''>('')
  const [vendorBills, setVendorBills] = useState<ApprovedBill[]>([])
  const [employeePayouts, setEmployeePayouts] = useState<OpenPayout[]>([])
  const [selectedBillId, setSelectedBillId] = useState('')
  const [selectedPayoutId, setSelectedPayoutId] = useState('')
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadUnsettled()
  }, [viewMode])

  const loadUnsettled = async () => {
    setLoading(true)
    setError('')
    try {
      const endpoint = viewMode === 'suggested'
        ? '/api/finance/transactions/suggestions'
        : '/api/finance/transactions/unsettled'
      const res = await apiFetch(endpoint)
      const data = await res.json().catch(() => [])
      setTransactions(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load unsettled transactions')
    } finally {
      setLoading(false)
    }
  }

  const loadVendorBills = async () => {
    const res = await apiFetch('/api/finance/vendor-bills/approved')
    const data = await res.json().catch(() => [])
    setVendorBills(Array.isArray(data) ? data : [])
  }

  const loadEmployeePayouts = async () => {
    const res = await apiFetch('/api/finance/employee-payouts/open')
    const data = await res.json().catch(() => [])
    setEmployeePayouts(Array.isArray(data) ? data : [])
  }

  const openModal = (tx: UnsettledTx) => {
    setSelectedTx(tx)
    if (tx.suggested_vendor_bill_id) {
      setSettleType('vendor')
      setSelectedBillId(String(tx.suggested_vendor_bill_id))
      setSelectedPayoutId('')
    } else if (tx.suggested_employee_payout_id) {
      setSettleType('payout')
      setSelectedPayoutId(String(tx.suggested_employee_payout_id))
      setSelectedBillId('')
    } else {
      setSettleType('')
      setSelectedBillId('')
      setSelectedPayoutId('')
    }
    setModalError('')
  }

  const closeModal = () => {
    setSelectedTx(null)
    setSettleType('')
    setSelectedBillId('')
    setSelectedPayoutId('')
    setModalError('')
    setSaving(false)
  }

  useEffect(() => {
    if (!selectedTx || !settleType) return
    if (settleType === 'vendor' && vendorBills.length === 0) {
      void loadVendorBills()
    }
    if (settleType === 'payout' && employeePayouts.length === 0) {
      void loadEmployeePayouts()
    }
  }, [selectedTx, settleType])

  const selectedBill = useMemo(() => vendorBills.find(bill => String(bill.id) === selectedBillId), [vendorBills, selectedBillId])
  const selectedPayout = useMemo(() => employeePayouts.find(payout => String(payout.id) === selectedPayoutId), [employeePayouts, selectedPayoutId])

  const txAmount = selectedTx ? Number(selectedTx.amount) : 0
  const billRemaining = selectedBill ? Number(selectedBill.remaining_amount) : null
  const payoutRemaining = selectedPayout ? Number(selectedPayout.remaining_amount) : null

  const amountMismatch = settleType === 'vendor'
    ? billRemaining !== null && txAmount > billRemaining
    : settleType === 'payout'
      ? payoutRemaining !== null && txAmount > payoutRemaining
      : false

  const handleConfirm = async () => {
    if (!selectedTx) return
    setModalError('')
    setSaving(true)

    try {
      if (settleType === 'vendor') {
        if (!selectedBillId) {
          setModalError('Select a vendor bill')
          return
        }
        const res = await apiFetch(`/api/finance/transactions/${selectedTx.id}/link-vendor-bill`, {
          method: 'POST',
          body: JSON.stringify({ vendor_bill_id: Number(selectedBillId) }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setModalError(data?.error || 'Unable to settle transaction')
          return
        }
      } else if (settleType === 'payout') {
        if (!selectedPayoutId) {
          setModalError('Select an employee payout')
          return
        }
        const res = await apiFetch(`/api/finance/transactions/${selectedTx.id}/link-employee-payout`, {
          method: 'POST',
          body: JSON.stringify({ employee_payout_id: Number(selectedPayoutId) }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setModalError(data?.error || 'Unable to settle transaction')
          return
        }
      } else {
        setModalError('Choose a settlement type')
        return
      }

      setTransactions(prev => prev.filter(item => item.id !== selectedTx.id))
      closeModal()
    } catch (err: any) {
      setModalError(err?.message || 'Unable to settle transaction')
    } finally {
      setSaving(false)
    }
  }

  const suggestionLabel = (tx: UnsettledTx) => {
    if (tx.suggested_vendor_bill_id) return `Vendor Bill #${tx.suggested_vendor_bill_id}`
    if (tx.suggested_employee_payout_id) return `Employee Payout #${tx.suggested_employee_payout_id}`
    return '—'
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Unsettled Transactions</h1>
        <p className="text-sm text-neutral-600 mt-1">Settle outgoing transactions to vendor bills or employee payouts.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className={buttonOutline} href="/admin/finance">Transactions</Link>
        <Link className={buttonPrimary} href="/admin/finance/unsettled">Unsettled Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/money-sources">Money Sources</Link>
        <Link className={buttonOutline} href="/admin/finance/categories">Categories</Link>
        <Link className={buttonOutline} href="/admin/finance/cashflow">Cashflow</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="text-sm text-neutral-600">
            {viewMode === 'suggested' ? 'Showing suggested matches only.' : 'Showing all unsettled transactions.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={viewMode === 'unsettled' ? buttonPrimary : buttonOutline}
              onClick={() => setViewMode('unsettled')}
            >
              Unsettled
            </button>
            <button
              className={viewMode === 'suggested' ? buttonPrimary : buttonOutline}
              onClick={() => setViewMode('suggested')}
            >
              Suggestions
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-neutral-500">
                <th className="pb-3">Date</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Money Source</th>
                <th className="pb-3">Note</th>
                <th className="pb-3">Status</th>
                {viewMode === 'suggested' && <th className="pb-3">Suggested For</th>}
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={viewMode === 'suggested' ? 7 : 6}>Loading unsettled transactions…</td>
                </tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={viewMode === 'suggested' ? 7 : 6}>
                    {viewMode === 'suggested' ? 'No suggestions found.' : 'All clear. No unsettled transactions.'}
                  </td>
                </tr>
              )}
              {!loading && transactions.map(tx => (
                <tr key={tx.id}>
                  <td className="py-3">{formatDateShort(tx.date)}</td>
                  <td className="py-3">{formatAmount(tx.amount)}</td>
                  <td className="py-3">{tx.money_source}</td>
                  <td className="py-3">{tx.note || '—'}</td>
                  <td className="py-3">
                    <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      {viewMode === 'suggested' ? 'Suggested' : 'Unsettled'}
                    </span>
                  </td>
                  {viewMode === 'suggested' && (
                    <td className="py-3">{suggestionLabel(tx)}</td>
                  )}
                  <td className="py-3">
                    <button className={buttonOutline} onClick={() => openModal(tx)}>
                      Settle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Settle Transaction</h2>
                <p className="text-sm text-neutral-600">Amount: {formatAmount(selectedTx.amount)}</p>
              </div>
              <button className={buttonOutline} onClick={closeModal}>Close</button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Step 1</div>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="settle-type"
                      checked={settleType === 'vendor'}
                      onChange={() => setSettleType('vendor')}
                    />
                    Vendor Bill
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="settle-type"
                      checked={settleType === 'payout'}
                      onChange={() => setSettleType('payout')}
                    />
                    Employee Payout
                  </label>
                </div>
              </div>

              {settleType === 'vendor' && (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Step 2</div>
                  <select
                    className={fieldClass}
                    value={selectedBillId}
                    onChange={e => setSelectedBillId(e.target.value)}
                  >
                    <option value="">Select approved bill</option>
                    {vendorBills.map(bill => (
                      <option key={bill.id} value={bill.id}>
                        {bill.vendor_name} · #{bill.id}
                      </option>
                    ))}
                  </select>
                  {selectedBill && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
                      <div>Vendor: <span className="font-medium">{selectedBill.vendor_name}</span></div>
                      <div>Bill Amount: {formatAmount(selectedBill.bill_amount)}</div>
                      <div>Remaining: {formatAmount(selectedBill.remaining_amount)}</div>
                    </div>
                  )}
                </div>
              )}

              {settleType === 'payout' && (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Step 2</div>
                  <select
                    className={fieldClass}
                    value={selectedPayoutId}
                    onChange={e => setSelectedPayoutId(e.target.value)}
                  >
                    <option value="">Select open payout</option>
                    {employeePayouts.map(payout => (
                      <option key={payout.id} value={payout.id}>
                        {payout.user_name} · {monthLabel(payout.month)}
                      </option>
                    ))}
                  </select>
                  {selectedPayout && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
                      <div>Employee: <span className="font-medium">{selectedPayout.user_name}</span></div>
                      <div>Month: {monthLabel(selectedPayout.month)}</div>
                      <div>Remaining: {formatAmount(selectedPayout.remaining_amount)}</div>
                    </div>
                  )}
                </div>
              )}

              {amountMismatch && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Transaction amount exceeds remaining amount. Choose a different bill/payout.
                </div>
              )}

              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonPrimary}
                  onClick={handleConfirm}
                  disabled={saving || amountMismatch}
                >
                  Confirm Settlement
                </button>
                <button className={buttonOutline} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
