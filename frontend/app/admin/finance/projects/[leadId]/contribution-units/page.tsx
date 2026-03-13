'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/formatters'

const sectionCard = 'bg-white border border-[var(--border)] rounded-xl shadow-sm overflow-hidden'
const sectionHeader = 'px-6 py-3 bg-neutral-50 border-b border-[var(--border)]'
const sectionTitle = 'text-xs font-semibold text-neutral-700 uppercase tracking-widest'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type CuEntry = {
  id: number
  user_id: number
  lead_id: number
  category: 'sales' | 'planning' | 'execution' | 'post_production'
  month: string
  notes?: string | null
  created_at: string
  user_name?: string | null
  lead_name?: string | null
}

type CuUser = {
  user_id: number
  user_name: string
  employment_type: string
}

export default function ContributionUnitsPage() {
  const params = useParams()
  const leadId = params?.leadId

  const [cuUsers, setCuUsers] = useState<CuUser[]>([])
  const [cuEntries, setCuEntries] = useState<CuEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)

  const [cuUserId, setCuUserId] = useState('')
  const [cuCategory, setCuCategory] = useState<CuEntry['category']>('sales')
  const [cuMonth, setCuMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [cuNotes, setCuNotes] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const loadCuUsers = async () => {
    setError('')
    try {
      const res = await apiFetch('/api/payroll/profiles')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load employees')
      const allowed = ['salaried', 'stipend', 'salaried_plus_variable']
      const mapped = (Array.isArray(json) ? json : [])
        .filter((row: any) => row?.is_active && allowed.includes(row?.employment_type))
        .map((row: any) => ({
          user_id: row.user_id,
          user_name: row.user_name || row.name || `User ${row.user_id}`,
          employment_type: row.employment_type
        }))
      setCuUsers(mapped)
    } catch (err: any) {
      setError(err?.message || 'Failed to load employees')
    }
  }

  const loadCuEntries = async () => {
    if (!leadId) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('lead_id', String(leadId))
      if (filterMonth) params.set('month', `${filterMonth}-01`)
      const res = await apiFetch(`/api/contribution-units?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load contribution units')
      setCuEntries(Array.isArray(json) ? json : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load contribution units')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCuUsers()
  }, [])

  useEffect(() => {
    void loadCuEntries()
  }, [leadId, filterMonth])

  const groupedEntries = useMemo(() => {
    const groups: Record<string, { label: string; entries: CuEntry[]; total: number; categoryCounts: Record<string, number> }> = {}
    cuEntries.forEach(entry => {
      const monthLabel = formatDate(entry.month)
      const userLabel = entry.user_name || `User ${entry.user_id}`
      const key = `${userLabel}__${entry.month}`
      if (!groups[key]) {
        groups[key] = { label: `${userLabel} · ${monthLabel}`, entries: [], total: 0, categoryCounts: {} }
      }
      groups[key].entries.push(entry)
      groups[key].total += 1
      groups[key].categoryCounts[entry.category] = (groups[key].categoryCounts[entry.category] || 0) + 1
    })
    return Object.values(groups).sort((a, b) => (a.label < b.label ? 1 : -1))
  }, [cuEntries])

  const totalCuCount = useMemo(() => cuEntries.length, [cuEntries])

  const handleAddCu = async () => {
    if (!leadId) return
    setError('')
    setWarning('')
    if (!cuUserId) return setError('Select an employee')
    if (!cuCategory) return setError('Select a category')
    if (!cuMonth) return setError('Select a month')

    setSaving(true)
    try {
      const res = await apiFetch('/api/contribution-units', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(cuUserId),
          lead_id: Number(leadId),
          category: cuCategory,
          month: `${cuMonth}-01`,
          notes: cuNotes || null
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to log contribution unit')
      if (json.warning) setWarning(json.warning)
      setCuNotes('')
      await loadCuEntries()
    } catch (err: any) {
      setError(err?.message || 'Failed to log contribution unit')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCu = async (entry: CuEntry) => {
    const reason = window.prompt('Why are you deleting this CU?')
    if (!reason || !reason.trim()) return
    setError('')
    setWarning('')
    try {
      const res = await apiFetch(`/api/contribution-units/${entry.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ delete_reason: reason.trim() })
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Failed to delete contribution unit')
      await loadCuEntries()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete contribution unit')
    }
  }

  return (
    <div className="pb-28 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/finance/projects/${leadId}/pnl`}
            className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Project</div>
            <h1 className="text-2xl font-semibold text-neutral-900">Contribution Units</h1>
            <div className="text-sm text-neutral-500 mt-1">Lead #{leadId}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Filter Month</div>
            <input
              type="month"
              className="rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
            />
          </div>
          {filterMonth && (
            <button
              onClick={() => setFilterMonth('')}
              className="border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)] transition rounded"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Log Contribution Unit</h2>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="text-xs text-neutral-500">Log one unit per meaningful work session.</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Employee</div>
              <select
                className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={cuUserId}
                onChange={e => setCuUserId(e.target.value)}
              >
                <option value="">Select employee</option>
                {cuUsers.map(user => (
                  <option key={user.user_id} value={user.user_id}>{user.user_name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Category</div>
              <select
                className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={cuCategory}
                onChange={e => setCuCategory(e.target.value as CuEntry['category'])}
              >
                <option value="sales">Sales</option>
                <option value="planning">Planning</option>
                <option value="execution">Execution</option>
                <option value="post_production">Post Production</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Month</div>
              <input
                type="month"
                className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={cuMonth}
                onChange={e => setCuMonth(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Notes (optional)</div>
              <input
                type="text"
                className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={cuNotes}
                onChange={e => setCuNotes(e.target.value)}
                placeholder="Context for this work session"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAddCu}
              disabled={saving}
              className="bg-neutral-900 text-white px-4 py-2 text-sm font-medium rounded hover:bg-neutral-800 transition"
            >
              {saving ? 'Saving...' : '+1 CU'}
            </button>
            {warning && <div className="text-xs text-amber-600">{warning}</div>}
            {error && <div className="text-xs text-rose-600">{error}</div>}
          </div>
        </div>
      </section>

      <section className={sectionCard}>
        <div className={sectionHeader}>
          <h2 className={sectionTitle}>Logged Units</h2>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="text-xs text-neutral-500">Total units: {totalCuCount}</div>
          {loading && <div className="text-neutral-500">Loading contribution units...</div>}
          {!loading && groupedEntries.length === 0 && (
            <div className="text-neutral-500">No contribution units logged for this lead.</div>
          )}
          <div className="space-y-4">
            {groupedEntries.map(group => (
              <div key={group.label} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-neutral-50 text-xs font-semibold text-neutral-600 flex flex-wrap items-center gap-3">
                  <span>{group.label}</span>
                  <span className="text-neutral-400">•</span>
                  <span>Total: {group.total}</span>
                  {Object.entries(group.categoryCounts).map(([cat, count]) => (
                    <span key={cat} className="text-neutral-500">
                      {cat.replace('_', ' ')}: {count}
                    </span>
                  ))}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-neutral-500 uppercase tracking-wider bg-white border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left px-4 py-2">Category</th>
                      <th className="text-left px-4 py-2">Notes</th>
                      <th className="text-left px-4 py-2">Logged At</th>
                      <th className="text-right px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(entry => (
                      <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-2 capitalize">{entry.category.replace('_', ' ')}</td>
                        <td className="px-4 py-2 text-neutral-600">{entry.notes || '—'}</td>
                        <td className="px-4 py-2 text-neutral-500">{formatDate(entry.created_at)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleDeleteCu(entry)}
                            className="text-xs text-rose-600 hover:text-rose-700"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
