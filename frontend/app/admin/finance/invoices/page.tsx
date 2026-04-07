'use client'


import CalendarInput from '@/components/CalendarInput'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm mb-6'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const fieldClass = 'rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const formatAmount = (num: number | string | undefined) => {
    if (num === undefined) return '0.00'
    return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDateShort = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type InvoiceInfo = {
    id: number
    invoice_number: string
    lead_id: number
    lead_name: string
    lead_number?: number
    invoice_type: 'gst' | 'non_gst'
    total_amount: number | string
    paid_amount: number | string
    status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled'
    issue_date?: string
    due_date?: string
}

export default function InvoiceListPage() {
    const [invoices, setInvoices] = useState<InvoiceInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Filters
    const [filterLeadId, setFilterLeadId] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [filterType, setFilterType] = useState('')
    const [filterStartDate, setFilterStartDate] = useState('')
    const [filterEndDate, setFilterEndDate] = useState('')

    const loadInvoices = async () => {
        setLoading(true)
        setError('')
        try {
            const q = new URLSearchParams()
            if (filterLeadId) q.set('lead_id', filterLeadId)
            if (filterStatus) q.set('status', filterStatus)
            if (filterType) q.set('type', filterType) // Backend mapping check needed if supported

            const res = await apiFetch(`/api/finance/invoices?${q.toString()}`)
            const data = await res.json().catch(() => [])

            let items = Array.isArray(data) ? data : []
            if (filterType) items = items.filter((i: any) => i.invoice_type === filterType)
            if (filterStartDate) items = items.filter((i: any) => !i.issue_date || new Date(i.issue_date) >= new Date(filterStartDate))
            if (filterEndDate) items = items.filter((i: any) => !i.issue_date || new Date(i.issue_date) <= new Date(filterEndDate))

            setInvoices(items)
        } catch (err: any) {
            setError(err?.message || 'Unable to load invoices')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadInvoices()
    }, [filterLeadId, filterStatus, filterType, filterStartDate, filterEndDate])

    return (
        <div className="space-y-8 pb-32 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Finance</div>
                    <h1 className="text-2xl font-semibold mt-1">Invoices</h1>
                </div>
                <Link className={buttonPrimary} href="/admin/finance/invoices/new">
                    + Create Invoice
                </Link>
            </div>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {/* FILTER ROW */}
            <section className={`${cardClass} mb-6 py-4 px-5`}>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="w-56">
                        <div className="text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">Lead</div>
                        <LeadAsyncSearch value={filterLeadId} onChange={setFilterLeadId} />
                    </div>

                    <div className="w-32">
                        <div className="text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">Status</div>
                        <select className={`${fieldClass} w-full`} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="issued">Issued</option>
                            <option value="partially_paid">Partially Paid</option>
                            <option value="paid">Paid</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    <div className="w-32">
                        <div className="text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">Type</div>
                        <select className={`${fieldClass} w-full`} value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="">All Types</option>
                            <option value="gst">GST</option>
                            <option value="non_gst">Non-GST</option>
                        </select>
                    </div>

                    <div className="w-32">
                        <div className="text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">Date From</div>
                        <CalendarInput className={`${fieldClass} w-full`} value={filterStartDate} onChange={val => setFilterStartDate(val)} />
                    </div>

                    <div className="w-32">
                        <div className="text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">Date To</div>
                        <CalendarInput className={`${fieldClass} w-full`} value={filterEndDate} onChange={val => setFilterEndDate(val)} />
                    </div>
                </div>
            </section>

            {/* TABLE */}
            <section className={cardClass}>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="text-neutral-500 text-xs font-semibold uppercase tracking-wider border-b border-[var(--border)]">
                            <tr className="text-left">
                                <th className="px-4 py-3">Invoice #</th>
                                <th className="px-4 py-3">Lead</th>
                                <th className="px-4 py-3 text-right">Total Amount</th>
                                <th className="px-4 py-3 text-right">Paid Amount</th>
                                <th className="px-4 py-3 text-right">Outstanding Amount</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Issue Date</th>
                                <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] text-neutral-800">
                            {loading && invoices.length === 0 && (
                                <tr>
                                    <td className="px-4 py-8 text-neutral-500 text-center" colSpan={8}>Loading invoices…</td>
                                </tr>
                            )}
                            {!loading && invoices.length === 0 && (
                                <tr>
                                    <td className="px-4 py-8 text-neutral-500 text-center" colSpan={8}>No invoices found matching your criteria.</td>
                                </tr>
                            )}
                            {invoices.map((inv) => {
                                const total = Number(inv.total_amount)
                                const paid = Number(inv.paid_amount)
                                const balance = total - paid

                                return (
                                    <tr key={inv.id} className="hover:bg-[var(--surface-muted)] transition">
                                        <td className="px-4 py-3 font-medium text-neutral-900">{inv.invoice_number}</td>
                                        <td className="px-4 py-3">
                                            {inv.lead_number ? `L#${inv.lead_number} ` : ''}{inv.lead_name}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">₹{formatAmount(total)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600">₹{formatAmount(paid)}</td>
                                        <td className="px-4 py-3 text-right font-medium text-rose-700">
                                            {balance > 0 ? `₹${formatAmount(balance)}` : '₹0.00'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider
                         ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                                    inv.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                                                        'bg-blue-100 text-blue-800'}`}>
                                                {inv.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">{formatDateShort(inv.issue_date)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <Link href={`/admin/finance/invoices/${inv.id}`} className="text-brand-600 font-medium hover:text-brand-800 text-xs uppercase tracking-wider">
                                                View
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
