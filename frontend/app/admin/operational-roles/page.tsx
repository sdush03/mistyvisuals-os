'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

const cardClass = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

type OperationalRole = {
  id: number
  category: string
  name: string
  active: boolean
  createdAt?: string
}

type ModalState = {
  open: boolean
  mode: 'create' | 'edit'
  item: OperationalRole | null
}

export default function OperationalRolesPage() {
  const [roles, setRoles] = useState<OperationalRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'create', item: null })
  const [formState, setFormState] = useState({ category: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  const loadRoles = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/operational-roles')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to load roles')
      setRoles(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])

  const openModal = (mode: 'create' | 'edit', item?: OperationalRole) => {
    setModal({ open: true, mode, item: item ?? null })
    if (mode === 'edit' && item) {
      setFormState({ category: item.category || '', name: item.name || '' })
    } else {
      setFormState({ category: '', name: '' })
    }
  }

  const handleToggleActive = async (item: OperationalRole, nextActive: boolean) => {
    const action = nextActive ? 'Restore' : 'Delete'
    const confirmed = window.confirm(`${action} "${item.name}"?`)
    if (!confirmed) return
    setError(null)
    try {
      const res = await apiFetch(`/api/operational-roles/${item.id}`, { 
        method: 'PATCH',
        body: JSON.stringify({ active: nextActive })
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Failed to ${action}`)
      setRoles(prev => prev.map(role => role.id === item.id ? data : role))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`)
    }
  }

  const closeModal = () => {
    if (saving) return
    setModal({ open: false, mode: 'create', item: null })
  }

  const handleSave = async () => {
    if (!formState.category.trim()) {
      setError('Category is required')
      return
    }
    if (!formState.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = modal.mode === 'edit' && modal.item ? `/api/operational-roles/${modal.item.id}` : '/api/operational-roles'
      const method = modal.mode === 'edit' ? 'PATCH' : 'POST'
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          category: formState.category.trim(),
          name: formState.name.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to save')
      if (modal.mode === 'edit') {
        setRoles(prev => prev.map(role => (role.id === data.id ? data : role)))
      } else {
        setRoles(prev => [data, ...prev])
      }
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const groupedRoles = useMemo(() => {
    const map = new Map<string, OperationalRole[]>()
    const filteredRoles = roles.filter(role => activeTab === 'active' ? role.active : !role.active)
    
    filteredRoles.forEach(role => {
      const key = role.category || 'Other'
      const list = map.get(key) || []
      list.push(role)
      map.set(key, list)
    })
    return Array.from(map.entries())
  }, [roles, activeTab])

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">Admin</div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Operational Roles</h1>
          <p className="mt-1 text-sm text-neutral-600">Define global crew roles used across quotes and planning.</p>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 p-1 bg-white border border-neutral-200 rounded-full shadow-sm">
             <button onClick={() => setActiveTab('active')} className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${activeTab === 'active' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}>
                Active Roles
             </button>
             <button onClick={() => setActiveTab('archived')} className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${activeTab === 'archived' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}>
                Archived
             </button>
          </div>
          {activeTab === 'active' && (
             <button
               type="button"
               onClick={() => openModal('create')}
               className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 transition"
             >
               + Add Role
             </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Category</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                      Loading roles...
                    </td>
                  </tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                      No operational roles yet.
                    </td>
                  </tr>
                ) : (
                  groupedRoles.map(([category, items]) => (
                    <Fragment key={category}>
                      {items.map((role, index) => (
                        <tr key={role.id} className="bg-white">
                          <td className="px-4 py-3 font-medium text-neutral-900">
                            {index === 0 ? category : ''}
                          </td>
                          <td className="px-4 py-3 text-neutral-700">{role.name}</td>
                          <td className="px-4 py-3 text-right">
                             <div className="inline-flex items-center gap-2">
                               {activeTab === 'active' ? (
                                  <>
                                     <button type="button" onClick={() => openModal('edit', role)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Edit</button>
                                     <button type="button" onClick={() => handleToggleActive(role, false)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">Delete</button>
                                  </>
                               ) : (
                                  <button type="button" onClick={() => handleToggleActive(role, true)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition">Restore</button>
                               )}
                             </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">Operational Role</div>
                <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                  {modal.mode === 'create' ? 'Add' : 'Edit'} Role
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-600">Category</label>
                <input
                  type="text"
                  value={formState.category}
                  onChange={(event) => setFormState(prev => ({ ...prev, category: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-600">Role name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => setFormState(prev => ({ ...prev, name: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm"
                />
              </div>
              </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
