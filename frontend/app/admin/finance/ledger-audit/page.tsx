'use client'

import { useEffect, useState } from 'react'
import { formatIndian } from '@/components/CurrencyInput'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type DuplicateRow = {
  invoice_id?: number
  vendor_bill_id?: number
  date?: string
  amount?: number | string
  count?: number
}

type TransferMismatch = {
  transfer_group_id: string
  count: number
}

type AuditData = {
  missing_transaction_type: number
  orphan_transactions: number
  duplicate_invoice_payments: DuplicateRow[]
  duplicate_vendor_payments: DuplicateRow[]
  transfer_group_mismatches: TransferMismatch[]
}

const formatMoney = (value: number | string | null | undefined) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '₹0'
  return `₹${formatIndian(Math.round(num))}`
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function LedgerAuditPage() {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch('/api/finance/ledger-audit')
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(payload?.error || 'Failed to load audit')
        setData(payload)
      } catch (err: any) {
        setError(err?.message || 'Failed to load audit')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Ledger Audit</h1>
        <p className="mt-1 text-sm text-neutral-500">Integrity checks for finance transactions</p>
      </div>

      {loading && <div className="text-sm text-neutral-500">Loading audit…</div>}
      {!loading && error && <div className="text-sm text-rose-600">{error}</div>}

      {!loading && data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-xs text-neutral-500">Missing Transaction Type</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{data.missing_transaction_type}</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-xs text-neutral-500">Orphan Transactions</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{data.orphan_transactions}</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-xs text-neutral-500">Duplicate Invoice Payments</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{data.duplicate_invoice_payments.length}</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-xs text-neutral-500">Duplicate Vendor Payments</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-900">{data.duplicate_vendor_payments.length}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="text-lg font-semibold text-neutral-900">Transfer Group Mismatches</div>
            {data.transfer_group_mismatches.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-500">No transfer mismatches detected.</div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500">
                      <th className="pb-2">Transfer Group</th>
                      <th className="pb-2 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {data.transfer_group_mismatches.map((row) => (
                      <tr key={row.transfer_group_id}>
                        <td className="py-2 text-neutral-700">{row.transfer_group_id}</td>
                        <td className="py-2 text-right font-semibold text-rose-600">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-lg font-semibold text-neutral-900">Duplicate Invoice Payments</div>
              {data.duplicate_invoice_payments.length === 0 ? (
                <div className="mt-2 text-sm text-neutral-500">No duplicate invoice payments.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500">
                        <th className="pb-2">Invoice</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {data.duplicate_invoice_payments.map((row, idx) => (
                        <tr key={`${row.invoice_id}-${row.date}-${idx}`}>
                          <td className="py-2 text-neutral-700">#{row.invoice_id}</td>
                          <td className="py-2 text-neutral-600">{formatDateShort(row.date)}</td>
                          <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                          <td className="py-2 text-right font-semibold text-rose-600">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-lg font-semibold text-neutral-900">Duplicate Vendor Payments</div>
              {data.duplicate_vendor_payments.length === 0 ? (
                <div className="mt-2 text-sm text-neutral-500">No duplicate vendor payments.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500">
                        <th className="pb-2">Bill</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {data.duplicate_vendor_payments.map((row, idx) => (
                        <tr key={`${row.vendor_bill_id}-${row.date}-${idx}`}>
                          <td className="py-2 text-neutral-700">#{row.vendor_bill_id}</td>
                          <td className="py-2 text-neutral-600">{formatDateShort(row.date)}</td>
                          <td className="py-2 text-right">{formatMoney(row.amount)}</td>
                          <td className="py-2 text-right font-semibold text-rose-600">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
