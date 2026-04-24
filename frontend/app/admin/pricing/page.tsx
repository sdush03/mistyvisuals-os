'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import CurrencyInput from '@/components/CurrencyInput'

const unitTypes = ['PER_DAY', 'PER_UNIT', 'FLAT'] as const

type UnitType = (typeof unitTypes)[number]

type CatalogItem = {
  id: number
  name: string
  price: number
  unitType: UnitType
  active: boolean
  createdAt?: string
  category?: 'PHOTO' | 'VIDEO' | 'OTHER' | 'ADDON'
  description?: string | null
  deliveryTimeline?: string | null
  _type?: 'team' | 'deliverable'
}

type ModalState = {
  open: boolean
  type: 'team' | 'deliverable'
  mode: 'create' | 'edit'
  item: CatalogItem | null
}

const cardClass = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'

const formatMoney = (value: number | string) =>
  `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`

export default function PricingCatalogPage() {
  const [activeTab, setActiveTab] = useState<'team' | 'deliverable' | 'addon' | 'archived'>('team')
  const [teamRoles, setTeamRoles] = useState<CatalogItem[]>([])
  const [deliverables, setDeliverables] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({
    open: false,
    type: 'team',
    mode: 'create',
    item: null,
  })
  const [formState, setFormState] = useState({
    name: '',
    price: '',
    unitType: 'PER_DAY' as UnitType,
    active: true,
    category: 'OTHER',
    description: '',
    deliveryTimeline: '',
  })
  const [saving, setSaving] = useState(false)

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, {
      credentials: 'include',
      ...(init.body ? { headers: { 'Content-Type': 'application/json' } } : {}),
      ...init,
    })

  const loadCatalogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const [teamRes, delRes] = await Promise.all([
        apiFetch('/api/catalog/team-roles'),
        apiFetch('/api/catalog/deliverables'),
      ])
      const teamData = await teamRes.json().catch(() => [])
      const delData = await delRes.json().catch(() => [])
      if (!teamRes.ok || !delRes.ok) {
        throw new Error('Failed to load catalogs')
      }
      setTeamRoles(Array.isArray(teamData) ? teamData : [])
      setDeliverables(Array.isArray(delData) ? delData : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalogs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalogs()
  }, [])

  const activeItems = useMemo(() => {
    if (activeTab === 'team') {
      return teamRoles.filter(role => role.active);
    }
    if (activeTab === 'archived') {
      return [
        ...teamRoles.filter(r => !r.active).map(r => ({ ...r, _type: 'team' as const })),
        ...deliverables.filter(d => !d.active).map(d => ({ ...d, _type: 'deliverable' as const }))
      ];
    }
    if (activeTab === 'addon') {
      return deliverables.filter(d => d.active && d.category === 'ADDON');
    }
    return deliverables.filter((item) => item.active && item.category !== 'ADDON');
  }, [activeTab, teamRoles, deliverables])

  const openModal = (type: 'team' | 'deliverable', mode: 'create' | 'edit', item?: CatalogItem) => {
    setModal({ open: true, type, mode, item: item ?? null })
    if (mode === 'edit' && item) {
      setFormState({
        name: item.name || '',
        price: String(item.price ?? ''),
        unitType: item.unitType || 'PER_DAY',
        active: item.active ?? true,
        category: item.category || 'OTHER',
        description: item.description || '',
        deliveryTimeline: item.deliveryTimeline || '',
      })
    } else {
      setFormState({ name: '', price: '', unitType: 'PER_DAY', active: true, category: 'OTHER', description: '', deliveryTimeline: '' })
    }
  }

  const closeModal = () => {
    if (saving) return
    setModal({ open: false, type: 'team', mode: 'create', item: null })
  }

  const handleSave = async () => {
    if (modal.type !== 'team' && !formState.name.trim()) {
      setError('Name is required')
      return
    }
    if (!formState.price || Number(formState.price) <= 0) {
      setError('Price must be greater than 0')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      ...(modal.type === 'team' ? {} : { name: formState.name.trim(), category: formState.category, description: (formState.description || '').trim() || null, deliveryTimeline: (formState.deliveryTimeline || '').trim() || null }),
      price: Number(formState.price),
      unitType: formState.unitType,
      active: formState.active,
    }
    try {
      const isTeam = modal.type === 'team'
      const baseUrl = isTeam ? '/api/catalog/team-roles' : '/api/catalog/deliverables'
      const url = modal.mode === 'edit' && modal.item ? `${baseUrl}/${modal.item.id}` : baseUrl
      const method = modal.mode === 'edit' ? 'PATCH' : 'POST'
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save')
      }
      if (isTeam) {
        setTeamRoles((prev) => {
          if (modal.mode === 'edit') {
            return prev.map((item) => (item.id === data.id ? data : item))
          }
          return [data, ...prev]
        })
      } else {
        setDeliverables((prev) => {
          if (modal.mode === 'edit') {
            return prev.map((item) => (item.id === data.id ? data : item))
          }
          return [data, ...prev]
        })
      }
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (type: 'team' | 'deliverable', item: CatalogItem, nextActive: boolean) => {
    const action = nextActive ? 'Restore' : 'Delete'
    const confirmed = window.confirm(`${action} "${item.name}"?`)
    if (!confirmed) return
    setError(null)
    try {
      const baseUrl = type === 'team' ? '/api/catalog/team-roles' : '/api/catalog/deliverables'
      if (nextActive) {
        // Restore: PATCH active=true
        const res = await apiFetch(`${baseUrl}/${item.id}`, { 
          method: 'PATCH',
          body: JSON.stringify({ active: true })
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Failed to restore')
        if (type === 'team') {
          setTeamRoles((prev) => prev.map((row) => row.id === item.id ? data : row))
        } else {
          setDeliverables((prev) => prev.map((row) => row.id === item.id ? data : row))
        }
      } else {
        // Delete: smart DELETE
        const res = await apiFetch(`${baseUrl}/${item.id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Failed to delete')
        if (data?.action === 'archived') {
          // Was referenced — archived instead of deleted
          alert(`"${item.name}" is used in existing quotes and was archived instead of permanently deleted.`)
          if (type === 'team') {
            setTeamRoles((prev) => prev.map((row) => row.id === item.id ? data.item : row))
          } else {
            setDeliverables((prev) => prev.map((row) => row.id === item.id ? data.item : row))
          }
        } else {
          // Permanently deleted — remove from list
          if (type === 'team') {
            setTeamRoles((prev) => prev.filter((row) => row.id !== item.id))
          } else {
            setDeliverables((prev) => prev.filter((row) => row.id !== item.id))
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">Admin</div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Pricing Catalog</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Manage pricing used by the quotation engine for team roles and deliverables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 p-1 bg-white border border-neutral-200 rounded-full shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'team'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Team Roles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deliverable')}
              className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'deliverable'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Deliverables
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addon')}
              className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'addon'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Add-ons
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'archived'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Archived
            </button>
          </div>
          
          <div className="flex-1" />
          {(activeTab === 'deliverable' || activeTab === 'addon') && (
            <button
              type="button"
              onClick={() => openModal(activeTab === 'addon' ? 'deliverable' : activeTab, 'create')}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 transition"
            >
              + Add {activeTab === 'addon' ? 'Add-on' : 'Deliverable'}
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
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Price</th>
                  {activeTab === 'deliverable' && <th className="px-4 py-3 text-left font-semibold">Unit Type</th>}
                  {activeTab === 'deliverable' && <th className="px-4 py-3 text-left font-semibold">Timeline</th>}
                  {activeTab === 'archived' && <th className="px-4 py-3 text-left font-semibold">Type</th>}
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                      Loading catalog...
                    </td>
                  </tr>
                ) : activeItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  activeTab === 'deliverable' ? (
                     ['PHOTO', 'VIDEO', 'OTHER'].map(cat => {
                        const items = activeItems.filter(i => (i.category || 'OTHER') === cat)
                        if (items.length === 0) return null
                        const catLabel = cat === 'PHOTO' ? '📸 Photography' : cat === 'VIDEO' ? '🎥 Cinematography' : '📦 Other Deliverables'
                        return (
                           <Fragment key={cat}>
                              <tr className="bg-neutral-50 border-y border-neutral-200">
                                 <td colSpan={6} className="px-4 py-2 font-bold text-neutral-800 text-xs tracking-wider uppercase">{catLabel}</td>
                              </tr>
                              {items.map(item => (
                                <tr key={item.id} className="bg-white hover:bg-neutral-50 transition">
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-neutral-900">{item.name}</div>
                                    {item.description && <div className="text-[11px] text-neutral-500 mt-0.5">{item.description}</div>}
                                  </td>
                                  <td className="px-4 py-3 text-neutral-700">{formatMoney(item.price)}</td>
                                  <td className="px-4 py-3 text-neutral-700">{item.unitType}</td>
                                  <td className="px-4 py-3 text-neutral-700">{item.deliveryTimeline || '-'}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="inline-flex items-center gap-2">
                                      <button type="button" onClick={() => openModal('deliverable', 'edit', item)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Edit</button>
                                      <button type="button" onClick={() => handleToggleActive('deliverable', item, false)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600">Delete</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                           </Fragment>
                        )
                     })
                  ) : activeTab === 'addon' ? (
                      activeItems.map(item => (
                        <tr key={item.id} className="bg-white hover:bg-neutral-50 transition">
                          <td className="px-4 py-3">
                            <div className="font-medium text-neutral-900">{item.name}</div>
                            {item.description && <div className="text-[11px] text-neutral-500 mt-0.5">{item.description}</div>}
                          </td>
                          <td className="px-4 py-3 text-neutral-700">{formatMoney(item.price)}</td>
                          <td className="px-4 py-3 text-neutral-700">{item.unitType}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button type="button" onClick={() => openModal('deliverable', 'edit', item)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Edit</button>
                              <button type="button" onClick={() => handleToggleActive('deliverable', item, false)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                  ) : (
                     activeItems.map((item) => (
                       <tr key={item.id} className="bg-white hover:bg-neutral-50 transition">
                         <td className="px-4 py-3 font-medium text-neutral-900">{item.name}</td>
                         <td className="px-4 py-3 text-neutral-700">{formatMoney(item.price)}</td>
                         {activeTab === 'archived' && (
                           <td className="px-4 py-3 text-neutral-700 capitalize">
                             {item._type}
                           </td>
                         )}
                         <td className="px-4 py-3 text-right">
                           <div className="inline-flex items-center gap-2">
                             {activeTab === 'archived' ? (
                               <button type="button" onClick={() => handleToggleActive(item._type as any, item, true)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600">Restore</button>
                             ) : (
                               <>
                                 <button
                                   type="button"
                                   onClick={() => openModal(item._type || activeTab as any, 'edit', item)}
                                   className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700"
                                 >
                                   Edit
                                 </button>
                                 <button type="button" onClick={() => handleToggleActive(item._type || activeTab as any, item, false)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600">Delete</button>
                               </>
                             )}
                           </div>
                         </td>
                       </tr>
                     ))
                  )
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
                <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  {modal.type === 'team' ? 'Team Role' : 'Deliverable'}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                  {modal.mode === 'create' ? 'Add' : 'Edit'} {modal.type === 'team' ? 'Role' : 'Deliverable'}
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
              {modal.type !== 'team' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Name</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm"
                  />
                </div>
              )}
              {modal.type === 'team' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Role</label>
                  <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                    {modal.item?.name || 'Team role'}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Price</label>
                  <CurrencyInput
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm"
                    value={formState.price}
                    onChange={(val) => setFormState((prev) => ({ ...prev, price: val }))}
                    placeholder="0"
                  />
                </div>
                {modal.type === 'deliverable' && (
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Unit Type</label>
                    <select
                      value={formState.unitType}
                      onChange={(event) => setFormState((prev) => ({ ...prev, unitType: event.target.value as UnitType }))}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm"
                    >
                      {unitTypes.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {modal.type === 'deliverable' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-neutral-600">Category Tag</label>
                    <select
                      value={formState.category}
                      onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900"
                    >
                      <option value="PHOTO">📸 Photography</option>
                      <option value="VIDEO">🎥 Cinematography</option>
                      <option value="OTHER">📦 Other</option>
                      <option value="ADDON">💎 Add-on Feature</option>
                    </select>
                  </div>
                </div>
              )}
              {modal.type === 'deliverable' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Sub-Description (Optional)</label>
                  <textarea
                    value={formState.description}
                    onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900"
                    placeholder="Brief description for the StoryViewer proposal..."
                    rows={2}
                  />
                </div>
              )}
              {modal.type === 'deliverable' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Delivery Timeline (Optional)</label>
                  <input
                    type="text"
                    value={formState.deliveryTimeline}
                    onChange={(event) => setFormState((prev) => ({ ...prev, deliveryTimeline: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm focus:border-neutral-900"
                    placeholder="e.g. 2 weeks, 45-60 days..."
                  />
                </div>
              )}
              {modal.type === 'deliverable' && (

                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={formState.active}
                    onChange={(event) => setFormState((prev) => ({ ...prev, active: event.target.checked }))}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  Active
                </label>
              )}
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
