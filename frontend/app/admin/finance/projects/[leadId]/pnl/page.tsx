'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatINR, formatDate } from '@/lib/formatters'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'

type RevenueRow = {
  invoice_id: number
  amount: number
  paid_date: string | null
}

type VendorCostRow = {
  vendor_bill_id: number
  vendor_name: string
  category: string
  amount: number
  paid_date: string | null
}

type PayrollRow = {
  user_name: string
  component_name: string
  amount: number
  month: string
}

type PnlResponse = {
  revenue_total: number
  vendor_cost_total: number
  payroll_cost_total: number
  net_profit: number
  revenue_breakdown: RevenueRow[]
  vendor_cost_breakdown: VendorCostRow[]
  payroll_breakdown: PayrollRow[]
}

const sectionCard = 'bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden'
const sectionHeader = 'px-6 py-3 bg-neutral-50 border-b border-[var(--border)]'
const sectionTitle = 'text-xs font-semibold text-neutral-700 uppercase tracking-widest'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

export default function ProjectPnlPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const leadId = params?.leadId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<PnlResponse | null>(null)
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const fromParam = searchParams?.get('date_from') || ''
    const toParam = searchParams?.get('date_to') || ''
    setDateFromInput(fromParam)
    setDateToInput(toParam)
    setDateFrom(fromParam)
    setDateTo(toParam)
  }, [searchParams])

  useEffect(() => {
    if (!leadId) return
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        const suffix = params.toString() ? `?${params.toString()}` : ''
        const res = await apiFetch(`/api/finance/projects/${leadId}/pnl${suffix}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load P&L')
        setData(json)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leadId, dateFrom, dateTo])

  const netColor = useMemo(() => {
    if (!data) return 'text-neutral-700'
    return data.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
  }, [data])

  const handleExportCsv = () => {
    if (!data) return
    const lines: string[] = []
    lines.push('Project P&L Summary')
    if (dateFrom || dateTo) {
      lines.push(`Date Range,${dateFrom || 'Any'} to ${dateTo || 'Any'}`)
    }
    lines.push('Revenue,Vendor Cost,Payroll Cost,Net Profit')
    lines.push(
      `${data.revenue_total},${data.vendor_cost_total},${data.payroll_cost_total},${data.net_profit}`
    )
    lines.push('')

    lines.push('Revenue Breakdown')
    lines.push('Invoice ID,Amount,Paid Date')
    data.revenue_breakdown.forEach(row => {
      lines.push(`${row.invoice_id},${row.amount},${row.paid_date || ''}`)
    })
    lines.push('')

    lines.push('Vendor Cost Breakdown')
    lines.push('Vendor Bill ID,Vendor,Category,Amount,Paid Date')
    data.vendor_cost_breakdown.forEach(row => {
      lines.push(
        `${row.vendor_bill_id},${row.vendor_name},${row.category},${row.amount},${row.paid_date || ''}`
      )
    })
    lines.push('')

    lines.push('Payroll Cost Breakdown')
    lines.push('User,Component,Amount,Month')
    data.payroll_breakdown.forEach(row => {
      lines.push(`${row.user_name},${row.component_name},${row.amount},${row.month}`)
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lead-${leadId}-pnl.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="p-8 text-neutral-500">Loading project P&L...</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mb-4 text-rose-600 font-medium">{error}</div>
        <button
          className="text-sm text-neutral-700 underline"
          onClick={() => router.refresh()}
        >
          Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="pb-28 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <Link
          href="/admin/finance"
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-neutral-900">Project P&amp;L</h1>
          <div className="text-sm text-neutral-500 mt-1">Lead #{leadId}</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Jump to Lead</div>
            <LeadAsyncSearch
              value={String(leadId || '')}
              onChange={(id) => {
                if (!id || String(id) === String(leadId || '')) return
                const params = new URLSearchParams()
                if (dateFrom) params.set('date_from', dateFrom)
                if (dateTo) params.set('date_to', dateTo)
                const suffix = params.toString() ? `?${params.toString()}` : ''
                router.push(`/admin/finance/projects/${id}/pnl${suffix}`)
              }}
              placeholder="Search another lead..."
            />
          </div>
          <button
            onClick={handleExportCsv}
            className="border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)] transition rounded"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Date Range</h2>
        </div>
        <div className="p-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">From</label>
            <input
              type="date"
              className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={dateFromInput}
              onChange={e => setDateFromInput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-1">To</label>
            <input
              type="date"
              className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={dateToInput}
              onChange={e => setDateToInput(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDateFrom(dateFromInput)
                setDateTo(dateToInput)
              }}
              className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded hover:bg-neutral-800 transition"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setDateFromInput('')
                setDateToInput('')
                setDateFrom('')
                setDateTo('')
              }}
              className="border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)] transition rounded"
            >
              Clear
            </button>
          </div>
          {(dateFrom || dateTo) && (
            <div className="text-xs text-neutral-500">
              Applied: {dateFrom || 'Any'} to {dateTo || 'Any'}
            </div>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Summary</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Revenue</div>
            <div className="text-xl font-semibold text-neutral-900">{formatINR(data.revenue_total)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Vendor Cost</div>
            <div className="text-xl font-semibold text-neutral-900">{formatINR(data.vendor_cost_total)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Payroll Cost</div>
            <div className="text-xl font-semibold text-neutral-900">{formatINR(data.payroll_cost_total)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Net Profit</div>
            <div className={`text-2xl font-semibold ${netColor}`}>{formatINR(data.net_profit)}</div>
          </div>
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Revenue Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 uppercase tracking-wider bg-white border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-6 py-3">Invoice</th>
                <th className="text-left px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Paid Date</th>
              </tr>
            </thead>
            <tbody>
              {data.revenue_breakdown.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-neutral-500" colSpan={3}>No paid invoices for this lead.</td>
                </tr>
              )}
              {data.revenue_breakdown.map(row => (
                <tr key={row.invoice_id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-6 py-3 text-neutral-900">#{row.invoice_id}</td>
                  <td className="px-6 py-3">{formatINR(row.amount)}</td>
                  <td className="px-6 py-3 text-neutral-600">{formatDate(row.paid_date || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Vendor Cost Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 uppercase tracking-wider bg-white border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-6 py-3">Vendor</th>
                <th className="text-left px-6 py-3">Category</th>
                <th className="text-left px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Paid Date</th>
              </tr>
            </thead>
            <tbody>
              {data.vendor_cost_breakdown.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-neutral-500" colSpan={4}>No vendor costs for this lead.</td>
                </tr>
              )}
              {data.vendor_cost_breakdown.map(row => (
                <tr key={row.vendor_bill_id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-6 py-3 text-neutral-900">{row.vendor_name}</td>
                  <td className="px-6 py-3 text-neutral-600">{row.category}</td>
                  <td className="px-6 py-3">{formatINR(row.amount)}</td>
                  <td className="px-6 py-3 text-neutral-600">{formatDate(row.paid_date || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Payroll Cost Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 uppercase tracking-wider bg-white border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-6 py-3">User</th>
                <th className="text-left px-6 py-3">Component</th>
                <th className="text-left px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Month</th>
              </tr>
            </thead>
            <tbody>
              {data.payroll_breakdown.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-neutral-500" colSpan={4}>No payroll allocations for this lead.</td>
                </tr>
              )}
              {data.payroll_breakdown.map((row, idx) => (
                <tr key={`${row.user_name}-${row.component_name}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-6 py-3 text-neutral-900">{row.user_name}</td>
                  <td className="px-6 py-3 text-neutral-600">{row.component_name}</td>
                  <td className="px-6 py-3">{formatINR(row.amount)}</td>
                  <td className="px-6 py-3 text-neutral-600">{formatDate(row.month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
