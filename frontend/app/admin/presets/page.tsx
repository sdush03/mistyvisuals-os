'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
type PresetType = 'TEAM' | 'DELIVERABLE'

type PresetItem = {
  catalogId: number
  label: string
  quantity: number
  unitPrice: number
  category?: string
}

type Preset = {
  id: number
  name: string
  type: PresetType
  items: PresetItem[]
  active: boolean
  createdAt?: string
}

type CatalogItem = {
  id: number
  name: string
  price: number
  unitType: string
  active: boolean
  category?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const cardClass = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'
const apiFetch = (url: RequestInfo, init: RequestInit = {}) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QuotePresetsPage() {
  const [activeTab, setActiveTab] = useState<PresetType>('TEAM')
  const [presets, setPresets] = useState<Preset[]>([])
  const [teamCatalog, setTeamCatalog] = useState<CatalogItem[]>([])
  const [delCatalog, setDelCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editPreset, setEditPreset] = useState<Preset | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<PresetType>('TEAM')
  const [formItems, setFormItems] = useState<PresetItem[]>([])
  const [saving, setSaving] = useState(false)

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [pRes, tRes, dRes] = await Promise.all([
          apiFetch('/api/catalog/presets'),
          apiFetch('/api/catalog/team-roles'),
          apiFetch('/api/catalog/deliverables'),
        ])
        const [pData, tData, dData] = await Promise.all([
          pRes.json().catch(() => []),
          tRes.json().catch(() => []),
          dRes.json().catch(() => []),
        ])
        setPresets(Array.isArray(pData) ? pData : [])
        setTeamCatalog(Array.isArray(tData) ? tData.filter((i: CatalogItem) => i.active) : [])
        setDelCatalog(Array.isArray(dData) ? dData.filter((i: CatalogItem) => i.active && i.category !== 'ADDON') : [])
      } catch {
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredPresets = useMemo(() => presets.filter(p => p.type === activeTab), [presets, activeTab])
  const catalog = formType === 'TEAM' ? teamCatalog : delCatalog

  // ── Open modal ───────────────────────────────────────────────────────────────
  const openCreate = (type: PresetType) => {
    setEditPreset(null)
    setFormName('')
    setFormType(type)
    setFormItems([])
    setModalOpen(true)
    setError(null)
  }

  const openEdit = (preset: Preset) => {
    setEditPreset(preset)
    setFormName(preset.name)
    setFormType(preset.type)
    setFormItems(preset.items.map(i => ({ ...i })))
    setModalOpen(true)
    setError(null)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditPreset(null)
  }

  // ── Item management ──────────────────────────────────────────────────────────
  const addItem = () => {
    const first = catalog[0]
    if (!first) return
    setFormItems(prev => [...prev, { catalogId: first.id, label: first.name, quantity: 1, unitPrice: first.price, category: first.category }])
  }

  const updateItem = (idx: number, catalogId: number) => {
    const match = catalog.find(c => c.id === catalogId)
    if (!match) return
    setFormItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, catalogId: match.id, label: match.name, unitPrice: match.price, category: match.category } : it
    ))
  }

  const updateQty = (idx: number, qty: number) => {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, qty) } : it))
  }

  const removeItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formName.trim()) { setError('Name is required'); return }
    if (formItems.length === 0) { setError('Add at least one item'); return }

    setSaving(true)
    setError(null)
    try {
      const payload = { name: formName.trim(), type: formType, items: formItems }
      const url = editPreset ? `/api/catalog/presets/${editPreset.id}` : '/api/catalog/presets'
      const method = editPreset ? 'PATCH' : 'POST'
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to save')

      setPresets(prev =>
        editPreset
          ? prev.map(p => p.id === data.id ? data : p)
          : [data, ...prev]
      )
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (preset: Preset) => {
    if (!window.confirm(`Delete preset "${preset.name}"?`)) return
    try {
      const res = await apiFetch(`/api/catalog/presets/${preset.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setPresets(prev => prev.filter(p => p.id !== preset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">Admin · Config</div>
            <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Quick Add Presets</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Define reusable team bundles and deliverable packages. Apply them in one click inside the Quote Builder.
            </p>
          </div>
          <Link href="/admin/pricing" className="text-sm font-medium text-neutral-500 hover:text-neutral-800 transition">
            ← Pricing Catalog
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex w-fit items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 shadow-sm">
            {(['TEAM', 'DELIVERABLE'] as PresetType[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${activeTab === t ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'}`}
              >
                {t === 'TEAM' ? 'Team Bundles' : 'Deliverable Packages'}
              </button>
            ))}
          </div>
          <button
            onClick={() => openCreate(activeTab)}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 transition"
          >
            + New Preset
          </button>
        </div>

        {error && !modalOpen && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Presets list */}
        <div className="space-y-3">
          {loading ? (
            <div className={`${cardClass} px-6 py-8 text-center text-sm text-neutral-400`}>Loading presets…</div>
          ) : filteredPresets.length === 0 ? (
            <div className={`${cardClass} px-6 py-12 text-center`}>
              <div className="text-3xl mb-3">{activeTab === 'TEAM' ? '👥' : '📦'}</div>
              <div className="text-sm text-neutral-500">No presets yet. Create one to speed up quote building.</div>
            </div>
          ) : (
            filteredPresets.map(preset => (
              <div key={preset.id} className={`${cardClass} p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-neutral-900">{preset.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {preset.items.map((item, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                          <span className="font-bold text-neutral-900">{item.quantity}×</span> {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(preset)}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(preset)}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  {formType === 'TEAM' ? 'Team Bundle' : 'Deliverable Package'}
                </div>
                <h2 className="mt-1 text-xl font-semibold text-neutral-900">
                  {editPreset ? 'Edit Preset' : 'New Preset'}
                </h2>
              </div>
              <button onClick={closeModal} className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600">
                Close
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}

            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-neutral-600">Preset Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. 2+2, Std Wedding, Roka Package"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
                />
              </div>

              {/* Type (only for new presets) */}
              {!editPreset && (
                <div>
                  <label className="text-xs font-semibold text-neutral-600">Type</label>
                  <div className="mt-2 flex gap-2">
                    {(['TEAM', 'DELIVERABLE'] as PresetType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => { setFormType(t); setFormItems([]) }}
                        className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${formType === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                      >
                        {t === 'TEAM' ? '👥 Team Bundle' : '📦 Deliverables'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-neutral-600">Items in this preset</label>
                  <button
                    onClick={addItem}
                    disabled={catalog.length === 0}
                    className="text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-lg px-3 py-1 hover:bg-neutral-50 transition disabled:opacity-40"
                  >
                    + Add Item
                  </button>
                </div>

                {formItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
                    No items yet. Click "+ Add Item" to start.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        {/* Catalog picker */}
                        <select
                          value={item.catalogId}
                          onChange={e => updateItem(idx, Number(e.target.value))}
                          className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                        >
                          {catalog.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {/* Quantity */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQty(idx, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg border border-neutral-200 bg-white text-neutral-700 font-bold hover:bg-neutral-100 transition text-sm"
                          >−</button>
                          <span className="w-6 text-center text-sm font-semibold text-neutral-900">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(idx, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg border border-neutral-200 bg-white text-neutral-700 font-bold hover:bg-neutral-100 transition text-sm"
                          >+</button>
                        </div>
                        {/* Remove */}
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-7 h-7 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition text-sm font-bold"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : editPreset ? 'Save Changes' : 'Create Preset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
