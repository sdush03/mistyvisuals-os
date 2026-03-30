'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Role = {
  id: number
  key: string
  label: string
}

type OperationalRole = {
  id: number
  category: string
  name: string
  active: boolean
}

type AdminUser = {
  id: number
  name?: string | null
  email?: string | null
  phone?: string | null
  nickname?: string | null
  job_title?: string | null
  profile_photo?: string | null
  crew_type?: string | null
  operational_role_id?: number | null
  is_login_enabled?: boolean | null
  is_active?: boolean | null
  force_password_reset?: boolean | null
  created_at?: string | null
  roles?: string[]
}

export default function AdminUserDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const userId = params?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [operationalRoles, setOperationalRoles] = useState<OperationalRole[]>([])
  const [draft, setDraft] = useState({
    name: '',
    email: '',
    phone: '',
    nickname: '',
    job_title: '',
    profile_photo: '',
    operational_role_id: '',
  })
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [isActive, setIsActive] = useState(true)
  const [isLoginEnabled, setIsLoginEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; roles?: string; crew_type?: string; operational_role_id?: string }>({})
  const [shake, setShake] = useState(false)

  const roleMap = useMemo(() => new Map(roles.map(r => [r.key, r.label])), [roles])

  useEffect(() => {
    if (!userId) return
    void loadUser()
  }, [userId])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => setCurrentUserEmail(String(data?.user?.email || '').trim().toLowerCase()))
      .catch(() => setCurrentUserEmail(''))
  }, [])

  const loadUser = async () => {
    setLoading(true)
    setError('')
    try {
      const [roleRes, opsRes, userRes] = await Promise.all([
        apiFetch('/api/admin/roles'),
        apiFetch('/api/operational-roles'),
        apiFetch(`/api/admin/users/${userId}`),
      ])
      const roleData = await roleRes.json().catch(() => [])
      const opsData = await opsRes.json().catch(() => [])
      if (!userRes.ok) {
        const err = await userRes.json().catch(() => ({}))
        setError(err?.error || 'Unable to load user')
        setLoading(false)
        return
      }
      const userData = await userRes.json().catch(() => null)
      setRoles(Array.isArray(roleData) ? roleData : [])
      setOperationalRoles(Array.isArray(opsData) ? opsData : [])
      setUser(userData)
      setDraft({
        name: userData?.name || '',
        email: userData?.email || '',
        phone: userData?.phone || '',
        nickname: userData?.nickname || '',
        job_title: userData?.job_title || '',
        profile_photo: userData?.profile_photo || '',
        operational_role_id: userData?.operational_role_id ? String(userData.operational_role_id) : '',
      })
      setSelectedRoles(userData?.roles || [])
      setIsActive(userData?.is_active !== false)
      setIsLoginEnabled(userData?.is_login_enabled !== false)
    } catch (err: any) {
      setError(err?.message || 'Unable to load user')
    } finally {
      setLoading(false)
    }
  }

  const toggleRole = (key: string) => {
    setSelectedRoles(prev => (prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key]))
    if (fieldErrors.roles) {
      setFieldErrors(prev => ({ ...prev, roles: undefined }))
    }
  }

  const saveChanges = async () => {
    if (!userId) return
    setSaving(true)
    setError('')
    const nextErrors: { name?: string; phone?: string; roles?: string; operational_role_id?: string } = {}
    if (!draft.name.trim()) nextErrors.name = 'Name is required'
    const compactPhone = draft.phone.trim().replace(/[\s\-().]/g, '')
    const phoneValid = /^\d{10}$/.test(compactPhone) || /^\+91\d{10}$/.test(compactPhone)
    if (!phoneValid) nextErrors.phone = 'Phone must be 10 digits or +91XXXXXXXXXX'
    if (!selectedRoles.length) nextErrors.roles = 'At least one role is required'
    if (selectedRoles.includes('crew') && !draft.operational_role_id) {
      nextErrors.operational_role_id = 'Operational role is required'
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      setError('Please fix the highlighted fields.')
      setShake(true)
      setTimeout(() => setShake(false), 350)
      setSaving(false)
      return
    }
    setFieldErrors({})
    const res = await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: draft.name,
        email: draft.email || null,
        phone: draft.phone || null,
        nickname: draft.nickname || null,
        job_title: draft.job_title || null,
        profile_photo: draft.profile_photo || null,
        operational_role_id: selectedRoles.includes('crew') ? Number(draft.operational_role_id) : null,
        is_login_enabled: selectedRoles.includes('crew') ? Boolean(isLoginEnabled) : true,
        roles: selectedRoles,
        is_active: isActive,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Unable to update user')
      setSaving(false)
      return
    }
    const updated = await res.json().catch(() => null)
    setUser(updated)
    setIsLoginEnabled(updated?.is_login_enabled !== false)
    setSaving(false)
    setIsEditing(false)
  }

  const toggleActive = async () => {
    if (!userId) return
    setError('')
    const res = await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !isActive }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Unable to update user status')
      return
    }
    const updated = await res.json().catch(() => null)
    setUser(updated)
    setIsActive(updated?.is_active !== false)
  }

  const toggleLoginEnabled = async () => {
    if (!userId) return
    setError('')
    const res = await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_login_enabled: !isLoginEnabled }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Unable to update login access')
      return
    }
    const updated = await res.json().catch(() => null)
    setUser(updated)
    setIsLoginEnabled(updated?.is_login_enabled !== false)
  }

  const resetPassword = async () => {
    if (!userId) return
    setError('')
    const res = await apiFetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Unable to reset password')
      return
    }
    setUser(prev => (prev ? { ...prev, force_password_reset: true } : prev))
  }

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading user…</div>
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <button className={buttonOutline} onClick={() => router.push('/admin/users')}>
          Back
        </button>
        <div className="text-sm text-neutral-500">{error || 'User not found.'}</div>
      </div>
    )
  }

  const protectedEmail = 'dushyant@mistyvisuals.com'
  const targetEmail = String(user?.email || '').trim().toLowerCase()
  const canEditProfile = targetEmail !== protectedEmail || currentUserEmail === protectedEmail

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <button className={buttonOutline} onClick={() => router.push('/admin/users')}>
          Back to Users
        </button>
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2">User Detail</h1>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Profile</div>
          {canEditProfile && (
            <button className={buttonOutline} onClick={() => setIsEditing(v => !v)}>
              {isEditing ? 'Cancel Edit' : 'Edit'}
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-neutral-700">
          <div>
            <div className="text-xs text-neutral-500">Name</div>
            {isEditing ? (
              <input
                className={`${inputClass} ${fieldErrors.name ? 'field-error' : ''} ${fieldErrors.name && shake ? 'shake' : ''}`}
                placeholder="Name *"
                value={draft.name}
                onChange={e => {
                  setDraft(prev => ({ ...prev, name: e.target.value }))
                  if (fieldErrors.name && e.target.value.trim()) {
                    setFieldErrors(prev => ({ ...prev, name: undefined }))
                  }
                }}
              />
            ) : (
              <div className="font-medium">{user.name || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-neutral-500">Email</div>
            {isEditing ? (
              <input
                className={inputClass}
                placeholder="Email"
                value={draft.email}
                onChange={e => setDraft(prev => ({ ...prev, email: e.target.value }))}
              />
            ) : (
              <div className="font-medium">{user.email || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-neutral-500">Phone</div>
            {isEditing ? (
              <input
                className={`${inputClass} ${fieldErrors.phone ? 'field-error' : ''} ${fieldErrors.phone && shake ? 'shake' : ''}`}
                placeholder="Phone"
                value={draft.phone}
                onChange={e => {
                  setDraft(prev => ({ ...prev, phone: e.target.value }))
                  if (fieldErrors.phone && e.target.value.trim()) {
                    setFieldErrors(prev => ({ ...prev, phone: undefined }))
                  }
                }}
              />
            ) : (
              <div className="font-medium">{user.phone || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-neutral-500">Nickname</div>
            {isEditing ? (
              <input
                className={inputClass}
                placeholder="Nickname"
                value={draft.nickname}
                onChange={e => setDraft(prev => ({ ...prev, nickname: e.target.value }))}
              />
            ) : (
              <div className="font-medium">{user.nickname || '—'}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-neutral-500">Job title</div>
            {isEditing ? (
              <input
                className={inputClass}
                placeholder="Job title"
                value={draft.job_title}
                onChange={e => setDraft(prev => ({ ...prev, job_title: e.target.value }))}
              />
            ) : (
              <div className="font-medium">{user.job_title || '—'}</div>
            )}
          </div>
          {selectedRoles.includes('crew') && (
            <div>
              <div className="text-xs text-neutral-500">Operational role</div>
              {isEditing ? (
                <select
                  className={`${inputClass} ${fieldErrors.operational_role_id ? 'field-error' : ''} ${fieldErrors.operational_role_id && shake ? 'shake' : ''}`}
                  value={draft.operational_role_id}
                  onChange={e => {
                    setDraft(prev => ({ ...prev, operational_role_id: e.target.value }))
                    if (fieldErrors.operational_role_id && e.target.value.trim()) {
                      setFieldErrors(prev => ({ ...prev, operational_role_id: undefined }))
                    }
                  }}
                >
                  <option value="">Select operational role</option>
                  {operationalRoles.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.category} — {option.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="font-medium">
                  {operationalRoles.find(role => role.id === user.operational_role_id)?.name || '—'}
                </div>
              )}
            </div>
          )}
          <div className={isEditing ? 'md:col-span-3' : ''}>
            <div className="text-xs text-neutral-500">Roles</div>
            {isEditing ? (
              <div className={`mt-2 grid gap-2 md:grid-cols-3 ${fieldErrors.roles ? 'field-error' : ''} ${fieldErrors.roles && shake ? 'shake' : ''}`}>
                {roles.map(role => (
                  <label key={role.key} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.key)}
                      onChange={() => toggleRole(role.key)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            ) : (
              <div className="font-medium">
                {selectedRoles.length ? selectedRoles.map(r => roleMap.get(r) || r).join(', ') : '—'}
              </div>
            )}
          </div>
          {selectedRoles.includes('crew') && (
            <div>
              <div className="text-xs text-neutral-500">Login access</div>
              <div className="font-medium">{isLoginEnabled ? 'Enabled' : 'Disabled'}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-neutral-500">Status</div>
            <div className="font-medium">{user.is_active === false ? 'Disabled' : 'Active'}</div>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="text-lg font-semibold">Actions</div>
        <div className="mt-4 flex flex-wrap gap-3">
          {isEditing && (
            <button className={buttonPrimary} disabled={saving} onClick={() => void saveChanges()}>
              Save Changes
            </button>
          )}
          {canEditProfile && (
            <button className={buttonOutline} onClick={() => void toggleActive()}>
              {isActive ? 'Disable User' : 'Enable User'}
            </button>
          )}
          {canEditProfile && selectedRoles.includes('crew') && (
            <button className={buttonOutline} onClick={() => void toggleLoginEnabled()}>
              {isLoginEnabled ? 'Disable Login' : 'Enable Login'}
            </button>
          )}
          {canEditProfile && (
            <button className={buttonOutline} onClick={() => void resetPassword()}>
              Reset Password
            </button>
          )}
        </div>
        {user.force_password_reset && (
          <div className="mt-3 text-xs text-amber-700">
            User must reset password on next login.
          </div>
        )}
      </section>
    </div>
  )
}
