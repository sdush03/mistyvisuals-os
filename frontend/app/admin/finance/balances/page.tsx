'use client'


import CalendarInput from '@/components/CalendarInput'
import { toISTDateInput } from '@/lib/formatters'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type BalanceRow = {
  money_source_id: number
  name: string
  account_type?: string | null
  balance: number | string
  last_transaction_date?: string | null
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FinanceBalancesPage() {
  const [asOfDate, setAsOfDate] = useState(() => toISTDateInput())
  const [showZero, setShowZero] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadBalances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate])

  const loadBalances = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/balances?as_of=${encodeURIComponent(asOfDate)}`)
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to load balances')
      setBalances(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load balances')
    } finally {
      setLoading(false)
    }
  }

  const filteredBalances = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return balances
      .map(row => ({ ...row, balance: Number(row.balance || 0) }))
      .filter(row => (showZero ? true : row.balance !== 0))
      .filter(row => {
        if (!query) return true
        const name = String(row.name || '').toLowerCase()
        const type = String(row.account_type || '').toLowerCase()
        return name.includes(query) || type.includes(query)
      })
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
  }, [balances, showZero, searchTerm])

  const exportSnapshotCsv = () => {
    const lines: string[] = []
    lines.push('Account,Type,Balance,Last Transaction Date')
    filteredBalances.forEach(row => {
      const balanceValue = Number(row.balance || 0)
      lines.push(`${row.name},${row.account_type || ''},${balanceValue},${row.last_transaction_date || ''}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balances-${asOfDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Account Balances</h1>
        <p className="text-sm text-neutral-600 mt-1">Point-in-time snapshot across internal accounts.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Snapshot</div>
            <div className="text-xs text-neutral-500">Balances as of selected date.</div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">As of Date</div>
              <CalendarInput className={fieldClass} value={asOfDate} onChange={val => setAsOfDate(val)} />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Search</div>
              <input className={fieldClass} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search account" />
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-600 mb-1">
              <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} />
              Show zero balance
            </label>
            <button className={buttonOutline} onClick={exportSnapshotCsv} disabled={filteredBalances.length === 0}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              <tr className="text-left">
                <th className="pb-3">Account</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Balance</th>
                <th className="pb-3">Last Transaction</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={5}>Loading balances…</td>
                </tr>
              )}
              {!loading && filteredBalances.length === 0 && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500" colSpan={5}>No balances found.</td>
                </tr>
              )}
              {!loading && filteredBalances.map(row => {
                const balanceValue = Number(row.balance || 0)
                const balanceTone = balanceValue < 0 ? 'text-rose-600' : 'text-emerald-600'
                return (
                  <tr key={row.money_source_id}>
                    <td className="py-3 font-medium text-neutral-900">{row.name}</td>
                    <td className="py-3 text-neutral-500">{row.account_type || '—'}</td>
                    <td className={`py-3 font-semibold ${balanceTone}`}>₹{formatIndian(balanceValue)}</td>
                    <td className="py-3 text-neutral-600">{formatDateShort(row.last_transaction_date)}</td>
                    <td className="py-3 text-right">
                      <Link className={buttonOutline} href={`/admin/finance/balances/${row.money_source_id}`}>
                        View Ledger
                      </Link>
                    </td>
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
