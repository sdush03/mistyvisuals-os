'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CurrencyInput from '@/components/CurrencyInput'

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
}

type Vendor = {
  id: number
  name: string
  vendor_type: string
  user_id?: number | null
  is_active?: boolean
  email?: string | null
  phone?: string | null
  notes?: string | null
}

type PayrollProfile = {
  id: number
  user_id: number
  user_name?: string
  user_email?: string
  employment_type: string
  base_amount?: number | null
  is_active?: boolean
}

type Category = {
  id: number
  name: string
}

type User = {
  id: number
  name?: string | null
  email?: string | null
}

const TYPE_OPTIONS = [
  { value: 'GST', label: 'Firm (GST)' },
  { value: 'NON_GST', label: 'Firm (Non-GST)' },
  { value: 'CASH', label: 'Cash' },
  { value: 'PERSONAL', label: 'Personal' },
]

const formatSourceType = (value?: string) => {
  const match = TYPE_OPTIONS.find(option => option.value === value)
  if (match) return match.label
  if (!value) return '—'
  return value
}

const empTypes: Record<string, string> = {
  salaried: 'Salary',
  stipend: 'Stipend',
  salaried_plus_variable: 'Mixed',
}

export default function FinanceAccountsPage() {
  const [sources, setSources] = useState<MoneySource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourcesError, setSourcesError] = useState('')
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceType, setNewSourceType] = useState('NON_GST')
  const [sourceSaving, setSourceSaving] = useState(false)
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null)
  const [editingSourceName, setEditingSourceName] = useState('')
  const [editingSourceType, setEditingSourceType] = useState('NON_GST')
  const [editingSourceActive, setEditingSourceActive] = useState(true)

  const [profiles, setProfiles] = useState<PayrollProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [profilesError, setProfilesError] = useState('')
  const [profilesSaving, setProfilesSaving] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editProfile, setEditProfile] = useState<PayrollProfile | null>(null)
  const [profileForm, setProfileForm] = useState({ user_id: '', employment_type: 'salaried', base_amount: '', is_active: true })

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [vendorsError, setVendorsError] = useState('')
  const [vendorSaving, setVendorSaving] = useState(false)
  const [showVendorModal, setShowVendorModal] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [newVendor, setNewVendor] = useState({ name: '', vendor_type: 'freelancer', email: '', phone: '', notes: '' })

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    void loadSources()
    void loadProfiles()
    void loadVendors()
    void loadCategories()
    void loadUsers()
  }, [])

  const loadSources = async () => {
    setSourcesLoading(true)
    setSourcesError('')
    try {
      const res = await apiFetch('/api/finance/money-sources')
      const data = await res.json().catch(() => [])
      setSources(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setSourcesError(err?.message || 'Unable to load money sources')
    } finally {
      setSourcesLoading(false)
    }
  }

  const loadProfiles = async () => {
    setProfilesLoading(true)
    setProfilesError('')
    try {
      const res = await apiFetch('/api/payroll/profiles')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch profiles')
      setProfiles(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setProfilesError(err?.message || 'Unable to load employee profiles')
    } finally {
      setProfilesLoading(false)
    }
  }

  const loadVendors = async () => {
    setVendorsLoading(true)
    setVendorsError('')
    try {
      const res = await apiFetch('/api/finance/vendors')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch vendors')
      setVendors(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setVendorsError(err?.message || 'Unable to load vendors')
    } finally {
      setVendorsLoading(false)
    }
  }

  const loadCategories = async () => {
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const res = await apiFetch('/api/finance/categories')
      const data = await res.json().catch(() => [])
      setCategories(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setCategoriesError(err?.message || 'Unable to load categories')
    } finally {
      setCategoriesLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const res = await apiFetch('/api/users')
      const data = await res.json().catch(() => [])
      if (res.ok && Array.isArray(data)) setUsers(data)
    } catch (_) {
      // ignore
    }
  }

  const handleAddSource = async () => {
    const name = newSourceName.trim()
    if (!name) return
    setSourceSaving(true)
    setSourcesError('')
    try {
      const res = await apiFetch('/api/finance/money-sources', {
        method: 'POST',
        body: JSON.stringify({ name, type: newSourceType, is_active: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSourcesError(data?.error || 'Unable to add source')
        return
      }
      setSources(prev => [...prev, data])
      setNewSourceName('')
      setNewSourceType('NON_GST')
      setIsAddingSource(false)
    } catch (err: any) {
      setSourcesError(err?.message || 'Unable to add source')
    } finally {
      setSourceSaving(false)
    }
  }

  const handleCancelAddSource = () => {
    setIsAddingSource(false)
    setNewSourceName('')
    setNewSourceType('NON_GST')
    setSourcesError('')
  }

  const startEditSource = (source: MoneySource) => {
    setEditingSourceId(source.id)
    setEditingSourceName(source.name)
    setEditingSourceType(source.type || 'NON_GST')
    setEditingSourceActive(source.is_active !== false)
  }

  const cancelEditSource = () => {
    setEditingSourceId(null)
    setEditingSourceName('')
    setEditingSourceType('NON_GST')
    setEditingSourceActive(true)
  }

  const saveEditSource = async () => {
    if (!editingSourceId) return
    const name = editingSourceName.trim()
    if (!name) return
    setSourceSaving(true)
    setSourcesError('')
    try {
      const res = await apiFetch(`/api/finance/money-sources/${editingSourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, type: editingSourceType, is_active: editingSourceActive }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSourcesError(data?.error || 'Unable to update source')
        return
      }
      setSources(prev => prev.map(item => (item.id === editingSourceId ? data : item)))
      cancelEditSource()
    } catch (err: any) {
      setSourcesError(err?.message || 'Unable to update source')
    } finally {
      setSourceSaving(false)
    }
  }

  const openCreateProfile = () => {
    setEditProfile(null)
    setProfileForm({ user_id: '', employment_type: 'salaried', base_amount: '', is_active: true })
    setShowProfileModal(true)
  }

  const openEditProfile = (profile: PayrollProfile) => {
    setEditProfile(profile)
    setProfileForm({
      user_id: String(profile.user_id),
      employment_type: profile.employment_type,
      base_amount: profile.base_amount ? String(profile.base_amount) : '',
      is_active: profile.is_active !== false,
    })
    setShowProfileModal(true)
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfilesSaving(true)
    setProfilesError('')
    try {
      const url = editProfile ? `/api/payroll/profiles/${editProfile.id}` : '/api/payroll/profiles'
      const method = editProfile ? 'PATCH' : 'POST'
      const body: any = {
        employment_type: profileForm.employment_type,
        base_amount: profileForm.base_amount ? Number(profileForm.base_amount) : null,
      }
      if (!editProfile) body.user_id = Number(profileForm.user_id)
      if (editProfile) body.is_active = profileForm.is_active

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setProfilesError(data?.error || 'Failed to save profile')
        return
      }
      setShowProfileModal(false)
      void loadProfiles()
    } catch (err: any) {
      setProfilesError(err?.message || 'Failed to save profile')
    } finally {
      setProfilesSaving(false)
    }
  }

  const profileUserIds = useMemo(() => new Set(profiles.map(profile => profile.user_id)), [profiles])
  const availableUsers = useMemo(() => users.filter(user => !profileUserIds.has(user.id)), [users, profileUserIds])
  const formatBase = (value?: number | null) => value != null ? `₹${Number(value).toLocaleString('en-IN')}` : '—'

  const openCreateVendor = () => {
    setEditVendor(null)
    setNewVendor({ name: '', vendor_type: 'freelancer', email: '', phone: '', notes: '' })
    setShowVendorModal(true)
  }

  const openEditVendor = (vendor: Vendor) => {
    setEditVendor({ ...vendor })
    setShowVendorModal(true)
  }

  const getUserName = (userId?: number | null) => {
    if (!userId) return null
    const match = users.find(user => user.id === userId)
    return match ? match.name || match.email : `User #${userId}`
  }

  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setVendorSaving(true)
    setVendorsError('')
    try {
      if (editVendor) {
        const res = await apiFetch(`/api/finance/vendors/${editVendor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: editVendor.name,
            vendor_type: editVendor.vendor_type,
            email: editVendor.email,
            phone: editVendor.phone,
            notes: editVendor.notes,
            is_active: editVendor.is_active,
            user_id: editVendor.user_id || null,
          }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setVendorsError(data?.error || 'Failed to update vendor')
          return
        }
      } else {
        const res = await apiFetch('/api/finance/vendors', {
          method: 'POST',
          body: JSON.stringify(newVendor),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setVendorsError(data?.error || 'Failed to add vendor')
          return
        }
      }
      setShowVendorModal(false)
      void loadVendors()
    } catch (err: any) {
      setVendorsError(err?.message || 'Failed to save vendor')
    } finally {
      setVendorSaving(false)
    }
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCategorySaving(true)
    setCategoriesError('')
    try {
      const res = await apiFetch('/api/finance/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCategoriesError(data?.error || 'Unable to add category')
        return
      }
      setCategories(prev => [...prev, data])
      setNewCategoryName('')
      setIsAddingCategory(false)
    } catch (err: any) {
      setCategoriesError(err?.message || 'Unable to add category')
    } finally {
      setCategorySaving(false)
    }
  }

  const handleCancelCategory = () => {
    setIsAddingCategory(false)
    setNewCategoryName('')
    setCategoriesError('')
  }

  const startEditCategory = (category: Category) => {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  const cancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const saveEditCategory = async () => {
    if (!editingCategoryId) return
    const name = editingCategoryName.trim()
    if (!name) return
    setCategorySaving(true)
    setCategoriesError('')
    try {
      const res = await apiFetch(`/api/finance/categories/${editingCategoryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCategoriesError(data?.error || 'Unable to update category')
        return
      }
      setCategories(prev => prev.map(item => (item.id === editingCategoryId ? data : item)))
      cancelEditCategory()
    } catch (err: any) {
      setCategoriesError(err?.message || 'Unable to update category')
    } finally {
      setCategorySaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Accounts</h1>
        <p className="text-sm text-neutral-600 mt-1">Money sources, employee compensation profiles, and vendors in one place.</p>
      </div>

      <section className={cardClass}>
        <div className="text-sm font-semibold text-neutral-800">Quick Links</div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Link className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm font-medium text-neutral-800 hover:bg-[var(--surface-muted)]" href="/admin/finance/accounts#money-sources">
            Money Sources
          </Link>
          <Link className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm font-medium text-neutral-800 hover:bg-[var(--surface-muted)]" href="/admin/finance/accounts#employee-profiles">
            Payroll Profiles
          </Link>
          <Link className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm font-medium text-neutral-800 hover:bg-[var(--surface-muted)]" href="/admin/finance/accounts#vendors">
            Vendors
          </Link>
          <Link className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm font-medium text-neutral-800 hover:bg-[var(--surface-muted)]" href="/admin/finance/accounts#categories">
            Categories
          </Link>
          <Link className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm font-medium text-neutral-800 hover:bg-[var(--surface-muted)]" href="/admin/finance/ledger-audit">
            Ledger Audit
          </Link>
        </div>
      </section>

      <section className={cardClass} id="money-sources">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Money Sources</div>
            <div className="text-xs text-neutral-500">Add or rename where money comes from or goes to.</div>
          </div>
          {!isAddingSource && (
            <button className={buttonPrimary} onClick={() => setIsAddingSource(true)}>
              Add Source
            </button>
          )}
        </div>

        {sourcesError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {sourcesError}
          </div>
        )}

        {isAddingSource && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <input
              className={fieldClass}
              placeholder="Add new money source"
              value={newSourceName}
              onChange={e => setNewSourceName(e.target.value)}
            />
            <select
              className={fieldClass}
              value={newSourceType}
              onChange={e => setNewSourceType(e.target.value)}
            >
              {TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button className={buttonPrimary} onClick={handleAddSource} disabled={sourceSaving}>
                Save
              </button>
              <button className={buttonOutline} onClick={handleCancelAddSource} disabled={sourceSaving}>
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
              {sourcesLoading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>Loading sources…</td>
                </tr>
              )}
              {!sourcesLoading && sources.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={4}>No money sources yet.</td>
                </tr>
              )}
              {!sourcesLoading && sources.map(source => (
                <tr key={source.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3">
                    {editingSourceId === source.id ? (
                      <input
                        className={fieldClass}
                        value={editingSourceName}
                        onChange={e => setEditingSourceName(e.target.value)}
                      />
                    ) : (
                      source.name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingSourceId === source.id ? (
                      <select
                        className={fieldClass}
                        value={editingSourceType}
                        onChange={e => setEditingSourceType(e.target.value)}
                      >
                        {TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      formatSourceType(source.type)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingSourceId === source.id ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingSourceActive}
                          onChange={e => setEditingSourceActive(e.target.checked)}
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
                    {editingSourceId === source.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button className={buttonPrimary} onClick={saveEditSource} disabled={sourceSaving}>
                          Save
                        </button>
                        <button className={buttonOutline} onClick={cancelEditSource} disabled={sourceSaving}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className={buttonOutline} onClick={() => startEditSource(source)}>
                        View / Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardClass} id="employee-profiles">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Employee Compensation Profiles</div>
            <div className="text-xs text-neutral-500">Compensation settings per employee.</div>
          </div>
          <button className={buttonPrimary} onClick={openCreateProfile}>
            Add Profile
          </button>
        </div>

        {profilesError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {profilesError}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Employment Type</th>
                <th className="px-4 py-3 font-medium">Base Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {profilesLoading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={5}>Loading profiles…</td>
                </tr>
              )}
              {!profilesLoading && profiles.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={5}>No profiles yet.</td>
                </tr>
              )}
              {!profilesLoading && profiles.map(profile => (
                <tr key={profile.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3 font-medium text-neutral-900">{profile.user_name || profile.user_email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium">
                      {empTypes[profile.employment_type] || profile.employment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-neutral-900">{formatBase(profile.base_amount)}</td>
                  <td className="px-4 py-3">
                    {profile.is_active ? (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold">Active</span>
                    ) : (
                      <span className="text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-xs font-semibold">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button className={buttonOutline} onClick={() => openEditProfile(profile)}>
                      View / Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardClass} id="vendors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Vendors</div>
            <div className="text-xs text-neutral-500">External contractors, agencies, and service providers.</div>
          </div>
          <button className={buttonPrimary} onClick={openCreateVendor}>
            Add Vendor
          </button>
        </div>

        {vendorsError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {vendorsError}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Vendor Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Linked User</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {vendorsLoading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={5}>Loading vendors…</td>
                </tr>
              )}
              {!vendorsLoading && vendors.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={5}>No vendors found.</td>
                </tr>
              )}
              {!vendorsLoading && vendors.map(vendor => (
                <tr key={vendor.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3 font-semibold text-neutral-900">{vendor.name}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium">
                      {vendor.vendor_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {vendor.user_id ? (
                      <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs font-semibold">
                        {getUserName(vendor.user_id)}
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-xs italic">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {vendor.is_active ? (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">Active</span>
                    ) : (
                      <span className="text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className={buttonOutline} href={`/admin/finance/vendors/${vendor.id}`}>
                        Open
                      </Link>
                      <button className={buttonOutline} onClick={() => openEditVendor(vendor)}>
                        View / Edit
                      </button>
                      <Link className={buttonOutline} href="/admin/finance/bills">
                        Manage Bills
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardClass} id="categories">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Categories</div>
            <div className="text-xs text-neutral-500">Group transactions with simple labels.</div>
          </div>
          {!isAddingCategory && (
            <button className={buttonPrimary} onClick={() => setIsAddingCategory(true)}>
              Add Category
            </button>
          )}
        </div>

        {categoriesError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {categoriesError}
          </div>
        )}

        {isAddingCategory && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <input
              className={fieldClass}
              placeholder="Add new category"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className={buttonPrimary} onClick={handleAddCategory} disabled={categorySaving}>
                Save
              </button>
              <button className={buttonOutline} onClick={handleCancelCategory} disabled={categorySaving}>
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
              {categoriesLoading && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={2}>Loading categories…</td>
                </tr>
              )}
              {!categoriesLoading && categories.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-neutral-500" colSpan={2}>No categories yet.</td>
                </tr>
              )}
              {!categoriesLoading && categories.map(category => (
                <tr key={category.id} className="hover:bg-[var(--surface-muted)] transition">
                  <td className="px-4 py-3">
                    {editingCategoryId === category.id ? (
                      <input
                        className={fieldClass}
                        value={editingCategoryName}
                        onChange={e => setEditingCategoryName(e.target.value)}
                      />
                    ) : (
                      category.name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingCategoryId === category.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button className={buttonPrimary} onClick={saveEditCategory} disabled={categorySaving}>
                          Save
                        </button>
                        <button className={buttonOutline} onClick={cancelEditCategory} disabled={categorySaving}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className={buttonOutline} onClick={() => startEditCategory(category)}>
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

      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-neutral-900">{editProfile ? 'Edit Profile' : 'Add Profile'}</h3>
              <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowProfileModal(false)}>✕</button>
            </div>
            <form onSubmit={handleProfileSubmit} className="p-5 space-y-4">
              {!editProfile && (
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Employee *</label>
                  <select
                    required
                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white"
                    value={profileForm.user_id}
                    onChange={e => setProfileForm({ ...profileForm, user_id: e.target.value })}
                  >
                    <option value="">Select employee…</option>
                    {availableUsers.map(user => (
                      <option key={user.id} value={user.id}>{user.name || user.email}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Employment Type *</label>
                <select
                  required
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white"
                  value={profileForm.employment_type}
                  onChange={e => setProfileForm({ ...profileForm, employment_type: e.target.value })}
                >
                  <option value="salaried">Salary</option>
                  <option value="stipend">Stipend</option>
                  <option value="salaried_plus_variable">Mixed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Base Amount (₹/month)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 font-medium">₹</div>
                  <CurrencyInput
                    className="w-full p-2.5 pl-7 border border-neutral-300 rounded-lg text-sm"
                    value={profileForm.base_amount}
                    onChange={val => setProfileForm({ ...profileForm, base_amount: val })}
                    placeholder="25000"
                  />
                </div>
              </div>
              {editProfile && (
                <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer bg-neutral-50 border border-neutral-200 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    className="accent-neutral-900 w-4 h-4"
                    checked={profileForm.is_active}
                    onChange={e => setProfileForm({ ...profileForm, is_active: e.target.checked })}
                  />
                  <span className="font-medium">Profile is Active</span>
                </label>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowProfileModal(false)}>Cancel</button>
                <button type="submit" disabled={profilesSaving || (!editProfile && !profileForm.user_id)} className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition">
                  {profilesSaving ? 'Saving...' : editProfile ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-neutral-900">{editVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
              <button className="text-neutral-400 hover:text-neutral-600" onClick={() => setShowVendorModal(false)}>✕</button>
            </div>
            <form onSubmit={handleVendorSubmit} className="p-5 space-y-4">
              {!editVendor && (
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Name *</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition"
                    value={newVendor.name}
                    onChange={e => setNewVendor({ ...newVendor, name: e.target.value })}
                    placeholder="e.g. John Doe Studios"
                  />
                </div>
              )}
              {editVendor && (
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Name *</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition"
                    value={editVendor.name}
                    onChange={e => setEditVendor({ ...editVendor, name: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Vendor Type *</label>
                <select
                  required
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white"
                  value={editVendor ? editVendor.vendor_type : newVendor.vendor_type}
                  onChange={e => {
                    if (editVendor) {
                      setEditVendor({ ...editVendor, vendor_type: e.target.value })
                    } else {
                      setNewVendor({ ...newVendor, vendor_type: e.target.value })
                    }
                  }}
                >
                  <option value="freelancer">Freelancer</option>
                  <option value="service">Service Agency</option>
                  <option value="employee">Employee-linked</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition"
                    value={editVendor ? editVendor.email || '' : newVendor.email}
                    onChange={e => {
                      if (editVendor) {
                        setEditVendor({ ...editVendor, email: e.target.value })
                      } else {
                        setNewVendor({ ...newVendor, email: e.target.value })
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Phone</label>
                  <input
                    type="tel"
                    className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition"
                    value={editVendor ? editVendor.phone || '' : newVendor.phone}
                    onChange={e => {
                      if (editVendor) {
                        setEditVendor({ ...editVendor, phone: e.target.value })
                      } else {
                        setNewVendor({ ...newVendor, phone: e.target.value })
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Internal Notes</label>
                <textarea
                  rows={3}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm focus:border-neutral-500 outline-none transition resize-none"
                  value={editVendor ? editVendor.notes || '' : newVendor.notes}
                  onChange={e => {
                    if (editVendor) {
                      setEditVendor({ ...editVendor, notes: e.target.value })
                    } else {
                      setNewVendor({ ...newVendor, notes: e.target.value })
                    }
                  }}
                />
              </div>
              {editVendor && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Link to User Account</label>
                    <select
                      className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm bg-white"
                      value={editVendor.user_id || ''}
                      onChange={e => setEditVendor({ ...editVendor, user_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">— Not linked —</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>{user.name || user.email} (ID: {user.id})</option>
                      ))}
                    </select>
                    <div className="text-xs text-neutral-400 mt-1">Linking allows this vendor to use the Vendor Portal to view their payments.</div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer bg-neutral-50 border border-neutral-200 p-3 rounded-lg">
                      <input
                        type="checkbox"
                        className="accent-neutral-900 w-4 h-4"
                        checked={editVendor.is_active}
                        onChange={e => setEditVendor({ ...editVendor, is_active: e.target.checked })}
                      />
                      <span className="font-medium">Vendor is Active</span>
                    </label>
                  </div>
                </>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t border-neutral-100 mt-6">
                <button type="button" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition" onClick={() => setShowVendorModal(false)}>Cancel</button>
                <button
                  type="submit"
                  disabled={vendorSaving || (!editVendor && !newVendor.name)}
                  className="px-6 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg shadow transition"
                >
                  {vendorSaving ? 'Saving...' : editVendor ? 'Save Changes' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
