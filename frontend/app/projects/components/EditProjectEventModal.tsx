'use client'

import { useState } from 'react'
import type { ProjectEvent } from './types'

interface Props {
  event: ProjectEvent
  onClose: () => void
  onSuccess: () => void
}

export default function EditProjectEventModal({ event, onClose, onSuccess }: Props) {
  const [eventType, setEventType] = useState(event.event_type || '')
  const [eventDate, setEventDate] = useState(event.event_date ? event.event_date.split('T')[0] : '')
  const [startTime, setStartTime] = useState(event.start_time || '')
  const [endTime, setEndTime] = useState(event.end_time || '')
  const [slot, setSlot] = useState(event.slot || '')
  const [venue, setVenue] = useState(event.venue || '')
  const [venueAddress, setVenueAddress] = useState(event.venue_address || '')
  const [pax, setPax] = useState(event.pax ? String(event.pax) : '')
  const [notes, setNotes] = useState(event.notes || '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventType.trim()) {
      setError('Event name is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/projects/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event_type: eventType.trim(),
          event_date: eventDate || null,
          start_time: startTime.trim() || null,
          end_time: endTime.trim() || null,
          slot: slot || null,
          venue: venue.trim() || null,
          venue_address: venueAddress.trim() || null,
          pax: pax ? Number(pax) : null,
          notes: notes.trim() || null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update event')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update event details')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">Edit Event Details</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Update date, timings, venue, or guest count</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-[var(--foreground)] transition p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
              Event Name / Type <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              placeholder="e.g. Sangeet, Wedding, Reception"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                Event Date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                Slot / Time of Day
              </label>
              <select
                value={slot}
                onChange={e => setSlot(e.target.value)}
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              >
                <option value="">Select slot...</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
                <option value="Full Day">Full Day</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                Start Time
              </label>
              <input
                type="text"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                placeholder="e.g. 10:00 AM or 18:00"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                End Time
              </label>
              <input
                type="text"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                placeholder="e.g. 02:00 PM or 22:00"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                Venue Name
              </label>
              <input
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder="e.g. Grand Ballroom, Taj Palace"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
                Guest Count (Pax)
              </label>
              <input
                type="number"
                min="0"
                value={pax}
                onChange={e => setPax(e.target.value)}
                placeholder="e.g. 250"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
              Venue Address
            </label>
            <input
              type="text"
              value={venueAddress}
              onChange={e => setVenueAddress(e.target.value)}
              placeholder="e.g. Sector 44, Gurugram, Haryana"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1 block">
              Notes / Special Instructions
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any specific instructions for this event..."
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-neutral-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 transition shadow-sm"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
