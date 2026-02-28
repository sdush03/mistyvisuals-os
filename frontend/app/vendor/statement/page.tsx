'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const pageClass = 'max-w-6xl mx-auto pb-20 mt-8'
const headerClass = 'mb-8'
const titleClass = 'text-3xl font-bold tracking-tight text-neutral-900'

const cardClass = 'bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden'

const formatAmount = (num: number | string | undefined) => {
    if (num === undefined) return '0.00'
    return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDateShort = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function VendorStatementPage() {
    const [statement, setStatement] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const loadStatement = async () => {
        setLoading(true)
        setError('')
        try {
            const query = new URLSearchParams()
            if (dateFrom) query.set('date_from', dateFrom)
            if (dateTo) query.set('date_to', dateTo)

            const res = await fetch(`/api/vendor/statement?${query.toString()}`, { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to fetch statement')
            setStatement(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadStatement()
    }, [dateFrom, dateTo]) // Reloads on filter change

    const handleDownloadCsv = () => {
        if (!statement || !statement.history) return

        const headers = ['Date', 'Project', 'Type', 'Amount', 'Status']
        const rows = statement.history.map((row: any) => {
            const date = formatDateShort(row.date)
            const project = row.lead_name ? `${row.lead_num} - ${row.lead_name}` : 'No Project'
            const type = row.record_type === 'payment' ? 'Payment Received' : 'Bill'
            const amount = row.amount
            // Status descriptive labels (matching My Bills)
            let status = row.status
            if (status === 'submitted') status = 'Under Review'
            if (status === 'approved') status = 'Approved (Awaiting Payment)'
            if (status === 'paid') status = 'Paid'

            return [
                `"${date}"`,
                `"${project}"`,
                `"${type}"`,
                amount,
                `"${status}"`
            ].join(',')
        })

        const csvContent = [headers.join(','), ...rows].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `statement_${new Date().getTime()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className={pageClass}>
            <div className={headerClass}>
                <h1 className={titleClass}>My Statement</h1>
                <p className="text-neutral-500 mt-2">Overview of payments received and pending bills.</p>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    {error}
                </div>
            )}

            {statement && statement.summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className={`${cardClass} p-6 bg-emerald-50 border-emerald-100`}>
                        <div className="text-sm font-medium text-emerald-800 uppercase tracking-widest mb-2">Total Paid</div>
                        <div className="text-3xl font-bold text-emerald-900">₹{formatAmount(statement.summary.totalPaid)}</div>
                        <div className="text-xs text-emerald-700 mt-2">In selected date range</div>
                    </div>
                    <div className={`${cardClass} p-6 border-blue-100 bg-blue-50`}>
                        <div className="text-sm font-medium text-blue-800 uppercase tracking-widest mb-2">Pending Approved Amount</div>
                        <div className="text-3xl font-bold text-blue-900">₹{formatAmount(statement.summary.pendingApprovedAmount)}</div>
                        <div className="text-xs text-blue-700 mt-2">Approved bills awaiting payment</div>
                    </div>
                    <div className={`${cardClass} p-6 border-amber-100 bg-amber-50`}>
                        <div className="text-sm font-medium text-amber-800 uppercase tracking-widest mb-2">Bills Under Review</div>
                        <div className="text-3xl font-bold text-amber-900">{statement.summary.billsUnderReview}</div>
                        <div className="text-xs text-amber-700 mt-2">Admin is reviewing these bills</div>
                    </div>
                </div>
            )}

            <div className="mb-6 flex flex-col md:flex-row gap-4 items-end justify-between">
                <div className="flex flex-col md:flex-row gap-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Date From</label>
                        <input
                            type="date"
                            className="w-full md:w-48 bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Date To</label>
                        <input
                            type="date"
                            className="w-full md:w-48 bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                        />
                    </div>
                    {(dateFrom || dateTo) && (
                        <div className="flex items-end">
                            <button
                                className="text-sm text-neutral-500 hover:text-neutral-900 underline px-2 py-2 mb-0.5"
                                onClick={() => { setDateFrom(''); setDateTo('') }}
                            >
                                Clear Dates
                            </button>
                        </div>
                    )}
                </div>
                <div>
                    <button
                        onClick={handleDownloadCsv}
                        disabled={!statement || statement.history.length === 0}
                        className="bg-white border border-neutral-300 text-neutral-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-neutral-50 disabled:opacity-50 transition"
                    >
                        Download CSV
                    </button>
                </div>
            </div>

            <div className={cardClass}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-[var(--border)]">
                                <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Date</th>
                                <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Project</th>
                                <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Type</th>
                                <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-widest text-right">Amount</th>
                                <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-neutral-400">Loading statement...</td>
                                </tr>
                            ) : statement?.history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-neutral-400">
                                        No financial history found for the selected period.
                                    </td>
                                </tr>
                            ) : (
                                statement?.history.map((row: any, idx: number) => {
                                    const isPayment = row.record_type === 'payment'

                                    // Descriptive status formatting
                                    let statusLabel = row.status
                                    let statusColor = 'bg-neutral-100 text-neutral-800'

                                    if (statusLabel === 'submitted') {
                                        statusLabel = 'Under Review'
                                        statusColor = 'bg-amber-100 text-amber-800'
                                    } else if (statusLabel === 'approved') {
                                        statusLabel = 'Approved (Awaiting Payment)'
                                        statusColor = 'bg-blue-100 text-blue-800'
                                    } else if (statusLabel === 'paid' || statusLabel === 'Paid') {
                                        statusLabel = 'Paid'
                                        statusColor = 'bg-emerald-100 text-emerald-800'
                                    }

                                    return (
                                        <tr key={`${row.record_type}-${row.id}-${idx}`} className="hover:bg-neutral-50 transition-colors">
                                            <td className="px-6 py-4 text-sm whitespace-nowrap text-neutral-600">
                                                {formatDateShort(row.date)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {row.lead_name ? (
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-xs font-mono text-neutral-400">{row.lead_num}</span>
                                                        <span className="text-sm font-medium text-neutral-900">{row.lead_name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-neutral-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${isPayment ? 'bg-purple-100 text-purple-800' : 'bg-neutral-100 text-neutral-800'
                                                    }`}>
                                                    {isPayment ? 'Payment Received' : 'Bill'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-mono text-right font-medium">
                                                <span className={isPayment ? 'text-emerald-600' : 'text-neutral-900'}>
                                                    {isPayment ? '+' : ''}₹{formatAmount(row.amount)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                                    {statusLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
