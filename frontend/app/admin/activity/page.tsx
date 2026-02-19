'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDateTime, formatINR } from '@/lib/formatters'
import { getAuth } from '@/lib/authClient'

type ActivityRow = {
  id: number
  source?: 'activity' | 'note'
  activity_type: string
  metadata?: any
  created_at?: string
  user_id?: number | null
  user_name?: string | null
  user_nickname?: string | null
  user_email?: string | null
  user_role?: string | null
  lead_id?: number | null
  lead_number?: number | null
  lead_name?: string | null
  note_text?: string | null
  is_system?: boolean | null
}

type ActivityResponse = {
  range: { start: string; end: string }
  page: number
  page_size: number
  total: number
  rows: ActivityRow[]
}

type SalesPerformanceRow = {
  user_id: number
  user_name?: string | null
  user_nickname?: string | null
  user_email?: string | null
  user_role?: string | null
  total_session_duration_seconds?: number
  leads_opened_count?: number
  followups_done?: number
  negotiations_done?: number
  quotes_generated?: number
  conversions?: number
  total_time_spent_on_leads_seconds?: number
  avg_time_spent_per_lead_seconds?: number
  status_changes?: number
  followups_connected?: number
  followups_not_connected?: number
  quote_generated?: number
  quote_shared?: number
  negotiation_entries?: number
  daily?: {
    metric_date: string
    total_sessions: number
    leads_opened_count: number
    followups_done: number
    conversions: number
  }[]
}

type SalesPerformanceResponse = {
  range: { start: string; end: string }
  users: SalesPerformanceRow[]
}

const getUserLabel = (user: {
  user_id: number | null
  user_name?: string | null
  user_nickname?: string | null
  user_email?: string | null
}) => {
  if (!user.user_id) return 'System'
  const nick = String(user.user_nickname || '').trim()
  if (nick) return nick
  const name = String(user.user_name || '').trim()
  if (name) return name
  const email = String(user.user_email || '').trim()
  if (email) return email.split('@')[0]
  return `User #${user.user_id}`
}

const activityLabel = (type: string) => {
  switch (type) {
    case 'audit_login':
      return 'Login'
    case 'audit_logout':
      return 'Logout'
    case 'audit_password_change':
      return 'Password changed'
    case 'audit_profile_update':
      return 'Profile updated'
    case 'lead_created':
      return 'Lead created'
    case 'assigned_user_change':
      return 'Owner changed'
    case 'lead_field_change':
      return 'Lead field updated'
    case 'followup_done':
      return 'Follow-up completed'
    case 'followup_date_change':
      return 'Follow-up date updated'
    case 'status_change':
      return 'Stage changed'
    case 'heat_change':
      return 'Heat changed'
    case 'pricing_change':
      return 'Pricing updated'
    case 'event_create':
      return 'Event added'
    case 'event_update':
      return 'Event updated'
    case 'event_delete':
      return 'Event removed'
    case 'negotiation_entry':
      return 'Negotiation entry'
    case 'quote_generated':
      return 'Quote generated'
    case 'quote_shared_whatsapp':
      return 'Proposal shared on WhatsApp'
    case 'note_added':
      return 'Note added'
    default:
      return type
  }
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const day = d.toLocaleDateString('en-GB', { day: '2-digit' })
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  const year = d.toLocaleDateString('en-GB', { year: '2-digit' })
  return `${day} ${month} ${year}`
}

const getUserLabelById = (id: any) => {
  if (id === null || id === undefined) return 'Unassigned'
  return `User #${id}`
}

const getActivityActor = (activity: any) => {
  const meta = activity?.metadata || {}
  if (meta?.system) return { label: 'System', isSystem: true }
  const nickname = String(activity?.user_nickname || '').trim()
  if (nickname) return { label: nickname, isSystem: false }
  const name = String(activity?.user_name || '').trim()
  if (name) return { label: name.split(/\s+/)[0] || name, isSystem: false }
  const email = String(activity?.user_email || '').trim()
  if (email) return { label: email.split('@')[0], isSystem: false }
  return { label: 'Unknown', isSystem: false }
}

