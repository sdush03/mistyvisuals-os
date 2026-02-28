'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const buttonPrimary = 'bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800 transition rounded-lg inline-flex items-center gap-2'
const buttonOutline = 'bg-white text-neutral-700 border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-muted)] transition rounded-lg inline-flex items-center gap-2'

export default function VendorsPage() {
    const [vendors, setVendors] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [showAddModal, setShowAddModal] = useState(false)
    const [newVendor, setNewVendor] = useState({ name: '', vendor_type: 'freelancer', email: '', phone: '', notes: '' })
    const [saving, setSaving] = useState(false)

    const [editVendor, setEditVendor] = useState<any>(null)

    const loadVendors = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/finance/vendors', { credentials: 'include' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to fetch vendors')
            setVendors(Array.isArray(data) ? data : [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadUsers = async () => {
        try {
            const res = await fetch('/api/users', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && Array.isArray(data)) setUsers(data)
        } catch (_) { /* ignore */ }
    }

    useEffect(() => {
        loadVendors()
        loadUsers()
    }, [])

    const getUserName = (userId: number | null) => {
        if (!userId) return null
        const u = users.find(u => u.id === userId)
        return u ? u.name || u.email : `User #${userId}`
    }

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError('')
        try {
            const res = await fetch('/api/finance/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newVendor)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to add vendor')

            setShowAddModal(false)
            setNewVendor({ name: '', vendor_type: 'freelancer', email: '', phone: '', notes: '' })
            loadVendors()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editVendor) return
        setSaving(true)
        setError('')
        try {
            const res = await fetch(`/api/finance/vendors/${editVendor.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: editVendor.name,
                    vendor_type: editVendor.vendor_type,
                    email: editVendor.email,
                    phone: editVendor.phone,
                    notes: editVendor.notes,
                    is_active: editVendor.is_active,
                    user_id: editVendor.user_id || null,
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to update vendor')

            setEditVendor(null)
            loadVendors()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-32">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/finance" className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Vendors</h1>
                        <div className="text-sm text-neutral-500 mt-1">Manage external contractors, agencies, and service providers.</div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button className={buttonPrimary} onClick={() => setShowAddModal(true)}>
                        + Add Vendor
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
                                <th className="px-6 py-4 text-left font-medium">Name</th>
                                <th className="px-6 py-4 text-left font-medium">Type</th>
                                <th className="px-6 py-4 text-left font-medium">Linked User</th>
                                <th className="px-6 py-4 text-left font-medium">Contact</th>
                                <th className="px-6 py-4 text-left font-medium">Status</th>
                                <th className="px-6 py-4 text-center font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500">Loading vendors...</td></tr>
                            ) : vendors.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500 italic">No vendors found. Add one to get started.</td></tr>
                            ) : (
                                vendors.map(v => (
                                    <tr key={v.id} className="hover:bg-[var(--surface-muted)] transition">
                                        <td className="px-6 py-4 font-semibold text-neutral-900">{v.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium">
                                                {v.vendor_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {v.user_id ? (
                                                <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs font-semibold">
                                                    {getUserName(v.user_id)}
                                                </span>
                                            ) : (
                                                <span className="text-neutral-400 text-xs italic">Not linked</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-neutral-800">{v.email || '—'}</div>
                                            <div className="text-xs text-neutral-500 mt-0.5">{v.phone || '—'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {v.is_active ? (
                                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">Active</span>
                                            ) : (
                                                <span className="text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">Inactive</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                className="text-neutral-600 hover:text-neutral-900 text-xs font-semibold uppercase tracking-wider transition"
                                                onClick={() => setEditVendor({ ...v })}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ADD VENDOR MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Add New Vendor</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowAddModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Name *</label>
                                <input required autoFocus type="text" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} placeholder="e.g. John Doe Studios" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Type *</label>
                                <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={newVendor.vendor_type} onChange={e => setNewVendor({ ...newVendor, vendor_type: e.target.value })}>
                                    <option value="freelancer">Freelancer</option>
                                    <option value="service">Service Agency</option>
                                    <option value="employee">Internal Employee (Reimbursement)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Email</label>
                                    <input type="email" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={newVendor.email} onChange={e => setNewVendor({ ...newVendor, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Phone</label>
                                    <input type="tel" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={newVendor.phone} onChange={e => setNewVendor({ ...newVendor, phone: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Internal Notes</label>
                                <textarea rows={3} className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition resize-none" value={newVendor.notes} onChange={e => setNewVendor({ ...newVendor, notes: e.target.value })} placeholder="Account numbers, special conditions..."></textarea>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" disabled={saving || !newVendor.name} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                                    {saving ? 'Saving...' : 'Add Vendor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT VENDOR MODAL */}
            {editVendor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-neutral-900">Edit Vendor</h3>
                            <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setEditVendor(null)}>✕</button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Name *</label>
                                <input required autoFocus type="text" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={editVendor.name} onChange={e => setEditVendor({ ...editVendor, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Type *</label>
                                <select required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={editVendor.vendor_type} onChange={e => setEditVendor({ ...editVendor, vendor_type: e.target.value })}>
                                    <option value="freelancer">Freelancer</option>
                                    <option value="service">Service Agency</option>
                                    <option value="employee">Internal Employee (Reimbursement)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Email</label>
                                    <input type="email" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={editVendor.email || ''} onChange={e => setEditVendor({ ...editVendor, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Phone</label>
                                    <input type="tel" className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition" value={editVendor.phone || ''} onChange={e => setEditVendor({ ...editVendor, phone: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Internal Notes</label>
                                <textarea rows={3} className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition resize-none" value={editVendor.notes || ''} onChange={e => setEditVendor({ ...editVendor, notes: e.target.value })}></textarea>
                            </div>

                            {/* LINK USER */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Link to User Account</label>
                                <select className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition bg-white" value={editVendor.user_id || ''} onChange={e => setEditVendor({ ...editVendor, user_id: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">— Not linked —</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name || u.email} (ID: {u.id})</option>
                                    ))}
                                </select>
                                <div className="text-xs text-neutral-400 mt-1">Linking allows this vendor to use the Vendor Portal to view their payments.</div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer bg-neutral-50 border border-neutral-200 p-3 rounded-lg">
                                    <input type="checkbox" className="accent-neutral-900 w-4 h-4" checked={editVendor.is_active} onChange={e => setEditVendor({ ...editVendor, is_active: e.target.checked })} />
                                    <span className="font-medium">Vendor is Active</span>
                                </label>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setEditVendor(null)}>Cancel</button>
                                <button type="submit" disabled={saving || !editVendor.name} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
