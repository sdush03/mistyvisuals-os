'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Role = {
  id: number
  key: string
  label: string
}

type AdminUser = {
  id: number
  name?: string | null
  email?: string | null
  phone?: string | null
  nickname?: string | null
  job_title?: string | null
  is_active?: boolean | null
  is_login_enabled?: boolean | null
  force_password_reset?: boolean | null
  created_at?: string | null
  roles?: string[]
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  const [showDisabled, setShowDisabled] = useState(false)
  const [crewFilter, setCrewFilter] = useState<'all' | 'crew' | 'non-crew'>('all')

  const roleMap = useMemo(() => new Map(roles.map(r => [r.key, r.label])), [roles])

  useEffect(() => {
    void loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [rolesRes, usersRes] = await Promise.all([
        apiFetch('/api/admin/roles'),
        apiFetch('/api/admin/users'),
      ])
      const rolesData = await rolesRes.json().catch(() => [])
      const usersData = await usersRes.json().catch(() => [])
      setRoles(Array.isArray(rolesData) ? rolesData : [])
      setUsers(Array.isArray(usersData) ? usersData : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const visibleUsers = useMemo(() => {
    return users.filter(user => {
      const isCrew = Array.isArray(user.roles) && user.roles.includes('crew')
      if (crewFilter === 'crew' && !isCrew) return false
      if (crewFilter === 'non-crew' && isCrew) return false
      return showDisabled ? user.is_active === false : user.is_active !== false
    })
  }, [users, showDisabled, crewFilter])

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Users</h1>
        <p className="text-sm text-neutral-600 mt-1">Create users and manage identity and access.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500">Loading users…</div>}

      {!loading && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-[var(--border)] bg-white text-xs font-medium text-neutral-600">
              {[
                { key: 'all', label: 'All' },
                { key: 'crew', label: 'Crew' },
                { key: 'non-crew', label: 'Non-crew' },
              ].map(option => (
                <button
                  key={option.key}
                  className={`rounded-full px-3 py-1.5 transition ${crewFilter === option.key
                    ? 'bg-neutral-900 text-white'
                    : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  onClick={() => setCrewFilter(option.key as typeof crewFilter)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className={buttonPrimary} onClick={() => router.push('/admin/users/new')}>
              Add New User
            </button>
          </div>

          <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold">
                 Users Directory
              </div>
              <div className="flex items-center gap-2 p-1 bg-[var(--surface-muted)] border border-[var(--border)] rounded-full shadow-sm">
                 <button onClick={() => setShowDisabled(false)} className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${!showDisabled ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}>Active Users</button>
                 <button onClick={() => setShowDisabled(true)} className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${showDisabled ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'}`}>Archived</button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-neutral-500">
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Phone</th>
                    <th className="pb-3">Login Enabled</th>
                    <th className="pb-3">Roles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {visibleUsers.map(user => (
                    <tr
                      key={user.id}
                      className="cursor-pointer hover:bg-[var(--surface-muted)]"
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                    >
                      <td className="py-3 font-medium">
                        {user.name || '—'}
                        {user.is_active === false && (
                          <span className="ml-2 rounded text-[9px] uppercase tracking-widest font-bold bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-neutral-500">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="py-3">{user.email || '—'}</td>
                      <td className="py-3">{user.phone || '—'}</td>
                      <td className="py-3">
                        {user.is_login_enabled === false ? 'Disabled' : 'Enabled'}
                      </td>
                      <td className="py-3">
                        {user.roles && user.roles.length
                          ? user.roles.map(role => roleMap.get(role) || role).join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
