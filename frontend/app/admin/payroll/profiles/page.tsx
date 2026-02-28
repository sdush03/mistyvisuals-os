'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'

const empTypes: Record<string, string> = {
    salaried: 'Salaried',
    stipend: 'Stipend',
    salaried_plus_variable: 'Salaried + Variable',
}

export default function PayrollProfilesPage() {
    const [profiles, setProfiles] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [showModal, setShowModal] = useState(false)
    const [editProfile, setEditProfile] = useState<any>(null)
    const [form, setForm] = useState({ user_id: '', employment_type: 'salaried', base_amount: '', is_active: true })

    const load = async () => {
        setLoading(true)
        try {
            const [pRes, uRes] = await Promise.all([
                fetch('/api/payroll/profiles', { credentials: 'include' }),
                fetch('/api/users', { credentials: 'include' }),
            ])
            const pData = await pRes.json()
            const uData = await uRes.json()
            if (pRes.ok) setProfiles(Array.isArray(pData) ? pData : [])
            if (uRes.ok) setUsers(Array.isArray(uData) ? uData : [])
        } catch (err: any) { setError(err.message) }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const openCreate = () => {
        setEditProfile(null)
        setForm({ user_id: '', employment_type: 'salaried', base_amount: '', is_active: true })
        setShowModal(true)
    }
    const openEdit = (p: any) => {
        setEditProfile(p)
        setForm({ user_id: p.user_id, employment_type: p.employment_type, base_amount: p.base_amount || '', is_active: p.is_active })
        setShowModal(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true); setError('')
        try {
            const url = editProfile ? `/api/payroll/profiles/${editProfile.id}` : '/api/payroll/profiles'
            const method = editProfile ? 'PATCH' : 'POST'
            const body: any = { employment_type: form.employment_type, base_amount: form.base_amount ? Number(form.base_amount) : null }
            if (!editProfile) body.user_id = Number(form.user_id)
            if (editProfile) body.is_active = form.is_active

            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            setShowModal(false)
            load()
        } catch (err: any) { setError(err.message) }
        finally { setSaving(false) }
    }

    const profileUserIds = new Set(profiles.map(p => p.user_id))
    const availableUsers = users.filter(u => !profileUserIds.has(u.id))
    const fmt = (n: number | null) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/finance" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Employee Profiles</h1>
                        <p className="text-sm text-neutral-500 mt-1">Compensation settings per employee.</p>
                    </div>
                </div>
                <button onClick={openCreate} className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-neutral-800 transition">+ Add Profile</button>
            </div>

            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</div>}

            <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50/50 text-neutral-500 text-xs uppercase tracking-wider border-b border-neutral-200">
                        <tr>
                            <th className="px-6 py-4 text-left font-medium">Employee</th>
                            <th className="px-6 py-4 text-left font-medium">Type</th>
                            <th className="px-6 py-4 text-right font-medium">Base Amount</th>
                            <th className="px-6 py-4 text-center font-medium">Status</th>
                            <th className="px-6 py-4 text-center font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">Loading...</td></tr>
                        ) : profiles.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500 italic">No profiles yet.</td></tr>
                        ) : profiles.map(p => (
                            <tr key={p.id} className="hover:bg-neutral-50 transition">
                                <td className="px-6 py-4 font-semibold text-neutral-900">{p.user_name || p.user_email}</td>
                                <td className="px-6 py-4"><span className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium">{empTypes[p.employment_type] || p.employment_type}</span></td>
                                <td className="px-6 py-4 text-right font-semibold text-neutral-900">{fmt(p.base_amount)}</td>
                                <td className="px-6 py-4 text-center">
                                    {p.is_active ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold">Active</span>
                                        : <span className="text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-xs font-semibold">Inactive</span>}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => openEdit(p)} className="text-neutral-600 hover:text-neutral-900 text-xs font-semibold uppercase tracking-wider transition">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">{editProfile ? 'Edit Profile' : 'Add Profile'}</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            {!editProfile && (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Employee *</label>
                                    <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
                                        <option value="">Select employee…</option>
                                        {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Employment Type *</label>
                                <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white" value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                                    <option value="salaried">Salaried</option>
                                    <option value="stipend">Stipend</option>
                                    <option value="salaried_plus_variable">Salaried + Variable</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Base Amount (₹/month)</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                                    <CurrencyInput
                                        className="w-full p-2.5 pl-7 border border-neutral-300 rounded-lg text-sm"
                                        value={form.base_amount}
                                        onChange={val => setForm({ ...form, base_amount: val })}
                                        placeholder="25000"
                                    />
                                </div>
                            </div>
                            {editProfile && (
                                <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer bg-neutral-50 border border-neutral-200 p-3 rounded-lg">
                                    <input type="checkbox" className="accent-neutral-900 w-4 h-4" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                                    <span className="font-medium">Profile is Active</span>
                                </label>
                            )}
                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving || (!editProfile && !form.user_id)} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                                    {saving ? 'Saving...' : editProfile ? 'Save Changes' : 'Create Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
