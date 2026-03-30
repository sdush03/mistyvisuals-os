'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const sectionClass = 'mb-10 bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden'
const sectionHeaderClass = 'bg-neutral-50 border-b border-[var(--border)] px-6 py-3 flex items-center justify-between'
const sectionTitleClass = 'text-sm font-semibold text-neutral-900 uppercase tracking-widest'

const buttonPrimary = 'bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800 transition rounded'
const buttonDanger = 'bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2 text-sm font-medium hover:bg-rose-100 transition rounded'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

const formatAmount = (value: number | string | null | undefined) => {
    if (value == null) return '0'
    return formatIndian(value)
}

const formatDateShort = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const toDateInput = (value?: string | null) => {
    if (!value) return ''
    return String(value).slice(0, 10)
}

export default function InvoiceDetailPage() {
    const { id } = useParams()

    const [invoice, setInvoice] = useState<any>(null)
    const [moneySources, setMoneySources] = useState<any[]>([])

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [showApplyModal, setShowApplyModal] = useState(false)
    const [applyAmount, setApplyAmount] = useState('')
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [paymentSourceId, setPaymentSourceId] = useState('')
    const [paymentNote, setPaymentNote] = useState('')

    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null)

    const [scheduleDraft, setScheduleDraft] = useState<any[]>([])
    const [scheduleSaving, setScheduleSaving] = useState(false)
    const [scheduleError, setScheduleError] = useState('')
    const [scheduleSaved, setScheduleSaved] = useState('')

    const loadInvoice = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await apiFetch(`/api/finance/invoices/${id}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to load invoice')
            setInvoice(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadMoneySources = async () => {
        try {
            const res = await apiFetch('/api/finance/money-sources')
            const data = await res.json()
            if (res.ok && Array.isArray(data)) {
                setMoneySources(data)
            }
        } catch (err) {
            console.error('Failed to load money sources', err)
        }
    }

    useEffect(() => {
        if (id) {
            loadInvoice()
        }
    }, [id])

    useEffect(() => {
        loadMoneySources()
    }, [])

    useEffect(() => {
        if (!invoice) return
        const invoiceTotal = Number(invoice.total_amount || 0)
        const steps = Array.isArray(invoice.payment_steps) ? invoice.payment_steps : []
        const schedule = Array.isArray(invoice.payment_schedule) ? invoice.payment_schedule : []

        if (steps.length > 0) {
            const mapped = steps.map((step: any, idx: number) => {
                const match = schedule.find((row: any) =>
                    (row.step_order && row.step_order === step.step_order) || (row.label && row.label === step.label)
                )
                return {
                    label: step.label,
                    percentage: step.percentage,
                    due_date: toDateInput(match?.due_date),
                    step_order: step.step_order ?? idx + 1,
                    amount: null
                }
            })
            setScheduleDraft(mapped)
        } else if (schedule.length > 0) {
            const mapped = schedule.map((row: any, idx: number) => ({
                label: row.label || `Step ${idx + 1}`,
                percentage: row.percentage ?? null,
                due_date: toDateInput(row.due_date),
                step_order: row.step_order ?? idx + 1,
                amount: row.amount ?? null
            }))
            setScheduleDraft(mapped)
        } else if (invoice.due_date) {
            setScheduleDraft([
                { label: 'Due', percentage: null, due_date: toDateInput(invoice.due_date), step_order: 1, amount: invoiceTotal }
            ])
        } else {
            setScheduleDraft([])
        }
        setScheduleError('')
        setScheduleSaved('')
    }, [invoice?.id])

    const handleApplyPayment = async () => {
        if (!paymentSourceId) return setError('Select a money source')
        if (!applyAmount) return setError('Enter an amount')
        const amtNum = parseFloat(applyAmount)
        if (isNaN(amtNum) || amtNum <= 0) return setError('Valid amount is required')

        setSaving(true)
        setError('')
        try {
            const res = await apiFetch(`/api/finance/invoices/${id}/payments`, {
                method: 'POST',
                body: JSON.stringify({
                    amount_applied: amtNum,
                    money_source_id: Number(paymentSourceId),
                    date: paymentDate,
                    note: paymentNote.trim() || null
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to apply payment')

            setShowApplyModal(false)
            setApplyAmount('')
            setPaymentSourceId('')
            setPaymentNote('')
            void loadInvoice()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleRemovePayment = async () => {
        if (!deletePaymentId) return
        setSaving(true)
        setError('')
        try {
            const res = await apiFetch(`/api/finance/invoices/${id}/payments/${deletePaymentId}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to remove payment')

            setDeletePaymentId(null)
            void loadInvoice()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleCancelInvoice = async () => {
        setSaving(true)
        setError('')
        try {
            const res = await apiFetch(`/api/finance/invoices/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'cancelled' })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to cancel invoice')

            setShowCancelConfirm(false)
            void loadInvoice()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleSaveSchedule = async () => {
        if (scheduleDraft.length === 0) {
            return setScheduleError('Add at least one schedule item')
        }
        if (scheduleDraft.some(row => !row.due_date)) {
            return setScheduleError('All schedule items need a due date')
        }

        setScheduleSaving(true)
        setScheduleError('')
        setScheduleSaved('')
        try {
            const payload = scheduleDraft.map((row: any, idx: number) => ({
                label: row.label || `Step ${idx + 1}`,
                percentage: row.percentage ?? null,
                amount: row.amount ?? null,
                due_date: row.due_date,
                step_order: row.step_order ?? idx + 1
            }))
            const res = await apiFetch(`/api/finance/invoices/${id}/schedule`, {
                method: 'PUT',
                body: JSON.stringify({ schedule: payload })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to save schedule')
            setScheduleSaved('Schedule saved')
            setInvoice((prev: any) => prev ? { ...prev, payment_schedule: data.schedule || prev.payment_schedule } : prev)
        } catch (err: any) {
            setScheduleError(err.message)
        } finally {
            setScheduleSaving(false)
        }
    }

    if (loading && !invoice) {
        return <div className="p-8 text-neutral-500 max-w-4xl mx-auto">Loading invoice details...</div>
    }

    if (error && !invoice) {
        return <div className="p-8 text-rose-600 font-medium max-w-4xl mx-auto">{error}</div>
    }

    if (!invoice) return null

    const totalAmount = Number(invoice.total_amount)
    const paidAmount = invoice.payments ? invoice.payments.reduce((acc: number, p: any) => acc + Number(p.amount_applied), 0) : 0
    const balance = totalAmount - paidAmount

    return (
        <div className="space-y-8 pb-32 max-w-4xl mx-auto">
            {/* HEADER */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/admin/finance/invoices" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-neutral-900">{invoice.invoice_number}</h1>
                        <span className={`capitalize px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase
               ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                invoice.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                                    'bg-blue-100 text-blue-800'}`}>
                            {invoice.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="text-sm font-medium text-neutral-600 flex items-center gap-2">
                        <span>{invoice.lead_number ? `L#${invoice.lead_number} ` : ''}{invoice.lead_name}</span>
                        <span className="text-neutral-300">•</span>
                        <span className="uppercase text-xs tracking-wider text-neutral-500">{invoice.invoice_type.replace('_', ' ')}</span>
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
                    <h2 className={sectionTitleClass}>Section A — Summary</h2>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-6 divide-x divide-[var(--border)]">
                    <div className="pl-6 first:pl-0 border-0 md:border-l">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Subtotal</div>
                        <div className="text-lg font-medium text-neutral-700">₹{formatAmount(invoice.subtotal)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">GST (As Agreed)</div>
                        <div className="text-lg font-medium text-neutral-700">₹{formatAmount(invoice.tax_amount)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Amount</div>
                        <div className="text-lg font-semibold text-neutral-900">₹{formatAmount(totalAmount)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)]">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Paid Amount</div>
                        <div className="text-lg font-medium text-emerald-600">₹{formatAmount(paidAmount)}</div>
                    </div>
                    <div className="pl-6 border-l border-[var(--border)] bg-rose-50/30 -m-6 p-6">
                        <div className="text-xs text-rose-600 font-bold uppercase tracking-wider mb-1">Outstanding Balance</div>
                        <div className="text-2xl font-bold text-rose-700">₹{formatAmount(balance)}</div>
                    </div>
                </div>
            </section>

            {/* SECTION B — Line Items */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section B — Line Items</h2>
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-[var(--border)]">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium">Description</th>
                                <th className="px-6 py-3 text-right font-medium">Quantity</th>
                                <th className="px-6 py-3 text-right font-medium">Unit Price</th>
                                <th className="px-6 py-3 text-right font-medium">Line Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {invoice.line_items?.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-4 text-center text-neutral-500 italic">No line items</td>
                                </tr>
                            )}
                            {invoice.line_items?.map((item: any) => (
                                <tr key={item.id} className="hover:bg-[var(--surface-muted)] transition">
                                    <td className="px-6 py-4">
                                        <span className="font-medium text-neutral-800">{item.description}</span>
                                        {item.is_billable_expense && <span className="ml-2 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] uppercase font-bold tracking-wider">Expense</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right text-neutral-600">{Number(item.quantity).toString()}</td>
                                    <td className="px-6 py-4 text-right text-neutral-600">₹{formatAmount(item.unit_price)}</td>
                                    <td className="px-6 py-4 text-right font-medium text-neutral-900">₹{formatAmount(item.line_total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* SECTION C — Payments Applied */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section C — Payments Applied</h2>
                    {balance > 0 && invoice.status !== 'cancelled' && (
                        <button
                            className={buttonPrimary}
                            onClick={() => {
                                setPaymentDate(new Date().toISOString().slice(0, 10))
                                setApplyAmount(String(balance))
                                setShowApplyModal(true)
                            }}
                        >
                            + Apply Payment
                        </button>
                    )}
                </div>
                <div className="p-0 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-[var(--border)]">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium">Date</th>
                                <th className="px-6 py-3 text-left font-medium">Money Source</th>
                                <th className="px-6 py-3 text-left font-medium">Transaction Ref</th>
                                <th className="px-6 py-3 text-right font-medium">Amount Applied</th>
                                <th className="px-6 py-3 text-center font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {invoice.payments?.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500 italic">
                                        No payments applied yet. Click 'Apply Payment' to record a payment.
                                    </td>
                                </tr>
                            ) : (
                                invoice.payments?.map((payment: any) => (
                                    <tr key={payment.id} className="hover:bg-[var(--surface-muted)] transition">
                                        <td className="px-6 py-4 text-neutral-600">{formatDateShort(payment.transaction_date)}</td>
                                        <td className="px-6 py-4 font-medium text-neutral-800">{payment.money_source_name || '—'}</td>
                                        <td className="px-6 py-4 text-neutral-500 font-mono text-xs">TX-{payment.finance_transaction_id}</td>
                                        <td className="px-6 py-4 text-right font-bold text-emerald-700">₹{formatAmount(payment.amount_applied)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="text-rose-600 hover:text-rose-800 font-medium text-xs uppercase tracking-wider" onClick={() => setDeletePaymentId(payment.id)}>
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* SECTION D — Payment Plan */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section D — Payment Plan</h2>
                </div>
                <div className="p-6">
                    {scheduleDraft.length > 0 ? (
                        <div className="space-y-4 max-w-2xl">
                            {scheduleDraft.map((row: any, idx: number) => {
                                const expected = row.amount !== null && row.amount !== undefined
                                    ? Number(row.amount)
                                    : row.percentage ? (Number(row.percentage) / 100) * totalAmount : 0
                                const isPast = expected > 0 ? paidAmount >= expected : false
                                return (
                                    <div key={`${row.step_order || idx}-${row.label || 'step'}`} className="flex flex-col gap-2 border-b border-dashed border-[var(--border)] pb-4 last:border-0 last:pb-0">
                                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                            <div>
                                                <div className={`font-semibold uppercase tracking-wider text-xs ${isPast ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                                                    {row.label || `Step ${idx + 1}`}
                                                </div>
                                                <div className="text-neutral-500 mt-1">
                                                    {row.percentage ? `${row.percentage}% of total` : 'Custom amount'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-bold ${isPast ? 'text-neutral-400' : 'text-neutral-800'}`}>
                                                    ₹{formatAmount(expected)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="text-xs uppercase tracking-wider text-neutral-500">Due Date</div>
                                            <CalendarInput
                                                className="rounded border border-[var(--border)] bg-white px-3 py-1.5 text-sm"
                                                value={row.due_date || ''}
                                                onChange={val => {
                                                    setScheduleDraft((prev: any[]) =>
                                                        prev.map((item, i) => i === idx ? { ...item, due_date: val } : item)
                                                    )
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                            {scheduleError && <div className="text-sm text-rose-600 font-medium">{scheduleError}</div>}
                            {scheduleSaved && <div className="text-sm text-emerald-600 font-medium">{scheduleSaved}</div>}
                            <button className={buttonPrimary} onClick={handleSaveSchedule} disabled={scheduleSaving}>
                                {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                            </button>
                        </div>
                    ) : (
                        <div className="text-sm text-neutral-500 italic">No payment schedule found. Add due dates to generate expected payments.</div>
                    )}
                </div>
            </section>

            {/* SECTION E — Status Actions */}
            <section className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <h2 className={sectionTitleClass}>Section E — Status Actions</h2>
                </div>
                <div className="p-6 flex flex-wrap gap-4 items-center">
                    {invoice.status !== 'cancelled' && invoice.payments?.length === 0 && (
                        <button className={buttonDanger} onClick={() => setShowCancelConfirm(true)}>
                            Mark as Cancelled
                        </button>
                    )}
                    {invoice.status === 'cancelled' && (
                        <div className="text-sm font-semibold text-rose-700 bg-rose-50 px-4 py-2 rounded-lg border border-rose-200">
                            This invoice has been cancelled.
                        </div>
                    )}
                    {invoice.payments?.length > 0 && invoice.status !== 'cancelled' && (
                        <div className="text-sm text-neutral-500 italic">
                            Invoice cannot be cancelled while payments are applied. Remove payments first.
                        </div>
                    )}
                    <Link href={`/admin/finance?lead_id=${invoice.lead_id}`} className="text-sm font-medium text-brand-600 hover:text-brand-800 ml-auto flex items-center gap-1 uppercase tracking-wider text-xs">
                        View Linked Transactions
                        <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </Link>
                </div>
            </section>

            {/* APPLY PAYMENT MODAL */}
            {showApplyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-neutral-900">Record Payment</h3>
                            <button className="text-neutral-400 hover:text-neutral-600 font-bold" onClick={() => setShowApplyModal(false)}>✕</button>
                        </div>
                        <div className="p-5 space-y-5">
                            <p className="text-sm text-neutral-600">Record a new money-in transaction for this invoice.</p>

                            <div>
                                <div className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">Payment Date</div>
                                <CalendarInput
                                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-neutral-500 transition"
                                    value={paymentDate}
                                    onChange={val => setPaymentDate(val)}
                                />
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">Money Source</div>
                                <select
                                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-neutral-500 transition"
                                    value={paymentSourceId}
                                    onChange={(e) => setPaymentSourceId(e.target.value)}
                                >
                                    <option value="">-- Select Account --</option>
                                    {moneySources.map((source: any) => (
                                        <option key={source.id} value={source.id}>{source.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">Amount</div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                    <CurrencyInput
                                        className="w-full p-2.5 pl-7 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-neutral-500 transition font-medium"
                                        value={applyAmount}
                                        onChange={setApplyAmount}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 mt-2">
                                    Invoice Balance: ₹{formatAmount(balance)}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">Note (optional)</div>
                                <input
                                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:border-neutral-500 transition"
                                    value={paymentNote}
                                    onChange={(e) => setPaymentNote(e.target.value)}
                                    placeholder="Optional note"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                            <button className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 rounded-lg transition" onClick={() => setShowApplyModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition"
                                onClick={handleApplyPayment}
                                disabled={saving || !paymentSourceId || !applyAmount}
                            >
                                {saving ? 'Applying...' : 'Apply Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM DIALOGS */}
            <ConfirmDialog
                isOpen={deletePaymentId !== null}
                title="Remove Payment"
                message="Are you sure you want to remove this payment from the invoice? The transaction itself will NOT be deleted."
                confirmText="Remove"
                isDangerous
                onClose={() => setDeletePaymentId(null)}
                onConfirm={handleRemovePayment}
            />

            <ConfirmDialog
                isOpen={showCancelConfirm}
                title="Cancel Invoice"
                message="Are you sure you want to cancel this invoice? This will change its status to 'cancelled'."
                confirmText="Cancel Invoice"
                isDangerous
                onClose={() => setShowCancelConfirm(false)}
                onConfirm={handleCancelInvoice}
            />
        </div>
    )
}
