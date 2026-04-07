'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type AdminUser = {
  id: number
  name?: string | null
  phone?: string | null
  operational_role_id?: number | null
  is_login_enabled?: boolean | null
  is_active?: boolean | null
  roles?: string[]
}

type OperationalRole = {
  id: number
  category: string
  name: string
  active: boolean
}

export default function CrewAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [operationalRoles, setOperationalRoles] = useState<OperationalRole[]>([])

  useEffect(() => {
    void loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiFetch('/api/admin/users'),
        apiFetch('/api/operational-roles'),
      ])
      const data = await usersRes.json().catch(() => [])
      const roleData = await rolesRes.json().catch(() => [])
      if (!usersRes.ok) {
        setError(data?.error || 'Failed to load crew')
        setLoading(false)
        return
      }
      setUsers(Array.isArray(data) ? data : [])
      setOperationalRoles(Array.isArray(roleData) ? roleData : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load crew')
    } finally {
      setLoading(false)
    }
  }

  const crewUsers = useMemo(() => {
    return users.filter(user => Array.isArray(user.roles) && user.roles.includes('crew'))
  }, [users])

  const roleMap = useMemo(() => new Map(operationalRoles.map(role => [role.id, role.name])), [operationalRoles])

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Crew</h1>
        <p className="text-sm text-neutral-600 mt-1">Manage crew specialization and login access.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500">Loading crew…</div>}

      {!loading && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Crew Members</div>
            <button className={buttonPrimary} onClick={() => router.push('/admin/users/new?role=crew')}>
              Add Crew Member
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-neutral-500">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Crew Type</th>
                  <th className="pb-3">Login Enabled</th>
                  <th className="pb-3">Active</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {crewUsers.map(user => (
                  <tr key={user.id} className="hover:bg-[var(--surface-muted)]">
                    <td className="py-3 font-medium">{user.name || '—'}</td>
                    <td className="py-3">{user.phone || '—'}</td>
                    <td className="py-3">{roleMap.get(user.operational_role_id ?? -1) || '—'}</td>
                    <td className="py-3">{user.is_login_enabled === false ? 'Disabled' : 'Enabled'}</td>
                    <td className="py-3">{user.is_active === false ? 'Disabled' : 'Active'}</td>
                    <td className="py-3 text-right">
                      <button
                        className={buttonOutline}
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {!crewUsers.length && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-neutral-500">
                      No crew members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
