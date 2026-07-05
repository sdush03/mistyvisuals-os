'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getAuth } from '@/lib/authClient'
import useSWR from 'swr'
import AssignTeamModal from '../components/AssignTeamModal'
import type { ProjectDetailData, TeamAssignment, ChecklistItem, Deliverable } from '../components/types'
import {
  STATUS_COLORS, INVOICE_STATUS_COLORS, DELIVERABLE_STATUS_COLORS,
  PHASE_LABELS, DELIVERABLE_STATUSES,
} from '../components/types'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => {
  if (!r.ok) throw new Error('fetch failed')
  return r.json()
})

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}

function fmtMoney(v: string | number | null) {
  const n = Number(v || 0)
  return `₹${n.toLocaleString('en-IN')}`
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params?.id as string
  const [authed, setAuthed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [assignEventId, setAssignEventId] = useState<string | null>(null)

  const [localSlug, setLocalSlug] = useState('')
  const [localPasscode, setLocalPasscode] = useState('')
  const [portalSaved, setPortalSaved] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [savingPortal, setSavingPortal] = useState(false)
  const [portalInitialized, setPortalInitialized] = useState(false)

  useEffect(() => {
    setMounted(true)
    getAuth().then(d => {
      if (!d?.authenticated) { window.location.href = '/login'; return }
      setAuthed(true)
    })
  }, [])

  const { data, error, mutate } = useSWR(
    authed && projectId ? `/api/projects/${projectId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const detail: ProjectDetailData | null = data?.data || null
  const project = detail?.project
  const events = detail?.events || []
  const teamAssignments = detail?.team_assignments || []
  const deliverables = detail?.deliverables || []
  const checklist = detail?.checklist || []
  const invoice = detail?.invoice

  // Group team assignments by event
  const teamByEvent = useMemo(() => {
    const map = new Map<string, TeamAssignment[]>()
    teamAssignments.forEach(ta => {
      const arr = map.get(ta.project_event_id) || []
      arr.push(ta)
      map.set(ta.project_event_id, arr)
    })
    return map
  }, [teamAssignments])

  // Group checklist by phase
  const checklistByPhase = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>()
    checklist.forEach(c => {
      const arr = map.get(c.phase) || []
      arr.push(c)
      map.set(c.phase, arr)
    })
    return map
  }, [checklist])

  useEffect(() => {
    if (project && !portalInitialized) {
      let recommendedSlug = project.slug || ''
      if (!recommendedSlug) {
        let nameBase = (project.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s&]/g, '')
          .replace(/\s*(?:&|and)\s*/g, '-')
          .replace(/\s+/g, '-')
          .trim();
        nameBase = nameBase.replace(/-+/g, '-');
        
        const eventDate = project.start_date ? new Date(project.start_date) : null;
        if (eventDate && !isNaN(eventDate.getTime())) {
          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          const mon = monthNames[eventDate.getMonth()];
          const yy = eventDate.getFullYear().toString().slice(-2);
          recommendedSlug = `${nameBase}-${mon}${yy}`;
        } else {
          recommendedSlug = nameBase;
        }
      }

      let recommendedPasscode = project.passcode || ''
      if (!recommendedPasscode) {
        const phone = project.lead_phone || ''
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 4) {
          recommendedPasscode = digits.slice(-4);
        } else {
          recommendedPasscode = '';
        }
      }

      setLocalSlug(recommendedSlug)
      setLocalPasscode(recommendedPasscode)
      setPortalInitialized(true)
    }
  }, [project, portalInitialized])

  const handleSavePortal = useCallback(async () => {
    if (!localSlug.trim() || !localPasscode.trim()) {
      setPortalError('Slug and passcode cannot be empty.')
      return
    }
    try {
      setSavingPortal(true)
      setPortalError('')
      setPortalSaved(false)
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: localSlug, passcode: localPasscode }),
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to update portal credentials.')
      }
      setPortalSaved(true)
      mutate()
      setTimeout(() => setPortalSaved(false), 3000)
    } catch (err: any) {
      setPortalError(err.message || 'Failed to update portal credentials.')
    } finally {
      setSavingPortal(false)
    }
  }, [localSlug, localPasscode, projectId, mutate])

  // ── Status Change ──
  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!project) return
    // Optimistic
    mutate((prev: any) => prev ? { ...prev, data: { ...prev.data, project: { ...prev.data.project, status: newStatus } } } : prev, false)
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      })
      mutate()
    } catch { mutate() }
  }, [project, projectId, mutate])

  // ── Checklist Toggle ──
  const handleChecklistToggle = useCallback(async (item: ChecklistItem) => {
    const newVal = !item.is_completed
    mutate((prev: any) => {
      if (!prev) return prev
      return { ...prev, data: { ...prev.data, checklist: prev.data.checklist.map((c: ChecklistItem) => c.id === item.id ? { ...c, is_completed: newVal } : c) } }
    }, false)
    try {
      await fetch(`/api/projects/checklist/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ is_completed: newVal }),
      })
      mutate()
    } catch { mutate() }
  }, [mutate])

  // ── Deliverable Status Change ──
  const handleDeliverableStatus = useCallback(async (del: Deliverable, newStatus: string) => {
    mutate((prev: any) => {
      if (!prev) return prev
      return { ...prev, data: { ...prev.data, deliverables: prev.data.deliverables.map((d: Deliverable) => d.id === del.id ? { ...d, status: newStatus } : d) } }
    }, false)
    try {
      await fetch(`/api/projects/deliverables/${del.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      })
      mutate()
    } catch { mutate() }
  }, [mutate])

  // ── Loading ──
  if (!mounted || !authed) return null
  if (error) return <div className="max-w-4xl"><div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-400 text-center">Failed to load project.</div></div>
  if (!data) return (
    <div className="max-w-4xl space-y-6 animate-pulse">
      <div className="h-8 bg-[var(--surface-strong)] rounded w-1/3" />
      <div className="h-40 bg-[var(--surface)] rounded-2xl border border-[var(--border)]" />
      <div className="h-40 bg-[var(--surface)] rounded-2xl border border-[var(--border)]" />
    </div>
  )
  if (!project) return <div className="text-neutral-500 text-center py-12">Project not found.</div>

  const deliveredCount = deliverables.filter(d => d.status === 'delivered').length
  const completedChecklist = checklist.filter(c => c.is_completed).length

  return (
    <div className={`max-w-4xl space-y-6 md:space-y-8 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* ══════ HEADER ══════ */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--foreground)] truncate">{project.name}</h1>
            {project.lead_name && <p className="text-xs text-neutral-500 mt-1">Created from: {project.lead_name}</p>}
          </div>
          <select
            value={project.status}
            onChange={e => handleStatusChange(e.target.value)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border cursor-pointer bg-transparent ${STATUS_COLORS[project.status]}`}
          >
            {['upcoming', 'ongoing', 'completed', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-neutral-500">
          {project.city && <span>📍 {project.city}</span>}
          <span>📅 {fmtDate(project.start_date)} → {fmtDate(project.end_date)}</span>
          {project.is_destination && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">Destination</span>}
        </div>
      </div>

      {/* ══════ CLIENT PORTAL ══════ */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          🌐 Client Workspace Portal
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Custom Slug Input */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Custom URL Slug</label>
            <div className="flex items-center bg-white rounded-xl border border-neutral-200 focus-within:border-neutral-400 transition-colors shadow-sm overflow-hidden">
              <span className="text-xs text-neutral-400 pl-3 select-none">mistyvisuals.com/</span>
              <input
                type="text"
                value={localSlug}
                onChange={e => setLocalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
                placeholder="priya-arjun"
                className="bg-transparent border-none text-xs text-neutral-800 py-2.5 pr-3 focus:outline-none w-full font-medium"
              />
            </div>
          </div>

          {/* Passcode Input */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Passcode (Last 4 digits phone)</label>
            <input
              type="text"
              maxLength={8}
              value={localPasscode}
              onChange={e => setLocalPasscode(e.target.value.trim())}
              placeholder="1234"
              className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 px-3 text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 transition-colors shadow-sm font-medium"
            />
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSavePortal}
              disabled={savingPortal}
              className="bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm"
            >
              {savingPortal ? 'Saving...' : 'Save Settings'}
            </button>
            {portalSaved && <span className="text-xs text-emerald-500 font-medium">✓ Settings saved!</span>}
            {portalError && <span className="text-xs text-rose-500 font-medium">{portalError}</span>}
          </div>

          {project.slug && (
            <button
              id="copy-invite-btn"
              onClick={() => {
                const inviteText = `Here is your Misty Visuals client portal link:\nhttps://mistyvisuals.com/${project.slug}\n\nPasscode: ${project.passcode}`
                navigator.clipboard.writeText(inviteText).then(() => {
                  const btn = document.getElementById('copy-invite-btn')
                  if (btn) {
                    btn.textContent = '✓ Copied!'
                    setTimeout(() => { btn.textContent = '📋 Copy Welcome Text' }, 2000)
                  }
                })
              }}
              className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              📋 Copy Welcome Text
            </button>
          )}
        </div>
      </div>

      {/* ══════ EVENTS ══════ */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          Events <span className="text-neutral-500 font-normal text-xs">({events.length})</span>
        </h2>
        {events.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 text-center text-sm text-neutral-500">No events found.</div>
        ) : (
          <div className="space-y-3">
            {events.map(ev => {
              const team = teamByEvent.get(ev.id) || []
              return (
                <div key={ev.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold text-[var(--foreground)]">{ev.event_type || 'Event'}</span>
                      <span className="text-xs text-neutral-500 ml-2">{fmtDate(ev.event_date)}</span>
                    </div>
                    <button onClick={() => setAssignEventId(ev.id)} className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition shrink-0">+ Assign Team</button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {ev.venue && <span>🏛 {ev.venue}</span>}
                    {ev.start_time && <span>⏰ {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</span>}
                    {ev.pax && <span>👥 {ev.pax} pax</span>}
                    {ev.slot && <span>🕐 {ev.slot}</span>}
                  </div>
                  {/* Team chips */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {team.length === 0 ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/20">Unassigned</span>
                    ) : team.map(t => (
                      <span key={t.id} className="px-2 py-1 rounded-md text-[10px] bg-[var(--surface-strong)] text-neutral-400 border border-[var(--border)]">
                        {t.user_nickname || t.user_name} · <span className="text-neutral-500">{t.role.replace(/_/g, ' ')}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════ DELIVERABLES ══════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            Deliverables <span className="text-neutral-500 font-normal text-xs">({deliveredCount}/{deliverables.length} delivered)</span>
          </h2>
        </div>
        {deliverables.length > 0 && (
          <div className="w-full h-1.5 bg-[var(--surface-strong)] rounded-full mb-3 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliverables.length ? (deliveredCount / deliverables.length) * 100 : 0}%` }} />
          </div>
        )}
        {deliverables.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 text-center text-sm text-neutral-500">No deliverables.</div>
        ) : (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
            {deliverables.map(del => {
              const overdue = del.due_date && del.status !== 'delivered' && new Date(del.due_date) < new Date()
              return (
                <div key={del.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[var(--foreground)] truncate">{del.title}</span>
                    {del.type && del.type !== 'other' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--surface-strong)] text-neutral-500 shrink-0">{del.type}</span>
                    )}
                    {overdue && <span className="text-[10px] font-bold text-rose-400">OVERDUE</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {del.due_date && <span className="text-[10px] text-neutral-500">{fmtDate(del.due_date)}</span>}
                    <select
                      value={del.status}
                      onChange={e => handleDeliverableStatus(del, e.target.value)}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold border-none cursor-pointer ${DELIVERABLE_STATUS_COLORS[del.status] || ''}`}
                    >
                      {DELIVERABLE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════ CHECKLIST ══════ */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          Shoot Checklist <span className="text-neutral-500 font-normal text-xs">({completedChecklist}/{checklist.length} done)</span>
        </h2>
        {checklist.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 text-center text-sm text-neutral-500">No checklist items.</div>
        ) : (
          <div className="space-y-4">
            {['pre_shoot', 'shoot_day', 'post_shoot'].map(phase => {
              const items = checklistByPhase.get(phase) || []
              if (items.length === 0) return null
              const done = items.filter(i => i.is_completed).length
              return (
                <div key={phase} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[var(--foreground)]">{PHASE_LABELS[phase] || phase}</span>
                    <span className="text-[10px] text-neutral-500">{done}/{items.length} done</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <label key={item.id} className="flex items-center gap-3 cursor-pointer group p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition">
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          onChange={() => handleChecklistToggle(item)}
                          className="w-4 h-4 rounded border-[var(--border)] accent-emerald-500"
                        />
                        <span className={`text-sm transition ${item.is_completed ? 'line-through text-neutral-500' : 'text-[var(--foreground)]'}`}>
                          {item.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════ INVOICE ══════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Payment Schedule</h2>
          {invoice?.share_token && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/proforma/${invoice.share_token}`
                navigator.clipboard.writeText(url).then(() => {
                  const btn = document.getElementById('copy-proforma-btn')
                  if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '🔗 Share Link' }, 2000) }
                })
              }}
              id="copy-proforma-btn"
              className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded-md hover:bg-blue-500/10"
            >🔗 Share Link</button>
          )}
        </div>
        {!invoice ? (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 text-center text-sm text-neutral-500">No invoice generated yet.</div>
        ) : (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 md:p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Total Package</div>
                <div className="text-lg font-semibold text-[var(--foreground)]">{fmtMoney(invoice.total_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Advance</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-[var(--foreground)]">{fmtMoney(invoice.advance_amount)}</span>
                  {invoice.advance_paid && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400">PAID</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Balance</div>
                <div className="text-lg font-semibold text-[var(--foreground)]">{fmtMoney(invoice.balance_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Status</div>
                <span className={`px-2 py-1 rounded-md text-[10px] font-semibold uppercase border ${INVOICE_STATUS_COLORS[invoice.status] || INVOICE_STATUS_COLORS.draft}`}>{invoice.status}</span>
              </div>
            </div>

            {/* Payment Schedule Steps */}
            {invoice.payment_schedule && invoice.payment_schedule.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4 mb-4">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-3">Payment Milestones</div>
                <div className="space-y-2">
                  {invoice.payment_schedule.map((step: any, i: number) => {
                    const isPaid = step.status === 'paid'
                    const isOverdue = step.due_date && step.status !== 'paid' && new Date(step.due_date) < new Date()
                    return (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : isOverdue ? 'bg-rose-500/5 border-rose-500/20' : 'bg-[var(--surface-muted)] border-[var(--border)]'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${isPaid ? 'bg-emerald-500 text-white' : isOverdue ? 'bg-rose-500 text-white' : 'bg-neutral-700 text-neutral-400'}`}>
                            {isPaid ? '✓' : i + 1}
                          </span>
                          <span className="text-sm text-[var(--foreground)] truncate">{step.label}</span>
                          {step.percentage && <span className="text-[10px] text-neutral-500">({step.percentage}%)</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {step.due_date && !isPaid && <span className={`text-[10px] ${isOverdue ? 'text-rose-400 font-semibold' : 'text-neutral-500'}`}>{isOverdue ? 'Overdue' : `Due ${fmtDate(step.due_date)}`}</span>}
                          <span className={`text-sm font-semibold ${isPaid ? 'text-emerald-400' : 'text-[var(--foreground)]'}`}>{fmtMoney(step.amount)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Line Items Table */}
            {invoice.line_items && invoice.line_items.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4">
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b border-[var(--border)]">
                    <th className="text-left pb-2 font-medium">Description</th>
                    <th className="text-center pb-2 font-medium w-16">Qty</th>
                    <th className="text-right pb-2 font-medium w-28">Amount</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {invoice.line_items.map((li: any) => (
                      <tr key={li.id}>
                        <td className="py-2 text-[var(--foreground)]">{li.description}</td>
                        <td className="py-2 text-center text-neutral-500">{li.quantity}</td>
                        <td className={`py-2 text-right ${Number(li.amount) < 0 ? 'text-rose-400' : 'text-[var(--foreground)]'}`}>{fmtMoney(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignEventId && (
        <AssignTeamModal eventId={assignEventId} onClose={() => setAssignEventId(null)} onSuccess={() => mutate()} />
      )}
    </div>
  )
}
