'use client'

import { useEffect, useState } from 'react'
import { formatINR } from '@/lib/formatters'

type InsightsData = {
  time_to_convert?: {
    average?: number | string
    fastest?: number | string
    slowest?: number | string
  }
  followups_per_conversion?: {
    total_followups?: number | string
    average_per_conversion?: number | string
  }
  discount_efficiency?: {
    average_discount_pct?: number | string
    total_discount_amount?: number | string
  }
  revenue_per_salesperson?: {
    salesperson?: string
    converted_count?: number | string
    total_revenue?: number | string
    average_deal?: number | string
  }[]
  source_conversion?: {
    source?: string
    total_leads?: number | string
    converted_leads?: number | string
    conversion_rate?: number | string
  }[]
}

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/insights', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Unable to load insights')
        }
        return res.json()
      })
      .then(payload => {
        if (!active) return
        setData(payload && typeof payload === 'object' ? payload : {})
        setLoading(false)
      })
      .catch((err: any) => {
        if (!active) return
        setError(err?.message || 'Unable to load insights')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-neutral-500">Loading insights…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-neutral-500">No insights available yet.</div>
      </div>
    )
  }

  const time = data?.time_to_convert || {}
  const followups = data?.followups_per_conversion || {}
  const discounts = data?.discount_efficiency || {}
  const revenue = Array.isArray(data?.revenue_per_salesperson) ? data?.revenue_per_salesperson : []
  const sources = Array.isArray(data?.source_conversion) ? data?.source_conversion : []

  const avgDays = toNumber(time.average) ?? 0
  const fastDays = toNumber(time.fastest) ?? 0
  const slowDays = toNumber(time.slowest) ?? 0
  const totalFollowups = toNumber(followups.total_followups) ?? 0
  const avgFollowups = toNumber(followups.average_per_conversion) ?? 0
  const avgDiscountPct = toNumber(discounts.average_discount_pct) ?? 0
  const totalDiscount = toNumber(discounts.total_discount_amount) ?? 0

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Sales</div>
        <h1 className="text-2xl font-semibold mt-2">Insights</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Time to Convert</div>
          <div className="mt-3 text-2xl font-semibold">{avgDays.toFixed(1)} days</div>
          <div className="mt-2 text-xs text-neutral-500">
            Fastest: {fastDays.toFixed(1)} days · Slowest: {slowDays.toFixed(1)} days
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Follow-ups per Conversion</div>
          <div className="mt-3 text-2xl font-semibold">{avgFollowups.toFixed(1)}</div>
          <div className="mt-2 text-xs text-neutral-500">
            Total follow-ups: {totalFollowups}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Discount Efficiency</div>
          <div className="mt-3 text-2xl font-semibold">{(avgDiscountPct * 100).toFixed(1)}%</div>
          <div className="mt-2 text-xs text-neutral-500">
            Total discount: {formatINR(totalDiscount)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Revenue per Salesperson</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="text-left py-2 font-medium">Salesperson</th>
                  <th className="text-right py-2 font-medium">Converted</th>
                  <th className="text-right py-2 font-medium">Total Revenue</th>
                  <th className="text-right py-2 font-medium">Avg Deal</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map((row, idx) => (
                  <tr key={`${row.salesperson || 'Unknown'}-${idx}`} className="border-t border-[var(--border)]">
                    <td className="py-2">{row.salesperson || 'Unassigned'}</td>
                    <td className="py-2 text-right">{toNumber(row.converted_count) ?? 0}</td>
                    <td className="py-2 text-right">
                      {formatINR(toNumber(row.total_revenue) ?? 0)}
                    </td>
                    <td className="py-2 text-right">
                      {formatINR(toNumber(row.average_deal) ?? 0)}
                    </td>
                  </tr>
                ))}
                {revenue.length === 0 && (
                  <tr>
                    <td className="py-3 text-sm text-neutral-500" colSpan={4}>
                      No converted leads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Source Conversion Rate</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-right py-2 font-medium">Converted</th>
                  <th className="text-right py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((row, idx) => (
                  <tr key={`${row.source || 'Unknown'}-${idx}`} className="border-t border-[var(--border)]">
                    <td className="py-2">{row.source || 'Unknown'}</td>
                    <td className="py-2 text-right">{toNumber(row.total_leads) ?? 0}</td>
                    <td className="py-2 text-right">{toNumber(row.converted_leads) ?? 0}</td>
                    <td className="py-2 text-right">
                      {toNumber(row.conversion_rate)?.toFixed(1) ?? '0.0'}%
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr>
                    <td className="py-3 text-sm text-neutral-500" colSpan={4}>
                      No leads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
