'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const statusLabel: Record<string, { text: string; color: string; tooltip: string }> = {
    submitted: { text: 'Under Review', color: 'bg-amber-50 text-amber-700 border-amber-200', tooltip: 'Admin is reviewing this bill' },
    approved: { text: 'Approved (Awaiting Payment)', color: 'bg-blue-50 text-blue-700 border-blue-200', tooltip: 'Payment pending' },
    paid: { text: 'Paid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', tooltip: 'Payment completed' },
    rejected: { text: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200', tooltip: 'Bill was rejected' },
}

export default function VendorBillsPage() {
    const [bills, setBills] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showRejected, setShowRejected] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')
    const [leadId, setLeadId] = useState('')

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/vendor/projects', { credentials: 'include' })
            if (res.ok) {
                const data = await res.json()
                setProjects(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error('Failed to load projects', err)
        }
    }

    const loadBills = async () => {
        setLoading(true)
        setError('')
        try {
            const params = new URLSearchParams()
            if (showRejected) params.set('show_rejected', 'true')
            if (statusFilter) params.set('status', statusFilter)
            if (leadId) params.set('lead_id', leadId)

            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/vendor/bills${qs}`, { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to load bills')
            setBills(Array.isArray(data) ? data : [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchProjects()
    }, [])

    useEffect(() => { loadBills() }, [showRejected, statusFilter, leadId])

    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    const formatAmount = (a: number) => `₹${Number(a || 0).toLocaleString('en-IN')}`

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/vendor/payments" className="text-sm text-neutral-500 hover:text-neutral-900 transition">← My Payments</Link>
                </div>
                <Link href="/vendor/bills/new" className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-800 transition inline-flex items-center gap-2">
                    + Submit Bill
                </Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold text-neutral-900">My Bills</h1>
                <p className="text-sm text-neutral-500 mt-1">Bills you have submitted for review.</p>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-4 bg-neutral-50 border border-neutral-200 p-4 rounded-xl">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Project</label>
                        <select
                            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none w-full md:w-56 bg-white"
                            value={leadId}
                            onChange={e => setLeadId(e.target.value)}
                        >
                            <option value="">All Projects</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Status</label>
                        <select
                            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none w-full md:w-48 bg-white"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="">All Statuses</option>
                            <option value="submitted">Under Review</option>
                            <option value="approved">Approved (Awaiting Payment)</option>
                            <option value="paid">Paid</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-600">
                        <input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} className="accent-neutral-900" />
                        Show rejected bills
                    </label>
                </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-200">
                        <tr>
                            <th className="px-6 py-4 text-left font-medium">Date</th>
                            <th className="px-6 py-4 text-left font-medium">Project</th>
                            <th className="px-6 py-4 text-left font-medium">Category</th>
                            <th className="px-6 py-4 text-right font-medium">Amount</th>
                            <th className="px-6 py-4 text-center font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">Loading...</td></tr>
                        ) : bills.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500 italic">No bills found.</td></tr>
                        ) : (
                            bills.map(b => {
                                const s = statusLabel[b.status] || { text: b.status, color: 'bg-neutral-100 text-neutral-600 border-neutral-200' }
                                return (
                                    <tr key={b.id} className="hover:bg-neutral-50 transition">
                                        <td className="px-6 py-4 text-neutral-900">{formatDate(b.bill_date)}</td>
                                        <td className="px-6 py-4 text-neutral-700">{b.project || <span className="text-neutral-400 italic">No project</span>}</td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize text-neutral-600">{b.bill_category}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-semibold text-neutral-900">{formatAmount(b.bill_amount)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span title={s.tooltip} className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border cursor-help ${s.color}`}>
                                                {s.text}
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
    )
}
