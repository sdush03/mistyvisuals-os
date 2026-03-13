'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'

const empTypes: Record<string, string> = { salaried: 'Salaried', stipend: 'Stipend', salaried_plus_variable: 'Salaried + Variable' }

function getMonthStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function fmtMonth(s: string) {
    const d = new Date(s)
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
const fmt = (n: number | null) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

export default function PayrollDashboardPage() {
    const [month, setMonth] = useState(getMonthStr(new Date()))
    const [summary, setSummary] = useState<any[]>([])
    const [entries, setEntries] = useState<any[]>([])
    const [components, setComponents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Add Entry modal
    const [showEntryModal, setShowEntryModal] = useState(false)
    const [entryForm, setEntryForm] = useState({ user_id: '', component_id: '', amount: '', lead_id: '', notes: '' })
    const [saving, setSaving] = useState(false)

    // Payout modal
    const [showPayoutModal, setShowPayoutModal] = useState(false)
    const [payoutUser, setPayoutUser] = useState<any>(null)
    const [payoutForm, setPayoutForm] = useState({ total_payable: '', total_paid: '', payout_date: '' })

    const loadData = async () => {
        setLoading(true); setError('')
        try {
            const [sRes, eRes, cRes] = await Promise.all([
                fetch(`/api/payroll/summary?month=${month}`, { credentials: 'include' }),
                fetch(`/api/payroll/entries?month=${month}`, { credentials: 'include' }),
                fetch('/api/payroll/components', { credentials: 'include' }),
            ])
            const sData = await sRes.json()
            const eData = await eRes.json()
            const cData = await cRes.json()
            if (sRes.ok) { setSummary(Array.isArray(sData) ? sData : []) } else { throw new Error(sData.error || 'Failed to load summary') }
            if (eRes.ok) { setEntries(Array.isArray(eData) ? eData : []) } else { throw new Error(eData.error || 'Failed to load entries') }
            if (cRes.ok) { setComponents(Array.isArray(cData) ? cData : []) } else { throw new Error(cData.error || 'Failed to load components') }
        } catch (err: any) { setError(err.message) }
        finally { setLoading(false) }
    }

    useEffect(() => { loadData() }, [month])

    const handleAddEntry = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true); setError('')
        try {
            const res = await fetch('/api/payroll/entries', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    user_id: Number(entryForm.user_id), component_id: Number(entryForm.component_id),
                    amount: Number(entryForm.amount), month,
                    lead_id: entryForm.lead_id ? Number(entryForm.lead_id) : null, notes: entryForm.notes || null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            setShowEntryModal(false)
            setEntryForm({ user_id: '', component_id: '', amount: '', lead_id: '', notes: '' })
            loadData()
        } catch (err: any) { setError(err.message) }
        finally { setSaving(false) }
    }

    const openPayout = (s: any) => {
        setPayoutUser(s)
        setPayoutForm({
            total_payable: String(s.payable || 0),
            total_paid: String(s.total_paid || s.payable || 0),
            payout_date: new Date().toISOString().slice(0, 10),
        })
        setShowPayoutModal(true)
    }

    const handlePayout = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true); setError('')
        try {
            const res = await fetch('/api/payroll/payouts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    user_id: payoutUser.user_id, month,
                    total_payable: Number(payoutForm.total_payable),
                    total_paid: Number(payoutForm.total_paid),
                    payout_date: payoutForm.payout_date || null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            setShowPayoutModal(false)
            loadData()
        } catch (err: any) { setError(err.message) }
        finally { setSaving(false) }
    }

    const changeMonth = (delta: number) => {
        const d = new Date(month)
        d.setMonth(d.getMonth() + delta)
        setMonth(getMonthStr(d))
    }

    const inputClass = 'w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition'

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/finance" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Payroll</h1>
                        <p className="text-sm text-neutral-500 mt-1">Monthly compensation breakdown.</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Link href="/admin/finance/accounts#employee-profiles" className="bg-white text-neutral-700 border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 transition rounded-lg">
                        Employee Profiles
                    </Link>
                    <button onClick={() => { setEntryForm({ user_id: '', component_id: '', amount: '', lead_id: '', notes: '' }); setShowEntryModal(true) }} className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-800 transition">
                        + Add Entry
                    </button>
                </div>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>}

            {/* Month Selector */}
            <div className="flex items-center gap-4">
                <button onClick={() => changeMonth(-1)} className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition text-neutral-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-lg font-bold text-neutral-900 min-w-[180px] text-center">{fmtMonth(month)}</span>
                <button onClick={() => changeMonth(1)} className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition text-neutral-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            {/* Summary Table */}
            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-200">
                        <tr>
                            <th className="px-5 py-4 text-left font-medium">Employee</th>
                            <th className="px-5 py-4 text-left font-medium">Type</th>
                            <th className="px-5 py-4 text-right font-medium">Base Earnings</th>
                            <th className="px-5 py-4 text-right font-medium">Variable</th>
                            <th className="px-5 py-4 text-right font-medium">Deductions</th>
                            <th className="px-5 py-4 text-right font-medium">Carry-Fwd</th>
                            <th className="px-5 py-4 text-right font-medium">Net Payable</th>
                            <th className="px-5 py-4 text-right font-medium">Paid</th>
                            <th className="px-5 py-4 text-center font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-500">Loading...</td></tr>
                        ) : summary.length === 0 ? (
                            <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-500 italic">No active profiles. Add employee profiles first.</td></tr>
                        ) : summary.map(s => {
                            const isPaid = s.total_paid >= s.payable && s.payable > 0
                            return (
                                <tr key={s.user_id} className={`transition ${s.payable < 0 ? 'bg-rose-50 border-rose-100 hover:bg-rose-100' : 'hover:bg-neutral-50'}`}>
                                    <td className="px-5 py-4 font-semibold text-neutral-900">{s.user_name}</td>
                                    <td className="px-5 py-4"><span className="px-2 py-0.5 rounded bg-neutral-100 text-xs font-medium text-neutral-600">{empTypes[s.employment_type] || s.employment_type}</span></td>
                                    <td className="px-5 py-4 text-right text-emerald-700 font-semibold">{s.employment_type === 'salaried' ? fmt(s.base_amount) : '—'}</td>
                                    <td className="px-5 py-4 text-right text-emerald-600 font-medium">{s.var_earnings > 0 ? `+${fmt(s.var_earnings)}` : '—'}</td>
                                    <td className="px-5 py-4 text-right text-rose-600 font-medium">{s.deductions > 0 ? `-${fmt(s.deductions)}` : '—'}</td>
                                    <td className="px-5 py-4 text-right">
                                        {s.carry_forward > 0 ? (
                                            <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded">-{fmt(s.carry_forward)}</span>
                                        ) : '—'}
                                    </td>
                                    <td className="px-5 py-4 text-right font-bold text-neutral-900">{fmt(s.payable)}</td>
                                    <td className="px-5 py-4 text-right">
                                        {isPaid ? (
                                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold">Paid {fmt(s.total_paid)}</span>
                                        ) : s.total_paid > 0 ? (
                                            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">Partial {fmt(s.total_paid)}</span>
                                        ) : (
                                            <span className="text-neutral-400 text-xs italic">Unpaid</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <button onClick={() => openPayout(s)} className="text-neutral-600 hover:text-neutral-900 text-xs font-semibold uppercase tracking-wider transition">
                                            {isPaid ? 'Update' : 'Pay'}
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Entries for the month */}
            {entries.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold text-neutral-900 mb-3">Entries — {fmtMonth(month)}</h2>
                    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                        <table className="min-w-full text-sm">
                            <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-200">
                                <tr>
                                    <th className="px-5 py-3 text-left font-medium">Employee</th>
                                    <th className="px-5 py-3 text-left font-medium">Component</th>
                                    <th className="px-5 py-3 text-left font-medium">Type</th>
                                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                                    <th className="px-5 py-3 text-left font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {entries.map(e => (
                                    <tr key={e.id} className="hover:bg-neutral-50 transition">
                                        <td className="px-5 py-3 text-neutral-900">{e.user_name}</td>
                                        <td className="px-5 py-3">{e.component_name}</td>
                                        <td className="px-5 py-3">
                                            {e.component_type === 'earning'
                                                ? <span className="text-emerald-700 text-xs font-semibold uppercase">Earning</span>
                                                : <span className="text-rose-600 text-xs font-semibold uppercase">Deduction</span>}
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold">{fmt(e.amount)}</td>
                                        <td className="px-5 py-3 text-neutral-500 text-xs">{e.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ADD ENTRY MODAL */}
            {showEntryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Add Compensation Entry</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowEntryModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAddEntry} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Employee *</label>
                                <select required className={`${inputClass} bg-white`} value={entryForm.user_id} onChange={e => setEntryForm({ ...entryForm, user_id: e.target.value })}>
                                    <option value="">Select…</option>
                                    {summary.map(s => <option key={s.user_id} value={s.user_id}>{s.user_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Component *</label>
                                <select required className={`${inputClass} bg-white`} value={entryForm.component_id} onChange={e => setEntryForm({ ...entryForm, component_id: e.target.value })}>
                                    <option value="">Select…</option>
                                    {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
                                </select>
                                {entryForm.component_id && components.find(c => c.id === Number(entryForm.component_id))?.calculation_note && (
                                    <div className="mt-2 text-xs bg-blue-50 text-blue-800 p-2.5 rounded-lg border border-blue-100 flex gap-2">
                                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <div>
                                            <span className="font-semibold block mb-0.5 capitalize">{components.find(c => c.id === Number(entryForm.component_id))?.rule_type} Rule:</span>
                                            {components.find(c => c.id === Number(entryForm.component_id))?.calculation_note}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Amount (₹) *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                    <CurrencyInput
                                        required
                                        className={`${inputClass} pl-7`}
                                        value={entryForm.amount}
                                        onChange={val => setEntryForm({ ...entryForm, amount: val })}
                                    />
                                </div>
                                {entryForm.user_id && entryForm.component_id && entryForm.amount &&
                                    components.find(c => c.id === Number(entryForm.component_id))?.component_type === 'deduction' &&
                                    summary.find(s => s.user_id === Number(entryForm.user_id)) &&
                                    summary.find(s => s.user_id === Number(entryForm.user_id))!.payable - Number(entryForm.amount) < 0 && (
                                        <div className="mt-2 text-xs text-rose-600 font-medium flex gap-1.5 items-start">
                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            This deduction will push the employee into a negative monthly balance. Any deficit will automatically carry forward.
                                        </div>
                                    )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Lead ID <span className="normal-case text-neutral-400">(optional)</span></label>
                                <input type="number" className={inputClass} value={entryForm.lead_id} onChange={e => setEntryForm({ ...entryForm, lead_id: e.target.value })} placeholder="e.g. 26001" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Notes</label>
                                <input type="text" className={inputClass} value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowEntryModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                                    {saving ? 'Adding...' : 'Add Entry'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PAYOUT MODAL */}
            {showPayoutModal && payoutUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Record Payout — {payoutUser.user_name}</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowPayoutModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handlePayout} className="p-5 space-y-4">
                            {Number(payoutUser.payable) <= 0 && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg text-sm font-medium flex items-start gap-2">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    <div>This employee has a net payable of {fmt(Number(payoutUser.payable))}. You cannot process a payout for a zero or negative monthly balance. Any deficit carries forward automatically.</div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Total Payable (₹)</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                    <CurrencyInput
                                        className={`${inputClass} pl-7`}
                                        value={payoutForm.total_payable}
                                        onChange={val => setPayoutForm({ ...payoutForm, total_payable: val })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Total Paid (₹) *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                    <CurrencyInput
                                        required
                                        className={`${inputClass} pl-7`}
                                        value={payoutForm.total_paid}
                                        onChange={val => setPayoutForm({ ...payoutForm, total_paid: val })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Payout Date</label>
                                <input type="date" className={inputClass} value={payoutForm.payout_date} onChange={e => setPayoutForm({ ...payoutForm, payout_date: e.target.value })} />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowPayoutModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving || Number(payoutUser.payable) <= 0} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow transition">
                                    {saving ? 'Recording...' : 'Record Payout'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
