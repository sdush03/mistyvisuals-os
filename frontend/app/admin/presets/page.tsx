'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  deliveryPhase?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const cardClass = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'
const apiFetch = (url: RequestInfo, init: RequestInit = {}) =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

const DragHandle = () => (
  <div className="flex items-center text-neutral-300 hover:text-neutral-400 shrink-0 cursor-grab">
    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
      <circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="10" r="1.5"/><circle cx="4" cy="16" r="1.5"/>
      <circle cx="8" cy="4" r="1.5"/><circle cx="8" cy="10" r="1.5"/><circle cx="8" cy="16" r="1.5"/>
    </svg>
  </div>
)

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

  // Multi-select panel state
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelSelected, setPanelSelected] = useState<Set<number>>(new Set())
  const [panelPos, setPanelPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  // Drag-to-reorder state
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

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

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
        setPanelSelected(new Set())
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  const filteredPresets = useMemo(() => presets.filter(p => p.type === activeTab), [presets, activeTab])
  const catalog = formType === 'TEAM' ? teamCatalog : delCatalog
  const usedCatalogIds = useMemo(() => new Set(formItems.map(i => i.catalogId)), [formItems])

  // ── Open modal ───────────────────────────────────────────────────────────────
  const openCreate = (type: PresetType) => {
    setEditPreset(null)
    setFormName('')
    setFormType(type)
    setFormItems([])
    setModalOpen(true)
    setError(null)
    setPanelOpen(false)
  }

  const openEdit = (preset: Preset) => {
    setEditPreset(preset)
    setFormName(preset.name)
    setFormType(preset.type)
    setFormItems(preset.items.map(i => ({ ...i })))
    setModalOpen(true)
    setError(null)
    setPanelOpen(false)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditPreset(null)
    setPanelOpen(false)
  }

  // ── Multi-select panel ───────────────────────────────────────────────────────
  const openPanel = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setPanelPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setPanelSelected(new Set())
    setPanelOpen(true)
  }

  const toggleSelect = (catalogId: number) => {
    if (usedCatalogIds.has(catalogId)) return
    setPanelSelected(prev => {
      const next = new Set(prev)
      if (next.has(catalogId)) next.delete(catalogId)
      else next.add(catalogId)
      return next
    })
  }

  const confirmAdd = () => {
    const newItems: PresetItem[] = catalog
      .filter(c => panelSelected.has(c.id))
      .map(c => ({ catalogId: c.id, label: c.name, quantity: 1, unitPrice: c.price, category: c.category }))
    setFormItems(prev => [...prev, ...newItems])
    setPanelOpen(false)
    setPanelSelected(new Set())
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────────
  const handleDragEnd = () => {
    const from = dragItem.current
    const to = dragOver.current
    if (from === null || to === null || from === to) return
    setFormItems(prev => {
      const updated = [...prev]
      updated.splice(to, 0, updated.splice(from, 1)[0])
      return updated
    })
    dragItem.current = null
    dragOver.current = null
  }

  // ── Item qty ─────────────────────────────────────────────────────────────────
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
        editPreset ? prev.map(p => p.id === data.id ? data : p) : [data, ...prev]
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

  // ── Multi-select panel content ────────────────────────────────────────────────
  const renderPanel = () => {
    if (!panelOpen || typeof window === 'undefined') return null
    const isDeliverable = formType === 'DELIVERABLE'

    return createPortal(
      <div
        ref={panelRef}
        style={{ position: 'fixed', top: panelPos.top, right: panelPos.right, zIndex: 9999 }}
        className="w-80 bg-white border border-neutral-200 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-neutral-100 text-[10px] uppercase tracking-widest font-bold text-neutral-400">
          Select {isDeliverable ? 'Deliverables' : 'Team Roles'}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {catalog.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-neutral-400">No items in catalog</div>
          ) : isDeliverable ? (
            // Grouped by phase → category
            ['PRE_WEDDING', 'WEDDING'].map(phase => {
              const phaseItems = catalog.filter(c => (c.deliveryPhase || 'WEDDING') === phase)
              if (phaseItems.length === 0) return null
              const phaseLabel = phase === 'PRE_WEDDING' ? '💍 Pre-Wedding' : '💒 Wedding'
              return (
                <div key={phase}>
                  <div className="px-3 py-1.5 bg-neutral-50 text-[10px] uppercase tracking-widest font-bold text-neutral-500 border-b border-neutral-100">{phaseLabel}</div>
                  {['PHOTO', 'VIDEO', 'OTHER'].map(cat => {
                    const catItems = phaseItems.filter(c => (c.category || 'OTHER') === cat)
                    if (catItems.length === 0) return null
                    const catLabel = cat === 'PHOTO' ? '📸 Photography' : cat === 'VIDEO' ? '🎥 Cinematography' : '📦 Other'
                    return (
                      <div key={cat}>
                        <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">{catLabel}</div>
                        {catItems.map(c => {
                          const isUsed = usedCatalogIds.has(c.id)
                          const isSelected = panelSelected.has(c.id)
                          return (
                            <button
                              key={c.id}
                              disabled={isUsed}
                              onClick={() => toggleSelect(c.id)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition text-left ${isUsed ? 'opacity-40 cursor-not-allowed bg-neutral-50' : isSelected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50 text-neutral-800'}`}
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[9px] font-bold ${isUsed ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : isSelected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300 text-transparent'}`}>✓</span>
                              <span className="flex-1 font-medium">{c.name}</span>
                              {isUsed && <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Added</span>}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })
          ) : (
            // Flat team list
            catalog.map(c => {
              const isUsed = usedCatalogIds.has(c.id)
              const isSelected = panelSelected.has(c.id)
              return (
                <button
                  key={c.id}
                  disabled={isUsed}
                  onClick={() => toggleSelect(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition text-left ${isUsed ? 'opacity-40 cursor-not-allowed bg-neutral-50' : isSelected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50 text-neutral-800'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[9px] font-bold ${isUsed ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : isSelected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300 text-transparent'}`}>✓</span>
                  <span className="flex-1 font-medium">{c.name}</span>
                  {isUsed && <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Added</span>}
                </button>
              )
            })
          )}
        </div>
        <div className="px-3 py-2.5 border-t border-neutral-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-neutral-400">{panelSelected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => { setPanelOpen(false); setPanelSelected(new Set()) }} className="px-3 py-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition">Cancel</button>
            <button onClick={confirmAdd} disabled={panelSelected.size === 0} className="px-3 py-1.5 text-xs font-bold bg-neutral-900 text-white rounded-lg disabled:opacity-40 hover:bg-neutral-800 transition">Add Selected</button>
          </div>
        </div>
      </div>,
      document.body
    )
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
                        onClick={() => { setFormType(t); setFormItems([]); setPanelOpen(false) }}
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
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-neutral-600">Items in this preset</label>
                  {/* Multi-select Add Item button */}
                  <div className="relative">
                    <button
                      onClick={(ev) => panelOpen ? (setPanelOpen(false)) : openPanel(ev.currentTarget)}
                      disabled={catalog.length === 0}
                      className="text-xs font-semibold text-neutral-700 border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition disabled:opacity-40 flex items-center gap-1.5"
                    >
                      + Add Item
                      <svg className={`w-3 h-3 transition-transform ${panelOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {formItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
                    No items yet. Click &quot;+ Add Item&quot; to start building.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formItems.map((item, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => { dragItem.current = idx }}
                        onDragEnter={() => { dragOver.current = idx }}
                        onDragEnd={handleDragEnd}
                        onDragOver={(ev) => ev.preventDefault()}
                        className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 p-3 cursor-grab active:cursor-grabbing active:opacity-60 transition-all"
                      >
                        {/* Drag handle */}
                        <DragHandle />

                        {/* Label (read-only) */}
                        <div className="flex-1 text-sm font-medium text-neutral-800 select-none">
                          {item.label}
                          {item.category && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                              {item.category === 'PHOTO' ? 'Photo' : item.category === 'VIDEO' ? 'Video' : item.category}
                            </span>
                          )}
                        </div>

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

      {/* Portal panel — rendered outside modal stacking context */}
      {renderPanel()}
    </div>
  )
}
