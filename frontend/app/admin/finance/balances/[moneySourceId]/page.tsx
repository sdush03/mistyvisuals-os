'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type LedgerRow = {
  date: string
  direction: 'in' | 'out'
  amount: number | string
  note?: string | null
  is_transfer?: boolean
  transfer_group_id?: string | null
  counterparty_name?: string | null
  running_balance: number
}

type LedgerResponse = {
  account: {
    money_source_id: number
    name: string
    account_type?: string | null
  }
  ledger: LedgerRow[]
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function BalanceLedgerPage() {
  const params = useParams()
  const sourceId = String(params?.moneySourceId || '')

  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')
  const [detail, setDetail] = useState<LedgerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sourceId) return
    void loadLedger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (ledgerFrom) params.set('from_date', ledgerFrom)
    if (ledgerTo) params.set('to_date', ledgerTo)
    return params.toString()
      ? `/api/finance/balances/${sourceId}?${params.toString()}`
      : `/api/finance/balances/${sourceId}`
  }

  const loadLedger = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(buildUrl())
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load ledger')
      setDetail(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }

  const exportLedgerCsv = () => {
    if (!detail) return
    const lines: string[] = []
    lines.push('Date,Description,Direction,Amount,Running Balance')
    detail.ledger.forEach(row => {
      const desc = renderDescription(row)
      lines.push(`${row.date},${desc},${row.is_transfer ? 'TRANSFER' : row.direction.toUpperCase()},${row.amount},${row.running_balance}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${detail.account.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderDescription = (row: LedgerRow) => {
    if (row.is_transfer) {
      if (row.direction === 'out') return `Transfer to ${row.counterparty_name || 'account'}`
      return `Transfer from ${row.counterparty_name || 'account'}`
    }
    return row.note || '—'
  }

  const totalRows = useMemo(() => detail?.ledger?.length || 0, [detail])

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Ledger</h1>
            <p className="text-sm text-neutral-600 mt-1">{detail?.account.name || 'Account'} ledger history.</p>
          </div>
          <div className="flex gap-2">
            <Link className={buttonOutline} href="/admin/finance/balances">Back to Balances</Link>
            <button className={buttonOutline} onClick={exportLedgerCsv} disabled={!detail || totalRows === 0}>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">From</div>
            <CalendarInput className={fieldClass} value={ledgerFrom} onChange={val => setLedgerFrom(val)} />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">To</div>
            <CalendarInput className={fieldClass} value={ledgerTo} onChange={val => setLedgerTo(val)} />
          </div>
          <button className={buttonPrimary} onClick={loadLedger}>
            Apply
          </button>
        </div>
      </section>

      <section className={cardClass}>
        <div className="text-lg font-semibold">Ledger Entries</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              <tr className="text-left">
                <th className="pb-3">Date</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Direction</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={5}>Loading ledger…</td>
                </tr>
              )}
              {!loading && (!detail || detail.ledger.length === 0) && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={5}>No transactions in range.</td>
                </tr>
              )}
              {!loading && detail && detail.ledger.map((row, idx) => {
                const directionLabel = row.is_transfer ? 'TRANSFER' : row.direction.toUpperCase()
                return (
                  <tr key={`${row.date}-${idx}`}>
                    <td className="py-3">{formatDateShort(row.date)}</td>
                    <td className="py-3 text-neutral-600">{renderDescription(row)}</td>
                    <td className="py-3">
                      <span className={row.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}>
                        {directionLabel}
                      </span>
                    </td>
                    <td className="py-3">₹{formatIndian(row.amount || 0)}</td>
                    <td className="py-3 font-medium">₹{formatIndian(row.running_balance || 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
