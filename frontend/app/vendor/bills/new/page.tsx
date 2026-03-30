'use client'


import CalendarInput from '@/components/CalendarInput'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'

const CATEGORIES = ['editing', 'shooting', 'travel', 'food', 'printing', 'misc']

export default function VendorSubmitBillPage() {
    const router = useRouter()
    const [form, setForm] = useState({
        bill_date: new Date().toISOString().slice(0, 10),
        bill_amount: '',
        bill_category: 'editing',
        lead_id: '',
        receipt_url: '',
        notes: '',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            const res = await fetch('/api/vendor/bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...form,
                    bill_amount: Number(form.bill_amount),
                    lead_id: form.lead_id ? Number(form.lead_id) : null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to submit bill')
            router.push('/vendor/bills')
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const fieldClass = 'w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:border-neutral-500 outline-none transition'

    return (
        <div className="max-w-lg mx-auto pb-20 space-y-6">
            <div>
                <Link href="/vendor/bills" className="text-sm text-neutral-500 hover:text-neutral-900 transition">← Back to My Bills</Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold text-neutral-900">Submit a Bill</h1>
                <p className="text-sm text-neutral-500 mt-1">Submit an expense for admin review. You cannot edit after submission.</p>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 space-y-5">
                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Bill Date *</label>
                    <CalendarInput className={fieldClass} value={form.bill_date} onChange={val => setForm({ ...form, bill_date: val })} />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Amount *</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                        <CurrencyInput
                            required
                            className={`${fieldClass} pl-7`}
                            value={form.bill_amount}
                            onChange={val => setForm({ ...form, bill_amount: val })}
                            placeholder="5000"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Category *</label>
                    <select required className={`${fieldClass} bg-white`} value={form.bill_category} onChange={e => setForm({ ...form, bill_category: e.target.value })}>
                        {CATEGORIES.map(c => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Project Lead ID <span className="normal-case text-neutral-400">(optional)</span></label>
                    <input type="number" placeholder="e.g. 26001" className={fieldClass} value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })} />
                </div>

                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Receipt URL <span className="normal-case text-neutral-400">(optional)</span></label>
                    <input type="url" placeholder="Google Drive or Dropbox link" className={fieldClass} value={form.receipt_url} onChange={e => setForm({ ...form, receipt_url: e.target.value })} />
                </div>

                <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">Notes <span className="normal-case text-neutral-400">(optional)</span></label>
                    <textarea rows={3} placeholder="Any context about this expense..." className={`${fieldClass} resize-none`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end">
                    <button type="submit" disabled={saving || !form.bill_amount || !form.bill_category} className="bg-neutral-900 text-white px-6 py-2.5 text-sm font-medium rounded-lg hover:bg-neutral-800 disabled:opacity-50 shadow transition">
                        {saving ? 'Submitting...' : 'Submit Bill'}
                    </button>
                </div>
            </form>
        </div>
    )
}
