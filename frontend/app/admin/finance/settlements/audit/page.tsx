'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const formatDateTime = (d: string) => {
    if (!d) return '—'
    const dt = new Date(d)
    return `${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
}
const fmt = (n: number | null) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

export default function SettlementAuditPage() {
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [settlementType, setSettlementType] = useState('')
    const [autoManual, setAutoManual] = useState('')
    const [txSearch, setTxSearch] = useState('')

    const [detail, setDetail] = useState<any>(null)

    const loadData = async () => {
        setLoading(true); setError('')
        try {
            const params = new URLSearchParams()
            if (dateFrom) params.set('date_from', dateFrom)
            if (dateTo) params.set('date_to', dateTo)
            if (settlementType) params.set('settlement_type', settlementType)
            if (autoManual) params.set('auto_manual', autoManual)
            if (txSearch) params.set('transaction_id', txSearch)
            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/finance/settlement-audit${qs}`, { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to load')
            setRows(Array.isArray(data) ? data : [])
        } catch (err: any) { setError(err.message) }
        finally { setLoading(false) }
    }

    useEffect(() => { loadData() }, [])

    const clearFilters = () => {
        setDateFrom(''); setDateTo(''); setSettlementType(''); setAutoManual(''); setTxSearch('')
        setTimeout(loadData, 0)
    }

    const actionLabel = (r: any) => {
        if (r.action_type === 'link') return 'Linked'
        if (r.action_type === 'unlink') return 'Unlinked'
        return 'Relinked'
    }
    const actionColor = (r: any) => {
        if (r.action_type === 'link') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        if (r.action_type === 'unlink') return 'bg-rose-50 text-rose-700 border-rose-200'
        return 'bg-amber-50 text-amber-700 border-amber-200'
    }

    const settledToLabel = (r: any) => {
        if (r.settled_to_type === 'vendor_bill') {
            return `Bill #${r.settled_to_id}${r.vendor_name ? ` — ${r.vendor_name}` : ''}`
        }
        if (r.settled_to_type === 'employee_payout') {
            const month = r.payout_month ? formatDate(r.payout_month) : ''
            return `Payout #${r.settled_to_id}${r.payout_user_name ? ` — ${r.payout_user_name}` : ''}${month ? ` (${month})` : ''}`
        }
        return `#${r.settled_to_id}`
    }

    const inputClass = 'border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none transition'

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            <div className="flex items-center gap-4">
                <Link href="/admin/finance" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Settlement Audit</h1>
                    <p className="text-sm text-neutral-500 mt-1">Read-only log of how transactions were settled to vendor bills or employee payouts.</p>
                </div>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>}

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1">From</label>
                    <input type="date" className={inputClass} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1">To</label>
                    <input type="date" className={inputClass} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1">Type</label>
                    <select className={`${inputClass} bg-white`} value={settlementType} onChange={e => setSettlementType(e.target.value)}>
                        <option value="">All</option>
                        <option value="vendor">Vendor Bill</option>
                        <option value="payroll">Employee Payout</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1">Auto / Manual</label>
                    <select className={`${inputClass} bg-white`} value={autoManual} onChange={e => setAutoManual(e.target.value)}>
                        <option value="">All</option>
                        <option value="auto">Auto</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase tracking-wider mb-1">Transaction ID</label>
                    <input type="number" className={`${inputClass} w-28`} value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="#" />
                </div>
                <button onClick={loadData} className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-800 transition">Filter</button>
                {(dateFrom || dateTo || settlementType || autoManual || txSearch) && (
                    <button onClick={clearFilters} className="text-sm text-neutral-500 hover:text-neutral-900 underline transition">Clear</button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50/50 text-neutral-500 text-[10px] uppercase tracking-wider border-b border-neutral-200">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                                <th className="px-4 py-3 text-left font-medium">Tx ID</th>
                                <th className="px-4 py-3 text-right font-medium">Amount</th>
                                <th className="px-4 py-3 text-left font-medium">Settled To</th>
                                <th className="px-4 py-3 text-center font-medium">Type</th>
                                <th className="px-4 py-3 text-center font-medium">Auto / Manual</th>
                                <th className="px-4 py-3 text-center font-medium">Action</th>
                                <th className="px-4 py-3 text-left font-medium">Performed By</th>
                                <th className="px-4 py-3 text-center font-medium">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {loading ? (
                                <tr><td colSpan={9} className="px-6 py-8 text-center text-neutral-500">Loading...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={9} className="px-6 py-8 text-center text-neutral-500 italic">No settlement audit entries found.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.audit_id} className="hover:bg-neutral-50 transition">
                                    <td className="px-4 py-3 text-neutral-700 whitespace-nowrap text-xs">{formatDateTime(r.timestamp)}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-neutral-600">TX-{r.transaction_id}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-neutral-900">{fmt(r.amount)}</td>
                                    <td className="px-4 py-3 text-neutral-700 text-xs">{settledToLabel(r)}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${r.settled_to_type === 'vendor_bill' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                                            }`}>
                                            {r.settled_to_type === 'vendor_bill' ? 'Vendor' : 'Payroll'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${r.auto_or_manual === 'auto' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                            }`}>
                                            {r.auto_or_manual}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${actionColor(r)}`}>
                                            {actionLabel(r)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 text-xs">{r.performed_by_name || r.performed_by_email || (r.auto_or_manual === 'auto' ? 'System' : '—')}</td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => setDetail(r)} className="text-neutral-500 hover:text-neutral-900 text-xs font-semibold uppercase tracking-wider transition">
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Panel */}
            {detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Settlement Detail</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setDetail(null)}>✕</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Transaction</div>
                                    <div className="font-mono font-semibold text-neutral-900">TX-{detail.transaction_id}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Amount</div>
                                    <div className="font-bold text-neutral-900">{fmt(detail.amount)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Transaction Date</div>
                                    <div className="text-sm text-neutral-700">{formatDate(detail.transaction_date)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Money Source</div>
                                    <div className="text-sm text-neutral-700">{detail.money_source_name || '—'}</div>
                                </div>
                            </div>

                            <hr className="border-neutral-100" />

                            <div>
                                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Settled To</div>
                                <div className="text-sm font-semibold text-neutral-900">{settledToLabel(detail)}</div>
                                {detail.settled_to_type === 'vendor_bill' && detail.bill_amount && (
                                    <div className="text-xs text-neutral-500 mt-0.5">Bill Amount: {fmt(detail.bill_amount)} • Category: <span className="capitalize">{detail.bill_category || '—'}</span></div>
                                )}
                                {detail.settled_to_type === 'employee_payout' && detail.payout_total_payable && (
                                    <div className="text-xs text-neutral-500 mt-0.5">Total Payable: {fmt(detail.payout_total_payable)}</div>
                                )}
                            </div>

                            <hr className="border-neutral-100" />

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Action</div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${actionColor(detail)}`}>
                                        {actionLabel(detail)}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Method</div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${detail.auto_or_manual === 'auto' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                        }`}>
                                        {detail.auto_or_manual}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Performed By</div>
                                    <div className="text-sm text-neutral-700">{detail.performed_by_name || detail.performed_by_email || (detail.auto_or_manual === 'auto' ? 'System' : '—')}</div>
                                </div>
                            </div>

                            <div>
                                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Timestamp</div>
                                <div className="text-sm text-neutral-700">{formatDateTime(detail.timestamp)}</div>
                            </div>

                            {detail.transaction_note && (
                                <div>
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Transaction Note</div>
                                    <div className="text-sm text-neutral-600">{detail.transaction_note}</div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 bg-neutral-50 rounded-lg p-3 text-xs">
                                <div>
                                    <span className="text-neutral-500">Old Value:</span>{' '}
                                    <span className="font-mono text-neutral-700">{detail.old_value && detail.old_value !== 'null' ? detail.old_value : '—'}</span>
                                </div>
                                <div>
                                    <span className="text-neutral-500">New Value:</span>{' '}
                                    <span className="font-mono text-neutral-700">{detail.new_value && detail.new_value !== 'null' ? detail.new_value : '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
