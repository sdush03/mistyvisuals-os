'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'

const sectionClass = 'mb-10 bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden'
const sectionHeaderClass = 'bg-neutral-50 border-b border-[var(--border)] px-6 py-3 flex items-center justify-between'
const sectionTitleClass = 'text-sm font-semibold text-neutral-900 uppercase tracking-widest'

const buttonPrimary = 'bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800 transition rounded-lg'
const buttonOutline = 'bg-white text-neutral-700 border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-muted)] transition rounded-lg'

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

export default function VendorBillDetailPage() {
    const { id } = useParams()

    const [bill, setBill] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [showAttachModal, setShowAttachModal] = useState(false)
    const [newAttachmentUrl, setNewAttachmentUrl] = useState('')

    const [showPayModal, setShowPayModal] = useState(false)
    const [moneySources, setMoneySources] = useState<any[]>([])
    const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [payAmount, setPayAmount] = useState('')
    const [paySourceId, setPaySourceId] = useState('')
    const [payNote, setPayNote] = useState('')

    const statusColors: any = {
        submitted: 'bg-amber-100 text-amber-800 border-amber-200',
        approved: 'bg-blue-100 text-blue-800 border-blue-200',
        partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        rejected: 'bg-rose-100 text-rose-800 border-rose-200'
    }

    const loadBill = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch(`/api/finance/vendor-bills/${id}`, { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to fetch bill')
            setBill(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadMoneySources = async () => {
        try {
            const res = await fetch('/api/finance/money-sources', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && Array.isArray(data)) {
                setMoneySources(data)
            }
        } catch (err) {
            console.error(err)
        }
    }

    useEffect(() => {
        if (id) loadBill()
    }, [id])

    useEffect(() => {
        loadMoneySources()
    }, [showPayModal])

    const handleUpdateStatus = async (status: string) => {
        setSaving(true)
        setError('')
        try {
            const res = await fetch(`/api/finance/vendor-bills/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status })
            })
            if (!res.ok) throw new Error('Failed to update status')
            loadBill()
        } catch (err: any) {
            setError(err.message)
            setSaving(false)
        }
    }

    const handleAddAttachment = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await fetch(`/api/finance/vendor-bills/${id}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ file_url: newAttachmentUrl })
            })
            if (!res.ok) throw new Error('Failed to add attachment')

            setShowAttachModal(false)
            setNewAttachmentUrl('')
            loadBill()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleRemoveAttachment = async (attId: string) => {
        if (!confirm('Remove attachment link?')) return
        setSaving(true)
        try {
            const res = await fetch(`/api/finance/vendor-bills/${id}/attachments/${attId}`, { method: 'DELETE', credentials: 'include' })
            if (!res.ok) throw new Error('Failed to remove attachment')
            loadBill()
        } catch (err: any) {
            setError(err.message)
            setSaving(false)
        }
    }

    const handleApplyPayment = async () => {
        if (!paySourceId) return setError('Select a money source')
        const amountNum = Number(String(payAmount).replace(/,/g, '').trim())
        if (!Number.isFinite(amountNum) || amountNum <= 0) return setError('Enter a valid amount')
        setSaving(true)
        setError('')
        try {
            const res = await fetch(`/api/finance/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    date: payDate,
                    amount: amountNum,
                    direction: 'out',
                    money_source_id: Number(paySourceId),
                    vendor_bill_id: bill.id,
                    lead_id: bill.lead_id || null,
                    is_overhead: !bill.lead_id,
                    note: payNote.trim() || null
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to record payment')

            setShowPayModal(false)
            setPayAmount('')
            setPaySourceId('')
            setPayNote('')
            loadBill()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading && !bill) return <div className="p-8 text-neutral-500 max-w-4xl mx-auto">Loading bill details...</div>
    if (error && !bill) return <div className="p-8 text-rose-600 font-medium max-w-4xl mx-auto">{error}</div>
    if (!bill) return null

    const totalPaid = (bill.payments || []).reduce((acc: number, p: any) => acc + Number(p.amount), 0)
    const billAmount = Number(bill.bill_amount) || 0
    const remaining = Math.max(billAmount - totalPaid, 0)
    const computedStatus = bill.status === 'rejected'
        ? 'rejected'
        : bill.status === 'submitted'
            ? 'submitted'
            : totalPaid <= 0
                ? 'approved'
                : totalPaid < billAmount
                    ? 'partial'
                    : 'paid'

    return (
        <div className="space-y-8 pb-32 max-w-4xl mx-auto">
            {/* HEADER */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/admin/finance/bills" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-neutral-900">Vendor Bill #{bill.id}</h1>
                        <span className={`capitalize px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border
               ${statusColors[computedStatus] || 'bg-neutral-100 text-neutral-600'}`}>
                            {computedStatus === 'partial' ? 'Partially Paid' : computedStatus}
                        </span>
                        {bill.is_billable_to_client && (
                            <span className="capitalize px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border bg-purple-50 text-purple-700 border-purple-200">
                                Billable to Client
                            </span>
                        )}
                    </div>
                    <div className="text-sm font-medium text-neutral-600 flex items-center gap-2">
                        <span>Vendor: {bill.vendor_name}</span>
                        <span className="text-neutral-300">•</span>
                        <span className="uppercase text-xs tracking-wider text-neutral-500">Logged {formatDateShort(bill.created_at)}</span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-8 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
                    {error}
                </div>
            )}

            {/* SECTION A — Summary */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section A — Bill Details</h2>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6 divide-x divide-[var(--border)]">
                    <div className="first:pl-0 border-0 md:border-l pl-6">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Bill Amount</div>
                        <div className="text-xl font-semibold text-neutral-900">₹{formatAmount(billAmount)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Paid So Far</div>
                        <div className="text-lg font-medium text-emerald-600">₹{formatAmount(totalPaid)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)] bg-amber-50/50 -my-6 py-6">
                        <div className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Remaining</div>
                        <div className="text-xl font-bold text-amber-800">₹{formatAmount(remaining)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Category & Project</div>
                        <div className="text-sm font-medium text-neutral-800 capitalize">{bill.bill_category}</div>
                        {bill.lead_id && <div className="text-xs text-neutral-500 mt-0.5">L#{bill.lead_number} {bill.lead_name}</div>}
                    </div>
                </div>
                {bill.notes && (
                    <div className="px-6 py-4 bg-neutral-50 border-t border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Notes</div>
                        <p className="text-sm text-neutral-700">{bill.notes}</p>
                    </div>
                )}
            </section>

            {/* SECTION B — Process Workflow */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section B — Actions</h2>
                </div>
                <div className="p-6 flex flex-wrap gap-4 items-center bg-neutral-50">
                    {bill.status === 'submitted' && (
                        <>
                            <button className="bg-blue-600 text-white px-4 py-2 text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 transition" onClick={() => handleUpdateStatus('approved')}>
                                Approve Bill
                            </button>
                            <button className="bg-white text-rose-700 border border-rose-200 px-4 py-2 text-sm font-medium rounded-lg shadow-sm hover:bg-rose-50 transition" onClick={() => handleUpdateStatus('rejected')}>
                                Reject
                            </button>
                        </>
                    )}
                            {bill.status === 'approved' && (
                                <>
                                    <button
                                        className="bg-emerald-600 text-white px-4 py-2 text-sm font-medium rounded-lg shadow-sm hover:bg-emerald-700 transition"
                                        onClick={() => {
                                            setPayDate(new Date().toISOString().slice(0, 10))
                                            setPayAmount(remaining > 0 ? String(remaining) : '')
                                            setShowPayModal(true)
                                        }}
                                    >
                                        Record Outgoing Payment
                                    </button>
                                    {remaining <= 0 && (
                                        <button className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg shadow-sm hover:bg-neutral-800 transition" onClick={() => handleUpdateStatus('paid')}>
                                            Mark Fully Paid
                                        </button>
                                    )}
                            <button className="bg-white text-neutral-600 border border-neutral-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-100 transition" onClick={() => handleUpdateStatus('submitted')}>
                                Revert to Submitted
                            </button>
                        </>
                    )}
                    {bill.status === 'rejected' && (
                        <button className="bg-white text-neutral-600 border border-neutral-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-100 transition" onClick={() => handleUpdateStatus('submitted')}>
                            Reconsider (Move to Submitted)
                        </button>
                    )}
                    {bill.status === 'paid' && (
                        <span className="text-emerald-700 font-medium text-sm">Bill is fully paid.</span>
                    )}
                </div>
            </section>

            {/* SECTION C — Attachments */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section C — Receipts & Attachments</h2>
                    <button className="text-sm font-medium text-brand-600 hover:text-brand-800 lowercase tracking-wide" onClick={() => setShowAttachModal(true)}>
                        + add link
                    </button>
                </div>
                <div className="p-0">
                    <ul className="divide-y divide-[var(--border)]">
                        {bill.attachments?.length === 0 ? (
                            <li className="p-6 text-sm text-neutral-500 italic text-center">No receipts attached.</li>
                        ) : (
                            bill.attachments?.map((a: any) => (
                                <li key={a.id} className="p-4 flex justify-between items-center hover:bg-neutral-50 transition group">
                                    <div className="flex gap-4 items-center truncate">
                                        <div className="w-8 h-8 rounded bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
                                            🔗
                                        </div>
                                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline truncate">
                                            {a.file_url}
                                        </a>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-neutral-400">{formatDateShort(a.uploaded_at)}</span>
                                        <button className="text-rose-500 hover:text-rose-700 text-xs font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition" onClick={() => handleRemoveAttachment(a.id)}>Remove</button>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </section>

            {/* SECTION D — Payments Ledger */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section D — Actual Payments Made (Ledger)</h2>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-[var(--border)]">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium">Date</th>
                                <th className="px-6 py-3 text-left font-medium">Source</th>
                                <th className="px-6 py-3 text-left font-medium">Tx Ref</th>
                                <th className="px-6 py-3 text-right font-medium">Amount Paid</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {bill.payments?.length === 0 ? (
                                <tr><td colSpan={4} className="p-6 text-center text-sm text-neutral-500 italic">No payments applied yet.</td></tr>
                            ) : (
                                bill.payments?.map((p: any) => (
                                    <tr key={p.transaction_id} className="hover:bg-neutral-50 transition">
                                        <td className="px-6 py-4 text-neutral-600">{formatDateShort(p.date)}</td>
                                        <td className="px-6 py-4 font-medium text-neutral-800">{p.money_source_name || '—'}</td>
                                        <td className="px-6 py-4 text-neutral-500 font-mono text-xs">TX-{p.transaction_id}</td>
                                        <td className="px-6 py-4 text-right font-bold text-rose-700">₹{formatAmount(p.amount)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ATTACH MODAL */}
            {showAttachModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Add Receipt Link</h3>
                            <button className="text-neutral-400 hover:text-neutral-600 font-bold" onClick={() => setShowAttachModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAddAttachment} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">URL (Google Drive, Dropbox, etc.)</label>
                                <input type="url" required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm outline-none focus:border-neutral-500 transition" value={newAttachmentUrl} onChange={e => setNewAttachmentUrl(e.target.value)} placeholder="https://" />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 mt-4">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowAttachModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving || !newAttachmentUrl} className={buttonPrimary}>
                                    {saving ? 'Adding...' : 'Attach Link'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PAY MODAL */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                            <h3 className="text-lg font-bold text-neutral-900">Record Payment</h3>
                            <button className="text-neutral-400 hover:text-neutral-600 font-bold" onClick={() => setShowPayModal(false)}>✕</button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="text-sm text-neutral-600">
                                Create a new outgoing transaction for this bill.
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">Payment Date</label>
                                <input type="date" className="w-full p-3 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-brand-500 transition" value={payDate} onChange={e => setPayDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">Money Source</label>
                                <select className="w-full p-3 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-brand-500 transition" value={paySourceId} onChange={e => setPaySourceId(e.target.value)}>
                                    <option value="">-- Select Account --</option>
                                    {moneySources.map(source => (
                                        <option key={source.id} value={source.id}>{source.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">Amount</label>
                                <CurrencyInput
                                    className="w-full p-3 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 transition font-medium"
                                    value={payAmount}
                                    onChange={setPayAmount}
                                    placeholder="0"
                                />
                                <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 mt-2">
                                    Balance Due: ₹{formatAmount(remaining)}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">Note (optional)</label>
                                <input className="w-full p-3 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-brand-500 transition" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Optional note" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                            <button className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-lg transition" onClick={() => setShowPayModal(false)}>Cancel</button>
                            <button className={buttonPrimary} onClick={handleApplyPayment} disabled={saving || !paySourceId || !payAmount}>
                                {saving ? 'Recording...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
