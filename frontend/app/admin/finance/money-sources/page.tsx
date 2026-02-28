'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type MoneySource = {
  id: number
  name: string
  type?: 'GST' | 'NON_GST' | 'CASH' | 'PERSONAL' | string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

const TYPE_OPTIONS = [
  { value: 'GST', label: 'GST' },
  { value: 'NON_GST', label: 'Non-GST' },
  { value: 'CASH', label: 'Cash' },
  { value: 'PERSONAL', label: 'Personal' },
]

const formatTypeLabel = (value?: string) => {
  const match = TYPE_OPTIONS.find(option => option.value === value)
  if (match) return match.label
  if (!value) return '—'
  return value
}

export default function MoneySourcesPage() {
  const [sources, setSources] = useState<MoneySource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('NON_GST')
  const [saving, setSaving] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingType, setEditingType] = useState('NON_GST')
  const [editingActive, setEditingActive] = useState(true)

  useEffect(() => {
    void loadSources()
  }, [])

  const loadSources = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/finance/money-sources')
      const data = await res.json().catch(() => [])
      setSources(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load money sources')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch('/api/finance/money-sources', {
        method: 'POST',
        body: JSON.stringify({ name, type: newType, is_active: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Unable to add source')
        return
      }
      setSources(prev => [...prev, data])
      setNewName('')
      setNewType('NON_GST')
      setIsAdding(false)
    } catch (err: any) {
      setError(err?.message || 'Unable to add source')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelAdd = () => {
    setIsAdding(false)
    setNewName('')
    setNewType('NON_GST')
    setError('')
  }

  const startEdit = (source: MoneySource) => {
    setEditingId(source.id)
    setEditingName(source.name)
    setEditingType(source.type || 'NON_GST')
    setEditingActive(source.is_active !== false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingType('NON_GST')
    setEditingActive(true)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/money-sources/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, type: editingType, is_active: editingActive }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Unable to update source')
        return
      }
      setSources(prev => prev.map(item => (item.id === editingId ? data : item)))
      cancelEdit()
    } catch (err: any) {
      setError(err?.message || 'Unable to update source')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Money Sources</h1>
        <p className="text-sm text-neutral-600 mt-1">Add or rename where money comes from or goes to.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className={buttonOutline} href="/admin/finance">Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/unsettled">Unsettled Transactions</Link>
        <Link className={buttonPrimary} href="/admin/finance/money-sources">Money Sources</Link>
        <Link className={buttonOutline} href="/admin/finance/categories">Categories</Link>
        <Link className={buttonOutline} href="/admin/finance/cashflow">Cashflow</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between mb-4">
          <div className="text-lg font-semibold">Sources</div>
          {!isAdding && (
            <button className={buttonPrimary} onClick={() => setIsAdding(true)}>
              Add Source
            </button>
          )}
        </div>

        {isAdding && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 mb-4">
            <input
              className={fieldClass}
              placeholder="Add new money source"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <select
              className={fieldClass}
              value={newType}
              onChange={e => setNewType(e.target.value)}
            >
              {TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button className={buttonPrimary} onClick={handleAdd} disabled={saving}>
                Save
              </button>
              <button className={buttonOutline} onClick={handleCancelAdd} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>Loading sources…</td>
                </tr>
              )}
              {!loading && sources.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>No money sources yet.</td>
                </tr>
              )}
              {!loading && sources.map(source => (
                <tr key={source.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3">
                    {editingId === source.id ? (
                      <input
                        className={fieldClass}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                      />
                    ) : (
                      source.name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === source.id ? (
                      <select
                        className={fieldClass}
                        value={editingType}
                        onChange={e => setEditingType(e.target.value)}
                      >
                        {TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      formatTypeLabel(source.type)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === source.id ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingActive}
                          onChange={e => setEditingActive(e.target.checked)}
                        />
                        Active
                      </label>
                    ) : (
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${source.is_active === false ? 'bg-neutral-200 text-neutral-600' : 'bg-emerald-100 text-emerald-700'}`}>
                        {source.is_active === false ? 'Disabled' : 'Active'}
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    {editingId === source.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button className={buttonPrimary} onClick={saveEdit} disabled={saving}>
                          Save
                        </button>
                        <button className={buttonOutline} onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className={buttonOutline} onClick={() => startEdit(source)}>
                        Rename
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