const formatLoginMeta = (meta: any) => {
  if (!meta) return ''
  const kind = String(meta.client_kind || '').trim().toLowerCase()
  const device = String(meta.device_type || '').trim().toLowerCase()
  const platform = String(meta.platform || '').trim().toLowerCase()
  const name = String(meta.client_name || '').trim()

  const deviceLabel =
    device === 'mobile' ? 'Mobile' : device === 'tablet' ? 'Tablet' : device === 'desktop' ? 'Laptop' : ''
  const platformLabel =
    platform === 'ios'
      ? 'iOS'
      : platform === 'android'
        ? 'Android'
        : platform === 'windows'
          ? 'Windows'
          : platform === 'macos'
            ? 'macOS'
            : platform === 'linux'
              ? 'Linux'
              : ''

  if (kind === 'app') {
    const appName = name || 'App'
    return `${platformLabel || deviceLabel || 'Mobile'} app (${appName})`
  }

  const parts = [
    deviceLabel || 'Desktop',
    'browser',
    platformLabel,
    name,
  ].filter(Boolean)
  return parts.join(' · ')
}

const formatActivityDetails = (activity: any) => {
  const type = activity?.activity_type
  const meta = activity?.metadata || {}
  let title = activityLabel(type)
  let metaText = ''

  if (type === 'lead_created') {
    title = 'Lead created'
    if (meta?.source) metaText = `Source: ${meta.source}`
  } else if (type === 'audit_login') {
    title = 'Login'
    metaText = formatLoginMeta(meta)
  } else if (type === 'followup_done') {
    const outcome = meta?.outcome || 'Completed'
    if (outcome === 'Not connected') {
      title = 'Follow-up attempted'
      metaText = 'Not connected'
    } else {
      title = 'Follow-up completed'
      metaText = meta?.follow_up_mode ? meta.follow_up_mode : ''
    }
  } else if (type === 'followup_date_change') {
    title = 'Follow-up date updated'
    const from = meta?.from ? formatDateShort(meta.from) : 'Not set'
    const to = meta?.to ? formatDateShort(meta.to) : 'Not set'
    metaText = `${from} → ${to}`
  } else if (type === 'status_change') {
    title = 'Stage changed'
    if (meta?.from && meta?.to) metaText = `${meta.from} → ${meta.to}`
  } else if (type === 'heat_change') {
    title = 'Heat changed'
    if (meta?.from && meta?.to) metaText = `${meta.from} → ${meta.to}`
  } else if (type === 'assigned_user_change') {
    title = 'Owner updated'
    const from = getUserLabelById(meta?.from)
    const to = getUserLabelById(meta?.to)
    metaText = `${from} → ${to}`
  } else if (type === 'lead_field_change') {
    title = 'Field updated'
    const fieldLabel =
      meta?.field === 'amount_quoted'
        ? 'Amount quoted'
        : meta?.field === 'client_budget_amount'
          ? 'Client budget'
          : meta?.field
            ? String(meta.field).replace(/_/g, ' ')
            : 'Field'
    const fromValue = typeof meta?.from === 'number' ? formatINR(meta.from) : meta?.from ?? '—'
    const toValue = typeof meta?.to === 'number' ? formatINR(meta.to) : meta?.to ?? '—'
    metaText = `${fieldLabel}: ${fromValue} → ${toValue}`
  } else if (type === 'pricing_change') {
    title =
      meta?.field === 'client_offer_amount'
        ? 'Client offer updated'
        : meta?.field === 'discounted_amount'
          ? 'Discounted amount updated'
          : 'Pricing updated'
    const formatted = formatINR(meta?.to)
    metaText = formatted ? `New value: ${formatted}` : ''
  } else if (type === 'event_create') {
    title = 'Event added'
    const date = meta?.event_date ? formatDateShort(meta.event_date) : ''
    const slot = meta?.slot ? meta.slot : ''
    const name = meta?.event_name || 'Event'
    metaText = [name, date, slot].filter(Boolean).join(' · ')
  } else if (type === 'event_update') {
    title = 'Event updated'
    if (meta?.changes && typeof meta.changes === 'object') {
      const firstChange = Object.entries(meta.changes)[0]
      if (firstChange) {
        const [field, change] = firstChange as any
        const from = change?.from ?? '—'
        const to = change?.to ?? '—'
        metaText = `${String(field).replace(/_/g, ' ')}: ${from} → ${to}`
      }
    }
  } else if (type === 'event_delete') {
    title = 'Event removed'
    const date = meta?.event_date ? formatDateShort(meta.event_date) : ''
    const name = meta?.event_name || 'Event'
    metaText = [name, date].filter(Boolean).join(' · ')
  } else if (type === 'negotiation_entry') {
    title = 'Negotiation note added'
    if (meta?.topic) metaText = `Topic: ${meta.topic}`
  } else if (type === 'quote_generated') {
    title = meta?.reused ? 'Quote generated (no changes)' : 'Quote generated'
    if (meta?.quote_number) metaText = `Quote: ${meta.quote_number}`
  } else if (type === 'quote_shared_whatsapp') {
    title = 'Proposal shared on WhatsApp'
    if (meta?.quote_number) metaText = `Quote: ${meta.quote_number}`
  } else if (type === 'note_added') {
    title = 'Note added'
    const note = String(activity?.note_text || '').trim()
    if (note) metaText = note.length > 160 ? `${note.slice(0, 157)}…` : note
  }

  return { title, metaText }
}

