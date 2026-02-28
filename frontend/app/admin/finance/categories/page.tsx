'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Category = {
  id: number
  name: string
  created_at?: string
  updated_at?: string
}

export default function FinanceCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    void loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/finance/categories')
      const data = await res.json().catch(() => [])
      setCategories(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load categories')
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
      const res = await apiFetch('/api/finance/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Unable to add category')
        return
      }
      setCategories(prev => [...prev, data])
      setNewName('')
      setIsAdding(false)
    } catch (err: any) {
      setError(err?.message || 'Unable to add category')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelAdd = () => {
    setIsAdding(false)
    setNewName('')
    setError('')
  }

  const startEdit = (category: Category) => {
    setEditingId(category.id)
    setEditingName(category.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/categories/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Unable to update category')
        return
      }
      setCategories(prev => prev.map(item => (item.id === editingId ? data : item)))
      cancelEdit()
    } catch (err: any) {
      setError(err?.message || 'Unable to update category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Categories</h1>
        <p className="text-sm text-neutral-600 mt-1">Group transactions with simple labels.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link className={buttonOutline} href="/admin/finance">Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/unsettled">Unsettled Transactions</Link>
        <Link className={buttonOutline} href="/admin/finance/money-sources">Money Sources</Link>
        <Link className={buttonPrimary} href="/admin/finance/categories">Categories</Link>
        <Link className={buttonOutline} href="/admin/finance/cashflow">Cashflow</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between mb-4">
          <div className="text-lg font-semibold">Categories List</div>
          {!isAdding && (
            <button className={buttonPrimary} onClick={() => setIsAdding(true)}>
              Add Category
            </button>
          )}
        </div>

        {isAdding && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 mb-4">
            <input
              className={fieldClass}
              placeholder="Add new category"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
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
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={2}>Loading categories…</td>
                </tr>
              )}
              {!loading && categories.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={2}>No categories yet.</td>
                </tr>
              )}
              {!loading && categories.map(category => (
                <tr key={category.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3">
                    {editingId === category.id ? (
                      <input
                        className={fieldClass}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                      />
                    ) : (
                      category.name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === category.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button className={buttonPrimary} onClick={saveEdit} disabled={saving}>
                          Save
                        </button>
                        <button className={buttonOutline} onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className={buttonOutline} onClick={() => startEdit(category)}>
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
