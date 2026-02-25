'use client'

import { useEffect, useState } from 'react'
import { getAuth } from '@/lib/authClient'

export default function MePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{
    id: number
    email: string
    role: string
    name?: string | null
    nickname?: string | null
    job_title?: string | null
    force_password_reset?: boolean
  } | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [passwordShake, setPasswordShake] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  useEffect(() => {
    getAuth()
      .then(data => {
        if (!data?.authenticated) {
          setError('Not authenticated')
          setLoading(false)
          return
        }
        const nextUser = data.user
        if (!nextUser?.id || !nextUser.email || !nextUser.role) {
          setError('Unable to load profile')
          setLoading(false)
          return
        }
        setUser({
          id: nextUser.id,
          email: nextUser.email,
          role: nextUser.role,
          name: nextUser.name ?? null,
          nickname: nextUser.nickname ?? null,
          job_title: nextUser.job_title ?? null,
          force_password_reset: nextUser.force_password_reset === true,
        })
        if (nextUser.force_password_reset) {
          setShowChangePassword(true)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load profile')
        setLoading(false)
      })
  }, [])


  useEffect(() => {
    fetch('/api/auth/profile-photo', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) return null
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      })
      .then(url => {
        if (url) setPhotoDataUrl(url)
      })
      .catch(() => {})
  }, [])

  const initials = (user?.name || user?.email || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

  if (loading) {
    return (
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-neutral-500">Loading profile…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Account</div>
        <h2 className="text-2xl font-semibold mt-2">My Profile</h2>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm space-y-4 text-sm">
        <div className="flex items-center gap-4 h-20">
          <div className="h-20 w-20">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="h-20 w-20 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-center text-xl font-semibold text-neutral-700">
                {initials}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-lg font-semibold">{user?.name || '—'}</div>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            autoComplete="off"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                setPhotoError('Only JPG, PNG, or WEBP allowed')
                return
              }
              if (file.size > 2 * 1024 * 1024) {
                setPhotoError('Image must be 2MB or less')
                return
              }
              setPhotoError(null)
              setUploadingPhoto(true)
              const reader = new FileReader()
              reader.onload = async () => {
                const result = reader.result as string
                const res = await fetch('/api/auth/profile-photo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ image_data: result }),
                })
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}))
                  setPhotoError(err.error || 'Failed to upload photo')
                  setUploadingPhoto(false)
                  return
                }
                setPhotoDataUrl(result)
                setUploadingPhoto(false)
              }
              reader.readAsDataURL(file)
            }}
          />
          {uploadingPhoto ? 'Uploading…' : (photoDataUrl ? 'Change Photo' : 'Upload photo')}
        </label>
        {photoError && (
          <div className="mt-2 text-xs text-red-600">{photoError}</div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Name</span>
          <span className="font-medium">{user?.name || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Nickname</span>
          <span className="font-medium">{user?.nickname || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Email</span>
          <span className="font-medium">{user?.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Job title</span>
          <span className="font-medium">{user?.job_title || 'Job title not assigned'}</span>
        </div>
        {user?.role === 'admin' && (
          <div className="text-xs text-neutral-500">
            Admin hint: Job title is set during user creation.
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Role</span>
          <span className="font-medium">{user?.role}</span>
        </div>
      </div>


      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm text-sm">
        {user?.force_password_reset && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Please update your password to continue using the system.
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500">Password</div>
          <button
            className="text-sm text-neutral-700 hover:text-neutral-900"
            onClick={() =>
              setShowChangePassword(v => {
                if (v) {
                  setPasswordErrors({})
                  setPasswordShake(false)
                  setSaveMsg(null)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }
                return !v
              })
            }
          >
            {showChangePassword ? 'Close' : 'Change Password'}
          </button>
        </div>
        {showChangePassword && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3">
              <input
                type="password"
                placeholder="Current Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.current ? 'field-error' : ''} ${passwordErrors.current && passwordShake ? 'shake' : ''}`}
                value={currentPassword}
                onChange={e => {
                  setCurrentPassword(e.target.value)
                  if (passwordErrors.current && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, current: undefined }))
                  }
                }}
              />
              {passwordErrors.current && (
                <div className="text-xs text-red-600">{passwordErrors.current}</div>
              )}
              <input
                type="password"
                placeholder="New Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.next ? 'field-error' : ''} ${passwordErrors.next && passwordShake ? 'shake' : ''}`}
                value={newPassword}
                onChange={e => {
                  setNewPassword(e.target.value)
                  if (passwordErrors.next && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, next: undefined }))
                  }
                }}
              />
              {passwordErrors.next && (
                <div className="text-xs text-red-600">{passwordErrors.next}</div>
              )}
              <input
                type="password"
                placeholder="Confirm New Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.confirm ? 'field-error' : ''} ${passwordErrors.confirm && passwordShake ? 'shake' : ''}`}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value)
                  if (passwordErrors.confirm && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, confirm: undefined }))
                  }
                }}
              />
              {passwordErrors.confirm && (
                <div className="text-xs text-red-600">{passwordErrors.confirm}</div>
              )}
            </div>
            {saveMsg && (
              <div className={`text-sm ${saveMsg.startsWith('Success') ? 'text-green-700' : 'text-red-600'}`}>
                {saveMsg}
              </div>
            )}
            <div className="flex justify-end">
              <button
                disabled={saving}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                onClick={async () => {
                  setSaveMsg(null)
                  const nextErrors: { current?: string; next?: string; confirm?: string } = {}
                  if (!currentPassword.trim()) nextErrors.current = 'Current password is required'
                  if (!newPassword.trim()) nextErrors.next = 'New password is required'
                  if (!confirmPassword.trim()) nextErrors.confirm = 'Confirm password is required'
                  if (Object.keys(nextErrors).length) {
                    setPasswordErrors(nextErrors)
                    setPasswordShake(true)
                    setTimeout(() => setPasswordShake(false), 300)
                    return
                  }
                  setPasswordErrors({})
                  if (newPassword !== confirmPassword) {
                    setSaveMsg('New passwords do not match.')
                    return
                  }
                  setSaving(true)
                  const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      current_password: currentPassword,
                      new_password: newPassword,
                    }),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    setSaveMsg(data?.error || 'Failed to change password.')
                    setSaving(false)
                    return
                  }
                  setSaveMsg('Success: password updated.')
                  setUser(prev => (prev ? { ...prev, force_password_reset: false } : prev))
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setSaving(false)
                }}
              >
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