const getLeadGroupKey = (row: ActivityRow) => {
  const isAudit = String(row.activity_type || '').startsWith('audit_')
  const hasLead = !!(row.lead_id || row.lead_number || row.lead_name)
  if (!hasLead || isAudit) return `activity-${row.activity_type}-${row.id}`
  if (row.lead_id) return `lead-${row.lead_id}`
  if (row.lead_number) return `leadno-${row.lead_number}`
  if (row.lead_name) return `leadname-${row.lead_name}-${row.id}`
  return `activity-${row.id}`
}

const getLeadGroupLabel = (row: ActivityRow) => {
  const isAudit = String(row.activity_type || '').startsWith('audit_')
  const hasLead = !!(row.lead_id || row.lead_number || row.lead_name)
  if (!hasLead || isAudit) return activityLabel(row.activity_type)
  if (row.lead_name && row.lead_number) return `${row.lead_name} (L#${row.lead_number})`
  if (row.lead_name) return row.lead_name
  if (row.lead_number) return `Lead #${row.lead_number}`
  if (row.lead_id) return `Lead #${row.lead_id}`
  return 'Lead'
}

const groupActivitiesByLead = (rows: ActivityRow[]) => {
  const groups = new Map<
    string,
    { key: string; label: string; items: ActivityRow[]; standalone?: boolean }
  >()
  for (const item of rows) {
    const key = getLeadGroupKey(item)
    const label = getLeadGroupLabel(item)
    const isAudit = String(item.activity_type || '').startsWith('audit_')
    const hasLead = !!(item.lead_id || item.lead_number || item.lead_name)
    const standalone = isAudit || !hasLead
    if (!groups.has(key)) groups.set(key, { key, label, items: [], standalone })
    groups.get(key)!.items.push(item)
  }
  return Array.from(groups.values())
}

