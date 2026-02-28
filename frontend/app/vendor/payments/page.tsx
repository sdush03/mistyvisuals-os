'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function VendorPaymentsPage() {
    const [payments, setPayments] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Filters
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
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

    const loadPayments = async () => {
        setLoading(true)
        setError('')
        try {
            const params = new URLSearchParams()
            if (dateFrom) params.set('date_from', dateFrom)
            if (dateTo) params.set('date_to', dateTo)
            if (leadId) params.set('lead_id', leadId)
            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/vendor/payments${qs}`, { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to load payments')
            setPayments(Array.isArray(data) ? data : [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchProjects()
        loadPayments()
    }, [])

    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    const formatAmount = (a: number) => `₹${Number(a || 0).toLocaleString('en-IN')}`

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <div className="flex items-center gap-4">
                <Link href="/vendor/bills" className="text-sm text-neutral-500 hover:text-neutral-900 transition">My Bills →</Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold text-neutral-900">My Payments</h1>
                <p className="text-sm text-neutral-500 mt-1">Payments you have received for completed work.</p>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Project</label>
                    <select
                        className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none w-full md:w-64 bg-white"
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
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">From</label>
                    <input type="date" className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none w-full md:w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">To</label>
                    <input type="date" className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:border-neutral-500 outline-none w-full md:w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <button onClick={loadPayments} className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-800 transition">
                    Filter
                </button>
                {(dateFrom || dateTo || leadId) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); setLeadId(''); setTimeout(loadPayments, 0) }} className="text-sm text-neutral-500 hover:text-neutral-900 transition underline px-2 py-2">
                        Clear
                    </button>
                )}
            </div>

            {/* Payments Table */}
            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-200">
                        <tr>
                            <th className="px-6 py-4 text-left font-medium">Date</th>
                            <th className="px-6 py-4 text-left font-medium">Project</th>
                            <th className="px-6 py-4 text-right font-medium">Amount Paid</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={3} className="px-6 py-8 text-center text-neutral-500">Loading...</td></tr>
                        ) : payments.length === 0 ? (
                            <tr><td colSpan={3} className="px-6 py-8 text-center text-neutral-500 italic">No payments found.</td></tr>
                        ) : (
                            payments.map(p => (
                                <tr key={p.id} className="hover:bg-neutral-50 transition">
                                    <td className="px-6 py-4 text-neutral-900">{formatDate(p.date)}</td>
                                    <td className="px-6 py-4 text-neutral-700">{p.project || <span className="text-neutral-400 italic">No project</span>}</td>
                                    <td className="px-6 py-4 text-right font-semibold text-neutral-900">{formatAmount(p.amount)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
