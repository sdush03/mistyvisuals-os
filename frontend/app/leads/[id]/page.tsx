'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getRouteStateKey, readRouteState, writeRouteState, shouldRestoreScroll } from '@/lib/routeState'
import PhoneActions from '@/components/PhoneActions'
import { formatINR, formatDate, formatDateTime, toISTDateInput } from '@/lib/formatters'
import { formatLeadName } from '@/lib/leadNameFormat'
import DuplicateContactModal, { type DuplicateResults } from '@/components/DuplicateContactModal'
import { checkContactDuplicates, hasDuplicates } from '@/lib/contactDuplicates'
import FollowUpActionPopup from '@/components/FollowUpActionPopup'
import { buildConversionSummary, type ConversionSummary } from '@/lib/conversionSummary'
import PhoneField from '@/components/PhoneField'
import CalendarInput from '@/components/CalendarInput'
import VenueAutocomplete from '@/components/VenueAutocomplete'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

const api = (url: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {}
  if (init.method !== 'DELETE' && init.method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    }
  })
}

const STATUSES = ['New','Contacted','Quoted','Follow Up','Negotiation','Awaiting Advance','Converted','Lost','Rejected']
const HEAT = ['Cold','Warm','Hot']
const SLOTS = ['Morning','Day','Evening','Night']
const COVERAGES = ['Both Sides','Bride Side','Groom Side']

const EVENT_TYPES = [
  'Haldi',
  'Haldi (Bride)',
  'Haldi (Groom)',
  'Mehendi',
  'Mehendi (Bride)',
  'Mehendi (Groom)',
  'Engagement',
  'Pre Wedding',
  'Pre Wedding (1 Day)',
  'Pre Wedding (2 Days)',
  'Cocktail',
  'Cocktail (Bride)',
  'Cocktail (Groom)',
  'Sangeet',
  'Sangeet (Bride)',
  'Sangeet (Groom)',
  'Wedding',
  'Reception',
  'Reception (Bride)',
  'Reception (Groom)',
  'Bhaat',
  'Bhaat (Bride)',
  'Bhaat (Groom)',
  'Chooda',
  'Mayra',
  'Mayra (Bride)',
  'Mayra (Groom)',
  'Dhol Night',
  'Dhol Night (Bride)',
  'Dhol Night (Groom)',
  'Mata ki Chowki',
  'Mata ki Chowki (Bride)',
  'Mata ki Chowki (Groom)',
  'Satsang',
  'Satsang (Bride)',
  'Satsang (Groom)',
  'Jaago',
  'Jaago (Bride)',
  'Jaago (Groom)',
]

const REJECT_REASONS = [
  'Low budget',
  'Not our type of work',
  'Dates not available',
  'Client not responsive',
  'Other',
]
const LOST_REASONS = [
  { label: 'Client stopped responding', icon: '📵' },
  { label: 'Went with another vendor', icon: '🔄' },
  { label: 'Budget mismatch', icon: '💸' },
  { label: 'Event cancelled', icon: '🚫' },
  { label: 'Dates not available', icon: '📅' },
  { label: 'Other', icon: '✏️' },
]

const toTimeOnly = (value?: string | null) => {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5)
  return raw
}

const EMAIL_TYPO_MAP: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'outlook.con': 'outlook.com',
}
const COMMON_TLDS = ['com', 'in', 'co', 'org', 'net', 'edu', 'gov']
const COMPOUND_TLDS = ['co.in', 'org.in']

const normalizePhone = (value?: string | null) => {
  if (!value) return null
  const parsed = parsePhoneNumberFromString(value, 'IN')
  if (!parsed || !parsed.isValid()) return null
  return parsed.format('E.164')
}

const isValidPhone = (value?: string | null) => {
  if (!value) return false
  const parsed = parsePhoneNumberFromString(value, 'IN')
  return Boolean(parsed && parsed.isValid())
}

const formatName = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

const isValidInstagramUsername = (value: string) => /^[a-z0-9._]{1,30}$/.test(value)


const validateEmail = (value: string) => {
  if (!value) return { valid: true, normalized: '', warning: null }
  let normalized = value.trim().toLowerCase()
  normalized = normalized.replace(/^https?:\/\//, '')
  const atParts = normalized.split('@')
  if (atParts.length !== 2) return { valid: false, normalized, warning: null }
  let [local, domain] = atParts
  if (!local || !domain) return { valid: false, normalized, warning: null }
  if (EMAIL_TYPO_MAP[domain]) domain = EMAIL_TYPO_MAP[domain]
  normalized = `${local}@${domain}`

  if (!domain.includes('.')) return { valid: false, normalized, warning: null }
  const parts = domain.split('.')
  const tld = parts[parts.length - 1]
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { valid: false, normalized, warning: null }
  }
  const lastTwo = parts.slice(-2).join('.')
  const isAllowed = COMMON_TLDS.includes(tld) || COMPOUND_TLDS.includes(lastTwo)

  const label = parts[0] || ''
  if (label.length >= 5 && !/[aeiou]/.test(label)) {
    return { valid: false, normalized, warning: null }
  }

  if (!isAllowed) {
    return { valid: true, normalized, warning: 'This email domain looks uncommon. Please double-check.' }
  }

  return { valid: true, normalized, warning: null }
}

const formatTimeDisplay = (value?: string | null) => {
  const t = toTimeOnly(value)
  if (!t || !t.includes(':')) return t || ''
  const [hh, mm] = t.split(':')
  const hourNum = Number(hh)
  if (Number.isNaN(hourNum)) return t
  const ampm = hourNum >= 12 ? 'PM' : 'AM'
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12
  return `${displayHour}:${mm} ${ampm}`
}

const parseTimeInput = (value: string) => {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([ap]m)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  let minute = Number(match[2] ?? '0')
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null
  const meridiem = match[3]
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = 0
    if (meridiem.toLowerCase() === 'pm') hour += 12
  } else if (hour > 23) {
    return null
  }
  const rounded = minute < 15 ? 0 : minute < 45 ? 30 : 60
  if (rounded === 60) {
    hour = (hour + 1) % 24
    minute = 0
  } else {
    minute = rounded
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const addMinutes = (value: string, delta: number) => {
  const base = toTimeOnly(value || '00:00')
  const [hh, mm] = base.split(':').map(Number)
  const total = (hh * 60 + mm + delta + 1440) % 1440
  const nextHour = Math.floor(total / 60)
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

const isTerminalStatus = (status?: string | null) =>
  status === 'Converted' || status === 'Lost' || status === 'Rejected'

const FOLLOWUP_REQUIRED_STATUSES = ['Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance']

const isFollowupRequired = (status?: string | null) =>
  status ? FOLLOWUP_REQUIRED_STATUSES.includes(status) : false

const isFollowupDueOrOverdue = (value?: string | null) => {
  if (!value) return false
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return false
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return t <= today
}

const mergeLeadFieldChanges = (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  const contactFields = new Set([
    'name',
    'phone_primary',
    'phone_secondary',
    'email',
    'instagram',
    'source',
    'source_name',
    'bride_name',
    'bride_phone_primary',
    'bride_phone_secondary',
    'bride_email',
    'bride_instagram',
    'groom_name',
    'groom_phone_primary',
    'groom_phone_secondary',
    'groom_email',
    'groom_instagram',
  ])
  const detailFields = new Set([
    'event_type',
    'is_destination',
    'coverage_scope',
    'potential',
    'important',
    'amount_quoted',
    'client_budget_amount',
    'cities',
    'discounted_amount',
    'client_offer_amount',
  ])

  const resolveSection = (meta: any) => {
    const direct = String(meta?.section || '').trim()
    if (direct) return direct
    const field = meta?.field
    if (field && contactFields.has(field)) return 'contact'
    if (field && detailFields.has(field)) return 'details'
    return ''
  }

  const toChangeMap = (meta: any) => {
    if (meta?.changes && typeof meta.changes === 'object') return meta.changes
    if (meta?.field) {
      return {
        [meta.field]: { from: meta.from ?? null, to: meta.to ?? null },
      }
    }
    return {}
  }

  const normalizedRows = rows.map((row: any) => {
    if (row?.activity_type === 'pricing_change') {
      return {
        ...row,
        activity_type: 'lead_field_change',
        metadata: {
          ...row.metadata,
          section: 'details',
          field: row.metadata?.field,
          from: row.metadata?.from,
          to: row.metadata?.to,
        },
      }
    }
    return row
  })

  const merged: any[] = []
  const windowMs = 2000

  for (const row of normalizedRows) {
    if (row?.activity_type !== 'lead_field_change') {
      merged.push(row)
      continue
    }

    const section = resolveSection(row?.metadata)
    const last = merged[merged.length - 1]
    if (last?.activity_type === 'lead_field_change') {
      const lastSection = resolveSection(last?.metadata)
      const sameLead = last?.lead_id && row?.lead_id && last.lead_id === row.lead_id
      const sameUser = last?.user_id && row?.user_id && last.user_id === row.user_id
      const lastTime = new Date(last?.created_at || 0).getTime()
      const currentTime = new Date(row?.created_at || 0).getTime()
      const closeInTime =
        Number.isFinite(lastTime) &&
        Number.isFinite(currentTime) &&
        Math.abs(currentTime - lastTime) <= windowMs

      if (sameLead && sameUser && lastSection === section && closeInTime) {
        const lastMeta = (last.metadata && typeof last.metadata === 'object') ? { ...last.metadata } : {}
        const nextMeta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {}
        const mergedChanges = {
          ...toChangeMap(lastMeta),
          ...toChangeMap(nextMeta),
        }
        merged[merged.length - 1] = {
          ...last,
          metadata: {
            ...lastMeta,
            section: lastSection || section,
            changes: mergedChanges,
          },
        }
        continue
      }
    }

    const baseMeta = (row.metadata && typeof row.metadata === 'object') ? { ...row.metadata } : {}
    merged.push({
      ...row,
      metadata: {
        ...baseMeta,
        section: section || baseMeta.section,
        changes: toChangeMap(baseMeta),
      },
    })
  }

  return merged
}

const formatActivityDetails = (activity: any) => {
  const type = activity?.activity_type
  const meta = activity?.metadata || {}
  let title = 'Activity updated'
  let metaText = ''

  const toDateOnly = (val?: string | null) => {
    if (!val) return ''
    if (String(val).startsWith('2099-01-01')) return 'TBD'
    return String(val).slice(0, 10)
  }
  const formatDateShort = (val?: string | null) => {
    const d = toDateOnly(val)
    if (!d || d === 'TBD') return 'TBD'
    return d
  }

  if (type === 'lead_created') {
    title = 'Lead created'
    if (meta?.source) {
      metaText = `Source: ${meta.source}`
    }
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
    if (meta?.from && meta?.to) {
      metaText = `${meta.from} → ${meta.to}`
    }
  } else if (type === 'heat_change') {
    title = 'Heat changed'
    if (meta?.from && meta?.to) {
      metaText = `${meta.from} → ${meta.to}`
    }
  } else if (type === 'assigned_user_change') {
    title = 'Owner updated'
    metaText = `Assigned User ID changed`
  } else if (type === 'lead_field_change') {
    const section = String(meta?.section || '')
    if (section === 'contact') title = 'Contact updated'
    else if (section === 'details') title = 'Details updated'
    else title = 'Field updated'

    const fieldLabel = (field: string) => {
      switch (field) {
        case 'amount_quoted':
          return 'Amount quoted'
        case 'discounted_amount':
          return 'Discounted'
        case 'client_offer_amount':
          return 'Client offer'
        case 'client_budget_amount':
          return 'Client budget'
        case 'phone_primary':
          return 'Primary phone'
        case 'phone_secondary':
          return 'Secondary phone'
        case 'bride_phone_primary':
          return 'Bride primary phone'
        case 'bride_phone_secondary':
          return 'Bride secondary phone'
        case 'groom_phone_primary':
          return 'Groom primary phone'
        case 'groom_phone_secondary':
          return 'Groom secondary phone'
        case 'event_type':
          return 'Event type'
        case 'coverage_scope':
          return 'Coverage'
        case 'is_destination':
          return 'Destination'
        case 'source_name':
          return 'Source name'
        default:
          return field ? String(field).replace(/_/g, ' ') : 'Field'
      }
    }

    const formatFieldValue = (field: string, value: any) => {
      if (value === undefined || value === null || value === '') return '—'
      if (
        field === 'amount_quoted' ||
        field === 'client_budget_amount' ||
        field === 'client_offer_amount' ||
        field === 'discounted_amount'
      ) {
        return formatINR(Number(value)) || String(value)
      }
      if (typeof value === 'boolean') return value ? 'Yes' : 'No'
      return String(value)
    }

    if (meta?.changes && typeof meta.changes === 'object') {
      const entries = Object.entries(meta.changes)
      const parts = entries.map(([field, change]) => {
        const from = formatFieldValue(field, (change as any)?.from)
        const to = formatFieldValue(field, (change as any)?.to)
        return `${fieldLabel(field)}: ${from} → ${to}`
      })
      metaText = parts.join('\n')
    } else {
      const fieldLabelValue =
        meta?.field === 'amount_quoted'
          ? 'Amount quoted'
          : meta?.field === 'client_budget_amount'
            ? 'Client budget'
            : meta?.field
              ? String(meta.field).replace(/_/g, ' ')
              : 'Field'
      const fromValue =
        typeof meta?.from === 'number' ? formatINR(meta.from) : meta?.from ?? '—'
      const toValue =
        typeof meta?.to === 'number' ? formatINR(meta.to) : meta?.to ?? '—'
      metaText = `${fieldLabelValue}: ${fromValue} → ${toValue}`
    }
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
      const entries = Object.entries(meta.changes)
      const parts = entries.map(([field, change]) => {
        const from = (change as any)?.from ?? '—'
        const to = (change as any)?.to ?? '—'
        return `${field.replace(/_/g, ' ')}: ${from} → ${to}`
      })
      metaText = parts.join('\n')
    }
  } else if (type === 'event_delete') {
    title = 'Event removed'
    const date = meta?.event_date ? formatDateShort(meta.event_date) : ''
    const name = meta?.event_name || 'Event'
    metaText = [name, date].filter(Boolean).join(' · ')
  } else if (type === 'custom_note') {
    title = 'Note added'
    if (meta?.text) metaText = String(meta.text)
  } else if (type === 'negotiation_entry') {
    title = 'Negotiation note added'
    if (meta?.topic) metaText = `Topic: ${meta.topic}`
  } else if (type === 'quote_generated') {
    title = meta?.reused ? 'Quote generated (no changes)' : 'Quote generated'
    if (meta?.quote_number) metaText = `Quote: ${meta.quote_number}`
  } else if (type === 'quote_shared_whatsapp') {
    title = 'Proposal shared on WhatsApp'
    if (meta?.quote_number) metaText = `Quote: ${meta.quote_number}`
  }

  return { title, metaText }
}

const suggestTimesForSlot = (slot: string) => {
  if (slot === 'Morning') return { start: '10:00', end: '14:00' }
  if (slot === 'Day') return { start: '12:00', end: '17:00' }
  if (slot === 'Evening') return { start: '18:00', end: '00:00' }
  if (slot === 'Night') return { start: '18:00', end: '04:00' }
  return null
}

const suggestedPax = (eventType: string) => {
  const t = eventType.toLowerCase()
  if (t.includes('wedding') || t.includes('reception') || t.includes('engagement')) return 250
  if (t.includes('(bride)') || t.includes('(groom)')) return 60
  return 120
}

const normalizeInstagramInput = (value: string) => {
  const trimmed = value.trim().toLowerCase()
  const noProtocol = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')
  const noDomain = noProtocol.replace(/^instagram\.com\/?/i, '')
  const noAt = noDomain.replace(/^@/, '')
  const firstSegment = noAt.split(/[/?#]/)[0]
  return firstSegment.trim()
}

const Field = ({label,value}:{label:string;value?:any}) => {
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPhoneDropdown) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPhoneDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPhoneDropdown])

  if (value == null || value === '' || value === false) return null
  const isInstagram = label.toLowerCase() === 'instagram'
  const isPhone = label.toLowerCase().includes('phone')
  const isEmail = label.toLowerCase() === 'email'

  const username = isInstagram ? String(value).replace(/^@/, '') : ''
  const cleanPhone = isPhone ? String(value).replace(/\s+/g, '') : ''
  const waPhone = cleanPhone.replace(/^\+/, '')

  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-neutral-50 last:border-0 relative">
      <span className="text-xs text-neutral-400 shrink-0 w-32">{label}</span>
      <span className="text-xs font-medium text-neutral-800 text-right relative">
        {isInstagram ? (
          <a
            href={`https://instagram.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline cursor-pointer text-neutral-800"
          >
            {String(value)}
          </a>
        ) : isEmail ? (
          <a
            href={`mailto:${String(value)}`}
            className="hover:underline cursor-pointer text-neutral-800"
          >
            {String(value)}
          </a>
        ) : isPhone ? (
          <div className="relative inline-block" ref={dropdownRef}>
            <button
              onClick={() => setShowPhoneDropdown(!showPhoneDropdown)}
              className="hover:underline cursor-pointer outline-none bg-transparent border-0 p-0 text-xs font-medium text-neutral-800 text-right"
            >
              {String(value)}
            </button>
            
            {showPhoneDropdown && (
              <div className="absolute right-0 mt-1 w-32 bg-white border border-neutral-200 rounded-xl shadow-lg py-1.5 z-50 animate-fade-in origin-top-right">
                <a
                  href={`tel:${cleanPhone}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition text-left font-normal"
                  onClick={() => setShowPhoneDropdown(false)}
                >
                  <span>📞</span>
                  <span>Call</span>
                </a>
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition text-left font-normal"
                  onClick={() => setShowPhoneDropdown(false)}
                >
                  <span>💬</span>
                  <span>WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        ) : (
          String(value)
        )}
      </span>
    </div>
  )
}

