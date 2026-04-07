'use client'


import CalendarInput from '@/components/CalendarInput'
import { toISTDateInput } from '@/lib/formatters'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'

const buttonPrimary = 'bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800 transition rounded-lg inline-flex items-center gap-2'

const formatAmount = (value: number | string | null) => {
    if (value == null) return '0'
    return formatIndian(value)
}

const formatDateShort = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function VendorBillsPage() {
    const [bills, setBills] = useState<any[]>([])
    const [vendors, setVendors] = useState<any[]>([])
    const [leads, setLeads] = useState<any[]>([])

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [showAddModal, setShowAddModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [newBill, setNewBill] = useState({
        vendor_id: '',
        lead_id: '',
        bill_date: toISTDateInput(),
        bill_amount: '',
        bill_category: 'editing',
        is_billable_to_client: false,
        notes: ''
    })

    const loadData = async () => {
        setLoading(true)
        try {
            const [b, v, l] = await Promise.all([
                fetch('/api/finance/vendor-bills', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/finance/vendors', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/leads?limit=50', { credentials: 'include' }).then(r => r.json()), // Fetch top leads for linking
            ])

            if (b.error) throw new Error(b.error)

            setBills(Array.isArray(b) ? b : [])
            setVendors(Array.isArray(v) ? v : [])
            setLeads(Array.isArray(l.leads) ? l.leads : (Array.isArray(l) ? l : []))

        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            const payload = {
                ...newBill,
                bill_amount: Number(newBill.bill_amount) || 0,
                lead_id: newBill.lead_id ? Number(newBill.lead_id) : undefined,
                vendor_id: Number(newBill.vendor_id)
            }

            const res = await fetch('/api/finance/vendor-bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to add bill')

            setShowAddModal(false)
            setNewBill({
                vendor_id: '',
                lead_id: '',
                bill_date: toISTDateInput(),
                bill_amount: '',
                bill_category: 'editing',
                is_billable_to_client: false,
                notes: ''
            })
            loadData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const statusColors: any = {
        submitted: 'bg-amber-100 text-amber-800 border border-amber-200',
        approved: 'bg-blue-100 text-blue-800 border border-blue-200',
        partial: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        paid: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
        rejected: 'bg-rose-100 text-rose-800 border border-rose-200'
    }

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-32">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/finance/accounts#vendors" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Vendor Bills</h1>
                        <div className="text-sm text-neutral-500 mt-1">Track owed amounts, claims, and expenses.</div>
                    </div>
                </div>
                <div>
                    <button className={buttonPrimary} onClick={() => setShowAddModal(true)}>
                        + Log New Bill
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
                    {error}
                </div>
            )}

            <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-[var(--border)]">
                            <tr>
                                <th className="px-6 py-4 text-left font-medium">Date</th>
                                <th className="px-6 py-4 text-left font-medium">Vendor</th>
                                <th className="px-6 py-4 text-left font-medium">Category & Lead</th>
                                <th className="px-6 py-4 text-right font-medium">Amount</th>
                                <th className="px-6 py-4 text-center font-medium">Status</th>
                                <th className="px-6 py-4 text-center font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500">Loading bills...</td></tr>
                            ) : bills.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500 italic">No vendor bills recorded yet.</td></tr>
                            ) : (
                                bills.map(b => {
                                    const billAmount = Number(b.bill_amount) || 0
                                    const paidSoFar = Number(b.paid_amount || 0)
                                    const computedStatus = b.status === 'rejected'
                                        ? 'rejected'
                                        : b.status === 'submitted'
                                            ? 'submitted'
                                            : paidSoFar <= 0
                                                ? 'approved'
                                                : paidSoFar < billAmount
                                                    ? 'partial'
                                                    : 'paid'
                                    const statusLabel = computedStatus === 'partial' ? 'Partially Paid' : computedStatus
                                    return (
                                    <tr key={b.id} className="hover:bg-[var(--surface-muted)] transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-neutral-600">{formatDateShort(b.bill_date)}</td>
                                        <td className="px-6 py-4 font-semibold text-neutral-900">{b.vendor_name}</td>
                                        <td className="px-6 py-4">
                                            <div className="capitalize text-neutral-800">{b.bill_category}</div>
                                            {b.lead_name && <div className="text-xs text-neutral-500 mt-0.5">L#{b.lead_number} {b.lead_name}</div>}
                                            {b.is_billable_to_client && <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-widest rounded border border-purple-200">Billable</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium">₹{formatAmount(billAmount)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${statusColors[computedStatus] || ''}`}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Link href={`/admin/finance/bills/${b.id}`} className="text-brand-600 hover:text-brand-800 font-semibold uppercase tracking-wider text-xs">
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                )})
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Log Vendor Bill</h3>
                            <button className="text-neutral-400 hover:text-neutral-600 font-bold" onClick={() => setShowAddModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleAddSubmit} className="p-5 space-y-5">
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Vendor *</label>
                                    <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={newBill.vendor_id} onChange={e => setNewBill({ ...newBill, vendor_id: e.target.value })}>
                                        <option value="">-- Select Vendor --</option>
                                        {vendors.filter(v => v.is_active).map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Bill Date *</label>
                                    <CalendarInput className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={newBill.bill_date} onChange={val => setNewBill({ ...newBill, bill_date: val })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Category *</label>
                                    <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={newBill.bill_category} onChange={e => setNewBill({ ...newBill, bill_category: e.target.value })}>
                                        <option value="editing">Editing</option>
                                        <option value="shooting">Shooting (Camera Ops)</option>
                                        <option value="travel">Travel</option>
                                        <option value="food">Food & Beverage</option>
                                        <option value="printing">Printing</option>
                                        <option value="misc">Miscellaneous</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Amount *</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                        <CurrencyInput
                                            required
                                            className="w-full p-2.5 pl-7 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition"
                                            value={newBill.bill_amount}
                                            onChange={val => setNewBill({ ...newBill, bill_amount: val })}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Link to Lead (Optional)</label>
                                <select className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={newBill.lead_id} onChange={e => setNewBill({ ...newBill, lead_id: e.target.value })}>
                                    <option value="">-- No Lead linked --</option>
                                    {leads.map(l => (
                                        <option key={l.id} value={l.id}>L#{l.display_number} {l.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer bg-neutral-50 border border-neutral-200 p-3 rounded-lg">
                                    <input type="checkbox" className="accent-neutral-900 w-4 h-4" checked={newBill.is_billable_to_client} onChange={e => setNewBill({ ...newBill, is_billable_to_client: e.target.checked })} />
                                    <span className="font-medium">Mark as Billable to Client</span>
                                </label>
                                <div className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider ml-1">If checked, this expense can be attached to a client invoice later.</div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Description / Notes</label>
                                <textarea rows={2} className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition resize-none" value={newBill.notes} onChange={e => setNewBill({ ...newBill, notes: e.target.value })} placeholder="What is this bill for?"></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving || !newBill.vendor_id || !newBill.bill_amount} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                                    {saving ? 'Saving...' : 'Save Bill'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
