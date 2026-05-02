'use client'

import { useState, useEffect } from 'react'
import type { UserOption } from './types'
import { VALID_ROLES } from './types'

interface Props {
  eventId: string
  onClose: () => void
  onSuccess: () => void
}

export default function AssignTeamModal({ eventId, onClose, onSuccess }: Props) {
  const [users, setUsers] = useState<UserOption[]>([])
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('')
  const [callTime, setCallTime] = useState('')
  const [wrapTime, setWrapTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setUsers(d?.data || d?.users || []))
      .catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!userId || !role) { setError('Select a user and role'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/events/${eventId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: Number(userId), role, call_time: callTime || null, wrap_time: wrapTime || null, notes: notes || null }),
      })
      if (!res.ok) throw new Error('Failed')
      onSuccess()
      onClose()
    } catch {
      setError('Failed to assign team member')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--foreground)]">Assign Team Member</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-[var(--foreground)] transition p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">Team Member</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]">
              <option value="">Select...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nickname || u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]">
              <option value="">Select...</option>
              {VALID_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">Call Time</label>
              <input value={callTime} onChange={e => setCallTime(e.target.value)} placeholder="e.g. 8:00 AM" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">Wrap Time</label>
              <input value={wrapTime} onChange={e => setWrapTime(e.target.value)} placeholder="e.g. 6:00 PM" className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]" />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]" />
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-neutral-500 hover:text-[var(--foreground)] transition">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition">
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