export default function AdminActivityPage() {
  const [activityData, setActivityData] = useState<ActivityResponse | null>(null)
  const [performance, setPerformance] = useState<SalesPerformanceResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState('')
  const [role, setRole] = useState<string>('')
  const [rangePreset, setRangePreset] = useState('last7')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)
  const [activityPage, setActivityPage] = useState(1)
  const activityPageSize = 50
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detailPage, setDetailPage] = useState(1)
  const [detailData, setDetailData] = useState<ActivityResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const toYMD = (date: Date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const getRangeForPreset = (preset: string) => {
    const today = new Date()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (preset === 'today') {
      const start = new Date(end)
      return { start: toYMD(start), end: toYMD(end) }
    }
    if (preset === 'yesterday') {
      const start = new Date(end)
      start.setDate(start.getDate() - 1)
      return { start: toYMD(start), end: toYMD(start) }
    }
    if (preset === 'last30') {
      const start = new Date(end)
      start.setDate(start.getDate() - 29)
      return { start: toYMD(start), end: toYMD(end) }
    }
    if (preset === 'thisWeek') {
      const start = new Date(end)
      const day = start.getDay()
      const diff = day === 0 ? -6 : 1 - day
      start.setDate(start.getDate() + diff)
      return { start: toYMD(start), end: toYMD(end) }
    }
    if (preset === 'thisMonth') {
      const start = new Date(end.getFullYear(), end.getMonth(), 1)
      return { start: toYMD(start), end: toYMD(end) }
    }
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd }
    }
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    return { start: toYMD(start), end: toYMD(end) }
  }

  useEffect(() => {
    setActivityPage(1)
    setDetailPage(1)
  }, [rangePreset, customStart, customEnd])

  useEffect(() => {
    if (!detailUserId) return
    setDetailPage(1)
    setDetailData(null)
  }, [detailUserId])

  useEffect(() => {
    let active = true
    getAuth()
      .then(payload => {
        if (!active) return
        const nextRole = payload?.user?.role || ''
        setRole(nextRole)
        if (nextRole !== 'admin') {
          setActivityLoading(false)
          setActivityError('Admin access required.')
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    let active = true
    setActivityError('')
    setActivityLoading(true)
    const range = getRangeForPreset(rangePreset)
    fetch(
      `/api/admin/activity-summary?start=${range.start}&end=${range.end}&page=${activityPage}&page_size=${activityPageSize}`,
      { credentials: 'include' }
    )
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Unable to load activity')
        }
        return res.json()
      })
      .then(payload => {
        if (!active) return
        setActivityData(
          payload && typeof payload === 'object'
            ? payload
            : { range: { start: '', end: '' }, page: 1, page_size: activityPageSize, total: 0, rows: [] }
        )
        setActivityLoading(false)
      })
      .catch((err: any) => {
        if (!active) return
        setActivityError(err?.message || 'Unable to load activity')
        setActivityLoading(false)
      })
    return () => {
      active = false
    }
  }, [role, rangePreset, customStart, customEnd, activityPage])

  useEffect(() => {
    if (role !== 'admin') return
    let active = true
    setPerfLoading(true)
    setPerfError('')
    const range = getRangeForPreset(rangePreset)
    fetch(`/api/admin/sales-performance?start=${range.start}&end=${range.end}`, {
      credentials: 'include',
    })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Unable to load performance')
        }
        return res.json()
      })
      .then(payload => {
        if (!active) return
        setPerformance(
          payload && typeof payload === 'object'
            ? payload
            : { range: { start: '', end: '' }, users: [] }
        )
        setPerfLoading(false)
      })
      .catch((err: any) => {
        if (!active) return
        setPerfError(err?.message || 'Unable to load performance')
        setPerfLoading(false)
      })
    return () => {
      active = false
    }
  }, [role, rangePreset, customStart, customEnd])

  useEffect(() => {
    if (role !== 'admin' || !detailUserId) return
    let active = true
    setDetailLoading(true)
    setDetailError('')
    const range = getRangeForPreset(rangePreset)
    const userParam = detailUserId === 'system' ? 'system' : detailUserId
    fetch(
      `/api/admin/activity-summary?start=${range.start}&end=${range.end}&page=${detailPage}&page_size=${activityPageSize}&user_id=${userParam}`,
      { credentials: 'include' }
    )
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Unable to load activity')
        }
        return res.json()
      })
      .then(payload => {
        if (!active) return
        setDetailData(
          payload && typeof payload === 'object'
            ? payload
            : { range: { start: '', end: '' }, page: 1, page_size: activityPageSize, total: 0, rows: [] }
        )
        setDetailLoading(false)
      })
      .catch((err: any) => {
        if (!active) return
        setDetailError(err?.message || 'Unable to load activity')
        setDetailLoading(false)
      })
    return () => {
      active = false
    }
  }, [role, detailUserId, detailPage, rangePreset, customStart, customEnd])

  const activityRows = useMemo(
    () => (Array.isArray(activityData?.rows) ? activityData!.rows : []),
    [activityData]
  )
  const perfRows = useMemo(
    () => (Array.isArray(performance?.users) ? performance!.users : []),
    [performance]
  )

  const sortedPerfRows = useMemo(() => {
    const rows = [...perfRows]
    return rows.sort((a, b) => {
      const convA = Number(a.conversions || 0)
      const convB = Number(b.conversions || 0)
      if (convA !== convB) return convB - convA
      const nameA = getUserLabel(a)
      const nameB = getUserLabel(b)
      return nameA.localeCompare(nameB)
    })
  }, [perfRows])

  const formatDuration = (seconds?: number | null) => {
    const total = Number(seconds || 0)
    if (!Number.isFinite(total) || total <= 0) return '0m'
    const mins = Math.round(total / 60)
    const hours = Math.floor(mins / 60)
    const rem = mins % 60
    if (!hours) return `${rem}m`
    if (!rem) return `${hours}h`
    return `${hours}h ${rem}m`
  }

  const detailPageCount = useMemo(() => {
    if (!detailData) return 1
    const size = Number(detailData.page_size || activityPageSize)
    const total = Number(detailData.total || 0)
    return Math.max(1, Math.ceil(total / (size || activityPageSize)))
  }, [detailData, activityPageSize])

  const activityUsers = useMemo(() => {
    const byUser = new Map<
      string,
      {
        user_id: number | null
        user_name?: string | null
        user_nickname?: string | null
        user_email?: string | null
        user_role?: string | null
        total: number
        counts: Record<string, number>
        recent: ActivityRow[]
      }
    >()

    for (const row of activityRows) {
      const key = row.user_id ?? 'system'
      if (!byUser.has(String(key))) {
        byUser.set(String(key), {
          user_id: row.user_id ?? null,
          user_name: row.user_name || null,
          user_nickname: row.user_nickname || null,
          user_email: row.user_email || null,
          user_role: row.user_role || null,
          total: 0,
          counts: {},
          recent: [],
        })
      }
      const entry = byUser.get(String(key))!
      entry.total += 1
      entry.counts[row.activity_type] = (entry.counts[row.activity_type] || 0) + 1
      if (entry.recent.length < 10) {
        entry.recent.push(row)
      }
    }

    return Array.from(byUser.values()).sort((a, b) => (b.total || 0) - (a.total || 0))
  }, [activityRows])

  if (activityError) {
    return (
      <div className="max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-red-600">{activityError}</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin</div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Activity Logs</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Read-only · Activity + performance visibility
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
            <select
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
              value={rangePreset}
              onChange={e => setRangePreset(e.target.value)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
            {rangePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                />
                <span className="text-neutral-400">→</span>
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-800">Sales Performance</div>
            {performance?.range && (
              <div className="text-xs text-neutral-500 mt-1">
                {performance.range.start} → {performance.range.end}
              </div>
            )}
          </div>
        </div>
        {perfLoading ? (
          <div className="mt-3 text-sm text-neutral-500">Loading performance…</div>
        ) : perfError ? (
          <div className="mt-3 text-sm text-red-600">{perfError}</div>
        ) : sortedPerfRows.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">No performance data yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="text-left py-2 font-medium">Salesperson</th>
                  <th className="text-right py-2 font-medium">Session Time</th>
                  <th className="text-right py-2 font-medium">Leads Opened</th>
                  <th className="text-right py-2 font-medium">Follow-ups</th>
                  <th className="text-right py-2 font-medium">Negotiations</th>
                  <th className="text-right py-2 font-medium">Quotes</th>
                  <th className="text-right py-2 font-medium">Conversions</th>
                  <th className="text-right py-2 font-medium">Status Changes</th>
                  <th className="text-right py-2 font-medium">Avg Time / Lead</th>
                </tr>
              </thead>
              <tbody>
                {sortedPerfRows.map(row => (
                  <tr
                    key={row.user_id}
                    className="border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-muted)]"
                    onClick={() =>
                      setExpandedUserId(prev => (prev === row.user_id ? null : row.user_id))
                    }
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span>{getUserLabel(row)}</span>
                        {row.user_role === 'admin' && (
                          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">{formatDuration(row.total_session_duration_seconds)}</td>
                    <td className="py-2 text-right">{row.leads_opened_count ?? 0}</td>
                    <td className="py-2 text-right">{row.followups_done ?? 0}</td>
                    <td className="py-2 text-right">{row.negotiations_done ?? 0}</td>
                    <td className="py-2 text-right">{row.quotes_generated ?? 0}</td>
                    <td className="py-2 text-right">{row.conversions ?? 0}</td>
                    <td className="py-2 text-right">{row.status_changes ?? 0}</td>
                    <td className="py-2 text-right">{formatDuration(row.avg_time_spent_per_lead_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expandedUserId != null && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Daily Breakdown</div>
                {(() => {
                  const userRow = sortedPerfRows.find(row => row.user_id === expandedUserId)
                  const daily = userRow?.daily || []
                  if (!daily.length) {
                    return <div className="mt-2 text-sm text-neutral-500">No daily data in this range.</div>
                  }
                  return (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-neutral-500">
                          <tr>
                            <th className="text-left py-1 font-medium">Day</th>
                            <th className="text-right py-1 font-medium">Sessions</th>
                            <th className="text-right py-1 font-medium">Leads Opened</th>
                            <th className="text-right py-1 font-medium">Follow-ups</th>
                            <th className="text-right py-1 font-medium">Conversions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daily.map(day => (
                            <tr key={day.metric_date} className="border-t border-[var(--border)]">
                              <td className="py-1">
                                {(() => {
                                  const raw = String(day.metric_date || '')
                                  if (!raw) return '—'
                                  let dateObj: Date | null = null
                                  if (raw.includes('T')) {
                                    const parsed = new Date(raw)
                                    if (!Number.isNaN(parsed.getTime())) dateObj = parsed
                                  }
                                  if (!dateObj) {
                                    const [yyyy, mm, dd] = raw.split('-')
                                    if (!yyyy || !mm || !dd) return raw
                                    dateObj = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
                                  }
                                  if (Number.isNaN(dateObj.getTime())) return raw
                                  return dateObj.toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                })()}
                              </td>
                              <td className="py-1 text-right">{day.total_sessions ?? 0}</td>
                              <td className="py-1 text-right">{day.leads_opened_count ?? 0}</td>
                              <td className="py-1 text-right">{day.followups_done ?? 0}</td>
                              <td className="py-1 text-right">{day.conversions ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
        <div className="mt-3 text-xs text-neutral-500 leading-relaxed">
          Session time isn’t the same as productivity. Conversions depend on lead quality and timing.
          Negotiations and quotes often lag conversions. These metrics are directional, not absolute.
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="text-sm font-semibold text-neutral-800">Action Breakdown</div>
        {perfLoading ? (
          <div className="mt-3 text-sm text-neutral-500">Loading breakdown…</div>
        ) : perfError ? (
          <div className="mt-3 text-sm text-red-600">{perfError}</div>
        ) : sortedPerfRows.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">No action data yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="text-left py-2 font-medium">Salesperson</th>
                  <th className="text-right py-2 font-medium">Status Changes</th>
                  <th className="text-right py-2 font-medium">Follow-ups (C / NC)</th>
                  <th className="text-right py-2 font-medium">Quote Events</th>
                  <th className="text-right py-2 font-medium">Negotiations</th>
                </tr>
              </thead>
              <tbody>
                {sortedPerfRows.map(row => (
                  <tr key={`breakdown-${row.user_id}`} className="border-t border-[var(--border)]">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span>{getUserLabel(row)}</span>
                        {row.user_role === 'admin' && (
                          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">{row.status_changes ?? 0}</td>
                    <td className="py-2 text-right">
                      {row.followups_connected ?? 0} / {row.followups_not_connected ?? 0}
                    </td>
                    <td className="py-2 text-right">
                      {(row.quote_generated ?? 0) + (row.quote_shared ?? 0)}
                    </td>
                    <td className="py-2 text-right">{row.negotiation_entries ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activityUsers.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm text-sm text-neutral-500">
          No activity logged in this range.
        </div>
      )}

      <div className="space-y-4">
        {activityUsers.map(user => (
          <div
            key={String(user.user_id ?? 'system')}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{getUserLabel(user)}</div>
                <div className="text-xs text-neutral-500">
                  {user.user_email || (user.user_id ? `User #${user.user_id}` : 'System actions')}
                </div>
              </div>
              <div className="text-sm font-medium text-neutral-700">
                {user.total} action{user.total === 1 ? '' : 's'}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Action Counts</div>
                <div className="mt-2 space-y-1 text-sm">
                  {Object.entries(user.counts || {}).map(([type, count]) => (
                    <div
                      key={`${user.user_id}-${type}`}
                      className="grid w-fit grid-cols-[240px_20px] items-center gap-x-1 text-neutral-700"
                    >
                      <span className="truncate">{activityLabel(type)}</span>
                      <span className="text-neutral-600 text-right">{count}</span>
                    </div>
                  ))}
                  {Object.keys(user.counts || {}).length === 0 && (
                    <div className="text-neutral-500">No actions logged.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Recent Activity</div>
                {(() => {
                  const items = user.recent || []
                  if (items.length === 0) {
                    return <div className="mt-2 text-neutral-500">No recent activity.</div>
                  }

                  const groups = groupActivitiesByLead(items)
                  const userKey = String(user.user_id ?? 'system')
                  const showDetail = detailUserId === userKey

                  return (
                    <div className="mt-2 space-y-3 text-sm">
                      {groups.map(group => {
                        if (group.standalone) {
                          const activity = group.items[0]
                          if (!activity) return null
                          const display = formatActivityDetails(activity)
                          const actor = getActivityActor(activity)
                          return (
                            <div
                              key={group.key}
                              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                            >
                              <div className="text-neutral-800 whitespace-pre-line">
                                {display.title}
                                {display.metaText && (
                                  <div className="text-xs text-neutral-500 mt-1">{display.metaText}</div>
                                )}
                              </div>
                              <div className="text-xs text-neutral-500 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span>{actor.label}</span>
                                  {actor.isSystem && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                      System
                                    </span>
                                  )}
                                </div>
                                <div>{formatDateTime(activity.created_at)}</div>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={group.key}
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                          >
                            <div className="text-xs font-medium text-neutral-700">{group.label}</div>
                            <div className="mt-2 space-y-2 text-sm">
                              {group.items.map(activity => {
                                const display = formatActivityDetails(activity)
                                const actor = getActivityActor(activity)
                                return (
                                  <div
                                    key={activity.id}
                                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                                  >
                                    <div className="text-neutral-800 whitespace-pre-line">
                                      {display.title}
                                      {display.metaText && (
                                        <div className="text-xs text-neutral-500 mt-1">
                                          {display.metaText}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-neutral-500 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <span>{actor.label}</span>
                                        {actor.isSystem && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                            System
                                          </span>
                                        )}
                                      </div>
                                      <div>{formatDateTime(activity.created_at)}</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                        onClick={() => {
                          setDetailPage(1)
                          setDetailUserId(prev => (prev === userKey ? null : userKey))
                        }}
                      >
                        {showDetail ? 'Hide' : 'View more'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>

            {detailUserId === String(user.user_id ?? 'system') && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-neutral-800">All Activity</div>
                    {detailData?.range && (
                      <div className="text-xs text-neutral-500 mt-1">
                        {detailData.range.start} → {detailData.range.end}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 disabled:opacity-40"
                      disabled={detailPage <= 1 || detailLoading}
                      onClick={() => setDetailPage(prev => Math.max(1, prev - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {detailPage} of {detailPageCount}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 disabled:opacity-40"
                      disabled={detailPage >= detailPageCount || detailLoading}
                      onClick={() => setDetailPage(prev => Math.min(detailPageCount, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="mt-3 text-sm text-neutral-500">Loading activity…</div>
                ) : detailError ? (
                  <div className="mt-3 text-sm text-red-600">{detailError}</div>
                ) : !detailData || detailData.rows.length === 0 ? (
                  <div className="mt-3 text-sm text-neutral-500">No activity logged in this range.</div>
                ) : (
                  <div className="mt-4 space-y-3 text-sm">
                    {groupActivitiesByLead(detailData.rows).map(group => {
                      if (group.standalone) {
                        const activity = group.items[0]
                        if (!activity) return null
                        const display = formatActivityDetails(activity)
                        const actor = getActivityActor(activity)
                        return (
                          <div
                            key={group.key}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                          >
                            <div className="text-neutral-800 whitespace-pre-line">
                              {display.title}
                              {display.metaText && (
                                <div className="text-xs text-neutral-500 mt-1">{display.metaText}</div>
                              )}
                            </div>
                            <div className="text-xs text-neutral-500 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{actor.label}</span>
                                {actor.isSystem && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                    System
                                  </span>
                                )}
                              </div>
                              <div>{formatDateTime(activity.created_at)}</div>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={group.key}
                          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                        >
                          <div className="text-xs font-medium text-neutral-700">{group.label}</div>
                          <div className="mt-2 space-y-2 text-sm">
                            {group.items.map(activity => {
                              const display = formatActivityDetails(activity)
                              const actor = getActivityActor(activity)
                              return (
                                <div
                                  key={`${activity.source || 'activity'}-${activity.id}`}
                                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                                >
                                  <div className="text-neutral-800 whitespace-pre-line">
                                    {display.title}
                                    {display.metaText && (
                                      <div className="text-xs text-neutral-500 mt-1">
                                        {display.metaText}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-neutral-500 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <span>{actor.label}</span>
                                      {actor.isSystem && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                          System
                                        </span>
                                      )}
                                    </div>
                                    <div>{formatDateTime(activity.created_at)}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
