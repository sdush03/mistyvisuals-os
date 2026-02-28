'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type MoneySource = {
  id: number
  name: string
}

type Category = {
  id: number
  name: string
}

type LeadOption = {
  id: number
  name: string
  lead_number?: number | null
}

type FinanceTransaction = {
  id: number
  date: string
  amount: number | string
  direction: 'in' | 'out'
  money_source_id: number
  money_source_name?: string | null
  lead_id?: number | null
  lead_name?: string | null
  lead_number?: number | null
  is_overhead: boolean
  category_id?: number | null
  category_name?: string | null
  note?: string | null
  created_at?: string
  is_deleted?: boolean
  vendor_bill_id?: number | null
  employee_payout_id?: number | null
  settlement_status?: 'settled' | 'suggested' | 'unsettled' | string
}

type TotalSummary = {
  lead_id?: number
  lead_name?: string
  lead_number?: number
  source_name?: string
  money_source_id?: number
  month?: string
  total_in: number
  total_out: number
  overhead_in?: number
  overhead_out?: number
}

const parseAmount = (value: string) => {
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatAmount = (value: number | string) => {
  if (!value) return '0'
  return formatIndian(value)
}

export default function FinancePage() {
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [viewMode, setViewMode] = useState<'all' | 'lead' | 'overhead' | 'source'>('all')
  const [viewLeadId, setViewLeadId] = useState('')
  const [viewSourceId, setViewSourceId] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [mainTab, setMainTab] = useState<'transactions' | 'totals'>('transactions')
  const [totalsMode, setTotalsMode] = useState<'lead' | 'source' | 'month'>('lead')
  const [totalsData, setTotalsData] = useState<TotalSummary[]>([])

  const [editTx, setEditTx] = useState<FinanceTransaction | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [showEditConfirm, setShowEditConfirm] = useState(false)

  const [deleteTxId, setDeleteTxId] = useState<number | null>(null)
  const [pnlLeadId, setPnlLeadId] = useState('')

  const [formDate, setFormDate] = useState(() => {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  })
  const [formAmount, setFormAmount] = useState('')
  const [formDirection, setFormDirection] = useState<'in' | 'out'>('in')
  const [formMoneySourceId, setFormMoneySourceId] = useState('')
  const [formLeadId, setFormLeadId] = useState('')
  const [formOverhead, setFormOverhead] = useState(false)
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    void loadLookups()
  }, [])

  useEffect(() => {
    void loadTransactions()
  }, [viewMode, viewLeadId, viewSourceId])

  const loadLookups = async () => {
    setLoading(true)
    setError('')
    try {
      const [sourcesRes, categoriesRes] = await Promise.all([
        apiFetch('/api/finance/money-sources'),
        apiFetch('/api/finance/categories'),
      ])
      const sourcesData = await sourcesRes.json().catch(() => [])
      const categoriesData = await categoriesRes.json().catch(() => [])
      setMoneySources(Array.isArray(sourcesData) ? sourcesData : [])
      setCategories(Array.isArray(categoriesData) ? categoriesData : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load finance data')
    } finally {
      setLoading(false)
    }
  }

  const loadTransactions = async () => {
    if (viewMode === 'lead' && !viewLeadId) {
      setTransactions([])
      setLoading(false)
      return
    }
    if (viewMode === 'source' && !viewSourceId) {
      setTransactions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (viewMode === 'overhead') params.set('is_overhead', '1')
      if (viewMode === 'lead' && viewLeadId) params.set('lead_id', viewLeadId)
      if (viewMode === 'source' && viewSourceId) params.set('money_source_id', viewSourceId)
      if (showDeleted) params.set('show_deleted', '1')
      params.set('limit', '500')
      const url = params.toString() ? `/api/finance/transactions?${params.toString()}` : '/api/finance/transactions'
      const res = await apiFetch(url)
      const data = await res.json().catch(() => [])
      setTransactions(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const loadTotals = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/totals?group_by=${totalsMode}`)
      const data = await res.json().catch(() => [])
      setTotalsData(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load totals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mainTab === 'transactions') {
      void loadTransactions()
    } else if (mainTab === 'totals') {
      void loadTotals()
    }
  }, [viewMode, viewLeadId, viewSourceId, showDeleted, mainTab, totalsMode])

  const totals = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    for (const tx of transactions) {
      const value = Number(tx.amount)
      if (!Number.isFinite(value)) continue
      if (tx.direction === 'in') totalIn += value
      if (tx.direction === 'out') totalOut += value
    }
    return { totalIn, totalOut }
  }, [transactions])

  const handleSubmit = async () => {
    setFormError('')
    const amount = parseAmount(formAmount)
    if (!formDate) return setFormError('Date is required')
    if (!amount) return setFormError('Amount is required')
    if (!formMoneySourceId) return setFormError('Money source is required')
    if (formLeadId && formOverhead) return setFormError('Choose a lead OR overhead')
    if (!formLeadId && !formOverhead) return setFormError('Choose a lead OR overhead')

    setSaving(true)
    try {
      const res = await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: formDate,
          amount,
          direction: formDirection,
          money_source_id: Number(formMoneySourceId),
          lead_id: formLeadId ? Number(formLeadId) : null,
          is_overhead: formOverhead,
          category_id: formCategoryId ? Number(formCategoryId) : null,
          note: formNote || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(data?.error || 'Unable to save transaction')
        return
      }
      void loadTransactions()
      setFormAmount('')
      setFormNote('')
      setFormCategoryId('')
      setFormLeadId('')
      setFormOverhead(false)
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async () => {
    if (!editTx) return
    const amount = parseAmount(editAmount)
    if (!amount) return setError('Amount is required')
    setSaving(true)
    try {
      const res = await apiFetch(`/api/finance/transactions/${editTx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount,
          category_id: editCategory ? Number(editCategory) : null,
          note: editNote || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Unable to update transaction')
        return
      }
      setEditTx(null)
      void loadTransactions()
    } catch (err: any) {
      setError(err?.message || 'Unable to update transaction')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTxId) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/finance/transactions/${deleteTxId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Unable to delete transaction')
        return
      }
      void loadTransactions()
    } catch (err: any) {
      setError(err?.message || 'Unable to delete transaction')
    } finally {
      setSaving(false)
      setDeleteTxId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2">Finance</h1>
          <p className="text-sm text-neutral-600 mt-1">Track money in and money out with simple, explicit entries.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Quick P&amp;L</div>
            <LeadAsyncSearch
              value={pnlLeadId}
              onChange={(id) => setPnlLeadId(id)}
              placeholder="Search lead for P&L..."
            />
          </div>
          {pnlLeadId ? (
            <Link className={buttonOutline} href={`/admin/finance/projects/${pnlLeadId}/pnl`}>
              Open P&amp;L
            </Link>
          ) : (
            <button className={buttonOutline} disabled>
              Open P&amp;L
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className={buttonPrimary} href="/admin/finance">Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/unsettled">Unsettled Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/money-sources">Money Sources</Link>
        <Link className={buttonOutline} href="/admin/finance/categories">Categories</Link>
        <Link className={buttonOutline} href="/admin/finance/cashflow">Cashflow</Link>
        <Link className={buttonOutline} href="/admin/payroll/profiles">Employee Profiles</Link>
        <Link className={buttonOutline} href="/admin/finance/vendors">Vendors</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Add Transaction</div>
            <div className="text-xs text-neutral-500">Explicitly capture money in or out.</div>
          </div>
        </div>

        {formError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Date</div>
            <input type="date" className={fieldClass} value={formDate} onChange={e => setFormDate(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Amount</div>
            <CurrencyInput
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 outline-none transition"
              value={formAmount}
              onChange={setFormAmount}
              placeholder="0"
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Direction</div>
            <select className={fieldClass} value={formDirection} onChange={e => setFormDirection(e.target.value as 'in' | 'out')}>
              <option value="in">Money In</option>
              <option value="out">Money Out</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Money Source</div>
            <select className={fieldClass} value={formMoneySourceId} onChange={e => setFormMoneySourceId(e.target.value)}>
              <option value="">Select source</option>
              {moneySources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Lead</div>
            <LeadAsyncSearch
              value={formLeadId}
              onChange={(id) => {
                setFormLeadId(id)
                if (id) setFormOverhead(false)
              }}
              disabled={formOverhead}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formOverhead}
                onChange={e => {
                  const checked = e.target.checked
                  setFormOverhead(checked)
                  if (checked) {
                    setFormLeadId('')
                  }
                }}
              />
              Overhead (not tied to a lead)
            </label>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Category</div>
            <select className={fieldClass} value={formCategoryId} onChange={e => setFormCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-neutral-500 mb-1">Note</div>
            <input
              type="text"
              className={fieldClass}
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              placeholder="Optional context"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button className={buttonPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Transaction'}
          </button>
        </div>
      </section>

      {/* TABS FOR MAIN CONTENT */}
      <div className="flex border-b border-[var(--border)] gap-6">
        <button
          className={`pb-3 text-sm font-medium transition ${mainTab === 'transactions' ? 'border-b-2 border-neutral-900 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setMainTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={`pb-3 text-sm font-medium transition ${mainTab === 'totals' ? 'border-b-2 border-neutral-900 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setMainTab('totals')}
        >
          Read-Only Totals
        </button>
        <div className="ml-auto flex items-center gap-4 text-sm font-medium">
          <Link
            href="/admin/finance/invoices"
            className="pb-3 transition text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
          >
            Invoices
            <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/admin/finance/vendors/bills"
            className="pb-3 transition text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
          >
            Vendor Bills
            <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/admin/payroll"
            className="pb-3 transition text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
          >
            Payroll
            <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/admin/finance/settlements/audit"
            className="pb-3 transition text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
          >
            Settlement Audit
            <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>

      {mainTab === 'transactions' ? (
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Transactions</div>
              <div className="text-xs text-neutral-500">View and edit historical transactions.</div>
            </div>
            <div className="flex flex-col gap-2 relative">
              <div className="flex flex-wrap gap-2">
                <button className={viewMode === 'all' ? buttonPrimary : buttonOutline} onClick={() => setViewMode('all')}>
                  All
                </button>
                <button className={viewMode === 'lead' ? buttonPrimary : buttonOutline} onClick={() => setViewMode('lead')}>
                  By Lead
                </button>
                <button className={viewMode === 'overhead' ? buttonPrimary : buttonOutline} onClick={() => setViewMode('overhead')}>
                  Overheads
                </button>
                <button className={viewMode === 'source' ? buttonPrimary : buttonOutline} onClick={() => setViewMode('source')}>
                  By Source
                </button>
              </div>
              <div className="flex items-center justify-end gap-2 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
                  <span className="text-neutral-500">Show Deleted</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {viewMode === 'lead' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                  <LeadAsyncSearch
                    value={viewLeadId}
                    onChange={(id) => setViewLeadId(id)}
                    placeholder="Search lead to filter..."
                  />
                </div>
                {viewLeadId ? (
                  <Link
                    href={`/admin/finance/projects/${viewLeadId}/pnl`}
                    className={buttonOutline}
                  >
                    Open P&amp;L
                  </Link>
                ) : (
                  <button className={buttonOutline} disabled>
                    Open P&amp;L
                  </button>
                )}
              </div>
            )}
            {viewMode === 'source' && (
              <select className={fieldClass} value={viewSourceId} onChange={e => setViewSourceId(e.target.value)}>
                <option value="">Select money source</option>
                {moneySources.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            )}
            <div className="ml-auto text-sm text-neutral-600 flex items-center gap-4">
              <span>In: ₹{formatAmount(totals.totalIn)}</span>
              <span>Out: ₹{formatAmount(totals.totalOut)}</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-neutral-600">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Money Source</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Overhead</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 font-medium">Settlement</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-neutral-500" colSpan={10}>Loading transactions…</td>
                  </tr>
                )}
                {!loading && transactions.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-neutral-500" colSpan={10}>No transactions yet.</td>
                  </tr>
                )}
                {!loading && transactions.map(tx => {
                  if (editTx?.id === tx.id) {
                    const settlementLabel = tx.vendor_bill_id
                      ? `Bill #${tx.vendor_bill_id}`
                      : tx.employee_payout_id
                        ? `Payout #${tx.employee_payout_id}`
                        : (tx.settlement_status === 'suggested' ? 'Suggested' : 'Unsettled')
                    return (
                      <tr key={tx.id} className="bg-neutral-50/50">
                        <td className="px-4 py-3 opacity-50">{formatDateShort(tx.date)}</td>
                        <td className="px-4 py-3">
                          <CurrencyInput className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm" value={editAmount} onChange={setEditAmount} />
                        </td>
                        <td className="px-4 py-3 opacity-50">{tx.direction === 'in' ? 'In' : 'Out'}</td>
                        <td className="px-4 py-3 opacity-50">{tx.money_source_name || '—'}</td>
                        <td className="px-4 py-3 opacity-50">{tx.lead_id ? `${tx.lead_number ? `#${tx.lead_number}` : ''} ${tx.lead_name}` : '—'}</td>
                        <td className="px-4 py-3 opacity-50">{tx.is_overhead ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3">
                          <select className="max-w-[120px] rounded border border-neutral-300 px-2 py-1 text-sm bg-white" value={editCategory} onChange={e => setEditCategory(e.target.value)}>
                            <option value="">No category</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                          </select>
                        </td>
                        <td className="py-3 pr-2">
                          <input type="text" className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" value={editNote} onChange={e => setEditNote(e.target.value)} />
                        </td>
                        <td className="px-4 py-3 opacity-50">{settlementLabel}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button className="text-emerald-600 font-medium hover:text-emerald-800 text-xs" onClick={() => setShowEditConfirm(true)}>Save</button>
                          <button className="text-neutral-500 font-medium hover:text-neutral-700 text-xs" onClick={() => setEditTx(null)}>Cancel</button>
                        </td>
                      </tr>
                    )
                  }

                  const settlementLabel = tx.vendor_bill_id
                    ? `Bill #${tx.vendor_bill_id}`
                    : tx.employee_payout_id
                      ? `Payout #${tx.employee_payout_id}`
                      : (tx.settlement_status === 'suggested' ? 'Suggested' : 'Unsettled')
                  const settlementTone = tx.vendor_bill_id || tx.employee_payout_id
                    ? 'bg-emerald-100 text-emerald-700'
                    : tx.settlement_status === 'suggested'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-neutral-100 text-neutral-700'

                  return (
                    <tr key={tx.id} className={`hover:bg-[var(--surface-muted)] transition ${tx.is_deleted ? 'opacity-40 grayscale line-through' : ''}`}>
                      <td className="px-4 py-3">{formatDateShort(tx.date)}</td>
                      <td className="px-4 py-3">₹{formatAmount(tx.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={tx.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}>
                          {tx.direction === 'in' ? 'In' : 'Out'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{tx.money_source_name || '—'}</td>
                      <td className="px-4 py-3">
                        {tx.lead_id ? (
                          <span>
                            {tx.lead_number ? `#${tx.lead_number} · ` : ''}{tx.lead_name || 'Lead'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">{tx.is_overhead ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">{tx.category_name || '—'}</td>
                      <td className="py-3 text-neutral-600">{tx.note || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${settlementTone}`}>
                          {settlementLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!tx.is_deleted && (
                          <>
                            <button className="text-brand-600 font-medium hover:text-brand-800 text-xs mr-3" onClick={() => {
                              setEditTx(tx)
                              setEditAmount(String(tx.amount))
                              setEditCategory(tx.category_id ? String(tx.category_id) : '')
                              setEditNote(tx.note || '')
                            }}>Edit</button>
                            <button className="text-rose-600 font-medium hover:text-rose-800 text-xs" onClick={() => setDeleteTxId(tx.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <div className="text-lg font-semibold">Totals Summary</div>
              <div className="text-xs text-neutral-500">Read-only aggregations (deleted items excluded).</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={totalsMode === 'lead' ? buttonPrimary : buttonOutline} onClick={() => setTotalsMode('lead')}>
                By Lead
              </button>
              <button className={totalsMode === 'source' ? buttonPrimary : buttonOutline} onClick={() => setTotalsMode('source')}>
                By Source
              </button>
              <button className={totalsMode === 'month' ? buttonPrimary : buttonOutline} onClick={() => setTotalsMode('month')}>
                By Month
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-neutral-600 border-b border-[var(--border)]">
                <tr className="text-left">
                  {totalsMode === 'lead' && <th className="px-4 py-3 font-medium">Lead</th>}
                  {totalsMode === 'source' && <th className="px-4 py-3 font-medium">Money Source</th>}
                  {totalsMode === 'month' && <th className="px-4 py-3 font-medium">Month</th>}
                  <th className="px-4 py-3 font-medium text-right">Total In</th>
                  <th className="px-4 py-3 font-medium text-right">Total Out</th>
                  {totalsMode === 'lead' && <th className="px-4 py-3 font-medium text-right">Net</th>}
                  {totalsMode === 'month' && <th className="px-4 py-3 font-medium text-right">Overhead In</th>}
                  {totalsMode === 'month' && <th className="px-4 py-3 font-medium text-right">Overhead Out</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-neutral-500 text-center" colSpan={6}>Loading totals…</td>
                  </tr>
                )}
                {!loading && totalsData.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-neutral-500 text-center" colSpan={6}>No data found.</td>
                  </tr>
                )}
                {!loading && totalsData.map((row, i) => (
                  <tr key={i} className="hover:bg-[var(--surface-muted)] transition">
                    <td className="px-4 py-3">
                      {totalsMode === 'lead' && (
                        <span className="font-medium text-neutral-800">{row.lead_number ? `#${row.lead_number} ` : ''}{row.lead_name || 'Unknown Lead'}</span>
                      )}
                      {totalsMode === 'source' && <span className="font-medium text-neutral-800">{row.source_name || 'Unknown Source'}</span>}
                      {totalsMode === 'month' && <span className="font-medium text-neutral-800">{row.month}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">₹{formatAmount(row.total_in || 0)}</td>
                    <td className="px-4 py-3 text-right text-rose-700">₹{formatAmount(row.total_out || 0)}</td>

                    {totalsMode === 'lead' && (
                      <td className="px-4 py-3 text-right font-medium">
                        <span className={Number(row.total_in) - Number(row.total_out) >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          ₹{formatAmount(Number(row.total_in || 0) - Number(row.total_out || 0))}
                        </span>
                      </td>
                    )}
                    {totalsMode === 'month' && (
                      <>
                        <td className="px-4 py-3 text-right text-emerald-700/70">₹{formatAmount(row.overhead_in || 0)}</td>
                        <td className="px-4 py-3 text-right text-rose-700/70">₹{formatAmount(row.overhead_out || 0)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={showEditConfirm}
        title="Confirm Edit"
        message={
          <>
            Are you sure you want to modify this transaction?
            <br />
            <span className="font-medium text-rose-600">Warning: Financial edits affect read-only totals and reports.</span>
            <br />
            An audit log of this change will be recorded.
          </>
        }
        confirmText="Save Changes"
        onClose={() => setShowEditConfirm(false)}
        onConfirm={handleEditSave}
      />

      <ConfirmDialog
        isOpen={deleteTxId !== null}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? It will be hidden from totals, but can still be viewed later."
        confirmText="Delete"
        isDangerous
        onClose={() => setDeleteTxId(null)}
        onConfirm={handleDelete}
      />
    </div >
  )
}
