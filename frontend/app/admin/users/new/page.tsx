'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

function AdminNewUserPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [operationalRoles, setOperationalRoles] = useState<OperationalRole[]>([])
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; roles?: string; operational_role_id?: string }>({})
  const [shake, setShake] = useState(false)
  const [loginTouched, setLoginTouched] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    nickname: '',
    job_title: '',
    roles: [] as string[],
    operational_role_id: '',
    is_login_enabled: true,
  })

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/roles'),
      apiFetch('/api/operational-roles'),
    ])
      .then(async ([rolesRes, opsRes]) => {
        const rolesData = await rolesRes.json().catch(() => [])
        const opsData = await opsRes.json().catch(() => [])
        setRoles(Array.isArray(rolesData) ? rolesData : [])
        setOperationalRoles(Array.isArray(opsData) ? opsData : [])
      })
      .catch(() => {
        setRoles([])
        setOperationalRoles([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const defaultRole = searchParams?.get('role')
    if (defaultRole === 'crew') {
      setForm(prev => ({
        ...prev,
        roles: prev.roles.includes('crew') ? prev.roles : [...prev.roles, 'crew'],
        is_login_enabled: false,
      }))
      setLoginTouched(true)
    }
  }, [searchParams])

  const toggleRole = (key: string) => {
    setForm(prev => {
      const hasRole = prev.roles.includes(key)
      const nextRoles = hasRole ? prev.roles.filter(r => r !== key) : [...prev.roles, key]
      const next = { ...prev, roles: nextRoles }
      if (!hasRole && key === 'crew' && !loginTouched) {
        next.is_login_enabled = false
      }
      if (hasRole && key === 'crew') {
        next.operational_role_id = ''
      }
      return next
    })
    if (fieldErrors.roles) {
      setFieldErrors(prev => ({ ...prev, roles: undefined }))
    }
  }

  const submit = async () => {
    setError('')
    const nextErrors: { name?: string; phone?: string; roles?: string; operational_role_id?: string } = {}
    if (!form.name.trim()) nextErrors.name = 'Name is required'
    const compactPhone = form.phone.trim().replace(/[\s\-().]/g, '')
    const phoneValid = /^\d{10}$/.test(compactPhone) || /^\+91\d{10}$/.test(compactPhone)
    if (!phoneValid) nextErrors.phone = 'Phone must be 10 digits or +91XXXXXXXXXX'
    if (!form.roles.length) nextErrors.roles = 'At least one role is required'
    if (form.roles.includes('crew') && !form.operational_role_id) {
      nextErrors.operational_role_id = 'Operational role is required'
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      setError('Please fix the highlighted fields.')
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }
    setFieldErrors({})

    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim(),
        nickname: form.nickname.trim() || null,
        job_title: form.job_title.trim() || null,
        roles: form.roles,
        operational_role_id: form.roles.includes('crew') ? Number(form.operational_role_id) : null,
        is_login_enabled: form.roles.includes('crew') ? Boolean(form.is_login_enabled) : true,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Unable to create user')
      return
    }
    const created = await res.json().catch(() => null)
    if (created?.id) {
      router.push(`/admin/users/${created.id}`)
      return
    }
    router.push('/admin/users')
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <button className={buttonOutline} onClick={() => router.push('/admin/users')}>
          Back to Users
        </button>
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2">Add New User</h1>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        {loading ? (
          <div className="text-sm text-neutral-500">Loading roles…</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className={`${inputClass} ${fieldErrors.name ? 'field-error' : ''} ${fieldErrors.name && shake ? 'shake' : ''}`}
                placeholder="Name *"
                value={form.name}
                onChange={e => {
                  setForm(prev => ({ ...prev, name: e.target.value }))
                  if (fieldErrors.name && e.target.value.trim()) {
                    setFieldErrors(prev => ({ ...prev, name: undefined }))
                  }
                }}
              />
              <input
                className={inputClass}
                placeholder="Email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              />
              <input
                className={`${inputClass} ${fieldErrors.phone ? 'field-error' : ''} ${fieldErrors.phone && shake ? 'shake' : ''}`}
                placeholder="Phone *"
                value={form.phone}
                onChange={e => {
                  setForm(prev => ({ ...prev, phone: e.target.value }))
                  if (fieldErrors.phone && e.target.value.trim()) {
                    setFieldErrors(prev => ({ ...prev, phone: undefined }))
                  }
                }}
              />
              <input
                className={inputClass}
                placeholder="Nickname"
                value={form.nickname}
                onChange={e => setForm(prev => ({ ...prev, nickname: e.target.value }))}
              />
              <input
                className={inputClass}
                placeholder="Job title"
                value={form.job_title}
                onChange={e => setForm(prev => ({ ...prev, job_title: e.target.value }))}
              />
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">Roles</div>
              <div className={`mt-2 grid gap-2 md:grid-cols-3 ${fieldErrors.roles ? 'field-error' : ''} ${fieldErrors.roles && shake ? 'shake' : ''}`}>
                {roles.map(role => (
                  <label key={role.key} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(role.key)}
                      onChange={() => toggleRole(role.key)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>

            {form.roles.includes('crew') && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">Operational Role</div>
                  <select
                    className={`${inputClass} mt-2 ${fieldErrors.operational_role_id ? 'field-error' : ''} ${fieldErrors.operational_role_id && shake ? 'shake' : ''}`}
                    value={form.operational_role_id}
                    onChange={e => {
                      setForm(prev => ({ ...prev, operational_role_id: e.target.value }))
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
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">Login Access</div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={form.is_login_enabled}
                      onChange={e => {
                        setForm(prev => ({ ...prev, is_login_enabled: e.target.checked }))
                        setLoginTouched(true)
                      }}
                    />
                    Enable login for this crew member
                  </label>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button className={buttonPrimary} onClick={() => void submit()}>
                Create User
              </button>
              <button className={buttonOutline} onClick={() => router.push('/admin/users')}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default function AdminNewUserPage() {
  return (
    <Suspense fallback={<div className="text-sm text-neutral-500">Loading…</div>}>
      <AdminNewUserPageInner />
    </Suspense>
  )
}
