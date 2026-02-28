'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type CashflowRow = {
  month: string
  total_in: number
  total_out: number
  net: number
}

type CashflowResponse = {
  rows: CashflowRow[]
  summary: {
    avg_monthly_out: number
  }
}

const formatAmount = (value: number | string) => {
  return formatIndian(value)
}

export default function CashflowPage() {
  const [rows, setRows] = useState<CashflowRow[]>([])
  const [avgMonthlyOut, setAvgMonthlyOut] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [cashBalance, setCashBalance] = useState('')
  const [runwayLoading, setRunwayLoading] = useState(false)
  const [runwayMonths, setRunwayMonths] = useState<number | null>(null)
  const [runwayError, setRunwayError] = useState('')

  useEffect(() => {
    void loadCashflow()
  }, [])

  const loadCashflow = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/finance/cashflow')
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load cashflow')
      const payload = data as CashflowResponse
      setRows(Array.isArray(payload?.rows) ? payload.rows : [])
      setAvgMonthlyOut(Number(payload?.summary?.avg_monthly_out || 0))
    } catch (err: any) {
      setError(err?.message || 'Failed to load cashflow')
    } finally {
      setLoading(false)
    }
  }

  const handleRunway = async () => {
    setRunwayError('')
    setRunwayMonths(null)
    const raw = cashBalance.replace(/,/g, '').trim()
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value < 0) {
      setRunwayError('Enter a valid cash balance')
      return
    }
    setRunwayLoading(true)
    try {
      const res = await apiFetch('/api/finance/cashflow/runway', {
        method: 'POST',
        body: JSON.stringify({ current_cash_balance: value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to calculate runway')
      setAvgMonthlyOut(Number(data?.avg_monthly_out || 0))
      setRunwayMonths(Number(data?.runway_months ?? 0))
    } catch (err: any) {
      setRunwayError(err?.message || 'Failed to calculate runway')
    } finally {
      setRunwayLoading(false)
    }
  }

  const exportCsv = () => {
    const lines: string[] = []
    lines.push('Month,Total IN,Total OUT,Net')
    rows.forEach(r => {
      lines.push(`${r.month},${r.total_in},${r.total_out},${r.net}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cashflow.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const netClass = (value: number) => (value >= 0 ? 'text-emerald-600' : 'text-rose-600')

  const runwayLabel = useMemo(() => {
    if (runwayMonths === null || !Number.isFinite(runwayMonths)) return '—'
    return `~${runwayMonths.toFixed(1)} months`
  }, [runwayMonths])

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Cashflow</h1>
        <p className="text-sm text-neutral-600 mt-1">Monthly cash in vs out and runway planning.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className={buttonOutline} href="/admin/finance">Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/unsettled">Unsettled Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/money-sources">Money Sources</Link>
        <Link className={buttonOutline} href="/admin/finance/categories">Categories</Link>
        <Link className={buttonPrimary} href="/admin/finance/cashflow">Cashflow</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Monthly Cashflow</div>
            <div className="text-xs text-neutral-500">Last 6 months by default.</div>
          </div>
          <button className={buttonOutline} onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Total IN</th>
                <th className="px-4 py-3 font-medium">Total OUT</th>
                <th className="px-4 py-3 font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>Loading cashflow…</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>No cashflow data yet.</td>
                </tr>
              )}
              {!loading && rows.map(row => (
                <tr key={row.month}>
                  <td className="px-4 py-3 text-sm font-medium">{row.month}</td>
                  <td className="px-4 py-3">₹{formatAmount(row.total_in)}</td>
                  <td className="px-4 py-3">₹{formatAmount(row.total_out)}</td>
                  <td className={`px-4 py-3 font-semibold ${netClass(row.net)}`}>₹{formatAmount(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Runway</div>
            <div className="text-xs text-neutral-500">Based on last 3 months average outflow.</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Current Cash Balance</div>
            <CurrencyInput
              required
              className={fieldClass}
              value={cashBalance}
              onChange={setCashBalance}
              placeholder="0"
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Avg Monthly Out</div>
            <div className="text-lg font-semibold">₹{formatAmount(avgMonthlyOut)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Runway</div>
            <div className="text-lg font-semibold">{runwayLabel}</div>
          </div>
        </div>

        {runwayError && (
          <div className="mt-3 text-sm text-rose-600">{runwayError}</div>
        )}

        <div className="mt-4 flex justify-end">
          <button className={buttonPrimary} onClick={handleRunway} disabled={runwayLoading}>
            {runwayLoading ? 'Calculating…' : 'Calculate Runway'}
          </button>
        </div>
      </section>
    </div>
  )
}
