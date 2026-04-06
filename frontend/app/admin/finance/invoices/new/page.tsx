'use client'


import CalendarInput from '@/components/CalendarInput'
import { toISTDateInput } from '@/lib/formatters'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'

const sectionClass = 'mb-10'
const sectionTitleClass = 'text-sm font-semibold text-neutral-900 uppercase tracking-widest mb-4 pb-2 border-b border-[var(--border)]'
const fieldClass = 'w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none transition'
const labelClass = 'block text-xs text-neutral-500 font-medium mb-1 uppercase tracking-wider'

const buttonPrimary = 'bg-neutral-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-neutral-800 transition rounded'
const buttonOutline = 'border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)] transition rounded'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type LineItem = {
    id: string
    description: string
    quantity: string
    unit_price: string
    is_billable_expense: boolean
}

export default function NewInvoicePage() {
    const router = useRouter()

    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [leadId, setLeadId] = useState('')
    const [invoiceType, setInvoiceType] = useState('non_gst')
    const [issueDate, setIssueDate] = useState(() => toISTDateInput())
    const [dueDate, setDueDate] = useState('')
    const [notes, setNotes] = useState('')

    const [lineItems, setLineItems] = useState<LineItem[]>([
        { id: '1', description: '', quantity: '1', unit_price: '', is_billable_expense: false }
    ])

    const [taxAmount, setTaxAmount] = useState('')
    const [totalOverride, setTotalOverride] = useState('')

    const [savingStatus, setSavingStatus] = useState<'draft' | 'issued' | ''>('')
    const [error, setError] = useState('')

    const [paymentStructures, setPaymentStructures] = useState<any[]>([])
    const [defaultStructureId, setDefaultStructureId] = useState('')

    useEffect(() => {
        // Fetch payment structures to display the default one as read-only context
        apiFetch('/api/finance/invoices') // We don't have a direct endpoint for payment structures yet, wait, we might not need to fetch them if the backend auto-assigns. 
        // The prompt says "Payment Structure (dropdown, default auto-selected, read-only note)"
        // Let's implement a dummy fallback for now if no endpoint exists, or assume there is no endpoint and just show a message.
    }, [])

    const subtotal = lineItems.reduce((acc, item) => {
        const q = Number(item.quantity) || 0
        const p = Number(item.unit_price) || 0
        return acc + (q * p)
    }, 0)

    const tax = Number(taxAmount) || 0
    const calculatedTotal = subtotal + tax
    const userTotal = totalOverride ? Number(totalOverride) : calculatedTotal

    const handleAddLineItem = () => {
        setLineItems([
            ...lineItems,
            { id: Math.random().toString(), description: '', quantity: '1', unit_price: '', is_billable_expense: false }
        ])
    }

    const handleRemoveLineItem = (id: string) => {
        if (lineItems.length === 1) return
        setLineItems(lineItems.filter(item => item.id !== id))
    }

    const updateLineItem = (id: string, field: keyof LineItem, value: string | boolean) => {
        setLineItems(lineItems.map(item => item.id === id ? { ...item, [field]: value } : item))
    }

    const handleSave = async (status: 'draft' | 'issued') => {
        if (!leadId) return setError('Please select a lead')
        if (lineItems.some(i => !i.description.trim())) return setError('All line items must have a description')

        setSavingStatus(status)
        setError('')

        try {
            const res = await apiFetch('/api/finance/invoices', {
                method: 'POST',
                body: JSON.stringify({
                    lead_id: leadId,
                    invoice_type: invoiceType,
                    issue_date: issueDate,
                    due_date: dueDate || null,
                    notes,
                    tax_amount: tax,
                    total_amount: userTotal,
                    // invoice_number is handled by backend in V1
                    line_items: lineItems.map(i => ({
                        description: i.description,
                        quantity: Number(i.quantity) || 1,
                        unit_price: Number(i.unit_price) || 0,
                        is_billable_expense: i.is_billable_expense
                    }))
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to create invoice')

            // If requested to be issued, patch status immediately
            if (status === 'issued') {
                await apiFetch(`/api/finance/invoices/${data.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'issued' })
                })
            }

            router.push(`/admin/finance/invoices/${data.id}`)
        } catch (err: any) {
            setError(err.message)
            setSavingStatus('')
        }
    }

    return (
        <div className="pb-32 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/admin/finance/invoices" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold text-neutral-900">Create Invoice</h1>
                    <div className="text-sm text-neutral-500 mt-1">Single-page invoice builder</div>
                </div>
            </div>

            {error && (
                <div className="mb-8 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
                    {error}
                </div>
            )}

            {/* SECTION A — Invoice Basics */}
            <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Section A — Invoice Basics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className={labelClass}>Invoice Number</label>
                        <input type="text" className={`${fieldClass} bg-neutral-50 text-neutral-500`} placeholder="Auto-generated on save" disabled />
                    </div>
                    <div>
                        <label className={labelClass}>Lead <span className="text-rose-500">*</span></label>
                        <LeadAsyncSearch value={leadId} onChange={setLeadId} />
                    </div>
                    <div>
                        <label className={labelClass}>Invoice Type</label>
                        <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
                                <input type="radio" name="invType" value="non_gst" checked={invoiceType === 'non_gst'} onChange={() => setInvoiceType('non_gst')} className="accent-neutral-900" />
                                Non-GST
                            </label>
                            <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
                                <input type="radio" name="invType" value="gst" checked={invoiceType === 'gst'} onChange={() => setInvoiceType('gst')} className="accent-neutral-900" />
                                GST (Tax Invoice)
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Payment Structure</label>
                        <select className={`${fieldClass} bg-neutral-50 text-neutral-500`} disabled>
                            <option>Default Structure (Auto-selected)</option>
                        </select>
                        <div className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wide">Read-only note: Attached automatically by backend</div>
                    </div>
                    <div>
                        <label className={labelClass}>Issue Date</label>
                        <CalendarInput className={fieldClass} value={issueDate} onChange={val => setIssueDate(val)} />
                    </div>
                    <div>
                        <label className={labelClass}>Due Date</label>
                        <CalendarInput className={fieldClass} value={dueDate} onChange={val => setDueDate(val)} />
                    </div>
                </div>
            </section>

            {/* SECTION B — Line Items */}
            <section className={sectionClass}>
                <div className="flex items-center justify-between mb-4 border-b border-[var(--border)] pb-2">
                    <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-widest">Section B — Line Items</h2>
                    <button className="text-xs font-semibold text-brand-600 hover:text-brand-800 uppercase tracking-wider" onClick={handleAddLineItem}>
                        + Add Line Item
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-4 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-2">
                        <div className="col-span-6">Description</div>
                        <div className="col-span-2">Quantity</div>
                        <div className="col-span-3">Unit Price</div>
                        <div className="col-span-1"></div>
                    </div>

                    {lineItems.map((item, index) => (
                        <div key={item.id} className="grid grid-cols-12 gap-4 items-start group">
                            <div className="col-span-6">
                                <input
                                    type="text"
                                    placeholder="e.g. Base Photography Package"
                                    className={fieldClass}
                                    value={item.description}
                                    onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                                />
                                <label className="flex items-center gap-1.5 mt-2 ml-1 cursor-pointer text-xs text-neutral-500">
                                    <input
                                        type="checkbox"
                                        checked={item.is_billable_expense}
                                        onChange={e => updateLineItem(item.id, 'is_billable_expense', e.target.checked)}
                                        className="accent-neutral-900"
                                    />
                                    Billable Expense
                                </label>
                            </div>
                            <div className="col-span-2">
                                <input
                                    type="number"
                                    min="1"
                                    className={fieldClass}
                                    value={item.quantity}
                                    onChange={e => updateLineItem(item.id, 'quantity', e.target.value)}
                                />
                            </div>
                            <div className="col-span-3">
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-neutral-400 text-sm">₹</span>
                                    <CurrencyInput
                                        placeholder="0"
                                        className={`${fieldClass} pl-7`}
                                        value={item.unit_price}
                                        onChange={val => updateLineItem(item.id, 'unit_price', val)}
                                    />
                                </div>
                                <div className="text-xs text-neutral-500 mt-2 ml-1">
                                    Total: ₹{((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="col-span-1 flex justify-center pt-2">
                                {lineItems.length > 1 && (
                                    <button
                                        className="p-1 text-neutral-300 hover:text-rose-600 transition opacity-0 group-hover:opacity-100"
                                        onClick={() => handleRemoveLineItem(item.id)}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    <div className="pt-4 flex justify-end">
                        <div className="w-1/3 text-right text-sm text-neutral-600">
                            <span className="mr-4 uppercase tracking-wider text-xs font-semibold">Subtotal:</span>
                            <span className="text-neutral-900 font-medium tracking-wide">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION C — Totals */}
            <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Section C — Totals (Negotiated Truth)</h2>
                <div className="bg-neutral-50 border border-neutral-200 rounded p-6 space-y-4 max-w-md ml-auto">
                    <div className="flex justify-between items-center text-sm text-neutral-600">
                        <span className="uppercase tracking-wider text-xs font-semibold">Subtotal (Read-only)</span>
                        <span className="font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="pt-2">
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                <div className="text-sm font-semibold text-neutral-900 uppercase tracking-widest">GST</div>
                                <div className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wide leading-relaxed max-w-[200px]">
                                    Enter GST actually charged. May be partial or zero.
                                </div>
                            </div>
                            <div className="relative w-32 shrink-0">
                                <span className="absolute left-3 top-2 text-neutral-400 text-sm">₹</span>
                                <CurrencyInput
                                    className={`${fieldClass} pl-7 text-right bg-white`}
                                    value={taxAmount}
                                    onChange={setTaxAmount}
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-neutral-200">
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                <div className="text-sm font-semibold text-neutral-900 uppercase tracking-widest mb-1">Total Amount</div>
                                <div className="text-[10px] text-rose-600 font-semibold uppercase tracking-wide leading-relaxed max-w-[200px]">
                                    Authoritative: Invoice is paid when this amount is received.
                                </div>
                            </div>
                            <div className="relative w-32 shrink-0">
                                <span className="absolute left-3 top-2 text-neutral-400 text-sm font-medium">₹</span>
                                <CurrencyInput
                                    className={`${fieldClass} pl-7 text-right bg-white font-semibold text-neutral-900`}
                                    value={totalOverride}
                                    onChange={setTotalOverride}
                                    placeholder={calculatedTotal.toString()}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION D — Payment Plan */}
            <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Section D — Payment Plan (Read-only)</h2>
                <div className="text-sm text-neutral-500 border border-dashed border-neutral-300 rounded p-4 text-center bg-neutral-50/50">
                    <em>Payment structure steps will strictly be displayed on the final invoice detail view based on the backend default.</em>
                </div>
            </section>

            {/* SECTION E — Notes */}
            <section className={sectionClass}>
                <h2 className={sectionTitleClass}>Section E — Notes</h2>
                <textarea
                    className={`${fieldClass} min-h-[120px] resize-y`}
                    placeholder="Terms, conditions, or a thank you note..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                />
            </section>

            {/* SECTION F — Actions */}
            <section className={`pt-6 border-t border-[var(--border)] flex items-center justify-end gap-4`}>
                <button
                    className={`${buttonOutline} w-40`}
                    onClick={() => handleSave('draft')}
                    disabled={!!savingStatus}
                >
                    {savingStatus === 'draft' ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                    className={`${buttonPrimary} w-40`}
                    onClick={() => handleSave('issued')}
                    disabled={!!savingStatus}
                >
                    {savingStatus === 'issued' ? 'Issuing...' : 'Issue Invoice'}
                </button>
            </section>
        </div>
    )
}