const SectionHead = ({label,onEdit,editing,onCancel,disabled}:{label:string;onEdit?:()=>void;editing?:boolean;onCancel?:()=>void;disabled?:boolean}) => (
  <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</span>
    {onEdit && !editing && !disabled && <button onClick={onEdit} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>}
    {editing && <button onClick={onCancel} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Cancel</button>}
  </div>
)

const Input = ({
  label,
  val,
  onChange,
  type = 'text',
  placeholder,
  hasError,
  shake,
  errorMsg,
  disabled
}: {
  label: string
  val: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hasError?: boolean
  shake?: boolean
  errorMsg?: string
  disabled?: boolean
}) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">{label}</label>
    <input
      type={type}
      value={val}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full text-sm px-3 py-2 rounded-xl border bg-neutral-50 outline-none focus:border-neutral-600 transition ${
        disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''
      } ${
        hasError ? 'field-error' : 'border-neutral-200'
      } ${hasError && shake ? 'shake' : ''}`}
    />
    {hasError && errorMsg && (
      <div className="text-xs text-red-600 mt-1 font-medium animate-fade-in">{errorMsg}</div>
    )}
  </div>
)

const Select = ({
  label,
  val,
  onChange,
  opts,
  hasError,
  shake,
  errorMsg
}: {
  label: string
  val: string
  onChange: (v: string) => void
  opts: string[]
  hasError?: boolean
  shake?: boolean
  errorMsg?: string
}) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">{label}</label>
    <select
      value={val}
      onChange={e => onChange(e.target.value)}
      className={`w-full text-sm px-3 py-2 rounded-xl border bg-neutral-50 outline-none focus:border-neutral-600 transition ${
        hasError ? 'field-error' : 'border-neutral-200'
      } ${hasError && shake ? 'shake' : ''}`}
    >
      <option value="">Select…</option>
      {opts.map(o => (
        <option key={o}>{o}</option>
      ))}
    </select>
    {hasError && errorMsg && (
      <div className="text-xs text-red-600 mt-1 font-medium animate-fade-in">{errorMsg}</div>
    )}
  </div>
)

const SaveBtn = ({onClick,label='Save',saving}:{onClick:()=>void;label?:string;saving?:boolean}) => (
  <div className="flex justify-end pt-3 border-t border-neutral-100">
    <button onClick={onClick} disabled={saving}
      className="px-5 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">
      {saving?'Saving…':label}
    </button>
  </div>
)

type Tab = 'overview' | 'profile' | 'timeline' | 'quotes'
type EditSection = 'contact' | 'details' | 'cities' | null
type EditingEvent = { id: string | null; data: any } | null

function computeLatestSentPricing(allVersions: any[]) {
  const latestSent = allVersions.find((v: any) => v.status !== 'DRAFT')
  if (!latestSent) return null

  const draft = typeof latestSent.draftDataJson === 'string' ? JSON.parse(latestSent.draftDataJson) : (latestSent.draftDataJson || {})
  const isTiered = draft.pricingMode === 'TIERED'
  
  let amountQuoted: number | null = null
  let discountedAmount: number | null = null

  if (isTiered) {
    const starredTier = (draft.tiers || []).find((t: any) => t.isPopular) || draft.tiers?.[0]
    if (starredTier) {
      amountQuoted = starredTier.overridePrice ?? starredTier.price
      discountedAmount = starredTier.discountedPrice ?? null
    }
  } else {
    const activeTier = (draft.tiers || []).find((t: any) => t.id === draft.selectedTierId) || draft.tiers?.[0]
    if (activeTier) {
      amountQuoted = activeTier.overridePrice ?? activeTier.price
      discountedAmount = activeTier.discountedPrice ?? null
    } else {
      amountQuoted = draft.overridePrice ?? (latestSent.calculatedPrice ? parseFloat(latestSent.calculatedPrice) : null)
      const hasDiscount = draft.expirySettings?.discountEnabled && draft.expirySettings?.discountAmount
      discountedAmount = (hasDiscount && amountQuoted != null) ? (amountQuoted - (draft.expirySettings.discountAmount || 0)) : null
    }
  }
  return { amountQuoted, discountedAmount }
}

export default function LeadV2Page() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const searchParams = useSearchParams()
  const routeKey = typeof window !== 'undefined' ? getRouteStateKey(window.location.pathname) : ''
  const [tab, setTab] = useState<Tab>('overview')
  const [tabInitialized, setTabInitialized] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !id || tabInitialized) return
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    const restoreAllowed = shouldRestoreScroll()
    const storedState = restoreAllowed && routeKey ? readRouteState(routeKey) : null
    const storedTab = storedState?.activeTab
    
    if (
      tabParam === 'overview' ||
      tabParam === 'profile' ||
      tabParam === 'timeline' ||
      tabParam === 'quotes'
    ) {
      setTab(tabParam as Tab)
      setTabInitialized(true)
      return
    }
    
    if (
      storedTab === 'overview' ||
      storedTab === 'profile' ||
      storedTab === 'timeline' ||
      storedTab === 'quotes'
    ) {
      setTab(storedTab as Tab)
      setTabInitialized(true)
      return
    }
    
    if (restoreAllowed) {
      const key = `lead_tab_v2:${id}`
      const saved = sessionStorage.getItem(key)
      if (
        saved === 'overview' ||
        saved === 'profile' ||
        saved === 'timeline' ||
        saved === 'quotes'
      ) {
        setTab(saved as Tab)
        setTabInitialized(true)
        return
      }
    }
    setTab('overview')
    setTabInitialized(true)
  }, [id, routeKey, tabInitialized])

  useEffect(() => {
    if (typeof window === 'undefined' || !id || !tabInitialized) return
    const key = `lead_tab_v2:${id}`
    sessionStorage.setItem(key, tab)
    if (routeKey) {
      writeRouteState(routeKey, { activeTab: tab })
    }
  }, [id, tab, routeKey, tabInitialized])

  useEffect(() => {
    if (typeof window === 'undefined' || !id || !tabInitialized) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === tab) return
    const isFirstWrite = !params.has('tab')
    params.set('tab', tab)
    if (isFirstWrite) {
      window.history.replaceState(null, '', `/leads/${id}?${params.toString()}`)
    } else {
      window.history.pushState(null, '', `/leads/${id}?${params.toString()}`)
    }
  }, [id, tab, tabInitialized])

  useEffect(() => {
    if (typeof window === 'undefined' || !id || !tabInitialized) return
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (tabParam && tabParam !== tab) {
        if (['overview', 'profile', 'timeline', 'quotes'].includes(tabParam)) {
          setTab(tabParam as Tab)
        }
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [id, tab, tabInitialized])
  const [lead, setLead] = useState<any>(null)
  const isConverted = lead?.status === 'Converted'
  const [enrichment, setEnrichment] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'activities' | 'notes'>('all')
  const [quotes, setQuotes] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [versionsByGroup, setVersionsByGroup] = useState<Record<number, any[]>>({})
  const [loading, setLoading] = useState(true)
  // Quote group management states
  const [creatingVersion, setCreatingVersion] = useState<number | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [showNewQuoteForm, setShowNewQuoteForm] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<number[]>([])
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editGroupTitle, setEditGroupTitle] = useState('')
  const [quoteDeleteConfirm, setQuoteDeleteConfirm] = useState<{type: 'group' | 'version', id: number, groupId?: number, title: string} | null>(null)
  const [isQuoteDeleting, setIsQuoteDeleting] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [heatLoading, setHeatLoading] = useState(false)
  const [editSection, setEditSection] = useState<EditSection>(null)
  const [contactForm, setContactForm] = useState<any>({})
  const [detailsForm, setDetailsForm] = useState<any>({})
  const [citiesForm, setCitiesForm] = useState<any[]>([])
  const [newCityName, setNewCityName] = useState('')
  const [editingEvent, setEditingEvent] = useState<EditingEvent>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null)
  const [allCities, setAllCities] = useState<any[]>([])
  const noticeTimer = useRef<any>(null)

  const [contactErrors, setContactErrors] = useState<any>({})
  const [contactShake, setContactShake] = useState(false)
  const [detailsErrors, setDetailsErrors] = useState<any>({})
  const [detailsShake, setDetailsShake] = useState(false)
  const [eventErrors, setEventErrors] = useState<any>({})
  const [eventShake, setEventShake] = useState(false)

  // New features state
  const [assignableUsers, setAssignableUsers] = useState<any[]>([])
  const [userRole, setUserRole] = useState('')
  const [brideSameAsLead, setBrideSameAsLead] = useState(false)
  const [groomSameAsLead, setGroomSameAsLead] = useState(false)
  const [contactDuplicateData, setContactDuplicateData] = useState<DuplicateResults | null>(null)
  const [showContactDuplicate, setShowContactDuplicate] = useState(false)
  const [eventDuplicates, setEventDuplicates] = useState<any[]>([])
  const [showEventDuplicateModal, setShowEventDuplicateModal] = useState(false)
  const [dateLoads, setDateLoads] = useState<any[]>([])
  const [selectedLoadDate, setSelectedLoadDate] = useState<string | null>(null)
  const [loadDetails, setLoadDetails] = useState<any[]>([])
  const [loadDetailsLoading, setLoadDetailsLoading] = useState(false)
  const [followupPopupOpen, setFollowupPopupOpen] = useState(false)
  const [followupPopupDefaultDone, setFollowupPopupDefaultDone] = useState(false)
  const [showEventSuggestions, setShowEventSuggestions] = useState(false)

  // Status modals states
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('Low budget')
  const [rejectOther, setRejectOther] = useState('')
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('Client stopped responding')
  const [lostOther, setLostOther] = useState('')

  // Convert states
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false)
  const [convertSummary, setConvertSummary] = useState<ConversionSummary | null>(null)
  const [convertSaving, setConvertSaving] = useState(false)
  const [convertLeadSnapshot, setConvertLeadSnapshot] = useState<any>(null)

  // Deletion states
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null)

  const showNotice = (msg: string, ok = true) => {
    setNotice({ msg, ok })
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3000)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const [l, e, n, a, groupData, c, dupEvents, dateLoadsData] = await Promise.all([
      api(`/api/leads/${id}`).then(r => r.json()).catch(() => null),
      api(`/api/leads/${id}/enrichment`).then(r => r.json()).catch(() => null),
      api(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => []),
      api(`/api/leads/${id}/activities`).then(r => r.json()).catch(() => []),
      api(`/api/leads/${id}/quote-groups`).then(r => r.json()).catch(() => []),
      api('/api/cities').then(r => r.json()).catch(() => []),
      api(`/api/leads/${id}/event-duplicates`).then(r => r.json()).catch(() => ({ matches: [] })),
      api(`/api/leads/${id}/date-loads`).then(r => r.json()).catch(() => ({ dateLoads: [] })),
    ])

    let allVersions: any[] = []
    if (Array.isArray(groupData) && groupData.length > 0) {
      try {
        const versionResponses = await Promise.all(
          groupData.map((g: any) =>
            api(`/api/quote-groups/${g.id}/versions`)
              .then(async (res) => ({ group: g, list: await res.json().catch(() => []) }))
              .catch(() => ({ group: g, list: [] }))
          )
        )
        const nextVersionsByGroup: Record<number, any[]> = {}
        versionResponses.forEach((entry) => {
          const group = entry.group
          const list = Array.isArray(entry.list) ? entry.list : []
          nextVersionsByGroup[group.id] = list
          list.forEach((v: any) => {
            allVersions.push({
              id: v.id,
              version: v.versionNumber,
              status: v.status,
              total_amount: v.calculatedPrice ? parseFloat(v.calculatedPrice) : null,
              discounted_amount: v.salesOverridePrice ? parseFloat(v.salesOverridePrice) : (v.softDiscountPrice ? parseFloat(v.softDiscountPrice) : null),
              created_at: v.createdAt,
              group_title: group.title,
              group_id: group.id,
              draftDataJson: v.draftDataJson,
              calculatedPrice: v.calculatedPrice
            })
          })
        })
        setVersionsByGroup(nextVersionsByGroup)
      } catch (err) {
        console.error('Error fetching quote versions:', err)
      }
    } else {
      setVersionsByGroup({})
    }
    allVersions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const pricing = computeLatestSentPricing(allVersions)
    let finalLead = l
    let finalEnrichment = e

    if (pricing && l) {
      const dbAmountQuoted = l.amount_quoted != null ? parseFloat(l.amount_quoted) : null
      const dbDiscountedAmount = l.discounted_amount != null ? parseFloat(l.discounted_amount) : null
      
      const calcAmountQuoted = pricing.amountQuoted != null ? parseFloat(String(pricing.amountQuoted)) : null
      const calcDiscountedAmount = pricing.discountedAmount != null ? parseFloat(String(pricing.discountedAmount)) : null

      if (dbAmountQuoted !== calcAmountQuoted || dbDiscountedAmount !== calcDiscountedAmount) {
        try {
          await api(`/api/leads/${id}/enrichment`, {
            method: 'PATCH',
            body: JSON.stringify({
              amount_quoted: calcAmountQuoted,
              discounted_amount: calcDiscountedAmount
            })
          })
          finalLead = {
            ...l,
            amount_quoted: calcAmountQuoted,
            discounted_amount: calcDiscountedAmount
          }
          if (e) {
            finalEnrichment = {
              ...e,
              amount_quoted: calcAmountQuoted,
              discounted_amount: calcDiscountedAmount
            }
          }
        } catch (err) {
          console.error('Error syncing dynamic pricing to backend:', err)
        }
      }
    }

    setLead(finalLead)
    setEnrichment(finalEnrichment)
    setNotes(Array.isArray(n) ? n : [])
    setActivities(Array.isArray(a) ? a : [])
    setQuotes(allVersions)
    setGroups(Array.isArray(groupData) ? groupData : [])
    setAllCities(Array.isArray(c) ? c : [])
    setEventDuplicates(dupEvents?.matches || [])
    setDateLoads(dateLoadsData?.dateLoads || [])
    if (l) {
      setContactForm({
        name: l.name||'', phone_primary: l.primary_phone||'', phone_secondary: l.phone_secondary||'',
        email: l.email||'', instagram: l.instagram||'',
        bride_name: l.bride_name||'', bride_phone_primary: l.bride_phone_primary||'', bride_phone_secondary: l.bride_phone_secondary||'', bride_email: l.bride_email||'', bride_instagram: l.bride_instagram||'',
        groom_name: l.groom_name||'', groom_phone_primary: l.groom_phone_primary||'', groom_phone_secondary: l.groom_phone_secondary||'', groom_email: l.groom_email||'', groom_instagram: l.groom_instagram||'',
        source: l.source||'', source_name: l.source_name||'',
      })

      const isBrideSame = !!(l.name && l.bride_name === l.name && (l.bride_phone_primary || '') === (l.primary_phone || '') && (l.bride_email || '') === (l.email || ''))
      const isGroomSame = !isBrideSame && !!(l.name && l.groom_name === l.name && (l.groom_phone_primary || '') === (l.primary_phone || '') && (l.groom_email || '') === (l.email || ''))
      setBrideSameAsLead(isBrideSame)
      setGroomSameAsLead(isGroomSame)

      // Run duplicate check
      const phones = [
        l.primary_phone,
        l.phone_secondary,
        l.bride_phone_primary,
        l.groom_phone_primary
      ].filter(Boolean)
      const emails = [
        l.email,
        l.bride_email,
        l.groom_email
      ].filter(Boolean)
      const instagrams = [l.instagram].filter(Boolean)

      checkContactDuplicates({
        leadId: Number(id),
        phones,
        emails,
        instagrams,
      }).then(duplicates => {
        if (hasDuplicates(duplicates)) {
          setContactDuplicateData(duplicates)
        } else {
          setContactDuplicateData(null)
        }
      }).catch(() => {})
    }
    if (finalEnrichment) {
      const isPot = finalEnrichment.potential === true || String(finalEnrichment.potential).toLowerCase() === 'yes'
      const isImp = finalEnrichment.important === true || String(finalEnrichment.important).toLowerCase() === 'yes'
      setDetailsForm({
        event_type: finalEnrichment.event_type||'', coverage_scope: finalEnrichment.coverage_scope||'',
        is_destination: finalEnrichment.is_destination ? 'Destination' : 'Local',
        client_budget_amount: finalEnrichment.client_budget_amount||'',
        amount_quoted: finalEnrichment.amount_quoted||'',
        discounted_amount: finalEnrichment.discounted_amount||'',
        potential: isPot,
        important: isImp,
        assigned_user_id: finalLead?.assigned_user_id ?? '',
      })
      setCitiesForm(Array.isArray(finalEnrichment.cities) ? finalEnrichment.cities.map((c:any) => ({...c})) : [])
    }
    setLoading(false)
  }, [id])

  const fetchDateLoadDetails = useCallback(async (dateVal: string, typeVal: string) => {
    setSelectedLoadDate(dateVal)
    setLoadDetailsLoading(true)
    setLoadDetails([])
    try {
      const res = await api(`/api/leads/${id}/date-load-details?date=${dateVal}&type=${typeVal}`).then(r => r.json())
      if (res && Array.isArray(res.details)) {
        setLoadDetails(res.details)
      }
    } catch (err) {
      console.error('Error fetching date load details:', err)
    } finally {
      setLoadDetailsLoading(false)
    }
  }, [id])

  useEffect(() => {
    reload()
    api('/api/auth/me').then(r => r.json()).then(data => {
      setUserRole(data?.user?.role || '')
    }).catch(() => {})

    api('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const filtered = data.filter((u: any) => {
          const roles = Array.isArray(u.roles) ? u.roles : typeof u.role === 'string' ? [u.role] : []
          return roles.includes('sales') || roles.includes('admin')
        })
        setAssignableUsers(filtered)
      } else {
        setAssignableUsers([])
      }
    }).catch(() => {})
  }, [reload])

  useEffect(() => {
    if (lead && lead.error) {
      setSelectedLoadDate(null)
      setShowEventDuplicateModal(false)
      setShowContactDuplicate(false)
      setFollowupPopupOpen(false)
    }
  }, [lead])

  const saveNote = async () => {
    const t = noteText.trim(); if (!t || savingNote) return
    setSavingNote(true)
    await api(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ note_text: t }) })
    const fresh = await api(`/api/leads/${id}/notes`).then(r => r.json()).catch(() => [])
    setNotes(Array.isArray(fresh) ? fresh : []); setNoteText(''); setSavingNote(false)
  }
  const changeStatus = async (status: string, reason?: string | null, advanceReceived?: boolean) => {
    setStatusLoading(true)
    let res: Response
    if (status === 'Lost') {
      res = await api(`/api/leads/${id}/lost`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Client stopped responding' }),
      })
    } else {
      res = await api(`/api/leads/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          rejected_reason: reason || undefined,
          advance_received: advanceReceived === true ? true : undefined,
        }),
      })
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err?.code === 'ADVANCE_REQUIRED') {
        showNotice('Please collect the advance amount before converting.', false)
      } else {
        showNotice(err?.error || `Failed to change status to ${status}`, false)
      }
      setStatusLoading(false)
      return
    }

    const updated = await res.json()
    setLead(updated)
    setStatusLoading(false)
    await reload()

    if (isFollowupRequired(updated.status) && !updated.next_followup_date) {
      setFollowupPopupDefaultDone(false)
      setFollowupPopupOpen(true)
    }
  }

  const handleStatusSelect = (nextStatus: string) => {
    if (lead?.status === 'Converted' && nextStatus !== 'Converted') {
      if (!confirm('Are you sure you want to change status from Converted?')) return
    }
    if (nextStatus === 'Converted') {
      setConvertLeadSnapshot(lead)
      setConvertConfirmOpen(true)
      return
    }
    if (nextStatus === 'Rejected') {
      setRejectReason('Low budget')
      setRejectOther('')
      setShowRejectModal(true)
      return
    }
    if (nextStatus === 'Lost') {
      setLostReason('Client stopped responding')
      setLostOther('')
      setShowLostModal(true)
      return
    }
    changeStatus(nextStatus)
  }

  const openConversionSummary = () => {
    if (!convertLeadSnapshot) return
    const summary = buildConversionSummary(convertLeadSnapshot, activities)
    setConvertSummary(summary)
    setConvertConfirmOpen(false)
    setConvertLeadSnapshot(null)
  }

  const finalizeConversion = async () => {
    if (!convertSummary) return
    setConvertSaving(true)
    await changeStatus('Converted', null, true)
    setConvertSaving(false)
    setConvertSummary(null)
  }

  const handleDeleteLead = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      const res = await api(`/api/leads/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/leads')
      } else {
        const data = await res.json().catch(() => ({}))
        showNotice(data.error || 'Failed to delete lead', false)
        setIsDeleting(false)
        setShowDeleteConfirm(false)
      }
    } catch (err) {
      console.error('Error deleting lead:', err)
      showNotice('Error deleting lead', false)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }
  const handleCreateGroup = async () => {
    const title = newGroupTitle.trim()
    if (!title) return
    setCreatingGroup(true)
    try {
      const res = await api('/api/quote-groups', {
        method: 'POST',
        body: JSON.stringify({ leadId: Number(id), title }),
      })
      const groupData = await res.json().catch(() => null)
      if (!res.ok || !groupData?.id) {
        showNotice(groupData?.error || 'Failed to create quote group.', false)
        return
      }

      // Auto-create initial version with selected events
      let selectedEvs: any[] = []
      if (enrichment?.events) {
        const sortedLeadEvents = [...(enrichment.events || [])].sort((a: any, b: any) => (a.event_date || '').localeCompare(b.event_date || ''))
        selectedEvs = sortedLeadEvents
          .filter((e) => selectedEvents.includes(e.id))
          .map((e) => ({
            name: e.event_type,
            date: e.event_date || '',
            location: e.venue || (e.city_name ? `TBD, ${e.city_name}` : ''),
            slot: e.slot || null,
          }))
      }

      const vRes = await api(`/api/quote-groups/${groupData.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          draftDataJson: selectedEvs.length > 0 ? { events: selectedEvs } : {}
        }),
      })
      const vData = await vRes.json().catch(() => null)

      if (vRes.ok && vData?.id) {
         router.push(`/leads/${id}/quotes/${vData.id}`)
         return
      }

      showNotice('Quote group created successfully')
      setNewGroupTitle('')
      setShowNewQuoteForm(false)
      setSelectedEvents([])
      await reload()
    } catch {
      showNotice('Failed to create quote.', false)
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleCreateVersion = async (groupId: number) => {
    const latestVersion = (versionsByGroup[groupId] || []).find(v => v.isLatest || v.is_latest)
    setCreatingVersion(groupId)
    try {
      const body: Record<string, any> = {}
      if (latestVersion?.draftDataJson) {
        body.draftDataJson = latestVersion.draftDataJson
      }
      const res = await api(`/api/quote-groups/${groupId}/versions`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.id) {
        showNotice(data?.error || 'Failed to create version.', false)
        return
      }
      router.push(`/leads/${id}/quotes/${data.id}`)
    } catch {
      showNotice('Failed to create version.', false)
    } finally {
      setCreatingVersion(null)
    }
  }

  const handleQuoteDeleteConfirm = async () => {
    if (!quoteDeleteConfirm) return
    setIsQuoteDeleting(true)
    try {
      if (quoteDeleteConfirm.type === 'group') {
         const res = await api(`/api/quote-groups/${quoteDeleteConfirm.id}`, { method: 'DELETE' })
         if (!res.ok) throw new Error()
         showNotice('Quote group deleted')
      } else if (quoteDeleteConfirm.type === 'version' && quoteDeleteConfirm.groupId) {
         const res = await api(`/api/quote-versions/${quoteDeleteConfirm.id}`, { method: 'DELETE' })
         if (!res.ok) throw new Error((await res.json())?.error || 'Failed')
         showNotice('Quote version deleted')
      }
      setQuoteDeleteConfirm(null)
      await reload()
    } catch (err: any) {
      showNotice(err instanceof Error ? err.message : 'Deletion failed. It may have active dependencies.', false)
      setQuoteDeleteConfirm(null)
    } finally {
      setIsQuoteDeleting(false)
    }
  }

  const handleUpdateGroupTitle = async (groupId: number) => {
    const newTitle = editGroupTitle.trim()
    if (!newTitle) {
       setEditingGroupId(null)
       return
    }
    try {
       const res = await api(`/api/quote-groups/${groupId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: newTitle }),
       })
       if (res.ok) {
          showNotice('Title updated')
          await reload()
       } else {
          showNotice('Failed to update quote group title.', false)
       }
    } catch {
       showNotice('Failed to update quote group title.', false)
    } finally {
       setEditingGroupId(null)
    }
  }

  const changeHeat = async (heat: string) => {
    setHeatLoading(true)
    await api(`/api/leads/${id}/heat`, { method: 'PATCH', body: JSON.stringify({ heat }) })
    const l = await api(`/api/leads/${id}`).then(r => r.json()).catch(() => lead)
    setLead(l); setHeatLoading(false)
  }
  const saveContact = async () => {
    setContactErrors({})
    const nextErrors: Record<string, string> = {}

    // Resolve Same as Lead overrides
    const finalForm = { ...contactForm }
    if (brideSameAsLead) {
      finalForm.bride_name = contactForm.name
      finalForm.bride_phone_primary = contactForm.phone_primary
      finalForm.bride_phone_secondary = contactForm.phone_secondary
      finalForm.bride_email = contactForm.email
      finalForm.bride_instagram = contactForm.instagram
    } else if (groomSameAsLead) {
      finalForm.groom_name = contactForm.name
      finalForm.groom_phone_primary = contactForm.phone_primary
      finalForm.groom_phone_secondary = contactForm.phone_secondary
      finalForm.groom_email = contactForm.email
      finalForm.groom_instagram = contactForm.instagram
    }

    // Name check
    if (!finalForm.name?.trim()) {
      nextErrors.name = 'Name is required'
    }

    // Source name check
    const needsSourceName = ['Reference', 'Direct Call', 'WhatsApp'].includes(finalForm.source)
    if (needsSourceName && !finalForm.source_name?.trim()) {
      nextErrors.source_name = 'Name is required for this source'
    }

    // Primary phone check
    const primaryPhone = normalizePhone(finalForm.phone_primary)
    if (!primaryPhone) {
      nextErrors.phone_primary = 'Valid phone number required'
    }

    // Optional phone checks
    const optionalPhones = [
      'phone_secondary',
      'bride_phone_primary',
      'bride_phone_secondary',
      'groom_phone_primary',
      'groom_phone_secondary',
    ] as const
    optionalPhones.forEach(field => {
      const val = finalForm[field]
      if (val && !isValidPhone(val)) {
        nextErrors[field] = 'Invalid phone number'
      }
    })

    // Email checks
    const emailFields = ['email', 'bride_email', 'groom_email'] as const
    const normalizedEmails: Record<string, string> = {}
    emailFields.forEach(field => {
      const val = finalForm[field]
      if (val) {
        const { valid, normalized } = validateEmail(val)
        if (!valid) {
          nextErrors[field] = 'Please enter a valid email address'
        } else {
          normalizedEmails[field] = normalized
        }
      }
    })

    // Instagram checks
    const instagramFields = ['instagram', 'bride_instagram', 'groom_instagram'] as const
    const normalizedInstagrams: Record<string, string> = {}
    instagramFields.forEach(field => {
      const val = finalForm[field]
      if (val) {
        const clean = normalizeInstagramInput(val)
        if (!isValidInstagramUsername(clean)) {
          nextErrors[field] = 'Enter a valid Instagram username'
        } else {
          normalizedInstagrams[field] = clean
        }
      } else {
        normalizedInstagrams[field] = ''
      }
    })

    if (Object.keys(nextErrors).length) {
      setContactErrors(nextErrors)
      setContactShake(true)
      setTimeout(() => setContactShake(false), 300)
      requestAnimationFrame(() => {
        const el = document.querySelector('.field-error')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setSaving(true)
    const payload = {
      ...finalForm,
      ...normalizedEmails,
      ...normalizedInstagrams,
      primary_phone: primaryPhone
    }
    const res = await api(`/api/leads/${id}/contact`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (res.ok) {
      await reload()
      setEditSection(null)
      showNotice('Contact saved')
    } else {
      const result = await res.json().catch(() => null)
      if (result?.field) {
        setContactErrors({ [result.field]: result.error || 'Invalid field value' })
        setContactShake(true)
        setTimeout(() => setContactShake(false), 300)
        requestAnimationFrame(() => {
          const el = document.querySelector('.field-error')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      } else {
        showNotice(result?.error || 'Failed to save contact', false)
      }
    }
    setSaving(false)
  }

  const resetContactForm = () => {
    setContactErrors({})
    if (lead) {
      setContactForm({
        name: lead.name||'', phone_primary: lead.primary_phone||'', phone_secondary: lead.phone_secondary||'',
        email: lead.email||'', instagram: lead.instagram||'',
        bride_name: lead.bride_name||'', bride_phone_primary: lead.bride_phone_primary||'', bride_phone_secondary: lead.bride_phone_secondary||'', bride_email: lead.bride_email||'', bride_instagram: lead.bride_instagram||'',
        groom_name: lead.groom_name||'', groom_phone_primary: lead.groom_phone_primary||'', groom_phone_secondary: lead.groom_phone_secondary||'', groom_email: lead.groom_email||'', groom_instagram: lead.groom_instagram||'',
        source: lead.source||'', source_name: lead.source_name||'',
      })
      const isBrideSame = !!(lead.name && lead.bride_name === lead.name && (lead.bride_phone_primary || '') === (lead.primary_phone || '') && (lead.bride_email || '') === (lead.email || ''))
      const isGroomSame = !isBrideSame && !!(lead.name && lead.groom_name === lead.name && (lead.groom_phone_primary || '') === (lead.primary_phone || '') && (lead.groom_email || '') === (lead.email || ''))
      setBrideSameAsLead(isBrideSame)
      setGroomSameAsLead(isGroomSame)
    }
  }


  const saveDetails = async () => {
    setDetailsErrors({})
    const nextErrors: Record<string, string> = {}
    if (!detailsForm.event_type?.trim()) {
      nextErrors.event_type = 'Event Type is required'
    }

    if (Object.keys(nextErrors).length) {
      setDetailsErrors(nextErrors)
      setDetailsShake(true)
      setTimeout(() => setDetailsShake(false), 300)
      requestAnimationFrame(() => {
        const el = document.querySelector('.field-error')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setSaving(true)
    const toYesNo = (val: boolean) => (val ? 'Yes' : 'No')
    const payload = {
      event_type: detailsForm.event_type,
      coverage_scope: detailsForm.coverage_scope,
      is_destination: detailsForm.is_destination === 'Destination',
      client_budget_amount: detailsForm.client_budget_amount,
      amount_quoted: detailsForm.amount_quoted,
      discounted_amount: detailsForm.discounted_amount,
      potential: toYesNo(!!detailsForm.potential),
      important: toYesNo(!!detailsForm.important),
      ...(userRole === 'admin' ? { assigned_user_id: detailsForm.assigned_user_id ? Number(detailsForm.assigned_user_id) : null } : {}),
    }
    const res = await api(`/api/leads/${id}/enrichment`, { method: 'PATCH', body: JSON.stringify(payload) })
    if (res.ok) {
      await reload()
      setEditSection(null)
      showNotice('Details saved')
    } else {
      const result = await res.json().catch(() => null)
      if (result?.field) {
        setDetailsErrors({ [result.field]: result.error || 'Invalid field value' })
        setDetailsShake(true)
        setTimeout(() => setDetailsShake(false), 300)
        requestAnimationFrame(() => {
          const el = document.querySelector('.field-error')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      } else {
        showNotice(result?.error || 'Failed to save details', false)
      }
    }
    setSaving(false)
  }

  const saveCities = async () => {
    setDetailsErrors({})
    if (!citiesForm.length || !citiesForm.some((c: any) => c.is_primary)) {
      setDetailsErrors({ cities: 'Set one primary city' })
      setDetailsShake(true)
      setTimeout(() => setDetailsShake(false), 300)
      showNotice('Set one primary city', false)
      return
    }
    setSaving(true)
    const res = await api(`/api/leads/${id}/cities`, { method: 'PUT', body: JSON.stringify({ cities: citiesForm }) })
    if (res.ok) {
      await reload()
      setEditSection(null)
      showNotice('Cities saved')
    } else {
      const d = await res.json().catch(() => ({}))
      showNotice(d.error || 'Failed to save cities', false)
    }
    setSaving(false)
  }

  const addCity = () => {
    const n = newCityName.trim(); if (!n) return
    const found = allCities.find((c: any) => c.name.toLowerCase() === n.toLowerCase())
    const newEntry = found ? { ...found, is_primary: !citiesForm.length } : { name: n, state: '', country: 'India', is_primary: !citiesForm.length }
    setCitiesForm(f => [...f, newEntry]); setNewCityName('')
  }
  const setPrimaryCity = (idx: number) => setCitiesForm(f => f.map((c, i) => ({ ...c, is_primary: i === idx })))
  const removeCity = (idx: number) => {
    const next = citiesForm.filter((_, i) => i !== idx)
    if (next.length && !next.some((c: any) => c.is_primary)) next[0].is_primary = true
    setCitiesForm(next)
  }

  const saveEvent = async () => {
    if (!editingEvent) return
    setEventErrors({})
    const { id: evId, data } = editingEvent
    const nextErrors: Record<string, string> = {}

    if (!data.event_type?.trim()) {
      nextErrors.event_type = 'Event Name is required'
    } else if (data.event_type.trim().length > 50) {
      nextErrors.event_type = 'Max 50 characters'
    }
    if (!data.event_date) {
      nextErrors.event_date = 'Date is required'
    }
    if (!data.pax) {
      nextErrors.pax = 'Guests count is required'
    }
    if (!data.city_id) {
      nextErrors.city_id = 'City is required'
    }

    if (Object.keys(nextErrors).length) {
      setEventErrors(nextErrors)
      setEventShake(true)
      setTimeout(() => setEventShake(false), 300)
      requestAnimationFrame(() => {
        const el = document.querySelector('.field-error')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }

    setSaving(true)
    const payload = { ...data }
    if (!payload.event_date) {
      payload.date_status = 'tba'
    } else if (payload.date_status === 'tba') {
      payload.date_status = 'confirmed'
    }
    if (payload.start_time) payload.start_time = toTimeOnly(payload.start_time)
    if (payload.end_time) payload.end_time = toTimeOnly(payload.end_time)
    let res: Response
    if (evId) res = await api(`/api/leads/${id}/events/${evId}`, { method: 'PATCH', body: JSON.stringify(payload) })
    else res = await api(`/api/leads/${id}/events`, { method: 'POST', body: JSON.stringify(payload) })
    
    if (res.ok) {
      await reload()
      setEditingEvent(null)
      showNotice(evId ? 'Event updated' : 'Event added')
    } else {
      const d = await res.json().catch(() => ({}))
      if (d.field) {
        setEventErrors({ [d.field]: d.error || 'Invalid field value' })
        setEventShake(true)
        setTimeout(() => setEventShake(false), 300)
        requestAnimationFrame(() => {
          const el = document.querySelector('.field-error')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      } else {
        showNotice(d.error || 'Failed to save event', false)
      }
    }
    setSaving(false)
  }
  const deleteEvent = async (evId: string) => {
    setSaving(true)
    const res = await api(`/api/leads/${id}/events/${evId}`, { method: 'DELETE' })
    if (res.ok) { await reload(); showNotice('Event deleted') }
    else showNotice('Failed to delete event', false)
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-neutral-50"><div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin"/></div>
  if (lead && lead.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 p-6">
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4 text-xl">
            🔒
          </div>
          <h2 className="text-base font-semibold text-neutral-900 mb-2">Access Denied</h2>
          <p className="text-xs text-neutral-500 mb-6">{lead.error}</p>
          <Link
            href="/leads"
            className="inline-block px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold transition"
            style={{ color: '#ffffff' }}
          >
            Back to Leads
          </Link>
        </div>
      </div>
    )
  }
  if (!lead) return <div className="min-h-screen flex items-center justify-center bg-neutral-50"><p className="text-sm text-neutral-500">Lead not found</p></div>

  const events = [...(enrichment?.events||[])].sort((a:any,b:any) => (a.event_date||'').localeCompare(b.event_date||''))
  const sortedLeadEvents = events
  const formatEventList = (names: string[]) => {
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
  }
  const cities: any[] = enrichment?.cities||[]
  const primaryCity = cities.find((c:any) => c.is_primary)||cities[0]
  const headerName = formatLeadName(lead)
  const latestQuote = quotes[0]||null
  const heatColor = lead.heat==='Hot'?'bg-rose-500':lead.heat==='Warm'?'bg-amber-400':'bg-sky-400'
  const isOverdue = lead.next_followup_date && isFollowupDueOrOverdue(lead.next_followup_date)
  const timeline = [
    ...notes.map((n:any)=>({...n,_kind:'note',_ts:new Date(n.created_at||0).getTime()})),
    ...mergeLeadFieldChanges(activities).map((a:any)=>({...a,_kind:'activity',_ts:new Date(a.created_at||0).getTime()})),
  ].sort((a,b)=>b._ts-a._ts)

  const filteredTimeline = timeline.filter((item: any) => {
    if (timelineFilter === 'notes') return item._kind === 'note'
    if (timelineFilter === 'activities') return item._kind === 'activity'
    return true
  })

  const latestSentQuoteVersion = quotes.find((q: any) => q.status !== 'DRAFT')
  const latestSentDraft = latestSentQuoteVersion
    ? (typeof latestSentQuoteVersion.draftDataJson === 'string'
        ? JSON.parse(latestSentQuoteVersion.draftDataJson)
        : (latestSentQuoteVersion.draftDataJson || {}))
    : null



  return (
    <div className="min-h-screen bg-neutral-50">
      {/* ── Notice toast ── */}
      {notice && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg ${notice.ok?'bg-neutral-900 text-white':'bg-red-600 text-white'}`}>
          {notice.msg}
        </div>
      )}

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          {/* Row 1: Back link (Left) & Classic Link (Right) */}
          <div className="flex items-center justify-between pt-3 pb-1.5 border-b border-neutral-50">
            <button onClick={() => {
              const storedView = typeof window !== 'undefined' ? sessionStorage.getItem('leads_view') : null
              if (storedView === 'table' || storedView === 'kanban') {
                router.push(`/leads?view=${storedView}`)
              } else {
                router.push('/leads')
              }
            }} className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-neutral-400 hover:text-neutral-900 transition-colors italic flex items-center font-medium">
              ← <span className="ml-1 hidden sm:inline">Back to Leads</span><span className="ml-1 sm:hidden">Leads</span>
            </button>
            <div className="shrink-0">
              <Link href={`/leads/${id}/classic`} className="text-[11px] text-neutral-400 hover:text-neutral-700 transition px-2 font-medium">Classic →</Link>
            </div>
          </div>

          {/* Row 2: Name & Badges (Left) vs L# & City (Right) */}
          <div className="py-2.5 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${heatColor}`}/>
              <div className="flex-1 min-w-0 flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-neutral-900 flex items-baseline gap-1.5 leading-tight truncate">
                  <span>{headerName.leadName}</span>
                  {headerName.suffix && <span className="text-sm md:text-base text-neutral-500 font-normal">({headerName.suffix})</span>}
                </h1>
                <div className="flex items-center gap-1.5 shrink-0 self-center">
                  {(lead.important === true || String(lead.important).toLowerCase() === 'yes') && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-100 text-rose-700 leading-none">Important</span>
                  )}
                  {(lead.potential === true || String(lead.potential).toLowerCase() === 'yes') && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 leading-none">Potential</span>
                  )}
                  {(lead.not_contacted_count ?? 0) >= 5 && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 leading-none">Non Responsive</span>
                  )}
                </div>
              </div>
            </div>
            
            {/* L# and City stacked on the right */}
            <div className="text-right shrink-0 flex flex-col text-[11px] font-semibold text-neutral-400 leading-tight justify-center">
              {lead?.lead_number && <span>Lead #{lead.lead_number}</span>}
              {primaryCity && <span className="text-neutral-500 font-medium">{primaryCity.name}</span>}
              {userRole === 'admin' && lead && (() => {
                const assignedName = (() => {
                  if (!lead.assigned_user_id) return null
                  const user = assignableUsers.find(u => u.id === lead.assigned_user_id)
                  return user ? (user.nickname || user.name || user.email) : (lead.assigned_user_nickname || lead.assigned_user_name)
                })()
                
                if (assignedName) {
                  return (
                    <span className="text-blue-600 font-bold mt-1 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 inline-block text-[9px] uppercase tracking-wider w-fit ml-auto">
                      Assigned: {assignedName}
                    </span>
                  )
                } else {
                  return (
                    <span className="text-neutral-500 font-bold mt-1 bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.5 inline-block text-[9px] uppercase tracking-wider w-fit ml-auto">
                      Unassigned
                    </span>
                  )
                }
              })()}
            </div>
          </div>

          {/* Row 3: Contacts & Duplicate Alert (Just below the name) */}
          <div className="pb-2.5 flex items-center gap-2 flex-wrap">
            {/* Primary Phone */}
            {lead.primary_phone && (
              <PhoneActions phone={lead.primary_phone} leadId={id}
                label={
                  <span className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-600 cursor-pointer">
                    📞 {lead.primary_phone}
                  </span>
                }/>
            )}
            
            {/* Bride Phone */}
            {lead.bride_phone_primary&&lead.bride_phone_primary!==lead.primary_phone&&(
              <PhoneActions phone={lead.bride_phone_primary} leadId={id}
                label={
                  <span className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-600 cursor-pointer">
                    Bride: {lead.bride_phone_primary}
                  </span>
                }/>
            )}

            {/* Groom Phone */}
            {lead.groom_phone_primary&&lead.groom_phone_primary!==lead.primary_phone&&(
              <PhoneActions phone={lead.groom_phone_primary} leadId={id}
                label={
                  <span className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition text-neutral-600 cursor-pointer">
                    Groom: {lead.groom_phone_primary}
                  </span>
                }/>
            )}

            {/* Duplicate Warning Badge */}
            {hasDuplicates(contactDuplicateData) && (
              <button onClick={() => setShowContactDuplicate(true)} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition animate-pulse">
                ⚠️ Duplicate Contact
              </button>
            )}

            {/* Event Duplicate Warning Badge */}
            {eventDuplicates.length > 0 && (
              <button onClick={() => setShowEventDuplicateModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition animate-pulse">
                ⚠️ Duplicate Event
              </button>
            )}
          </div>

          {/* Row 4: Dropdowns & Followup */}
          <div className="pb-3 flex items-center gap-2 flex-wrap border-b border-neutral-100">
            {/* Status Dropdown */}
            <select value={lead.status||''} onChange={e=>handleStatusSelect(e.target.value)} disabled={statusLoading || isConverted}
              className="text-[11px] font-semibold border border-neutral-200 rounded-lg px-2.5 py-1 bg-white outline-none focus:border-neutral-400 transition cursor-pointer">
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>

            {/* Heat Dropdown */}
            <select value={lead.heat||'Cold'} onChange={e=>changeHeat(e.target.value)} disabled={heatLoading || isConverted}
              className="text-[11px] font-semibold border border-neutral-200 rounded-lg px-2.5 py-1 bg-white outline-none focus:border-neutral-400 transition cursor-pointer">
              {HEAT.map(h=><option key={h}>{h}</option>)}
            </select>

            {/* Next Followup */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-neutral-200 bg-white text-neutral-600">
              <span>🗓️ Next:</span>
              {isConverted ? (
                <span className="text-neutral-800">
                  {lead.next_followup_date ? formatDate(lead.next_followup_date) : 'Not set'}
                </span>
              ) : (
                <button onClick={() => { setFollowupPopupDefaultDone(false); setFollowupPopupOpen(true) }} className="text-neutral-800 hover:underline">
                  {lead.next_followup_date ? formatDate(lead.next_followup_date) : 'Not set'}
                </button>
              )}
              {lead.next_followup_date && !isTerminalStatus(lead.status) && isOverdue && !isConverted && (
                <button onClick={() => { setFollowupPopupDefaultDone(true); setFollowupPopupOpen(true) }} className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded text-[9px] font-bold uppercase tracking-wider transition">
                  Mark Done
                </button>
              )}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 -mb-px">
            {(['overview','profile','timeline','quotes'] as Tab[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 transition capitalize ${tab===t?'border-neutral-900 text-neutral-900':'border-transparent text-neutral-400 hover:text-neutral-700'}`}>
                {t}{t==='quotes'&&quotes.length>0?` (${quotes.length})`:''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">

        {/* ═══ OVERVIEW ═══ */}
        {tab==='overview'&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left Column (1, 3, 5, 7) */}
            <div className="space-y-6">
              {/* 1. Lead */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm h-fit">
                <div className="px-5 py-3 border-b border-neutral-100"><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Lead</span></div>
                <div className="px-5 py-3">
                  <Field label="Status" value={lead.status}/>
                  <Field label="Source" value={lead.source?(lead.source_name?`${lead.source} · ${lead.source_name}`:lead.source):null}/>
                  <Field label="Coverage" value={lead.coverage_scope}/>
                  <Field label="Event Type" value={lead.event_type}/>
                  <Field label="Wedding" value={lead.is_destination?'Destination':'Local'}/>
                  <Field label="Created" value={formatDate(lead.created_at)}/>
                  {lead.next_followup_date&&<Field label="Next Followup" value={formatDate(lead.next_followup_date)}/>}
                </div>
              </div>

              {/* 3. Pricing */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm h-fit">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pricing</span>
                  {quotes.length > 0 ? (
                    <button onClick={() => setTab('quotes')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Open Quotes →</button>
                  ) : (
                    <button onClick={() => setTab('quotes')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">+ New Quote</button>
                  )}
                </div>
                <div className="px-5 py-3">
                  <Field label="Client Budget" value={formatINR(lead.client_budget_amount)}/>
                  <Field label="Amount Quoted" value={formatINR(lead.amount_quoted)}/>
                  <Field label="Discounted" value={formatINR(lead.discounted_amount)}/>
                  <Field label="Client Offer" value={formatINR(lead.client_offer_amount)}/>
                </div>
                {latestSentDraft && (
                  <div className="border-t border-neutral-100 px-5 py-4 bg-neutral-50/30 space-y-4">
                    {/* Day-wise Team */}
                    {latestSentDraft.events && latestSentDraft.events.length > 0 && (() => {
                      const normDate = (dStr: string) => {
                        if (!dStr) return ''
                        try {
                          const d = new Date(dStr)
                          if (Number.isNaN(d.getTime())) return dStr
                          const year = d.getFullYear()
                          const month = String(d.getMonth() + 1).padStart(2, '0')
                          const day = String(d.getDate()).padStart(2, '0')
                          return `${year}-${month}-${day}`
                        } catch {
                          return dStr
                        }
                      }

                      const parseTimeToMinutes = (timeStr: string) => {
                        const s = String(timeStr || '').trim().toLowerCase()
                        if (!s) return null
                        const match = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
                        if (!match) return null
                        let [_, hStr, mStr, ampm] = match
                        let hours = parseInt(hStr, 10)
                        let minutes = parseInt(mStr || '0', 10)
                        if (ampm === 'pm' && hours < 12) hours += 12
                        if (ampm === 'am' && hours === 12) hours = 0
                        return hours * 60 + minutes
                      }

                      const parseTimeRange = (rangeStr: string) => {
                        if (!rangeStr) return null
                        const parts = String(rangeStr).split(/[-–]/)
                        if (parts.length < 2) return null
                        const start = parseTimeToMinutes(parts[0])
                        const end = parseTimeToMinutes(parts[1])
                        if (start === null || end === null) return null
                        return { start, end }
                      }

                      const pluralizeRole = (word: string) => {
                        const w = word.trim()
                        if (/s$/i.test(w) && !/ss$/i.test(w)) return w
                        return w + 's'
                      }

                      // Group events by date
                      const eventsByDate: Record<string, { dateLabel: string; events: any[] }> = {}
                      latestSentDraft.events.forEach((ev: any) => {
                        const normalized = normDate(ev.date)
                        if (!eventsByDate[normalized]) {
                          eventsByDate[normalized] = {
                            dateLabel: ev.date,
                            events: []
                          }
                        }
                        eventsByDate[normalized].events.push(ev)
                      })

                      const sortedDateEntries = Object.entries(eventsByDate).sort(([dateA], [dateB]) => dateA.localeCompare(dateB))

                      return (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-2">Event Schedule & Crew</div>
                          <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white mt-1.5 shadow-sm">
                            {/* Table Header */}
                            <div className="grid grid-cols-[1fr_1.3fr_1.3fr] gap-x-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[8px] font-bold text-neutral-500 uppercase tracking-widest">
                              <div>Date</div>
                              <div>Event Details</div>
                              <div>Team</div>
                            </div>
                            {/* Table Rows */}
                            <div className="divide-y divide-neutral-100">
                              {sortedDateEntries.map(([dateKey, group]: any, idx: number) => {
                                // Gather all pricing items for events on this date
                                const matchingEventIds = new Set(group.events.map((e: any) => e.id))
                                const crewAllocations: Record<string, { label: string; catalogId: any; allocations: any[] }> = {};

                                (latestSentDraft.pricingItems || []).forEach((item: any) => {
                                  if (item.itemType === 'TEAM_ROLE' && Number(item.quantity) > 0 && matchingEventIds.has(item.eventId)) {
                                    const catId = item.catalogId
                                    const label = item.label || 'Crew'

                                    const event = group.events.find((e: any) => e.id === item.eventId)
                                    const range = parseTimeRange(event?.time)

                                    if (!crewAllocations[catId]) {
                                      crewAllocations[catId] = { label, catalogId: catId, allocations: [] }
                                    }
                                    crewAllocations[catId].allocations.push({
                                      qty: Number(item.quantity),
                                      start: range ? range.start : null,
                                      end: range ? range.end : null
                                    })
                                  }
                                })

                                const teamItems: { label: string; quantity: number }[] = []
                                Object.values(crewAllocations).forEach((roleAlloc: any) => {
                                  const sorted = roleAlloc.allocations.sort((a: any, b: any) => {
                                    if (a.start === null && b.start === null) return 0
                                    if (a.start === null) return 1
                                    if (b.start === null) return -1
                                    return a.start - b.start
                                  })

                                  const tracks: { end: number | null; maxQty: number }[] = []
                                  sorted.forEach((alloc: any) => {
                                    if (alloc.start === null || alloc.end === null) {
                                      tracks.push({ end: null, maxQty: alloc.qty })
                                      return
                                    }

                                    const compTrack = tracks.find(t => t.end !== null && t.end <= alloc.start!)
                                    if (compTrack) {
                                      compTrack.end = alloc.end
                                      compTrack.maxQty = Math.max(compTrack.maxQty, alloc.qty)
                                    } else {
                                      tracks.push({ end: alloc.end, maxQty: alloc.qty })
                                    }
                                  })

                                  let totalQty = 0
                                  tracks.forEach(t => {
                                    totalQty += t.maxQty
                                  })

                                  if (totalQty > 0) {
                                    teamItems.push({
                                      label: roleAlloc.label,
                                      quantity: totalQty
                                    })
                                  }
                                })

                                const teamLines = teamItems.map(item => {
                                  const plural = item.quantity > 1 ? pluralizeRole(item.label) : item.label
                                  return `${item.quantity} ${plural}`
                                })

                                return (
                                  <div key={dateKey || idx} className="grid grid-cols-[1fr_1.3fr_1.3fr] gap-x-2 px-3 py-2 items-start text-[10px] text-neutral-700">
                                    {/* Date */}
                                    <div className="font-semibold text-neutral-800 py-0.5">{group.dateLabel}</div>
                                    {/* Event Details */}
                                    <div className="space-y-1.5 py-0.5 pr-2">
                                      {group.events.map((ev: any, eIdx: number) => (
                                        <div key={ev.id || eIdx}>
                                          <div className="font-bold text-neutral-900 line-clamp-1">{ev.name}</div>
                                          {(ev.time || ev.slot || ev.location) && (
                                            <div className="text-[8px] text-neutral-400 mt-0.5 leading-tight">
                                              {[ev.time || ev.slot, ev.location].filter(Boolean).join(' · ')}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    {/* Team */}
                                    <div className="space-y-0.5 py-0.5">
                                      {teamLines.length > 0 ? (
                                        teamLines.map((line, li) => (
                                          <div key={li} className="text-[9px] text-neutral-600 font-medium leading-snug">{line}</div>
                                        ))
                                      ) : (
                                        <div className="text-[8px] text-neutral-400 font-medium">No crew allocated</div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Deliverables */}
                    {(() => {
                      const deliverables = (latestSentDraft.pricingItems || []).filter(
                        (i: any) => i.itemType === 'DELIVERABLE' && Number(i.quantity) > 0
                      )
                      if (deliverables.length === 0) return null
                      return (
                        <div className="pt-1 border-t border-neutral-100">
                          <div className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-2">Deliverables</div>
                          <ul className="space-y-1.5 list-none pl-0">
                            {deliverables.map((d: any, idx: number) => {
                              const rawLabel = d.name || d.label || String(d)
                              const qty = Number(d.quantity || 1)
                              const plural = qty > 1 && !rawLabel.endsWith('s') ? rawLabel + 's' : rawLabel
                              const displayLabel = qty > 1 ? `${qty} ${plural}` : rawLabel
                              return (
                                <li key={d.id || `deliv-${idx}`} className="text-xs text-neutral-600 font-medium flex items-start gap-1.5">
                                  <span className="text-neutral-300">▪</span>
                                  <div className="flex-1">
                                    <span className="text-neutral-800 font-semibold">{displayLabel}</span>
                                    {d.deliveryTimeline && (
                                      <span className="text-[10px] text-neutral-400 ml-1.5 font-normal">({d.deliveryTimeline})</span>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (2, 4, 5) */}
            <div className="space-y-6">
              {/* 2. Contact */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm h-fit">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contact</span>
                  <button onClick={()=>setTab('profile')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>
                </div>
                <div className="px-5 py-3">
                  <Field label="Name" value={lead.name}/>
                  <Field label="Phone" value={lead.primary_phone}/>
                  <Field label="Alt Phone" value={lead.phone_secondary}/>
                  <Field label="Email" value={lead.email}/>
                  {lead.bride_name&&<Field label="Bride" value={`${lead.bride_name}${lead.bride_phone_primary?' · '+lead.bride_phone_primary:''}`}/>}
                  {lead.groom_name&&<Field label="Groom" value={`${lead.groom_name}${lead.groom_phone_primary?' · '+lead.groom_phone_primary:''}`}/>}
                </div>
              </div>

              {/* 4. Events & Date Availability */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm h-fit">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Events & Date Availability · {events.length}</span>
                  <button onClick={()=>setTab('profile')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">Edit</button>
                </div>
                {events.length===0?<p className="px-5 py-4 text-xs text-neutral-400">No events added.</p>:(
                  <div className="divide-y divide-neutral-100">
                    {events.map((ev:any)=>{
                      const normDate = (dStr: string) => {
                        if (!dStr) return ''
                        try {
                          const d = new Date(dStr)
                          if (Number.isNaN(d.getTime())) return dStr
                          const year = d.getFullYear()
                          const month = String(d.getMonth() + 1).padStart(2, '0')
                          const day = String(d.getDate()).padStart(2, '0')
                          return `${year}-${month}-${day}`
                        } catch {
                          return dStr
                        }
                      }
                      const evDateNorm = normDate(ev.event_date)
                      const dl = dateLoads.find(d => normDate(d.date) === evDateNorm)

                      return (
                        <div key={ev.id} className="px-5 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-neutral-800">{ev.event_type||'—'}</div>
                              {ev.venue&&<div className="text-[11px] text-neutral-500 mt-0.5 truncate">{ev.venue}</div>}
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {ev.city_name&&<span className="text-[10px] text-neutral-400">{ev.city_name}</span>}
                                {(ev.start_time || ev.end_time) && (
                                  <span className="text-[10px] text-neutral-500 font-medium">
                                    🕒 {formatTimeDisplay(ev.start_time)}{ev.end_time ? ` – ${formatTimeDisplay(ev.end_time)}` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold text-neutral-700">{formatDate(ev.event_date)}</div>
                              {ev.slot&&<div className="text-[10px] text-neutral-400">{ev.slot}</div>}
                              {ev.pax!=null&&<div className="text-[10px] text-neutral-400">{ev.pax} guests</div>}
                            </div>
                          </div>

                          {dl && (
                            <div className="mt-2.5 pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-neutral-500">
                              <span className="font-semibold text-neutral-400 uppercase tracking-wider text-[8px]">Date Load:</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'booked')}
                                className="text-rose-700 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.converted} Booked
                              </button>
                              <span>•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'awaiting')}
                                className="text-amber-700 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.awaiting} Awaiting
                              </button>
                              <span>•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'potential')}
                                className="text-emerald-600 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.potential} Potential
                              </button>
                              <span>•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'active')}
                                className="text-neutral-600 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.active}/{dl.total} Active
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Other Dates Load if any */}
                {(() => {
                  const normDate = (dStr: string) => {
                    if (!dStr) return ''
                    try {
                      const d = new Date(dStr)
                      if (Number.isNaN(d.getTime())) return dStr
                      const year = d.getFullYear()
                      const month = String(d.getMonth() + 1).padStart(2, '0')
                      const day = String(d.getDate()).padStart(2, '0')
                      return `${year}-${month}-${day}`
                    } catch {
                      return dStr
                    }
                  }
                  const eventDates = new Set(events.map(ev => normDate(ev.event_date)))
                  const otherDateLoads = dateLoads.filter(dl => !eventDates.has(normDate(dl.date)))
                  if (otherDateLoads.length === 0) return null
                  return (
                    <div className="px-5 py-3 bg-neutral-50/50 border-t border-neutral-100">
                      <div className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-2">Other Dates Load</div>
                      <div className="space-y-2">
                        {otherDateLoads.map(dl => (
                          <div key={dl.date} className="flex items-center justify-between gap-4 text-xs pt-2 first:pt-0 border-t border-neutral-100/50 first:border-0">
                            <div className="font-semibold text-neutral-850">{dl.formattedDate}</div>
                            <div className="flex items-center gap-2 font-mono text-[9px]">
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'booked')}
                                className="text-rose-700 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.converted} Booked
                              </button>
                              <span className="text-neutral-200">•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'awaiting')}
                                className="text-amber-700 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.awaiting} Awaiting
                              </button>
                              <span className="text-neutral-200">•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'potential')}
                                className="text-emerald-600 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.potential} Potential
                              </button>
                              <span className="text-neutral-200">•</span>
                              <button
                                onClick={() => fetchDateLoadDetails(dl.date, 'active')}
                                className="text-neutral-600 hover:underline font-semibold outline-none focus:outline-none"
                              >
                                {dl.active}/{dl.total} Active
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* 5. Notes */}
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm h-fit">
                <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Notes · {notes.length}</span>
                  <button onClick={()=>setTab('timeline')} className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">All →</button>
                </div>
                {notes.length===0?<p className="px-5 py-4 text-xs text-neutral-400">No notes yet.</p>:(
                  <div className="divide-y divide-neutral-50">
                    {[...notes].reverse().slice(0,4).map((n:any)=>(
                      <div key={n.id} className="px-5 py-3">
                        <p className="text-xs text-neutral-700 leading-relaxed line-clamp-3">{n.note_text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-neutral-400">{formatDateTime(n.created_at)}</span>
                          {n.status_at_time&&<span className="text-[10px] text-neutral-400">· {n.status_at_time}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-4 bg-neutral-50/50 border-t border-neutral-100 flex gap-2">
                  <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Type a note… (⌘↵ to save)" rows={1}
                    className="flex-1 text-xs px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none resize-none focus:border-neutral-400 transition"
                    onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px'}}
                    onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}}/>
                  <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                    className="self-start px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-30 hover:bg-neutral-700 transition">{savingNote?'…':'Save'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PROFILE ═══ */}
        {tab==='profile'&&(
          <div className="max-w-2xl space-y-4">

            {/* ── Contact ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden animate-fade-in">
              <SectionHead label="Contact" onEdit={()=>{ resetContactForm(); setEditSection('contact'); }} editing={editSection==='contact'} onCancel={()=>{ resetContactForm(); setEditSection(null); }} disabled={isConverted}/>
              {editSection==='contact'?(
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Full Name" val={contactForm.name} onChange={v=>setContactForm((f:any)=>({...f,name:v}))}
                      hasError={!!contactErrors.name} shake={contactShake} errorMsg={contactErrors.name}/>
                    
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Primary Phone</label>
                      <PhoneField
                        value={contactForm.phone_primary || ''}
                        onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, phone_primary: v }))}
                        className={`${contactErrors.phone_primary ? 'field-error' : 'border-neutral-200'} ${contactErrors.phone_primary && contactShake ? 'shake' : ''}`}
                      />
                      {contactErrors.phone_primary && (
                        <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.phone_primary}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Alt Phone</label>
                      <PhoneField
                        value={contactForm.phone_secondary || ''}
                        onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, phone_secondary: v }))}
                        className={`${contactErrors.phone_secondary ? 'field-error' : 'border-neutral-200'} ${contactErrors.phone_secondary && contactShake ? 'shake' : ''}`}
                      />
                      {contactErrors.phone_secondary && (
                        <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.phone_secondary}</div>
                      )}
                    </div>
                    
                    <Input label="Email" val={contactForm.email} onChange={v=>setContactForm((f:any)=>({...f,email:v}))}
                      hasError={!!contactErrors.email} shake={contactShake} errorMsg={contactErrors.email}/>
                    
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Instagram</label>
                      <div className={`flex items-center rounded-xl border bg-neutral-50 px-3 py-2 text-sm ${contactErrors.instagram ? 'field-error' : 'border-neutral-200'} ${contactErrors.instagram && contactShake ? 'shake' : ''}`}>
                        <span className="text-neutral-400 select-none mr-1">instagram.com/</span>
                        <input
                          className="flex-1 outline-none bg-transparent"
                          placeholder="username"
                          value={contactForm.instagram || ''}
                          onChange={e => setContactForm((f: any) => ({ ...f, instagram: normalizeInstagramInput(e.target.value) }))}
                        />
                      </div>
                      {contactErrors.instagram && (
                        <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.instagram}</div>
                      )}
                    </div>
                    
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Source</label>
                      <select
                        className={`w-full text-sm px-3 py-2 rounded-xl border bg-neutral-50 outline-none focus:border-neutral-600 transition ${contactErrors.source ? 'field-error' : 'border-neutral-200'} ${contactErrors.source && contactShake ? 'shake' : ''}`}
                        value={contactForm.source || ''}
                        onChange={e => setContactForm((f: any) => ({ ...f, source: e.target.value }))}
                      >
                        <option value="">Select source…</option>
                        {['Instagram', 'Direct Call', 'WhatsApp', 'Reference', 'Website', 'Unknown'].map(src => (
                          <option key={src} value={src}>{src}</option>
                        ))}
                      </select>
                      {contactErrors.source && (
                        <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.source}</div>
                      )}
                    </div>

                    {['Reference', 'Direct Call', 'WhatsApp'].includes(contactForm.source) && (
                      <Input label="Source Name" val={contactForm.source_name} onChange={v=>setContactForm((f:any)=>({...f,source_name:v}))}
                        hasError={!!contactErrors.source_name} shake={contactShake} errorMsg={contactErrors.source_name}/>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-neutral-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bride</div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={brideSameAsLead}
                          onChange={(e) => {
                            const isChecked = e.target.checked
                            setBrideSameAsLead(isChecked)
                            if (isChecked) {
                              setGroomSameAsLead(false)
                              setContactForm((f: any) => ({
                                ...f,
                                bride_name: f.name || '',
                                bride_phone_primary: f.phone_primary || '',
                                bride_phone_secondary: f.phone_secondary || '',
                                bride_email: f.email || '',
                                bride_instagram: f.instagram || '',
                                groom_name: '',
                                groom_phone_primary: '',
                                groom_phone_secondary: '',
                                groom_email: '',
                                groom_instagram: '',
                              }))
                            } else {
                              setContactForm((f: any) => ({
                                ...f,
                                bride_name: '',
                                bride_phone_primary: '',
                                bride_phone_secondary: '',
                                bride_email: '',
                                bride_instagram: '',
                              }))
                            }
                          }}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        <span>Same as Lead</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Name"
                        val={brideSameAsLead ? (contactForm.name || '') : (contactForm.bride_name || '')}
                        onChange={v=>setContactForm((f:any)=>({...f,bride_name:v}))}
                        hasError={!!contactErrors.bride_name}
                        shake={contactShake}
                        errorMsg={contactErrors.bride_name}
                        disabled={brideSameAsLead}
                      />
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Phone</label>
                        <PhoneField
                          value={brideSameAsLead ? (contactForm.phone_primary || '') : (contactForm.bride_phone_primary || '')}
                          onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, bride_phone_primary: v }))}
                          className={`${contactErrors.bride_phone_primary ? 'field-error' : 'border-neutral-200'} ${contactErrors.bride_phone_primary && contactShake ? 'shake' : ''}`}
                          disabled={brideSameAsLead}
                        />
                        {contactErrors.bride_phone_primary && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.bride_phone_primary}</div>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Alt Phone</label>
                        <PhoneField
                          value={brideSameAsLead ? (contactForm.phone_secondary || '') : (contactForm.bride_phone_secondary || '')}
                          onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, bride_phone_secondary: v }))}
                          className={`${contactErrors.bride_phone_secondary ? 'field-error' : 'border-neutral-200'} ${contactErrors.bride_phone_secondary && contactShake ? 'shake' : ''}`}
                          disabled={brideSameAsLead}
                        />
                        {contactErrors.bride_phone_secondary && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.bride_phone_secondary}</div>
                        )}
                      </div>
                      
                      <Input
                        label="Email"
                        val={brideSameAsLead ? (contactForm.email || '') : (contactForm.bride_email || '')}
                        onChange={v=>setContactForm((f:any)=>({...f,bride_email:v}))}
                        hasError={!!contactErrors.bride_email}
                        shake={contactShake}
                        errorMsg={contactErrors.bride_email}
                        disabled={brideSameAsLead}
                      />
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Instagram</label>
                        <div className={`flex items-center rounded-xl border bg-neutral-50 px-3 py-2 text-sm ${brideSameAsLead ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${contactErrors.bride_instagram ? 'field-error' : 'border-neutral-200'} ${contactErrors.bride_instagram && contactShake ? 'shake' : ''}`}>
                          <span className="text-neutral-400 select-none mr-1">instagram.com/</span>
                          <input
                            className="flex-1 outline-none bg-transparent"
                            placeholder="username"
                            disabled={brideSameAsLead}
                            value={brideSameAsLead ? (contactForm.instagram || '') : (contactForm.bride_instagram || '')}
                            onChange={e => setContactForm((f: any) => ({ ...f, bride_instagram: normalizeInstagramInput(e.target.value) }))}
                          />
                        </div>
                        {contactErrors.bride_instagram && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.bride_instagram}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-neutral-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Groom</div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={groomSameAsLead}
                          onChange={(e) => {
                            const isChecked = e.target.checked
                            setGroomSameAsLead(isChecked)
                            if (isChecked) {
                              setBrideSameAsLead(false)
                              setContactForm((f: any) => ({
                                ...f,
                                groom_name: f.name || '',
                                groom_phone_primary: f.phone_primary || '',
                                groom_phone_secondary: f.phone_secondary || '',
                                groom_email: f.email || '',
                                groom_instagram: f.instagram || '',
                                bride_name: '',
                                bride_phone_primary: '',
                                bride_phone_secondary: '',
                                bride_email: '',
                                bride_instagram: '',
                              }))
                            } else {
                              setContactForm((f: any) => ({
                                ...f,
                                groom_name: '',
                                groom_phone_primary: '',
                                groom_phone_secondary: '',
                                groom_email: '',
                                groom_instagram: '',
                              }))
                            }
                          }}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        <span>Same as Lead</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Name"
                        val={groomSameAsLead ? (contactForm.name || '') : (contactForm.groom_name || '')}
                        onChange={v=>setContactForm((f:any)=>({...f,groom_name:v}))}
                        hasError={!!contactErrors.groom_name}
                        shake={contactShake}
                        errorMsg={contactErrors.groom_name}
                        disabled={groomSameAsLead}
                      />
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Phone</label>
                        <PhoneField
                          value={groomSameAsLead ? (contactForm.phone_primary || '') : (contactForm.groom_phone_primary || '')}
                          onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, groom_phone_primary: v }))}
                          className={`${contactErrors.groom_phone_primary ? 'field-error' : 'border-neutral-200'} ${contactErrors.groom_phone_primary && contactShake ? 'shake' : ''}`}
                          disabled={groomSameAsLead}
                        />
                        {contactErrors.groom_phone_primary && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.groom_phone_primary}</div>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Alt Phone</label>
                        <PhoneField
                          value={groomSameAsLead ? (contactForm.phone_secondary || '') : (contactForm.groom_phone_secondary || '')}
                          onChange={(v: string | null) => setContactForm((f: any) => ({ ...f, groom_phone_secondary: v }))}
                          className={`${contactErrors.groom_phone_secondary ? 'field-error' : 'border-neutral-200'} ${contactErrors.groom_phone_secondary && contactShake ? 'shake' : ''}`}
                          disabled={groomSameAsLead}
                        />
                        {contactErrors.groom_phone_secondary && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.groom_phone_secondary}</div>
                        )}
                      </div>
                      
                      <Input
                        label="Email"
                        val={groomSameAsLead ? (contactForm.email || '') : (contactForm.groom_email || '')}
                        onChange={v=>setContactForm((f:any)=>({...f,groom_email:v}))}
                        hasError={!!contactErrors.groom_email}
                        shake={contactShake}
                        errorMsg={contactErrors.groom_email}
                        disabled={groomSameAsLead}
                      />
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Instagram</label>
                        <div className={`flex items-center rounded-xl border bg-neutral-50 px-3 py-2 text-sm ${groomSameAsLead ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${contactErrors.groom_instagram ? 'field-error' : 'border-neutral-200'} ${contactErrors.groom_instagram && contactShake ? 'shake' : ''}`}>
                          <span className="text-neutral-400 select-none mr-1">instagram.com/</span>
                          <input
                            className="flex-1 outline-none bg-transparent"
                            placeholder="username"
                            disabled={groomSameAsLead}
                            value={groomSameAsLead ? (contactForm.instagram || '') : (contactForm.groom_instagram || '')}
                            onChange={e => setContactForm((f: any) => ({ ...f, groom_instagram: normalizeInstagramInput(e.target.value) }))}
                          />
                        </div>
                        {contactErrors.groom_instagram && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{contactErrors.groom_instagram}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <SaveBtn onClick={saveContact} label="Save Contact" saving={saving}/>
                </div>
              ):(
                <div className="px-5 py-3">
                  <Field label="Name" value={lead.name}/>
                  <Field label="Phone" value={lead.primary_phone}/>
                  <Field label="Alt Phone" value={lead.phone_secondary}/>
                  <Field label="Email" value={lead.email}/>
                  {lead.instagram && (
                    <Field label="Instagram" value={`@${normalizeInstagramInput(lead.instagram)}`}/>
                  )}
                  <Field label="Source" value={lead.source?(lead.source_name?`${lead.source} · ${lead.source_name}`:lead.source):null}/>
                  {lead.bride_name&&<>
                    <div className="pt-2 mt-2 border-t border-neutral-100"><div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Bride</div></div>
                    <Field label="Name" value={lead.bride_name}/>
                    <Field label="Phone" value={lead.bride_phone_primary}/>
                    <Field label="Alt Phone" value={lead.bride_phone_secondary}/>
                    <Field label="Email" value={lead.bride_email}/>
                    {lead.bride_instagram && (
                      <Field label="Instagram" value={`@${normalizeInstagramInput(lead.bride_instagram)}`}/>
                    )}
                  </>}
                  {lead.groom_name&&<>
                    <div className="pt-2 mt-2 border-t border-neutral-100"><div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Groom</div></div>
                    <Field label="Name" value={lead.groom_name}/>
                    <Field label="Phone" value={lead.groom_phone_primary}/>
                    <Field label="Alt Phone" value={lead.groom_phone_secondary}/>
                    <Field label="Email" value={lead.groom_email}/>
                    {lead.groom_instagram && (
                      <Field label="Instagram" value={`@${normalizeInstagramInput(lead.groom_instagram)}`}/>
                    )}
                  </>}
                </div>
              )}
            </div>

            {/* ── Lead Details ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <SectionHead label="Lead Details" onEdit={()=>setEditSection('details')} editing={editSection==='details'} onCancel={()=>setEditSection(null)} disabled={isConverted}/>
              {editSection==='details'?(
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Event Type" val={detailsForm.event_type} onChange={v=>setDetailsForm((f:any)=>({...f,event_type:v}))}
                      hasError={!!detailsErrors.event_type} shake={detailsShake} errorMsg={detailsErrors.event_type}/>
                    <Select label="Coverage" val={detailsForm.coverage_scope} onChange={v=>setDetailsForm((f:any)=>({...f,coverage_scope:v}))} opts={COVERAGES}/>
                    <Select label="Wedding Type" val={detailsForm.is_destination} onChange={v=>setDetailsForm((f:any)=>({...f,is_destination:v}))} opts={['Local','Destination']}/>
                    <Input label="Client Budget (₹)" val={String(detailsForm.client_budget_amount||'')} onChange={v=>setDetailsForm((f:any)=>({...f,client_budget_amount:v}))} type="number"/>
                    <Input label="Amount Quoted (₹)" val={String(detailsForm.amount_quoted||'')} onChange={v=>setDetailsForm((f:any)=>({...f,amount_quoted:v}))} type="number"/>
                    <Select label="Potential" val={detailsForm.potential ? 'Yes' : 'No'} onChange={v=>setDetailsForm((f:any)=>({...f,potential:v==='Yes'}))} opts={['No','Yes']}/>
                    <Select label="Important" val={detailsForm.important ? 'Yes' : 'No'} onChange={v=>setDetailsForm((f:any)=>({...f,important:v==='Yes'}))} opts={['No','Yes']}/>
                    {userRole === 'admin' && (
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Assigned To</label>
                        <select value={detailsForm.assigned_user_id || ''} onChange={e=>setDetailsForm((f:any)=>({...f,assigned_user_id:e.target.value}))}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition">
                          <option value="">Unassigned</option>
                          {assignableUsers.map(u => (
                            <option key={u.id} value={String(u.id)}>{u.nickname || u.name || u.email}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <SaveBtn onClick={saveDetails} label="Save Details" saving={saving}/>
                </div>
              ):(
                <div className="px-5 py-3">
                  <Field label="Event Type" value={lead.event_type}/>
                  <Field label="Coverage" value={lead.coverage_scope}/>
                  <Field label="Wedding" value={lead.is_destination?'Destination':'Local'}/>
                  <Field label="Client Budget" value={formatINR(lead.client_budget_amount)}/>
                  <Field label="Amount Quoted" value={formatINR(lead.amount_quoted)}/>
                  {lead.discounted_amount != null && lead.discounted_amount !== '' && (
                    <Field label="After Discount" value={formatINR(lead.discounted_amount)}/>
                  )}
                  <Field label="Potential" value={(lead.potential === true || String(lead.potential).toLowerCase() === 'yes') ? 'Yes' : 'No'}/>
                  <Field label="Important" value={(lead.important === true || String(lead.important).toLowerCase() === 'yes') ? 'Yes' : 'No'}/>
                  <Field label="Assigned To" value={(() => {
                    if (!lead.assigned_user_id) return 'Unassigned'
                    const user = assignableUsers.find(u => u.id === lead.assigned_user_id)
                    return user ? (user.nickname || user.name || user.email) : (lead.assigned_user_nickname || lead.assigned_user_name || 'Unassigned')
                  })()}/>
                </div>
              )}
            </div>

            {/* ── Cities ── */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <SectionHead label={`Cities · ${cities.length}`} onEdit={()=>setEditSection('cities')} editing={editSection==='cities'} onCancel={()=>setEditSection(null)} disabled={isConverted}/>
              {editSection==='cities'?(
                <div className="p-5 space-y-3">
                  {citiesForm.map((c:any,i:number)=>(
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-neutral-800">{c.name}</div>
                        {c.state&&<div className="text-[10px] text-neutral-400">{c.state}</div>}
                      </div>
                      <button onClick={()=>setPrimaryCity(i)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${c.is_primary?'bg-neutral-900 text-white border-neutral-900':'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-500'}`}>
                        {c.is_primary?'Primary':'Set Primary'}
                      </button>
                      <button onClick={()=>removeCity(i)} className="text-[10px] text-neutral-400 hover:text-red-600 transition font-semibold">Remove</button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <input value={newCityName} onChange={e=>setNewCityName(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCity()}}}
                        placeholder="Add city…"
                        className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                        list="city-suggestions"/>
                      <datalist id="city-suggestions">
                        {allCities.filter((c:any)=>c.name.toLowerCase().includes(newCityName.toLowerCase())).slice(0,8).map((c:any)=>(
                          <option key={c.id} value={c.name}/>
                        ))}
                      </datalist>
                    </div>
                    <button onClick={addCity} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl hover:bg-neutral-700 transition">Add</button>
                  </div>
                  {detailsErrors.cities && (
                    <div className={`text-xs text-red-600 font-medium ${detailsShake ? 'shake' : ''}`}>{detailsErrors.cities}</div>
                  )}
                  <SaveBtn onClick={saveCities} label="Save Cities" saving={saving}/>
                </div>
              ):(
                <div className="px-5 py-3">
                  {cities.length===0?<p className="py-2 text-xs text-neutral-400">No cities added.</p>:(
                    <div className="flex flex-wrap gap-2 py-2">
                      {cities.map((c:any)=>(
                        <span key={c.id} className={`text-xs px-3 py-1 rounded-full border ${c.is_primary?'bg-neutral-900 text-white border-neutral-900':'bg-neutral-50 text-neutral-600 border-neutral-200'}`}>
                          {c.name}{c.is_primary?' · Primary':''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Events ── */}
            <div className={`bg-white border border-neutral-200 rounded-2xl ${editingEvent ? 'overflow-visible' : 'overflow-hidden'}`}>
              <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Events · {events.length}</span>
                {!isConverted && (
                  <button onClick={()=>setEditingEvent({id:null,data:{event_type:'',event_date:'',slot:'',pax:'',venue:'',city_id:cities[0]?.id||'',start_time:'',end_time:''}})}
                    className="text-[10px] font-semibold text-neutral-400 hover:text-neutral-800 transition">+ Add Event</button>
                )}
              </div>
              <div className="divide-y divide-neutral-50">
                {events.length===0&&!editingEvent&&<p className="px-5 py-4 text-xs text-neutral-400">No events yet.</p>}
                {events.map((ev:any)=>(
                  <div key={ev.id}>
                    {editingEvent?.id===ev.id?(
                      <div className="p-5 space-y-3 bg-neutral-50 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="relative">
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Event Name</label>
                            <input
                              className={`w-full text-sm px-3 py-2 rounded-xl border outline-none focus:border-neutral-600 transition ${eventErrors.event_type ? 'field-error' : 'border-neutral-200'} ${eventErrors.event_type && eventShake ? 'shake' : ''}`}
                              value={editingEvent!.data.event_type || ''}
                              onFocus={() => setShowEventSuggestions(true)}
                              onClick={() => setShowEventSuggestions(true)}
                              onBlur={() => {
                                setTimeout(() => setShowEventSuggestions(false), 200)
                              }}
                              onChange={e => {
                                const v = e.target.value
                                const suggested = suggestedPax(v)
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  const currentPax = prev.data.pax
                                  const nextPax = !currentPax || currentPax === '' ? String(suggested) : currentPax
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      event_type: v,
                                      pax: nextPax
                                    }
                                  }
                                })
                                setShowEventSuggestions(true)
                              }}
                              placeholder="Event Name"
                              autoComplete="off"
                            />
                            {eventErrors.event_type && (
                              <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.event_type}</div>
                            )}
                            {showEventSuggestions && (() => {
                              const q = editingEvent!.data.event_type || ''
                              const filtered = EVENT_TYPES.filter(t => {
                                if (!q || EVENT_TYPES.includes(q)) return true
                                return t.toLowerCase().includes(q.toLowerCase())
                              })
                              return filtered.length > 0 ? (
                                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
                                  {filtered.map(t => (
                                    <div
                                      key={t}
                                      className="px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => {
                                        const suggested = suggestedPax(t)
                                        setEditingEvent(prev => {
                                          if (!prev) return prev
                                          return {
                                            ...prev,
                                            data: {
                                              ...prev.data,
                                              event_type: t,
                                              pax: String(suggested)
                                            }
                                          }
                                        })
                                        setShowEventSuggestions(false)
                                      }}
                                    >
                                      {t}
                                    </div>
                                  ))}
                                </div>
                              ) : null
                            })()}
                          </div>
                          
                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Date</label>
                            <CalendarInput
                              value={editingEvent!.data.event_date?.slice(0,10)||''}
                              onChange={v=>setEditingEvent(ev2=>ev2?{...ev2,data:{...ev2.data,event_date:v}}:ev2)}
                              className={`w-full text-sm px-3 py-2 rounded-xl border bg-white outline-none focus:border-neutral-600 transition h-[38px] flex items-center ${eventErrors.event_date ? 'field-error' : 'border-neutral-200'} ${eventErrors.event_date && eventShake ? 'shake' : ''}`}
                            />
                            {eventErrors.event_date && (
                              <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.event_date}</div>
                            )}
                          </div>
                          
                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Slot</label>
                            <select
                              value={editingEvent!.data.slot||''}
                              onChange={e => {
                                const v = e.target.value
                                const suggestion = suggestTimesForSlot(v)
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      slot: v,
                                      start_time: suggestion ? suggestion.start : prev.data.start_time,
                                      end_time: suggestion ? suggestion.end : prev.data.end_time,
                                      start_time_display: undefined,
                                      end_time_display: undefined
                                    }
                                  }
                                })
                              }}
                              className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                            >
                              <option value="">Select slot…</option>
                              {SLOTS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          
                          <Input label="Guests (Pax)" val={String(editingEvent!.data.pax||'')} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,pax:v}}:e)} type="number"
                            hasError={!!eventErrors.pax} shake={eventShake} errorMsg={eventErrors.pax}/>
                          
                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Start Time</label>
                            <input
                              className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                              value={editingEvent!.data.start_time_display ?? formatTimeDisplay(editingEvent!.data.start_time)}
                              placeholder="e.g. 10:00 AM"
                              onChange={e => {
                                const v = e.target.value
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      start_time_display: v
                                    }
                                  }
                                })
                              }}
                              onKeyDown={e => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  const next = addMinutes(editingEvent!.data.start_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                                  setEditingEvent(prev => {
                                    if (!prev) return prev
                                    return {
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        start_time: next,
                                        start_time_display: undefined
                                      }
                                    }
                                  })
                                }
                              }}
                              onBlur={e => {
                                const parsed = parseTimeInput(e.target.value)
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      start_time: parsed !== null ? parsed : prev.data.start_time,
                                      start_time_display: undefined
                                    }
                                  }
                                })
                              }}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">End Time</label>
                            <input
                              className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                              value={editingEvent!.data.end_time_display ?? formatTimeDisplay(editingEvent!.data.end_time)}
                              placeholder="e.g. 2:00 PM"
                              onChange={e => {
                                const v = e.target.value
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      end_time_display: v
                                    }
                                  }
                                })
                              }}
                              onKeyDown={e => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  const next = addMinutes(editingEvent!.data.end_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                                  setEditingEvent(prev => {
                                    if (!prev) return prev
                                    return {
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        end_time: next,
                                        end_time_display: undefined
                                      }
                                    }
                                  })
                                }
                              }}
                              onBlur={e => {
                                const parsed = parseTimeInput(e.target.value)
                                setEditingEvent(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      end_time: parsed !== null ? parsed : prev.data.end_time,
                                      end_time_display: undefined
                                    }
                                  }
                                })
                              }}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Venue</label>
                            <VenueAutocomplete
                              value={editingEvent!.data.venue || ''}
                              placeholder="Search venue…"
                              locationHint={(() => {
                                const cityId = editingEvent!.data.city_id
                                const cityMatch = cities.find((c: any) => c.id === cityId)
                                return cityMatch ? `${cityMatch.name}, ${cityMatch.state}` : ''
                              })()}
                              className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                              onChange={val => setEditingEvent(prev => {
                                if (!prev) return prev
                                return {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    venue: val
                                  }
                                }
                              })}
                              onSelect={(venue, meta) => setEditingEvent(prev => {
                                if (!prev) return prev
                                return {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    venue,
                                    venue_id: meta?.venue_id,
                                    venue_metadata: meta
                                  }
                                }
                              })}
                            />
                          </div>
                          {cities.length>0&&(
                            <div>
                              <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">City</label>
                              <select value={editingEvent!.data.city_id||''} onChange={e2=>setEditingEvent(e=>e?{...e,data:{...e.data,city_id:e2.target.value}}:e)}
                                className={`w-full text-sm px-3 py-2 rounded-xl border bg-white outline-none focus:border-neutral-600 transition ${eventErrors.city_id ? 'field-error' : 'border-neutral-200'} ${eventErrors.city_id && eventShake ? 'shake' : ''}`}>
                                <option value="">No city</option>
                                {cities.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              {eventErrors.city_id && (
                                <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.city_id}</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                          <button onClick={saveEvent} disabled={saving} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">{saving?'Saving…':'Save'}</button>
                          <button onClick={()=>setEditingEvent(null)} className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition">Cancel</button>
                          {ev.id&&<button onClick={()=>setDeleteEventId(ev.id)} className="ml-auto px-4 py-2 text-xs font-semibold text-red-500 hover:text-red-700 transition">Delete</button>}
                        </div>
                      </div>
                    ):(
                      <div className="px-5 py-3.5 flex items-start justify-between gap-3 group">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-800">{ev.event_type||'—'}</div>
                          {ev.venue&&<div className="text-[11px] text-neutral-500 mt-0.5 truncate">{ev.venue}</div>}
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {ev.city_name&&<span className="text-[10px] text-neutral-400">{ev.city_name}</span>}
                            {ev.pax!=null&&<span className="text-[10px] text-neutral-400">{ev.pax} guests</span>}
                            {(ev.start_time || ev.end_time) && (
                              <span className="text-[10px] text-neutral-500 font-medium">
                                🕒 {formatTimeDisplay(ev.start_time)}{ev.end_time ? ` – ${formatTimeDisplay(ev.end_time)}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs font-semibold text-neutral-700">{formatDate(ev.event_date)}</div>
                            {ev.slot&&<div className="text-[10px] text-neutral-400">{ev.slot}</div>}
                          </div>
                          {!isConverted && (
                            <button onClick={()=>setEditingEvent({id:ev.id,data:{event_type:ev.event_type||'',event_date:toISTDateInput(ev.event_date),slot:ev.slot||'',pax:ev.pax||'',venue:ev.venue||'',city_id:ev.city_id||'',date_status:ev.date_status||'confirmed',start_time:ev.start_time||'',end_time:ev.end_time||''}})}
                              className="opacity-0 group-hover:opacity-100 transition text-[10px] font-semibold text-neutral-400 hover:text-neutral-800">Edit</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {/* New event form */}
                {editingEvent?.id===null&&(
                  <div className="p-5 space-y-3 bg-neutral-50 animate-fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">New Event</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Event Name</label>
                        <input
                          className={`w-full text-sm px-3 py-2 rounded-xl border outline-none focus:border-neutral-600 transition ${eventErrors.event_type ? 'field-error' : 'border-neutral-200'} ${eventErrors.event_type && eventShake ? 'shake' : ''}`}
                          value={editingEvent.data.event_type || ''}
                          onFocus={() => setShowEventSuggestions(true)}
                          onClick={() => setShowEventSuggestions(true)}
                          onBlur={() => {
                            setTimeout(() => setShowEventSuggestions(false), 200)
                          }}
                          onChange={e => {
                            const v = e.target.value
                            const suggested = suggestedPax(v)
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              const currentPax = prev.data.pax
                              const nextPax = !currentPax || currentPax === '' ? String(suggested) : currentPax
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  event_type: v,
                                  pax: nextPax
                                }
                              }
                            })
                            setShowEventSuggestions(true)
                          }}
                          placeholder="Event Name"
                          autoComplete="off"
                        />
                        {eventErrors.event_type && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.event_type}</div>
                        )}
                        {showEventSuggestions && (() => {
                          const q = editingEvent.data.event_type || ''
                          const filtered = EVENT_TYPES.filter(t => {
                            if (!q || EVENT_TYPES.includes(q)) return true
                            return t.toLowerCase().includes(q.toLowerCase())
                          })
                          return filtered.length > 0 ? (
                            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
                              {filtered.map(t => (
                                <div
                                  key={t}
                                  className="px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    const suggested = suggestedPax(t)
                                    setEditingEvent(prev => {
                                      if (!prev) return prev
                                      return {
                                        ...prev,
                                        data: {
                                          ...prev.data,
                                          event_type: t,
                                          pax: String(suggested)
                                        }
                                      }
                                    })
                                    setShowEventSuggestions(false)
                                  }}
                                >
                                  {t}
                                </div>
                              ))}
                            </div>
                          ) : null
                        })()}
                      </div>
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Date</label>
                        <CalendarInput
                          value={editingEvent.data.event_date || ''}
                          onChange={v=>setEditingEvent(ev2=>ev2?{...ev2,data:{...ev2.data,event_date:v}}:ev2)}
                          className={`w-full text-sm px-3 py-2 rounded-xl border bg-white outline-none focus:border-neutral-600 transition h-[38px] flex items-center ${eventErrors.event_date ? 'field-error' : 'border-neutral-200'} ${eventErrors.event_date && eventShake ? 'shake' : ''}`}
                        />
                        {eventErrors.event_date && (
                          <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.event_date}</div>
                        )}
                      </div>
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Slot</label>
                        <select
                          value={editingEvent.data.slot||''}
                          onChange={e => {
                            const v = e.target.value
                            const suggestion = suggestTimesForSlot(v)
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  slot: v,
                                  start_time: suggestion ? suggestion.start : prev.data.start_time,
                                  end_time: suggestion ? suggestion.end : prev.data.end_time,
                                  start_time_display: undefined,
                                  end_time_display: undefined
                                }
                              }
                            })
                          }}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                        >
                          <option value="">Select slot…</option>
                          {SLOTS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      
                      <Input label="Guests (Pax)" val={String(editingEvent.data.pax||'')} onChange={v=>setEditingEvent(e=>e?{...e,data:{...e.data,pax:v}}:e)} type="number"
                        hasError={!!eventErrors.pax} shake={eventShake} errorMsg={eventErrors.pax}/>
                      
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Start Time</label>
                        <input
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                          value={editingEvent.data.start_time_display ?? formatTimeDisplay(editingEvent.data.start_time)}
                          placeholder="e.g. 10:00 AM"
                          onChange={e => {
                            const v = e.target.value
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  start_time_display: v
                                }
                              }
                            })
                          }}
                          onKeyDown={e => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault()
                              const next = addMinutes(editingEvent.data.start_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                              setEditingEvent(prev => {
                                if (!prev) return prev
                                return {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    start_time: next,
                                    start_time_display: undefined
                                  }
                                }
                              })
                            }
                          }}
                          onBlur={e => {
                            const parsed = parseTimeInput(e.target.value)
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  start_time: parsed !== null ? parsed : prev.data.start_time,
                                  start_time_display: undefined
                                }
                              }
                            })
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">End Time</label>
                        <input
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50 outline-none focus:border-neutral-600 transition"
                          value={editingEvent.data.end_time_display ?? formatTimeDisplay(editingEvent.data.end_time)}
                          placeholder="e.g. 2:00 PM"
                          onChange={e => {
                            const v = e.target.value
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  end_time_display: v
                                }
                              }
                            })
                          }}
                          onKeyDown={e => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault()
                              const next = addMinutes(editingEvent.data.end_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                              setEditingEvent(prev => {
                                if (!prev) return prev
                                return {
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    end_time: next,
                                    end_time_display: undefined
                                  }
                                }
                              })
                            }
                          }}
                          onBlur={e => {
                            const parsed = parseTimeInput(e.target.value)
                            setEditingEvent(prev => {
                              if (!prev) return prev
                              return {
                                ...prev,
                                data: {
                                  ...prev.data,
                                  end_time: parsed !== null ? parsed : prev.data.end_time,
                                  end_time_display: undefined
                                }
                              }
                            })
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Venue</label>
                        <VenueAutocomplete
                          value={editingEvent.data.venue || ''}
                          placeholder="Search venue…"
                          locationHint={(() => {
                            const cityId = editingEvent.data.city_id
                            const cityMatch = cities.find((c: any) => c.id === cityId)
                            return cityMatch ? `${cityMatch.name}, ${cityMatch.state}` : ''
                          })()}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                          onChange={val => setEditingEvent(prev => {
                            if (!prev) return prev
                            return {
                              ...prev,
                              data: {
                                ...prev.data,
                                venue: val
                              }
                            }
                          })}
                          onSelect={(venue, meta) => setEditingEvent(prev => {
                            if (!prev) return prev
                            return {
                              ...prev,
                              data: {
                                ...prev.data,
                                venue,
                                venue_id: meta?.venue_id,
                                venue_metadata: meta
                              }
                            }
                          })}
                        />
                      </div>
                      {cities.length>0&&(
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">City</label>
                          <select value={editingEvent.data.city_id||''} onChange={e2=>setEditingEvent(e=>e?{...e,data:{...e.data,city_id:e2.target.value}}:e)}
                            className={`w-full text-sm px-3 py-2 rounded-xl border bg-white outline-none focus:border-neutral-600 transition ${eventErrors.city_id ? 'field-error' : 'border-neutral-200'} ${eventErrors.city_id && eventShake ? 'shake' : ''}`}>
                            <option value="">No city</option>
                            {cities.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          {eventErrors.city_id && (
                            <div className="text-xs text-red-600 mt-1 font-medium">{eventErrors.city_id}</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                      <button onClick={saveEvent} disabled={saving} className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-40 hover:bg-neutral-700 transition">{saving?'Saving…':'Add Event'}</button>
                      <button onClick={()=>setEditingEvent(null)} className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Danger Zone ── */}
            {userRole === 'admin' && !isConverted && (
              <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div>
                  <div className="text-sm font-bold text-red-800">Delete Lead</div>
                  <div className="text-xs text-red-600 mt-1">Once deleted, a lead cannot be recovered.</div>
                </div>
                <button onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting} className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition">
                  {isDeleting ? 'Deleting...' : 'Delete Lead'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ TIMELINE ═══ */}
        {tab==='timeline'&&(
          <div className="max-w-2xl space-y-4">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="p-4 flex gap-2">
                <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Add a note… (⌘↵ to save)" rows={2}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 outline-none resize-none focus:border-neutral-400 transition"
                  onInput={e=>{const t=e.currentTarget;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))saveNote()}}/>
                <button onClick={saveNote} disabled={savingNote||!noteText.trim()}
                  className="self-start px-4 py-2.5 text-xs font-bold bg-neutral-900 text-white rounded-xl disabled:opacity-30 hover:bg-neutral-700 transition">{savingNote?'…':'Save'}</button>
              </div>
            </div>
            {timeline.length > 0 && (
              <div className="flex justify-between items-center bg-white border border-neutral-200 rounded-2xl px-4 py-2.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Timeline Filter</span>
                <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  <button
                    onClick={() => setTimelineFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition ${timelineFilter === 'all' ? 'bg-white text-neutral-800 shadow-sm' : 'hover:text-neutral-700'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setTimelineFilter('activities')}
                    className={`px-2.5 py-1 rounded-md transition ${timelineFilter === 'activities' ? 'bg-white text-neutral-800 shadow-sm' : 'hover:text-neutral-700'}`}
                  >
                    Activities
                  </button>
                  <button
                    onClick={() => setTimelineFilter('notes')}
                    className={`px-2.5 py-1 rounded-md transition ${timelineFilter === 'notes' ? 'bg-white text-neutral-800 shadow-sm' : 'hover:text-neutral-700'}`}
                  >
                    Notes
                  </button>
                </div>
              </div>
            )}
            
            {filteredTimeline.length === 0 && (
              <div className="text-center py-16 text-sm text-neutral-400">
                {timelineFilter === 'notes' ? 'No notes yet.' : timelineFilter === 'activities' ? 'No activities yet.' : 'No notes or activity yet.'}
              </div>
            )}
            
            <div className="relative">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-neutral-200"/>
              <div className="space-y-3 pl-12">
                {filteredTimeline.map((item:any,i)=>{
                  const isNote=item._kind==='note'
                  let displayTitle = ''
                  let displayMeta = ''
                  let actorLabel = ''
                  if (!isNote) {
                    const details = formatActivityDetails(item)
                    displayTitle = details.title
                    displayMeta = details.metaText
                    
                    const nickname = String(item.user_nickname || '').trim()
                    if (nickname) actorLabel = nickname
                    else {
                      const name = String(item.user_name || '').trim()
                      if (name) actorLabel = name.split(/\s+/)[0] || name
                      else {
                        const email = String(item.user_email || '').trim()
                        if (email) actorLabel = email.split('@')[0]
                      }
                    }
                  }
                  return (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[2.15rem] top-3.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] ${isNote?'bg-neutral-900 border-neutral-900 text-white':'bg-white border-neutral-300 text-neutral-500'}`}>
                        {isNote?'✍':'·'}
                      </div>
                      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${isNote?'text-neutral-700':'text-neutral-400'}`}>
                              {isNote?'Note':displayTitle}
                            </span>
                            <div className="text-right shrink-0">
                              {actorLabel && <span className="text-[10px] font-semibold text-neutral-500 mr-2">by {actorLabel}</span>}
                              <span className="text-[10px] text-neutral-400">{formatDateTime(item.created_at)}</span>
                            </div>
                          </div>
                          {isNote ? (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-800 font-medium">
                              {item.note_text}
                            </p>
                          ) : (
                            displayMeta ? (
                              <p className="text-xs leading-relaxed whitespace-pre-wrap text-neutral-600 bg-neutral-50/50 border border-neutral-100 rounded-xl p-3 mt-1.5 font-mono">
                                {displayMeta}
                              </p>
                            ) : (
                              <p className="text-xs text-neutral-400 italic">No field details</p>
                            )
                          )}
                          {isNote&&item.status_at_time&&<div className="text-[10px] mt-1.5 text-neutral-400">Status: {item.status_at_time}</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ QUOTES ═══ */}
        {tab==='quotes'&&(
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between relative">
              <span className="text-xs text-neutral-500">{quotes.length} version{quotes.length!==1?'s':''} across {groups.length} group{groups.length!==1?'s':''}</span>
              <button onClick={() => setShowNewQuoteForm(!showNewQuoteForm)} disabled={isConverted} className="text-xs font-bold px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-700 transition disabled:opacity-40">
                + New Quote Group
              </button>

              {showNewQuoteForm && (
                <div className="absolute right-0 top-11 w-80 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl z-20 flex flex-col gap-4">
                  <div className="text-sm font-semibold text-neutral-900">Create New Quote Group</div>
                  
                  {sortedLeadEvents.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Select Events</div>
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                        {sortedLeadEvents.map((ev: any) => (
                          <label key={ev.id} className="flex items-start gap-2 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={selectedEvents.includes(ev.id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const nextEvents = checked 
                                  ? [...selectedEvents, ev.id] 
                                  : selectedEvents.filter(x => x !== ev.id);
                                setSelectedEvents(nextEvents);
                                
                                const names = sortedLeadEvents.filter((x: any) => nextEvents.includes(x.id)).map((x: any) => x.event_type);
                                if (names.length > 0) {
                                  const formatted = formatEventList(names)
                                  setNewGroupTitle(formatted + (names.length === 1 ? ' Package' : ''))
                                } else {
                                  setNewGroupTitle('');
                                }
                              }}
                              className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900" 
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900">{ev.event_type}</span>
                              {ev.event_date && (
                                <span className="text-xs text-neutral-500">{formatDate(ev.event_date)}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Quote Title</div>
                    <input
                      type="text"
                      autoFocus
                      value={newGroupTitle}
                      onChange={(event) => setNewGroupTitle(event.target.value)}
                      placeholder="e.g. Custom Package"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-2 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewQuoteForm(false);
                        setSelectedEvents([]);
                        setNewGroupTitle('');
                      }}
                      className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateGroup}
                      disabled={creatingGroup || !newGroupTitle.trim()}
                      className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center min-w-[80px]"
                    >
                      {creatingGroup ? '...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {groups.length===0&&<div className="text-center py-16 text-sm text-neutral-400">No quotes yet.</div>}
            
            {groups.map((group: any) => {
              const versions = versionsByGroup[group.id] || []
              const hasSentOrExpired = versions.some((v: any) => ['SENT', 'ACCEPTED', 'EXPIRED'].includes(v.status?.toUpperCase()))
              return (
                <div key={group.id} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Group Header */}
                  <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 max-w-md">
                          <input
                            type="text"
                            autoFocus
                            value={editGroupTitle}
                            onChange={(e) => setEditGroupTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateGroupTitle(group.id)
                              if (e.key === 'Escape') setEditingGroupId(null)
                            }}
                            className="text-sm font-bold border border-neutral-300 rounded px-2.5 py-1 bg-white outline-none focus:border-neutral-500 flex-1 min-w-0"
                          />
                          <button onClick={() => handleUpdateGroupTitle(group.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 shrink-0">Save</button>
                          <button onClick={() => setEditingGroupId(null)} className="text-xs font-bold text-neutral-500 hover:text-neutral-700 px-2 py-1 rounded hover:bg-neutral-100 shrink-0">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title">
                          <h3 className="text-sm font-bold text-neutral-900 truncate">{group.title}</h3>
                          <button onClick={() => { setEditingGroupId(group.id); setEditGroupTitle(group.title) }} className="opacity-0 group-hover/title:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition shrink-0" title="Edit Package Title">
                            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500 font-medium">
                        <span>🗓️ {formatDate(group.created_at || group.createdAt)}</span>
                        <span>·</span>
                        <span>{versions.length} version{versions.length!==1?'s':''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingGroupId(group.id); setEditGroupTitle(group.title) }}
                        disabled={isConverted}
                        className="text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition px-3 py-1.5 rounded-lg border border-neutral-200 bg-white disabled:opacity-45"
                      >
                        Edit Name
                      </button>
                      <button
                        onClick={() => handleCreateVersion(group.id)}
                        disabled={creatingVersion === group.id || isConverted}
                        className="text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                      >
                        {creatingVersion === group.id ? 'Creating...' : '+ New Version'}
                      </button>
                      {!hasSentOrExpired && !isConverted && (
                        <button 
                          onClick={() => setQuoteDeleteConfirm({ type: 'group', id: group.id, title: group.title })}
                          className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-1"
                          title="Delete Quote Package"
                        >
                          <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Versions Grid */}
                  <div className="p-5">
                    {versions.length === 0 ? (
                      <div className="py-6 text-center border border-dashed border-neutral-150 rounded-xl">
                        <span className="text-xs text-neutral-400 font-medium">No versions in this group</span>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {versions.map((v: any) => {
                          const draft = typeof v.draftDataJson === 'string' ? JSON.parse(v.draftDataJson) : (v.draftDataJson || {})
                          const isTiered = draft.pricingMode === 'TIERED'
                          
                          let originalPrice: number | null = null
                          let finalPrice = v.calculatedPrice ? parseFloat(v.calculatedPrice) : 0

                          if (isTiered) {
                            const starredTier = (draft.tiers || []).find((t: any) => t.isPopular) || draft.tiers?.[0]
                            if (starredTier) {
                              const displayPrice = starredTier.overridePrice ?? starredTier.price
                              const discountedPrice = starredTier.discountedPrice ?? null
                              originalPrice = discountedPrice != null ? displayPrice : null
                              finalPrice = discountedPrice != null ? discountedPrice : displayPrice
                            }
                          } else {
                            const activeTier = (draft.tiers || []).find((t: any) => t.id === draft.selectedTierId) || draft.tiers?.[0]
                            if (activeTier) {
                              const displayPrice = activeTier.overridePrice ?? activeTier.price
                              const discountedPrice = activeTier.discountedPrice ?? null
                              originalPrice = discountedPrice != null ? displayPrice : null
                              finalPrice = discountedPrice != null ? discountedPrice : displayPrice
                            } else {
                              const displayPrice = draft.overridePrice ?? (v.calculatedPrice ? parseFloat(v.calculatedPrice) : 0)
                              const hasDiscount = draft.expirySettings?.discountEnabled && draft.expirySettings?.discountAmount
                              const discountedPrice = hasDiscount ? (displayPrice - (draft.expirySettings.discountAmount || 0)) : null
                              originalPrice = discountedPrice != null ? displayPrice : null
                              finalPrice = discountedPrice != null ? discountedPrice : displayPrice
                            }
                          }

                          const snapshotId = v.proposalSnapshots && v.proposalSnapshots.length > 0 ? v.proposalSnapshots[0].id : null
                          return (
                            <div key={v.id} className="relative group/version">
                              <div onClick={() => router.push(`/leads/${id}/quotes/${v.id}`)} className="block cursor-pointer">
                                <div className="border border-neutral-200 rounded-xl p-4 hover:border-neutral-300 hover:shadow-md transition bg-white flex flex-col h-full min-h-[110px]">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-md">
                                      Version {v.versionNumber}
                                    </span>
                                    {v.status === 'EXPIRED' && (
                                      <span className="flex h-2.5 w-2.5 relative mt-1" title="Expired">
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                                      </span>
                                    )}
                                    {['SENT', 'ACCEPTED'].includes(v.status) && (
                                      <span className="flex h-2.5 w-2.5 relative mt-1" title="Live: Visible to Client">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-auto">
                                    <div className="flex items-end justify-between gap-4">
                                      <div>
                                        {originalPrice != null && originalPrice > 0 && (
                                          <div className="text-[10px] line-through text-neutral-400">{formatINR(originalPrice)}</div>
                                        )}
                                        <div className="text-sm font-extrabold text-neutral-900">
                                          {finalPrice ? formatINR(finalPrice) : '—'}
                                        </div>
                                      </div>
                                      
                                      {v.proposalSnapshots && v.proposalSnapshots.length > 0 && (
                                        <div className="text-[9px] text-neutral-500 space-y-0.5 text-right shrink-0">
                                          {v.proposalSnapshots[0].createdAt && (
                                            <div>
                                              <span className="text-neutral-400">Shared:</span>{' '}
                                              <strong className="text-neutral-700 font-medium">
                                                {formatDate(v.proposalSnapshots[0].createdAt)}
                                              </strong>
                                            </div>
                                          )}
                                          {v.proposalSnapshots[0].expiresAt && (
                                            <div>
                                              <span className="text-neutral-400">Expires:</span>{' '}
                                              <strong className={v.status === 'EXPIRED' ? 'text-red-600 font-medium' : 'text-neutral-700 font-medium'}>
                                                {formatDate(v.proposalSnapshots[0].expiresAt)}
                                              </strong>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between mt-2 min-h-[22px]">
                                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        v.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' :
                                        v.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                                        v.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                                        'bg-neutral-100 text-neutral-600'
                                      }`}>
                                        {v.status}
                                      </span>
                                      {snapshotId && (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            router.push(`/proposalanalytics/${snapshotId}`)
                                          }}
                                          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded hover:bg-violet-100 z-10 transition shadow-sm opacity-100 lg:opacity-0 lg:group-hover/version:opacity-100"
                                        >
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                          Analytics
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Delete Draft Button */}
                              {v.status?.toUpperCase() === 'DRAFT' && !isConverted && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setQuoteDeleteConfirm({ type: 'version', id: v.id, groupId: group.id, title: `Version ${v.versionNumber}` })
                                  }}
                                  className="absolute top-3 right-3 p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-500 hover:text-white transition shadow-sm z-10 opacity-100 lg:opacity-0 lg:group-hover/version:opacity-100"
                                  title="Delete Draft"
                                >
                                  <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ===== LOST MODAL ===== */}
      {showLostModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl border border-neutral-100">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">🥀 Mark Lead as Lost</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Reason for Lost</label>
                <select
                  className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                >
                  <option value="">Select reason</option>
                  {LOST_REASONS.map(r => (
                    <option key={r.label} value={r.label}>{r.icon} {r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Note (Optional)</label>
                <textarea
                  className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                  placeholder="Explain why this lead was lost..."
                  rows={3}
                  value={lostOther}
                  onChange={e => setLostOther(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => setShowLostModal(false)}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white hover:bg-neutral-800 transition rounded-xl disabled:opacity-40"
                disabled={!lostReason}
                onClick={async () => {
                  if (!lostReason) return
                  setShowLostModal(false)
                  const finalNote = lostOther.trim() ? `Reason: ${lostReason}. Note: ${lostOther.trim()}` : lostReason
                  await changeStatus('Lost', finalNote)
                  setLostReason('Client stopped responding')
                  setLostOther('')
                }}
              >
                Mark Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== REJECT MODAL ===== */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl border border-neutral-100">
            <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">🚫 Reason for Rejection</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Reason</label>
                <select
                  className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                >
                  {REJECT_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {rejectReason === 'Other' && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-semibold text-neutral-400 block mb-1">Enter Custom Reason</label>
                  <input
                    className="w-full text-sm px-3 py-2 rounded-xl border border-neutral-200 bg-white outline-none focus:border-neutral-600 transition"
                    placeholder="Type details..."
                    value={rejectOther}
                    onChange={e => setRejectOther(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => { setShowRejectModal(false); setRejectOther('') }}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white hover:bg-neutral-800 transition rounded-xl disabled:opacity-40"
                disabled={rejectReason === 'Other' && !rejectOther.trim()}
                onClick={async () => {
                  const finalReason = rejectReason === 'Other' ? rejectOther.trim() : rejectReason
                  if (rejectReason === 'Other' && !finalReason) return
                  setShowRejectModal(false)
                  await changeStatus('Rejected', finalReason)
                  setRejectOther('')
                }}
              >
                Mark Rejected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONVERT CONFIRMATION MODAL ===== */}
      {convertConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-2xl border border-neutral-100">
            <h3 className="text-lg font-bold text-neutral-900 mb-2 flex items-center gap-2">🎉 Convert this Lead?</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mb-4">By converting, you confirm that the advance has been collected and the booking is confirmed.</p>
            <div className="flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => { setConvertConfirmOpen(false); setConvertLeadSnapshot(null) }}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition rounded-xl"
                onClick={() => openConversionSummary()}
              >
                Yes, Convert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONVERSION SUMMARY MODAL ===== */}
      {convertSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[440px] shadow-2xl border border-neutral-100">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">Confirm Conversion Details</h3>
            <div className="text-xs text-neutral-600 mb-5 space-y-2 bg-neutral-50 border border-neutral-150 rounded-xl p-4">
              <p>Lead: <strong>{lead?.name || 'Unknown'}</strong></p>
              {events[0]?.event_date && <p>Event Date: <strong>{formatDate(events[0].event_date)}</strong></p>}
              {lead?.amount_quoted && <p>Total Amount: <strong>{formatINR(lead.amount_quoted)}</strong></p>}
              {convertSummary.stageDurationDays != null && <p>Days in pipeline: <strong>{convertSummary.stageDurationDays} days</strong></p>}
              {convertSummary.discountValue != null && convertSummary.discountValue > 0 && <p>Discount Value: <strong>{formatINR(convertSummary.discountValue)}</strong></p>}
            </div>
            <div className="flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => setConvertSummary(null)} disabled={convertSaving}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-neutral-900 text-white hover:bg-neutral-800 transition rounded-xl disabled:opacity-40"
                disabled={convertSaving}
                onClick={() => finalizeConversion()}
              >
                {convertSaving ? 'Converting…' : 'Confirm & Convert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[400px] shadow-2xl border border-neutral-150">
            <h3 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2">⚠️ Delete Lead</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mb-4">Are you absolutely sure you want to delete this lead? All associated events, notes, quotes, and timelines will be permanently removed.</p>
            <div className="flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition rounded-xl disabled:opacity-40"
                disabled={isDeleting}
                onClick={() => handleDeleteLead()}
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE EVENT CONFIRMATION MODAL ===== */}
      {deleteEventId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[400px] shadow-2xl border border-neutral-150">
            <h3 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2">⚠️ Delete Event</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mb-4">Are you sure you want to delete this event? This action cannot be undone.</p>
            <div className="flex justify-end gap-2.5">
              <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => setDeleteEventId(null)} disabled={saving}>Cancel</button>
              <button
                className="px-4 py-2 text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition rounded-xl disabled:opacity-40"
                disabled={saving}
                onClick={async () => {
                  if (deleteEventId) {
                    await deleteEvent(deleteEventId)
                    setDeleteEventId(null)
                  }
                }}
              >
                {saving ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DUPLICATE CONTACT MODAL ===== */}
      {showContactDuplicate && contactDuplicateData && (
        <DuplicateContactModal
          open={showContactDuplicate}
          duplicates={contactDuplicateData}
          onContinue={() => setShowContactDuplicate(false)}
          showContinue={false}
        />
      )}

      {/* ===== DUPLICATE EVENT MODAL ===== */}
      {showEventDuplicateModal && (
        <div className="fixed inset-0 bg-neutral-900/50 flex items-center justify-center z-[200] p-4 animate-fade-in backdrop-blur-sm">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Potential Duplicate Events</h3>
                  <p className="text-[10px] text-amber-700">Other leads share similar dates & city schedules</p>
                </div>
              </div>
              <button onClick={() => setShowEventDuplicateModal(false)} className="text-neutral-400 hover:text-neutral-600 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-5 max-h-[300px] overflow-y-auto space-y-3 custom-scrollbar">
              {eventDuplicates.map((match: any) => {
                const isHigh = match.score >= 70
                const isMedium = match.score >= 40
                const badgeColor = isHigh ? 'bg-rose-50 text-rose-700 border-rose-100' : isMedium ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-neutral-50 text-neutral-600 border-neutral-100'
                const confidence = isHigh ? 'High Confidence' : isMedium ? 'Medium Confidence' : 'Low Confidence'

                return (
                  <div key={match.id} className="p-3 border border-neutral-100 rounded-xl bg-neutral-50/50 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-neutral-800">
                          Lead #{match.lead_number} ({match.name || 'Unnamed'})
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          Assigned to: <span className="font-medium text-neutral-600">{match.assigned_user_name}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-lg ${badgeColor}`}>
                        {confidence} ({match.score}%)
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <Link
                        href={`/leads/${match.id}`}
                        onClick={() => setShowEventDuplicateModal(false)}
                        className="text-[10px] font-semibold text-neutral-800 hover:bg-neutral-100 border border-neutral-200 px-3 py-1.5 rounded-lg transition"
                      >
                        View Lead Details
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex justify-end">
              <button
                onClick={() => setShowEventDuplicateModal(false)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DATE AVAILABILITY DETAILS MODAL ===== */}
      {selectedLoadDate && (
        <div className="fixed inset-0 bg-neutral-900/50 flex items-center justify-center z-[200] p-4 animate-fade-in backdrop-blur-sm">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-800">Date Load Details</h3>
                <p className="text-[10px] text-neutral-400">Leads with event schedules on {formatDate(selectedLoadDate)}</p>
              </div>
              <button onClick={() => setSelectedLoadDate(null)} className="text-neutral-400 hover:text-neutral-600 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-5 max-h-[350px] overflow-y-auto space-y-3 custom-scrollbar">
              {loadDetailsLoading ? (
                <div className="py-8 text-center text-xs text-neutral-400">Loading date load details…</div>
              ) : loadDetails.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400">No leads scheduled on this date.</div>
              ) : (
                <div className="space-y-3">
                  {loadDetails.map((match: any) => {
                    const isConverted = match.status === 'Converted'
                    const isAwaiting = match.status === 'Awaiting Advance'
                    const isPotential = match.potential === true || String(match.potential).toLowerCase() === 'yes'
                    
                    const statusColor = isConverted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : isAwaiting
                      ? 'bg-rose-50 text-rose-700 border-rose-100'
                      : isPotential
                      ? 'bg-violet-50 text-violet-700 border-violet-100'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-100'

                    return (
                      <div key={match.id} className="p-4 border border-neutral-200 rounded-xl bg-white flex flex-col gap-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-neutral-850">
                              Lead #{match.lead_number} ({match.name || 'Unnamed'})
                            </div>
                            <div className="text-[10px] text-neutral-400 mt-0.5">
                              Assigned to: <span className="font-semibold text-neutral-600">{match.assigned_user_name || 'Unassigned'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-lg ${statusColor}`}>
                              {match.status} {isPotential && '· Potential'}
                            </span>
                            <a
                              href={`/leads/${match.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:bg-neutral-50 px-2.5 py-1.5 rounded-lg transition"
                            >
                              View →
                            </a>
                          </div>
                        </div>

                        {/* Allocated Crew for Converted/Awaiting Leads */}
                        {match.teamLines && match.teamLines.length > 0 && (
                          <div className="pt-2 border-t border-neutral-100">
                            <div className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1">Booked Crew</div>
                            <div className="flex flex-wrap gap-1.5">
                              {match.teamLines.map((line: string, idx: number) => (
                                <span key={idx} className="text-[10px] font-mono font-medium text-neutral-700 bg-neutral-50 border border-neutral-150 px-2 py-0.5 rounded-md">
                                  {line}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex justify-end">
              <button
                onClick={() => setSelectedLoadDate(null)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FOLLOWUP ACTION POPUP ===== */}
      <FollowUpActionPopup
        open={followupPopupOpen}
        leadId={Number(id)}
        status={lead.status}
        nextFollowupDate={lead.next_followup_date}
        defaultToDone={followupPopupDefaultDone}
        onClose={() => setFollowupPopupOpen(false)}
        onSuccess={async (updated: any) => {
          setFollowupPopupOpen(false)
          await reload()
        }}
      />
      {/* ===== QUOTE DELETE CONFIRMATION MODAL ===== */}
      {quoteDeleteConfirm && (
         <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl p-6 w-full max-w-[400px] shadow-2xl border border-neutral-150 animate-in zoom-in-95 duration-200">
               <h3 className="text-lg font-bold text-red-800 mb-2 flex items-center gap-2">⚠️ Delete {quoteDeleteConfirm.type === 'group' ? 'Quote Package' : 'Draft'}</h3>
               <p className="text-xs text-neutral-500 leading-relaxed mb-4">
                  Are you sure you want to delete <strong>{quoteDeleteConfirm.title}</strong>? 
                  {quoteDeleteConfirm.type === 'group' 
                     ? ' This will permanently remove all versions and snapshots within this package. This action cannot be undone.'
                     : ' This action cannot be undone.'}
               </p>
               <div className="flex justify-end gap-2.5">
                  <button className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition" onClick={() => setQuoteDeleteConfirm(null)} disabled={isQuoteDeleting}>Cancel</button>
                  <button
                     className="px-4 py-2 text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition rounded-xl disabled:opacity-40"
                     disabled={isQuoteDeleting}
                     onClick={handleQuoteDeleteConfirm}
                  >
                     {isQuoteDeleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  )
}