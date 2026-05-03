'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneField from '@/components/PhoneField'
import CalendarInput from '@/components/CalendarInput'
import { formatINR } from '@/lib/formatters'
import { sanitizeText } from '@/lib/sanitize'
import DuplicateContactModal, { type DuplicateResults } from '@/components/DuplicateContactModal'
import { checkContactDuplicates, hasDuplicates } from '@/lib/contactDuplicates'
import { formatLeadName } from '@/lib/leadNameFormat'
import CurrencyInput from '@/components/CurrencyInput'
import VenueAutocomplete from '@/components/VenueAutocomplete'

const INDIA_STATES_UT = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
]

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
  'Satsang',
  'Satsang (Bride)',
  'Satsand (Groom)',
  'Jaago',
  'Jaago (Bride)',
  'Jaago (Groom)',
]

const COVERAGE_SCOPES = ['Both Sides', 'Bride Side', 'Groom Side']
const SOURCE_OPTIONS = ['Instagram', 'Direct Call', 'WhatsApp', 'Reference', 'Website', 'Unknown']
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const totalMinutes = i * 30
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
})

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'
const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm'
const softCardClass = 'rounded-2xl border border-[var(--border)] bg-white/60'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const errorTextClass = 'text-sm text-red-600'

export default function LeadIntakePage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const searchParams = useSearchParams()

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })

  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<any>(null)
  const [enrichment, setEnrichment] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({})
  const [contactWarnings, setContactWarnings] = useState<Record<string, string>>({})
  const [contactShake, setContactShake] = useState(false)
  const [contactDuplicateData, setContactDuplicateData] = useState<DuplicateResults | null>(null)
  const [showContactDuplicate, setShowContactDuplicate] = useState(false)
  const [pendingIntakeSave, setPendingIntakeSave] = useState<(() => void) | null>(null)
  const instagramInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [contactForm, setContactForm] = useState<any>({
    name: '',
    primary_phone: '',
    phone_secondary: '',
    email: '',
    instagram: '',
    source: 'Unknown',
    source_name: '',
    bride_name: '',
    bride_phone_primary: '',
    bride_phone_secondary: '',
    bride_email: '',
    bride_instagram: '',
    groom_name: '',
    groom_phone_primary: '',
    groom_phone_secondary: '',
    groom_email: '',
    groom_instagram: '',
  })

  const [detailsForm, setDetailsForm] = useState<any>({
    event_type: 'Wedding',
    is_destination: false,
    client_budget_amount: '',
    amount_quoted: '',
    coverage_scope: 'Both Sides',
    potential: false,
    important: false,
  })
  const [importantTouched, setImportantTouched] = useState(false)

  const [selectedCities, setSelectedCities] = useState<any[]>([])
  const [allCities, setAllCities] = useState<any[]>([])
  const [cityQuery, setCityQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pendingCity, setPendingCity] = useState<any | null>(null)

  const [eventsDraft, setEventsDraft] = useState<any[]>([])
  const [eventsDraftErrors, setEventsDraftErrors] = useState<Record<string, Record<string, string>>>({})
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})
  const [eventNotice, setEventNotice] = useState<string | null>(null)
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null)
  const [eventTypeSuggestRow, setEventTypeSuggestRow] = useState<string | null>(null)
  const [pendingEventDelete, setPendingEventDelete] = useState<string | null>(null)
  const [lastEventCalendar, setLastEventCalendar] = useState<{ y: number; m: number } | null>(null)

  const formatName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const formatEventName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const capitalizeToken = (token: string) => {
      const match = token.match(/[A-Za-z]/)
      if (!match || match.index == null) return token
      const idx = match.index
      const prefix = token.slice(0, idx)
      const rest = token.slice(idx)
      return prefix + rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase()
    }
    return trimmed
      .split(/\s+/)
      .map(word => capitalizeToken(word))
      .join(' ')
  }

  const suggestedPax = (eventType: string) => {
    const t = eventType.toLowerCase()
    if (t.includes('wedding') || t.includes('reception') || t.includes('engagement')) return 250
    if (t.includes('(bride)') || t.includes('(groom)')) return 60
    return 120
  }

  const toTimeOnly = (value?: string | null) => {
    if (!value) return ''
    const raw = String(value)
    if (raw.includes('T')) {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
      }
    }
    return raw.slice(0, 5)
  }

  const normalizeLakhInput = (value: string) => {
    const raw = value.replace(/,/g, '').trim()
    if (!raw) return ''
    if (!/^\d+(\.\d+)?$/.test(raw)) return raw
    if (!raw.includes('.')) return raw
    const [wholePart, fracPartRaw] = raw.split('.')
    if (!wholePart) return raw
    const fracPart = (fracPartRaw || '').replace(/\D/g, '')
    if (!fracPart) return raw
    if (fracPart.length === 1) {
      const amount = Number(wholePart) * 100000 + Number(fracPart) * 10000 + 1000
      return String(amount)
    }
    const amount = Number(wholePart) * 100000 + Number(fracPart.slice(0, 2)) * 1000
    return String(amount)
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

  const timeDraftKey = (rowKey: string, field: 'start_time' | 'end_time') => `${rowKey}:${field}`

  const suggestTimesForSlot = (slot: string) => {
    if (slot === 'Morning') return { start: '10:00', end: '14:00' }
    if (slot === 'Day') return { start: '12:00', end: '17:00' }
    if (slot === 'Evening') return { start: '18:00', end: '00:00' }
    return null
  }

  const toYesNo = (value: boolean) => (value ? 'Yes' : 'No')

  const withError = (base: string, hasError: boolean) => (hasError ? `${base} field-error` : base)

  const scrollToFirstError = () => {
    if (typeof document === 'undefined') return
    const target = document.querySelector('.field-error') as HTMLElement | null
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const normalizeInstagramInput = (value: string) => {
    const trimmed = value.trim().toLowerCase()
    const noProtocol = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')
    const noDomain = noProtocol.replace(/^instagram\.com\/?/i, '')
    const noAt = noDomain.replace(/^@/, '')
    const firstSegment = noAt.split(/[/?#]/)[0]
    return firstSegment.trim()
  }

  const isValidInstagramUsername = (value: string) => /^[a-z0-9._]{1,30}$/.test(value)

  const isInternational = selectedCities.some(c => (c.country || '').toLowerCase() !== 'india')
  const shouldSuggestImportant = isInternational || !!detailsForm?.is_destination

  useEffect(() => {
    if (shouldSuggestImportant && !importantTouched && !detailsForm.important) {
      setDetailsForm((prev: any) => ({ ...prev, important: true }))
    }
  }, [shouldSuggestImportant, importantTouched, detailsForm.important])

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

  const canonicalizeInstagramValue = (value?: string | null) => {
    if (!value) return null
    const username = normalizeInstagramInput(String(value))
    if (!username || !isValidInstagramUsername(username)) return null
    return `https://instagram.com/${username.toLowerCase()}`
  }

  const isValidPhone = (value?: string | null) => {
    if (!value) return false
    const parsed = parsePhoneNumberFromString(value, 'IN')
    return Boolean(parsed && parsed.isValid())
  }

  const getDuplicateCount = (fieldKey: string, rawValue?: string | null) => {
    if (!contactDuplicateData || !rawValue) return 0
    if (fieldKey.includes('phone')) {
      const parsed = parsePhoneNumberFromString(rawValue, 'IN')
      const normalized = parsed?.isValid() ? parsed.format('E.164') : null
      if (!normalized) return 0
      const group = contactDuplicateData.phones.find(g => g.value === normalized)
      return group ? group.matches.length : 0
    }
    if (fieldKey.includes('email')) {
      const { valid, normalized } = validateEmail(String(rawValue))
      if (!valid || !normalized) return 0
      const group = contactDuplicateData.emails.find(g => g.value === normalized)
      return group ? group.matches.length : 0
    }
    if (fieldKey.includes('instagram')) {
      const normalized = canonicalizeInstagramValue(rawValue)
      if (!normalized) return 0
      const group = contactDuplicateData.instagrams.find(g => g.value === normalized)
      return group ? group.matches.length : 0
    }
    return 0
  }

  const duplicateBadgeClass = (count: number) =>
    count > 1
      ? 'text-xs text-red-700 hover:underline underline-offset-2'
      : 'text-xs text-amber-700 hover:underline underline-offset-2'


  const formatDateDisplay = (value?: string | null) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
  }

  const getCityId = (c: any) => c?.city_id ?? c?.id ?? c?.cityId ?? null
  const toCityId = (value: any) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  const getDefaultCityId = () => {
    const primary =
      toCityId(getCityId(selectedCities.find((c: any) => c.is_primary))) ?? null
    if (primary) return primary
    return toCityId(getCityId(selectedCities[0]))
  }

  const createEmptyEventRow = () => ({
    __tempId: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    event_date: '',
    slot: '',
    start_time: '',
    end_time: '',
    event_type: '',
    pax: '',
    venue: '',
    description: '',
    city_id: null,
    date_status: 'confirmed',
  })

  const isEventRowEmpty = (row: any) =>
    !row?.event_date &&
    !row?.slot &&
    !row?.start_time &&
    !row?.end_time &&
    !row?.event_type &&
    !row?.pax &&
    !row?.venue &&
    !row?.description &&
    !row?.city_id

  const normalizeEventRows = (rows: any[]) => {
    if (!rows.length) return [createEmptyEventRow()]
    let foundEmpty = false
    const next = rows.filter(row => {
      const isEmpty = isEventRowEmpty(row)
      if (!isEmpty) return true
      if (foundEmpty) return false
      foundEmpty = true
      return true
    })
    if (!foundEmpty) next.push(createEmptyEventRow())
    return next
  }

  const getEventRowKey = (row: any) => (row?.id ? `event-${row.id}` : row.__tempId)

  const clearEventRowError = (rowKey: string, field: string) => {
    setEventsDraftErrors(prev => {
      const current = prev[rowKey]
      if (!current || !current[field]) return prev
      const nextRow = { ...current }
      delete nextRow[field]
      const next = { ...prev }
      if (Object.keys(nextRow).length) next[rowKey] = nextRow
      else delete next[rowKey]
      return next
    })
  }

  const updateEventRow = (index: number, patch: any, field?: string, rowKey?: string) => {
    if (patch.event_date) {
      const parts = String(patch.event_date).split('-').map(Number)
      if (parts.length === 3 && parts[0] && parts[1]) {
        setLastEventCalendar({ y: parts[0], m: parts[1] })
      }
    }
    setEventsDraft(prev => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      return normalizeEventRows(next)
    })
    if (field && rowKey) clearEventRowError(rowKey, field)
  }

  const removeEventRow = (index: number, row: any) => {
    setEventsDraftErrors(prev => {
      const next = { ...prev }
      delete next[getEventRowKey(row)]
      return next
    })
    setEventsDraft(prev => normalizeEventRows(prev.filter((_, i) => i !== index)))
  }

  useEffect(() => {
    if (lastEventCalendar) return
    const lastWithDate = [...eventsDraft].reverse().find(row => row?.event_date)
    if (lastWithDate?.event_date) {
      const parts = String(lastWithDate.event_date).split('-').map(Number)
      if (parts.length === 3 && parts[0] && parts[1]) {
        setLastEventCalendar({ y: parts[0], m: parts[1] })
      }
    }
  }, [eventsDraft, lastEventCalendar])

  const normalizeCityLabel = (value: string) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return ''
    return trimmed
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const addCity = async (city: any) => {
    if (!id) return
    const existingCities = selectedCities.map((c: any) => ({
      name: normalizeCityLabel(c?.name),
      state: normalizeCityLabel(c?.state),
      country: normalizeCityLabel(c?.country || 'India'),
      is_primary: !!c?.is_primary,
    }))
    const hasPrimary = existingCities.some(c => c.is_primary)
    const payload = {
      name: normalizeCityLabel(city?.name),
      state: normalizeCityLabel(city?.state),
      country: normalizeCityLabel(city?.country || 'India'),
      is_primary:
        !hasPrimary && ((city?.country || '').toLowerCase() !== 'india' || existingCities.length === 0),
    }
    if (!payload.name || !payload.state) {
      setEventNotice('City and state are required')
      return
    }
    let nextCities = [...existingCities, payload]
    if (payload.is_primary) {
      nextCities = nextCities.map(c => (c === payload ? c : { ...c, is_primary: false }))
    }
    let primaryCount = nextCities.filter(c => c.is_primary).length
    if (primaryCount === 0 && nextCities.length > 0) {
      nextCities[0] = { ...nextCities[0], is_primary: true }
      primaryCount = 1
    }
    if (primaryCount > 1) {
      let seen = false
      nextCities = nextCities.map(c => {
        if (c.is_primary) {
          if (seen) return { ...c, is_primary: false }
          seen = true
        }
        return c
      })
    }
    const res = await apiFetch(`/api/leads/${id}/cities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cities: nextCities }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setEventNotice(data?.error || 'Failed to save cities')
      return
    }
    const [enrichmentRes, citiesRes] = await Promise.all([
      apiFetch(`/api/leads/${id}/enrichment`),
      apiFetch('/api/cities'),
    ])
    const enrichmentData = await enrichmentRes.json().catch(() => ({}))
    const citiesData = await citiesRes.json().catch(() => [])
    if (enrichmentRes.ok) {
      setEnrichment(enrichmentData)
      setSelectedCities(Array.isArray(enrichmentData.cities) ? enrichmentData.cities : [])
    }
    if (citiesRes.ok) {
      setAllCities(Array.isArray(citiesData) ? citiesData : [])
    }
    setPendingCity(null)
    setCityQuery('')
  }

  const removeCity = (idToRemove: number) => {
    setSelectedCities(prev => prev.filter(c => (c.id || c.city_id) !== idToRemove))
  }

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setLoading(true)
        const leadRes = await apiFetch(`/api/leads/${id}`)
        const leadData = await leadRes.json()
        if (!leadRes.ok) {
          setLead(null)
          return
        }
        if (leadData?.intake_completed) {
          const params = new URLSearchParams()
          params.set('tab', 'dashboard')
          const from = searchParams.get('from')
          if (from) params.set('from', from)
          router.replace(`/leads/${id}?${params.toString()}`)
          return
        }
        setLead(leadData)
        setContactForm({
          name: leadData.name || '',
          primary_phone: leadData.primary_phone || '',
          phone_secondary: leadData.phone_secondary || '',
          email: leadData.email || '',
          instagram: (leadData.instagram || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^instagram\.com\/?/i, '').replace(/^@/, ''),
          source: leadData.source || 'Unknown',
          source_name: leadData.source_name || '',
          bride_name: leadData.bride_name || '',
          bride_phone_primary: leadData.bride_phone_primary || '',
          bride_phone_secondary: leadData.bride_phone_secondary || '',
          bride_email: leadData.bride_email || '',
          bride_instagram: (leadData.bride_instagram || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^instagram\.com\/?/i, '').replace(/^@/, ''),
          groom_name: leadData.groom_name || '',
          groom_phone_primary: leadData.groom_phone_primary || '',
          groom_phone_secondary: leadData.groom_phone_secondary || '',
          groom_email: leadData.groom_email || '',
          groom_instagram: (leadData.groom_instagram || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^instagram\.com\/?/i, '').replace(/^@/, ''),
        })

        const enrichmentRes = await apiFetch(`/api/leads/${id}/enrichment`)
        const enrichmentData = await enrichmentRes.json()
        if (enrichmentRes.ok) {
          setEnrichment(enrichmentData)
          setSelectedCities(Array.isArray(enrichmentData.cities) ? enrichmentData.cities : [])
          setDetailsForm({
            event_type: enrichmentData.event_type || 'Wedding',
            is_destination: !!enrichmentData.is_destination,
            client_budget_amount: enrichmentData.client_budget_amount ?? '',
            amount_quoted: enrichmentData.amount_quoted ?? '',
            coverage_scope: enrichmentData.coverage_scope || 'Both Sides',
            potential: enrichmentData.potential === true || enrichmentData.potential === 'Yes',
            important: enrichmentData.important === true || enrichmentData.important === 'Yes',
          })
          const existingEvents = (enrichmentData.events || []).map((e: any) => ({
            ...e,
            __tempId: `event-${e.id}`,
            event_date: e.event_date ? String(e.event_date).slice(0, 10) : '',
            slot: e.slot || '',
            start_time: toTimeOnly(e.start_time),
            end_time: toTimeOnly(e.end_time),
            event_type: e.event_type || '',
            pax: e.pax ?? '',
            venue: e.venue || '',
            description: e.description || '',
            city_id: e.city_id ?? null,
          }))
          setEventsDraft(normalizeEventRows(existingEvents))
        }

        const notesRes = await apiFetch(`/api/leads/${id}/notes`)
        const notesData = await notesRes.json().catch(() => [])
        setNotes(Array.isArray(notesData) ? notesData : [])

        const citiesRes = await apiFetch('/api/cities')
        const citiesData = await citiesRes.json().catch(() => [])
        setAllCities(Array.isArray(citiesData) ? citiesData : [])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id, router, searchParams])

  useEffect(() => {
    const defaultCityId = getDefaultCityId()
    if (!defaultCityId) return
    const changedKeys: string[] = []
    const next = eventsDraft.map((row: any, idx: number) => {
      if (row?.city_id) return row
      if (isEventRowEmpty(row)) return row
      const rowKey = getEventRowKey(row)
      changedKeys.push(rowKey)
      return { ...row, city_id: defaultCityId }
    })
    if (!changedKeys.length) return
    setEventsDraft(normalizeEventRows(next))
    setEventsDraftErrors(prev => {
      const nextErrors = { ...prev }
      changedKeys.forEach(key => {
        if (!nextErrors[key]?.city_id) return
        const rowErrors = { ...nextErrors[key] }
        delete rowErrors.city_id
        if (Object.keys(rowErrors).length) nextErrors[key] = rowErrors
        else delete nextErrors[key]
      })
      return nextErrors
    })
  }, [eventsDraft, selectedCities])

  const saveEvents = async () => {
    setEventNotice(null)
    const activeRows = eventsDraft.filter(row => row?.id || !isEventRowEmpty(row))
    const nextErrors: Record<string, Record<string, string>> = {}
    const validCityIds = new Set(
      selectedCities
        .map(c => toCityId(getCityId(c)))
        .filter((idValue): idValue is number => typeof idValue === 'number')
    )
    const defaultCityId = getDefaultCityId()
    const fallbackCityId =
      validCityIds.size === 1 ? Array.from(validCityIds.values())[0] : null
    activeRows.forEach(row => {
      const rowErrors: Record<string, string> = {}
      if (!row.event_date && row.date_status !== 'tba') rowErrors.event_date = 'Required'
      if (!row.slot) rowErrors.slot = 'Required'
      if (!row.event_type) rowErrors.event_type = 'Required'
      if (row.event_type && String(row.event_type).trim().length > 50) {
        rowErrors.event_type = 'Max 50 characters'
      }
      if (!row.pax) rowErrors.pax = 'Required'
      if (row.venue && String(row.venue).trim().length > 150) {
        rowErrors.venue = 'Max 150 characters'
      }
      const rowCityId = toCityId(row.city_id) ?? fallbackCityId
      if (rowCityId && !validCityIds.has(rowCityId)) {
        rowErrors.city_id = 'Update city'
      }
      const resolvedCityId = rowCityId ?? defaultCityId ?? null
      if (!resolvedCityId) rowErrors.city_id = 'Required'
      if (Object.keys(rowErrors).length) {
        nextErrors[getEventRowKey(row)] = rowErrors
      }
    })
    if (Object.keys(nextErrors).length) {
      setEventsDraftErrors(nextErrors)
      setEventNotice('Please fix highlighted fields for active rows.')
      requestAnimationFrame(scrollToFirstError)
      return false
    }

    for (const row of activeRows) {
      const rowCityId = toCityId(row.city_id) ?? fallbackCityId
      const resolvedCityId = rowCityId ?? defaultCityId ?? null
      const payload = {
        event_date: row.event_date,
        slot: row.slot,
        start_time: row.start_time || null,
        end_time: row.end_time || null,
        event_type: formatEventName(row.event_type || ''),
        pax: row.pax,
        venue: row.venue || '',
        venue_id: row.venue_id || null,
        venue_metadata: row.venue_metadata || null,
        description: row.description || '',
        city_id: resolvedCityId,
        date_status: row.date_status || 'confirmed',
      }

      if (row.id) {
        const res = await apiFetch(`/api/leads/${id}/events/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setEventNotice(err?.error || 'Failed to save event')
          return false
        }
      } else if (!isEventRowEmpty(row)) {
        const res = await apiFetch(`/api/leads/${id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setEventNotice(err?.error || 'Failed to add event')
          return false
        }
      }
    }

    return true
  }

  const markIntakeCompleted = async () => {
    await apiFetch(`/api/leads/${id}/intake`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
  }

  const handleSave = async () => {
    setSaveError('')
    setContactErrors({})
    setContactWarnings({})
    setSaving(true)
    try {
      const emailFields = ['email', 'bride_email', 'groom_email'] as const
      const normalizedEmails: Record<string, string> = {}
      const nextWarnings: Record<string, string> = {}
      const nextErrors: Record<string, string> = {}
      const needsSourceName = ['Reference', 'Direct Call', 'WhatsApp'].includes(contactForm.source)

      if (needsSourceName && !contactForm.source_name?.trim()) {
        nextErrors.source_name = 'Name is required for this source'
      }
      if (!contactForm.name?.trim()) {
        nextErrors.name = 'Name is required'
      }
      if (!isValidPhone(contactForm.primary_phone)) {
        nextErrors.primary_phone = 'Valid phone number required'
      }
      emailFields.forEach(field => {
        const value = contactForm?.[field]
        if (value) {
          const { valid, normalized, warning } = validateEmail(value)
          if (!valid) {
            nextErrors[field] = 'Please enter a valid email address'
          } else {
            normalizedEmails[field] = normalized
            if (warning) nextWarnings[field] = warning
          }
        }
      })

      const instagramFields = ['instagram', 'bride_instagram', 'groom_instagram'] as const
      instagramFields.forEach(field => {
        const value = contactForm?.[field]
        if (value && !isValidInstagramUsername(value)) {
          nextErrors[field] = 'Enter a valid Instagram username'
        }
      })

      if (Object.keys(nextErrors).length) {
        setContactErrors(nextErrors)
        setContactWarnings(nextWarnings)
        setContactShake(true)
        setTimeout(() => setContactShake(false), 300)
        requestAnimationFrame(scrollToFirstError)
        return
      }
      setContactWarnings(nextWarnings)

      const contactPayload = {
        ...contactForm,
        name: formatName(contactForm.name || ''),
        primary_phone: contactForm.primary_phone,
        phone_secondary: contactForm.phone_secondary || null,
        email: normalizedEmails.email || contactForm.email || null,
        instagram: normalizeInstagramInput(contactForm.instagram || ''),
        source: contactForm.source,
        source_name: contactForm.source_name || null,
        bride_name: formatName(contactForm.bride_name || ''),
        bride_phone_primary: contactForm.bride_phone_primary || null,
        bride_phone_secondary: contactForm.bride_phone_secondary || null,
        bride_email: normalizedEmails.bride_email || contactForm.bride_email || null,
        bride_instagram: normalizeInstagramInput(contactForm.bride_instagram || ''),
        groom_name: formatName(contactForm.groom_name || ''),
        groom_phone_primary: contactForm.groom_phone_primary || null,
        groom_phone_secondary: contactForm.groom_phone_secondary || null,
        groom_email: normalizedEmails.groom_email || contactForm.groom_email || null,
        groom_instagram: normalizeInstagramInput(contactForm.groom_instagram || ''),
      }

      const performSave = async () => {
        const contactRes = await apiFetch(`/api/leads/${id}/contact`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactPayload),
        })
        if (!contactRes.ok) {
          const err = await contactRes.json().catch(() => ({}))
          if (err?.field) {
            setContactErrors({ [err.field]: err.error || 'Please enter a valid email address' })
            setContactShake(true)
            setTimeout(() => setContactShake(false), 300)
            requestAnimationFrame(scrollToFirstError)
          } else {
            setSaveError(err?.error || 'Failed to save contact details')
          }
          return
        }

        const enrichmentRes = await apiFetch(`/api/leads/${id}/enrichment`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: detailsForm.event_type,
            is_destination: isInternational ? true : detailsForm.is_destination,
            client_budget_amount: detailsForm.client_budget_amount,
            amount_quoted: detailsForm.amount_quoted,
            coverage_scope: detailsForm.coverage_scope,
            potential: toYesNo(!!detailsForm.potential),
            important: toYesNo(!!detailsForm.important),
          }),
        })
        if (!enrichmentRes.ok) {
          const err = await enrichmentRes.json().catch(() => ({}))
          setSaveError(err?.error || 'Failed to save lead details')
          return
        }

        if (selectedCities.length > 0 && selectedCities.filter(c => c.is_primary).length === 1) {
          const citiesRes = await apiFetch(`/api/leads/${id}/cities`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cities: selectedCities.map(c => ({
                name: c.name,
                state: c.state,
                country: c.country,
                is_primary: c.is_primary,
              })),
            }),
          })
          if (!citiesRes.ok) {
            const err = await citiesRes.json().catch(() => ({}))
            setSaveError(err?.error || 'Failed to save cities')
            return
          }
        }

        const validCityIds = new Set(
          selectedCities
            .map(c => toCityId(getCityId(c)))
            .filter((idValue): idValue is number => typeof idValue === 'number')
        )
        const invalidCityRows = eventsDraft.filter(row => {
          const hasEventData =
            !!row?.id ||
            !!row?.event_date ||
            !!row?.slot ||
            !!row?.event_type ||
            !!row?.pax ||
            !!row?.venue ||
            !!row?.description ||
            !!row?.start_time ||
            !!row?.end_time
          if (!hasEventData) return false
          const cityId = toCityId(row?.city_id)
          return cityId != null && !validCityIds.has(cityId)
        })
        if (invalidCityRows.length) {
          const nextErrors: Record<string, Record<string, string>> = {}
          invalidCityRows.forEach(row => {
            nextErrors[getEventRowKey(row)] = { city_id: 'Update city' }
          })
          setEventsDraftErrors(nextErrors)
          setEventNotice('Cities updated. Please update event cities to match the current city list.')
          setTimeout(() => {
            const el = document.getElementById('events-section')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 100)
          return
        }

        if (eventsDraft.some(row => row?.id || !isEventRowEmpty(row))) {
          const ok = await saveEvents()
          if (!ok) return
        }

        if (noteText.trim().length > 1000) {
          setSaveError('Note must be 1000 characters or fewer')
          return
        }

        if (noteText.trim()) {
          await apiFetch(`/api/leads/${id}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note_text: noteText.trim() }),
          })
        }

        await markIntakeCompleted()

        const params = new URLSearchParams()
        params.set('tab', 'dashboard')
        const from = searchParams.get('from')
        if (from) params.set('from', from)
        router.replace(`/leads/${id}?${params.toString()}`)
      }

      const duplicates = await checkContactDuplicates({
        leadId: Number(id),
        phones: [
          contactPayload.primary_phone,
          contactPayload.phone_secondary,
          contactPayload.bride_phone_primary,
          contactPayload.bride_phone_secondary,
          contactPayload.groom_phone_primary,
          contactPayload.groom_phone_secondary,
        ].filter(Boolean) as string[],
        emails: [
          normalizedEmails.email,
          normalizedEmails.bride_email,
          normalizedEmails.groom_email,
        ].filter(Boolean) as string[],
        instagrams: [
          contactPayload.instagram,
          contactPayload.bride_instagram,
          contactPayload.groom_instagram,
        ].filter(Boolean) as string[],
      })

      if (hasDuplicates(duplicates)) {
        setSaving(false)
        setContactDuplicateData(duplicates)
        setPendingIntakeSave(() => async () => {
          setSaving(true)
          await performSave()
          setSaving(false)
        })
        setShowContactDuplicate(true)
        return
      }

      setContactDuplicateData(null)
      await performSave()
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/leads/${id}/intake`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      })
      const params = new URLSearchParams()
      params.set('tab', 'dashboard')
      const from = searchParams.get('from')
      if (from) params.set('from', from)
      router.replace(`/leads/${id}?${params.toString()}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-neutral-500">Loading intake…</div>
  }

  if (!lead) {
    return <div className="p-6 text-sm text-red-600">Lead not found.</div>
  }

  const forceIntake = searchParams.get('force_intake') === '1'

  const renderContactCard = (title: string, fields: Record<string, string>) => {
    const isRequiredField = (key: string) => title === 'Lead' && (key === 'name' || key === 'primary_phone')

    const formatLabel = (label: string) =>
      label
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

    const placeholderFor = (key: string) => {
      if (key === 'name') return 'Full Name'
      if (key === 'primary_phone') return 'Primary Number'
      if (key === 'phone_secondary') return 'Secondary Number'
      if (key === 'bride_phone_primary') return "Bride's Primary Number"
      if (key === 'bride_phone_secondary') return "Bride's Secondary Number"
      if (key === 'groom_phone_primary') return "Groom's Primary Number"
      if (key === 'groom_phone_secondary') return "Groom's Secondary Number"

      if (key === 'email') return 'Email id'
      if (key === 'bride_email') return "Bride's Email id"
      if (key === 'groom_email') return "Groom's Email id"

      if (key === 'instagram') return '@username'
      if (key === 'bride_instagram') return "@bride's_username"
      if (key === 'groom_instagram') return "@groom's_username"

      return formatLabel(key)
    }

    const secondaryPhoneKeyFor = (key: string) => {
      if (key === 'primary_phone') return 'phone_secondary'
      if (key.endsWith('phone_primary')) return key.replace('phone_primary', 'phone_secondary')
      return null
    }

    const focusInstagramInput = (fieldKey: string) => {
      const input = instagramInputRefs.current[fieldKey]
      if (!input) return
      input.focus()
      const len = input.value.length
      try {
        input.setSelectionRange(len, len)
      } catch {
        // ignore selection errors on unsupported inputs
      }
    }

    return (
      <div className={`${softCardClass} p-4 space-y-3`}>
        <div className="font-medium">{title}</div>

        {Object.entries(fields).map(([label, key]) => {
          const value = contactForm?.[key]
          const fieldError = contactErrors?.[key]
          const warning = contactWarnings?.[key]
          const isInstagram = key.includes('instagram')
          const isPhone = key.includes('phone')
          const isEmail = key.includes('email')
          const isSource = key === 'source'
          const isSourceName = key === 'source_name'
          const liveEmailInvalid =
            isEmail && typeof value === 'string' && value.trim().length > 0
              ? !validateEmail(value).valid
              : false

          if (isSourceName) return null
          if (isSource) {
            return (
              <div key={label} className="space-y-1">
                <div className="text-xs text-neutral-500">
                  Source{isRequiredField('source') ? ' *' : ''}
                </div>
                <select
                  className={withError(inputClass, !!contactErrors.source)}
                  value={contactForm.source || ''}
                  onChange={e => {
                    setContactForm({ ...contactForm, source: e.target.value })
                    if (contactErrors.source) {
                      setContactErrors((prev: any) => {
                        const next = { ...prev }
                        delete next.source
                        return next
                      })
                    }
                  }}
                >
                  <option value="" disabled className="text-neutral-400">Source</option>
                  {SOURCE_OPTIONS.map(src => (
                    <option key={src}>{src}</option>
                  ))}
                </select>
                {contactErrors.source && <div className={errorTextClass}>{contactErrors.source}</div>}

                {['Reference', 'Direct Call', 'WhatsApp'].includes(contactForm.source) && (
                  <div className="space-y-1">
                    <input
                      className={`${withError(inputClass, !!contactErrors.source_name)} placeholder:text-neutral-400`}
                      placeholder="Source Name"
                      value={contactForm.source_name || ''}
                      autoComplete="off"
                      onChange={e => {
                        setContactForm({ ...contactForm, source_name: e.target.value })
                        if (contactErrors.source_name) {
                          setContactErrors((prev: any) => {
                            const next = { ...prev }
                            delete next.source_name
                            return next
                          })
                        }
                      }}
                    />
                    {contactErrors.source_name && <div className={errorTextClass}>{contactErrors.source_name}</div>}
                  </div>
                )}
              </div>
            )
          }

          if (isPhone && key.includes('phone_secondary')) {
            return null
          }

          if (isPhone && (key === 'primary_phone' || key.endsWith('phone_primary'))) {
            const secondaryKey = secondaryPhoneKeyFor(key)
            const secondaryValue = secondaryKey ? contactForm?.[secondaryKey] : ''
            const secondaryError = secondaryKey ? contactErrors?.[secondaryKey] : null
            const primaryDupCount = getDuplicateCount(key, value)
            const secondaryDupCount = secondaryKey ? getDuplicateCount(secondaryKey, secondaryValue) : 0

            return (
              <div key={label} className="space-y-1">
                <div className="text-xs text-neutral-500">
                  Phone Number{isRequiredField(key) ? ' *' : ''}
                </div>
                <PhoneField
                  value={value || ''}
                  onChange={(v: string | null) => {
                    setContactForm({ ...contactForm, [key]: v })
                    if (contactErrors[key]) {
                      setContactErrors((prev: any) => {
                        const next = { ...prev }
                        delete next[key]
                        return next
                      })
                    }
                  }}
                  placeholder={placeholderFor(key)}
                  className={`${fieldError ? 'field-error' : ''} ${fieldError && contactShake ? 'shake' : ''}`}
                />
                {secondaryKey && (
                  <PhoneField
                    value={secondaryValue || ''}
                    onChange={(v: string | null) => {
                      setContactForm({ ...contactForm, [secondaryKey]: v })
                      if (secondaryError) {
                        setContactErrors((prev: any) => {
                          const next = { ...prev }
                          delete next[secondaryKey]
                          return next
                        })
                      }
                    }}
                    placeholder={placeholderFor(secondaryKey)}
                    className={`${secondaryError ? 'field-error' : ''} ${secondaryError && contactShake ? 'shake' : ''}`}
                  />
                )}
                {fieldError && <div className={errorTextClass}>{fieldError}</div>}
                {secondaryError && <div className={errorTextClass}>{secondaryError}</div>}
                {primaryDupCount > 0 && (
                  <button
                    type="button"
                    className={duplicateBadgeClass(primaryDupCount)}
                    onClick={() => setShowContactDuplicate(true)}
                  >
                    Already exists in {primaryDupCount} lead(s)
                  </button>
                )}
                {secondaryDupCount > 0 && (
                  <button
                    type="button"
                    className={duplicateBadgeClass(secondaryDupCount)}
                    onClick={() => setShowContactDuplicate(true)}
                  >
                    Already exists in {secondaryDupCount} lead(s)
                  </button>
                )}
              </div>
            )
          }

          return (
            <div key={label} className="space-y-1">
              <div className="text-xs text-neutral-500">
                {formatLabel(label)}{isRequiredField(key) ? ' *' : ''}
              </div>
              {isInstagram ? (
                <div className="flex items-center rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
                  <span
                    className="text-neutral-400 cursor-text"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => focusInstagramInput(key)}
                  >
                    instagram.com/
                  </span>
                  <input
                    className="ml-1 flex-1 outline-none bg-transparent placeholder:text-neutral-400"
                    placeholder={placeholderFor(key)}
                    value={value || ''}
                    ref={el => {
                      instagramInputRefs.current[key] = el
                    }}
                    autoComplete="off"
                    onChange={e => {
                      const username = normalizeInstagramInput(e.target.value)
                      setContactForm({ ...contactForm, [key]: username })
                    }}
                    onBlur={e => {
                      const username = normalizeInstagramInput(e.target.value)
                      if (username && !isValidInstagramUsername(username)) {
                        setContactErrors({ ...contactErrors, [key]: 'Enter a valid Instagram username' })
                        setContactShake(true)
                        setTimeout(() => setContactShake(false), 300)
                      } else if (contactErrors[key]) {
                        setContactErrors((prev: any) => {
                          const next = { ...prev }
                          delete next[key]
                          return next
                        })
                      }
                    }}
                  />
                </div>
              ) : (
                <input
                  className={`${withError(inputClass, !!fieldError)} ${fieldError && contactShake ? 'shake' : ''} placeholder:text-neutral-400`}
                  placeholder={placeholderFor(key)}
                  value={value || ''}
                  autoComplete={isEmail ? 'new-password' : 'off'}
                  onChange={e => {
                    setContactForm({ ...contactForm, [key]: e.target.value })
                    if (fieldError) {
                      setContactErrors((prev: any) => {
                        const next = { ...prev }
                        delete next[key]
                        return next
                      })
                    }
                  }}
                />
              )}
              {fieldError && <div className={errorTextClass}>{fieldError}</div>}
              {!fieldError && liveEmailInvalid && (
                <div className="text-xs text-red-600">Please enter a valid email address</div>
              )}
              {!fieldError && getDuplicateCount(key, value) > 0 && (
                <button
                  type="button"
                  className={duplicateBadgeClass(getDuplicateCount(key, value))}
                  onClick={() => setShowContactDuplicate(true)}
                >
                  Already exists in {getDuplicateCount(key, value)} lead(s)
                </button>
              )}
              {!fieldError && isEmail && warning && (
                <div className="text-xs text-amber-600">{warning}</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Lead Intake</div>
          <h2 className="text-2xl font-semibold mt-2">{lead.name || 'New Lead'}</h2>
          <p className="text-sm text-neutral-500">
            {forceIntake ? 'Please complete the lead intake form.' : 'Fill key details now or skip if you’re in a rush.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!forceIntake && (
            <button className={buttonOutline} onClick={handleSkip} disabled={saving}>
              Skip for Now
            </button>
          )}
        </div>
      </div>

      {saveError && <div className={errorTextClass}>{saveError}</div>}

      <div className={`${cardClass} p-6 space-y-5`}>
        <h3 className="text-lg font-semibold">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          {renderContactCard('Lead', {
            name: 'name',
            primary_phone: 'primary_phone',
            phone_secondary: 'phone_secondary',
            email: 'email',
            instagram: 'instagram',
            source: 'source',
            source_name: 'source_name',
          })}

          {renderContactCard('Bride', {
            name: 'bride_name',
            phone_primary: 'bride_phone_primary',
            phone_secondary: 'bride_phone_secondary',
            email: 'bride_email',
            instagram: 'bride_instagram',
          })}

          {renderContactCard('Groom', {
            name: 'groom_name',
            phone_primary: 'groom_phone_primary',
            phone_secondary: 'groom_phone_secondary',
            email: 'groom_email',
            instagram: 'groom_instagram',
          })}
        </div>
      </div>

      <div id="events-section" className={`${cardClass} p-4 space-y-4`}>
        <h3 className="text-lg font-semibold">Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Event Type *</div>
            <select
              className={inputClass}
              value={detailsForm.event_type}
              onChange={e => setDetailsForm((prev: any) => ({ ...prev, event_type: e.target.value }))}
            >
              <option>Wedding</option>
              <option>Wedding & Pre Wedding</option>
              <option>Pre-Wedding</option>
              <option>Anniversary</option>
              <option>Birthday Party</option>
              <option>Corporate</option>
              <option>Product</option>
              <option>Event</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Coverage Scope</div>
            <div className="inline-flex rounded-full border border-[var(--border)] bg-white p-1 text-xs font-medium">
              {COVERAGE_SCOPES.map(scope => (
                <button
                  key={scope}
                  type="button"
                  className={`px-3 py-1 rounded-full transition ${(detailsForm.coverage_scope || 'Both Sides') === scope
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-700 hover:bg-[var(--surface-muted)]'
                    }`}
                  onClick={() => setDetailsForm((prev: any) => ({ ...prev, coverage_scope: scope }))}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Wedding Type</div>
            <select
              className={inputClass}
              disabled={isInternational}
              value={isInternational ? 'Destination' : detailsForm.is_destination ? 'Destination' : 'Local'}
              onChange={e =>
                setDetailsForm((prev: any) => ({ ...prev, is_destination: e.target.value === 'Destination' }))
              }
            >
              <option>Local</option>
              <option>Destination</option>
            </select>
            {isInternational && (
              <div className="text-xs text-neutral-500 mt-1">
                International weddings are always treated as Destination
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">
              {selectedCities.length <= 1 ? 'City *' : 'Cities *'}
            </div>
            <div className="space-y-2">
              {selectedCities.map((c, idx) => (
                <div
                  key={`city-${c.id ?? c.city_id ?? c.name ?? c.city_name ?? 'unknown'}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm"
                >
                  <input
                    type="radio"
                    name="primary-city"
                    autoComplete="off"
                    checked={c.is_primary}
                    onChange={() =>
                      setSelectedCities((prev: any) =>
                        prev.map((p: any) => ({
                          ...p,
                          is_primary: (p.id || p.city_id) === (c.id || c.city_id),
                        }))
                      )
                    }
                  />
                  <div className="flex-1">
                    {c.name}, {c.state}
                    {c.country && c.country !== 'India' ? `, ${c.country}` : ''}
                  </div>
                  {!c.is_primary && (
                    <button
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                      onClick={() => removeCity(c.id || c.city_id)}
                    >
                      Remove
                    </button>
                  )}
                  {c.is_primary && <span className="text-xs text-neutral-500">Primary</span>}
                </div>
              ))}
              <div className="relative">
                <input
                  className={inputClass}
                  placeholder="Type City Name…"
                  value={cityQuery}
                  name="city-search"
                  autoComplete="new-password"
                  onChange={e => {
                    setCityQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                />
                {showSuggestions && cityQuery.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-40 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                    {allCities
                      .filter(c => {
                        const q = cityQuery.toLowerCase()
                        const name = (c.name || '').toLowerCase()
                        const state = (c.state || '').toLowerCase()
                        const country = (c.country || '').toLowerCase()
                        const alreadySelected = selectedCities.some(s => (s.id || s.city_id) === c.id)
                        return !alreadySelected && (name.includes(q) || state.includes(q) || country.includes(q))
                      })
                      .slice(0, 8)
                      .map(c => (
                        <div
                          key={c.id}
                          className="px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer"
                          onClick={async () => {
                            await addCity({ ...c, city_id: c.id })
                            setCityQuery('')
                            setShowSuggestions(false)
                          }}
                        >
                          {c.name}, {c.state}
                          {c.country && c.country !== 'India' ? `, ${c.country}` : ''}
                        </div>
                      ))}
                    <div
                      className="px-3 py-2 text-sm text-blue-600 hover:bg-neutral-100 cursor-pointer"
                      onClick={() => {
                        setPendingCity({
                          name: cityQuery,
                          state: '',
                          country: 'India',
                        })
                        setCityQuery('')
                        setShowSuggestions(false)
                      }}
                    >
                      + Add “{cityQuery}”
                    </div>
                  </div>
                )}

                {pendingCity && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2 text-sm">
                    <div className="font-medium">Add new city</div>
                    <input
                      className={inputClass}
                      placeholder="City *"
                      name="pending-city"
                      autoComplete="new-password"
                      value={pendingCity.name}
                      onChange={e => setPendingCity({ ...pendingCity, name: e.target.value })}
                    />
                    {pendingCity.country === 'India' ? (
                      <select
                        className={inputClass}
                        value={pendingCity.state}
                        autoComplete="new-password"
                        onChange={e => setPendingCity({ ...pendingCity, state: e.target.value })}
                      >
                        <option value="">State *</option>
                        {INDIA_STATES_UT.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        placeholder="State *"
                        name="pending-state"
                        autoComplete="new-password"
                        value={pendingCity.state}
                        onChange={e => setPendingCity({ ...pendingCity, state: e.target.value })}
                      />
                    )}
                    <input
                      className={inputClass}
                      placeholder="Country"
                      name="pending-country"
                      autoComplete="new-password"
                      value={pendingCity.country}
                      onChange={e => setPendingCity({ ...pendingCity, country: e.target.value, state: '' })}
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        className={buttonOutline}
                        onClick={() => setPendingCity(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className={buttonPrimary}
                        onClick={async () => {
                          if (!pendingCity.name.trim() || !pendingCity.state.trim()) return
                          await addCity(pendingCity)
                          setPendingCity(null)
                        }}
                      >
                        Add City
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Amount Quoted</div>
            <CurrencyInput
              className={inputClass}
              placeholder="e.g. 1,25,000"
              value={detailsForm.amount_quoted ?? ''}
              onWheel={(e: React.WheelEvent<HTMLInputElement>) => (e.currentTarget as HTMLInputElement).blur()}
              onChange={(val: string) => setDetailsForm((prev: any) => ({ ...prev, amount_quoted: val }))}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                const raw = e.target.value.replace(/,/g, '')
                const normalized = normalizeLakhInput(raw)
                setDetailsForm((prev: any) => ({ ...prev, amount_quoted: normalized }))
              }}
            />
            {detailsForm.amount_quoted && (
              <div className="mt-1 text-xs text-neutral-500">{formatINR(detailsForm.amount_quoted)}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Client Budget</div>
            <CurrencyInput
              className={inputClass}
              placeholder="e.g. 5,00,000"
              value={detailsForm.client_budget_amount ?? ''}
              onWheel={(e: React.WheelEvent<HTMLInputElement>) => (e.currentTarget as HTMLInputElement).blur()}
              onChange={(val: string) =>
                setDetailsForm((prev: any) => ({ ...prev, client_budget_amount: val }))
              }
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                const raw = e.target.value.replace(/,/g, '')
                const normalized = normalizeLakhInput(raw)
                setDetailsForm((prev: any) => ({ ...prev, client_budget_amount: normalized }))
              }}
            />
            {detailsForm.client_budget_amount && (
              <div className="mt-1 text-xs text-neutral-500">{formatINR(detailsForm.client_budget_amount)}</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Potential</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`inline-flex h-6 w-11 items-center rounded-full ${detailsForm.potential ? 'bg-emerald-600' : 'bg-neutral-300'
                  }`}
                onClick={() => setDetailsForm((prev: any) => ({ ...prev, potential: !prev.potential }))}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ${detailsForm.potential ? 'translate-x-5' : 'translate-x-1'
                    }`}
                />
              </button>
              <span className="text-xs text-neutral-500">Couple seems inclined towards us</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Important</div>
            <div className="flex items-start gap-3">
              <button
                type="button"
                className={`inline-flex h-6 w-11 items-center rounded-full ${detailsForm.important ? 'bg-emerald-600' : 'bg-neutral-300'
                  }`}
                onClick={() => {
                  setImportantTouched(true)
                  setDetailsForm((prev: any) => ({ ...prev, important: !prev.important }))
                }}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ${detailsForm.important ? 'translate-x-5' : 'translate-x-1'
                    }`}
                />
              </button>
              <div className="space-y-1">
                <div className="text-xs text-neutral-500">Wedding seems cool</div>
                {shouldSuggestImportant && (
                  <div className="text-xs text-amber-600">Suggested for destination / international lead</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} p-4 space-y-4`}>
        <h3 className="text-lg font-semibold">Events</h3>
        {eventNotice && <div className={errorTextClass}>{eventNotice}</div>}
        {eventDeleteError && <div className={errorTextClass}>{eventDeleteError}</div>}
        <div className="space-y-2">
          {eventsDraft.map((row: any, index: number) => {
            const rowKey = getEventRowKey(row)
            const rowErrors = eventsDraftErrors[rowKey] || {}
            const showSuggestions = eventTypeSuggestRow === rowKey && (row.event_type || '').length > 0
            const startKey = timeDraftKey(rowKey, 'start_time')
            const endKey = timeDraftKey(rowKey, 'end_time')
            const startValue = Object.prototype.hasOwnProperty.call(timeDrafts, startKey)
              ? timeDrafts[startKey]
              : row.start_time
                ? formatTimeDisplay(row.start_time)
                : ''
            const endValue = Object.prototype.hasOwnProperty.call(timeDrafts, endKey)
              ? timeDrafts[endKey]
              : row.end_time
                ? formatTimeDisplay(row.end_time)
                : ''
            const isEmptyRow = isEventRowEmpty(row)
            const validCityIds = new Set(
              selectedCities
                .map(c => toCityId(getCityId(c)))
                .filter((idValue): idValue is number => typeof idValue === 'number')
            )
            const cityValue = (() => {
              const rowCityId = toCityId(row.city_id)
              if (rowCityId && validCityIds.has(rowCityId)) return rowCityId
              if (rowCityId) return ''
              const defaultCityId = getDefaultCityId()
              return defaultCityId ?? ''
            })()

            const rowCardClass = isEmptyRow
              ? 'rounded-2xl border border-neutral-100 bg-white/60'
              : 'rounded-2xl border border-neutral-900 bg-white/60'
            return (
              <div key={rowKey} className={`${rowCardClass} p-3`}>
                <div className="mb-2 flex justify-end">
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                    disabled={isEmptyRow}
                    onClick={() => setPendingEventDelete(rowKey)}
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm items-end">
                  <div className="space-y-1 md:col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-neutral-500">{row.date_status === 'tba' ? 'Date' : 'Date *'}</div>
                      <div className="flex rounded-md overflow-hidden border border-neutral-200 ml-auto">
                        {(['confirmed', 'tentative', 'tba'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateEventRow(index, { date_status: s, ...(s === 'tba' ? { event_date: '' } : {}) }, 'date_status', rowKey)}
                            className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                              (row.date_status || 'confirmed') === s
                                ? s === 'confirmed' ? 'bg-emerald-500 text-white' : s === 'tentative' ? 'bg-amber-400 text-neutral-900' : 'bg-neutral-500 text-white'
                                : 'bg-white text-neutral-400 hover:text-neutral-600'
                            }`}
                          >
                            {s === 'tba' ? 'TBA' : s === 'tentative' ? 'Tent.' : '✓'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {row.date_status === 'tba' ? (
                      <div className="h-10 flex items-center px-3 bg-neutral-50 rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400 italic">To Be Decided</div>
                    ) : (
                      <CalendarInput
                        className={`${inputClass} h-10`}
                        value={row.event_date || ''}
                        preferredYear={lastEventCalendar?.y}
                        preferredMonth={lastEventCalendar?.m}
                        onChange={v => updateEventRow(index, { event_date: v }, 'event_date', rowKey)}
                      />
                    )}
                    {rowErrors.event_date && <div className={errorTextClass}>{rowErrors.event_date}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-neutral-500">Slot *</div>
                    <select
                      className={inputClass}
                      style={{ color: row.slot ? '#374151' : '#d4d4d4' }}
                      value={row.slot || ''}
                      onChange={e => {
                        const nextSlot = e.target.value
                        const suggestion = suggestTimesForSlot(nextSlot)
                        const patch: any = { slot: nextSlot }
                        if (suggestion) {
                          patch.start_time = suggestion.start
                          patch.end_time = suggestion.end
                          setTimeDrafts(prev => {
                            const next = { ...prev }
                            delete next[timeDraftKey(rowKey, 'start_time')]
                            delete next[timeDraftKey(rowKey, 'end_time')]
                            return next
                          })
                        }
                        updateEventRow(index, patch, 'slot', rowKey)
                      }}
                    >
                      <option value="" disabled className="text-neutral-300">Morning / Day / Evening</option>
                      <option>Morning</option>
                      <option>Day</option>
                      <option>Evening</option>
                    </select>
                    {rowErrors.slot && <div className={errorTextClass}>{rowErrors.slot}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-neutral-500">Event Name *</div>
                    <div className="relative">
                      <input
                        className={`${inputClass} h-10 ${!row.event_type ? 'text-neutral-300' : 'text-neutral-700'}`}
                        placeholder="Event Name"
                        value={row.event_type || ''}
                        maxLength={50}
                        autoComplete="off"
                        onFocus={() => setEventTypeSuggestRow(rowKey)}
                        onChange={e => {
                          updateEventRow(index, { event_type: e.target.value }, 'event_type', rowKey)
                          setEventTypeSuggestRow(rowKey)
                        }}
                        onBlur={e => {
                          const formatted = formatEventName(String(e.target.value || ''))
                          if (formatted && formatted !== row.event_type) {
                            updateEventRow(index, { event_type: formatted }, 'event_type', rowKey)
                          }
                          setEventTypeSuggestRow(null)
                        }}
                      />
                      {showSuggestions && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                          {Array.from(new Set(EVENT_TYPES))
                            .filter(t => t.toLowerCase().includes(String(row.event_type || '').toLowerCase()))
                            .map((t, tIdx) => (
                              <div
                                key={`${t}-${tIdx}`}
                                className="px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  updateEventRow(
                                    index,
                                    { event_type: t, pax: row.pax ? row.pax : suggestedPax(t) },
                                    'event_type',
                                    rowKey
                                  )
                                  setEventTypeSuggestRow(null)
                                }}
                              >
                                {t}
                              </div>
                            ))}
                          <div
                            className="px-3 py-2 text-sm text-blue-600 hover:bg-neutral-100 cursor-pointer"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              const formatted = formatEventName(String(row.event_type || ''))
                              updateEventRow(
                                index,
                                { event_type: formatted, pax: row.pax ? row.pax : suggestedPax(formatted) },
                                'event_type',
                                rowKey
                              )
                              setEventTypeSuggestRow(null)
                            }}
                          >
                            + Add “{row.event_type}”
                          </div>
                        </div>
                      )}
                    </div>
                    {rowErrors.event_type && <div className={errorTextClass}>{rowErrors.event_type}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-1">
                    <div className="text-xs text-neutral-500">Pax *</div>
                    <input
                      type="number"
                      step={20}
                      className={inputClass}
                      placeholder="Pax"
                      value={row.pax}
                      autoComplete="off"
                      onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                      onChange={e => updateEventRow(index, { pax: e.target.value }, 'pax', rowKey)}
                    />
                    {rowErrors.pax && <div className={errorTextClass}>{rowErrors.pax}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-neutral-500">Venue</div>
                    <VenueAutocomplete
                      value={row.venue || ''}
                      placeholder="Venue"
                      locationHint={(() => {
                        const cityMatch = selectedCities.find(c => (c.city_id || c.id) === toCityId(row.city_id))
                        return cityMatch ? `${cityMatch.name}, ${cityMatch.state}` : ''
                      })()}
                      className={`h-10 ${withError(inputClass, !!rowErrors.venue)}`}
                      onChange={val => updateEventRow(index, { venue: val }, 'venue', rowKey)}
                      onSelect={(venue, meta) => updateEventRow(index, { venue, venue_id: meta?.venue_id, venue_metadata: meta }, 'venue', rowKey)}
                    />
                    {row.venue_metadata && (
                      <div className="px-1 text-[10px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                        {(() => {
                          const meta = typeof row.venue_metadata === 'string' ? JSON.parse(row.venue_metadata) : row.venue_metadata
                          if (!meta) return null
                          const PRIORITY = ['banquet_hall', 'wedding_venue', 'event_venue', 'resort', 'hotel', 'spa', 'lodging']
                          const rawTypes = meta.types || []
                          const foundPriority = PRIORITY.find(p => rawTypes.includes(p))
                          const displayTypes = foundPriority ? [foundPriority] : rawTypes.filter((t: string) => !['point_of_interest', 'establishment', 'food', 'bar'].includes(t))
                          const primaryType = displayTypes[0] ? displayTypes[0].replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : null
                          const hotelClass = meta.hotel_class ? `${meta.hotel_class}-Star` : null
                          return (
                            <>
                              {hotelClass && <span className="text-amber-500 font-bold whitespace-nowrap">{hotelClass}</span>}
                              {primaryType && <span className="whitespace-nowrap">{primaryType}</span>}
                              {(hotelClass || primaryType) && meta.address && <span>•</span>}
                              {meta.address && <span className="truncate max-w-[150px]">{meta.address}</span>}
                            </>
                          )
                        })()}
                      </div>
                    )}
                    {rowErrors.venue && <div className={errorTextClass}>{rowErrors.venue}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <div className="text-xs text-neutral-500">City *</div>
                    <select
                      className={`${inputClass} ${!cityValue ? 'text-neutral-400' : ''}`}
                      value={cityValue}
                      onChange={e => updateEventRow(index, { city_id: Number(e.target.value) }, 'city_id', rowKey)}
                    >
                      {!cityValue && (
                        <option value="" disabled className="text-neutral-300">Select City</option>
                      )}
                      {selectedCities.map((c, idx) => (
                        <option key={getCityId(c) ?? `city-${idx}`} value={getCityId(c) ?? ''}>
                          {c.name}, {c.state}
                          {c.is_primary ? ' (Primary)' : ''}
                        </option>
                      ))}
                    </select>
                    {rowErrors.city_id && <div className={errorTextClass}>{rowErrors.city_id}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-neutral-500">Start Time</div>
                    <input
                      className={`${withError(inputClass, !!rowErrors.start_time)} h-10 ${!row.start_time ? 'text-neutral-400' : ''}`}
                      placeholder="Start Time"
                      value={startValue}
                      onChange={e =>
                        setTimeDrafts(prev => ({
                          ...prev,
                          [startKey]: e.target.value,
                        }))
                      }
                      onKeyDown={e => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          const next = addMinutes(row.start_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                          updateEventRow(index, { start_time: next }, 'start_time', rowKey)
                          setTimeDrafts(prev => {
                            const nextDrafts = { ...prev }
                            delete nextDrafts[startKey]
                            return nextDrafts
                          })
                        }
                      }}
                      onBlur={e => {
                        const parsed = parseTimeInput(e.target.value)
                        if (parsed !== null) {
                          updateEventRow(index, { start_time: parsed }, 'start_time', rowKey)
                        }
                        setTimeDrafts(prev => {
                          const nextDrafts = { ...prev }
                          delete nextDrafts[startKey]
                          return nextDrafts
                        })
                      }}
                    />
                    {rowErrors.start_time && <div className={errorTextClass}>{rowErrors.start_time}</div>}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-neutral-500">End Time</div>
                    <input
                      className={`${withError(inputClass, !!rowErrors.end_time)} h-10 ${!row.end_time ? 'text-neutral-400' : ''}`}
                      placeholder="End Time"
                      value={endValue}
                      onChange={e =>
                        setTimeDrafts(prev => ({
                          ...prev,
                          [endKey]: e.target.value,
                        }))
                      }
                      onKeyDown={e => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          const next = addMinutes(row.end_time || '00:00', e.key === 'ArrowUp' ? 30 : -30)
                          updateEventRow(index, { end_time: next }, 'end_time', rowKey)
                          setTimeDrafts(prev => {
                            const nextDrafts = { ...prev }
                            delete nextDrafts[endKey]
                            return nextDrafts
                          })
                        }
                      }}
                      onBlur={e => {
                        const parsed = parseTimeInput(e.target.value)
                        if (parsed !== null) {
                          updateEventRow(index, { end_time: parsed }, 'end_time', rowKey)
                        }
                        setTimeDrafts(prev => {
                          const nextDrafts = { ...prev }
                          delete nextDrafts[endKey]
                          return nextDrafts
                        })
                      }}
                    />
                    {rowErrors.end_time && <div className={errorTextClass}>{rowErrors.end_time}</div>}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-neutral-500">Description</div>
                  <textarea
                    className={inputClass}
                    placeholder="Event Description / Notes"
                    autoComplete="off"
                    value={row.description || ''}
                    onChange={e => updateEventRow(index, { description: e.target.value })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={`${cardClass} p-4 space-y-4`}>
        <h3 className="text-lg font-semibold">Notes</h3>
        <textarea
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          rows={3}
          placeholder="Add a Note…"
          autoComplete="off"
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          maxLength={1000}
        />
        {notes.length > 0 && (
          <div className="space-y-2 text-sm">
            {notes.map(note => (
              <div key={note.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                <div className="text-neutral-700 whitespace-pre-line">{sanitizeText(note.note_text)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button className={buttonPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>

      <DuplicateContactModal
        open={showContactDuplicate}
        duplicates={contactDuplicateData}
        onContinue={() => {
          const action = pendingIntakeSave
          setShowContactDuplicate(false)
          setPendingIntakeSave(null)
          if (action) action()
        }}
        onOpenLeads={(leadIds) => {
          if (typeof window !== 'undefined') {
            leadIds.forEach(idValue => {
              window.open(`/leads/${idValue}`, '_blank', 'noopener,noreferrer')
            })
          }
        }}
      />

      {pendingEventDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Delete event?</div>
            <div className="mt-2 text-sm text-neutral-700">
              Are you sure you want to delete this event?
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setPendingEventDelete(null)}>
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                onClick={async () => {
                  const index = eventsDraft.findIndex(r => getEventRowKey(r) === pendingEventDelete)
                  const row = index >= 0 ? eventsDraft[index] : null
                  if (!row) {
                    setPendingEventDelete(null)
                    return
                  }
                  if (row?.id) {
                    const res = await apiFetch(`/api/leads/${id}/events/${row.id}`, {
                      method: 'DELETE',
                    })
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      setEventDeleteError(err?.error || 'Unable to delete this event. Please try again.')
                      setPendingEventDelete(null)
                      return
                    }
                  }
                  removeEventRow(index, row)
                  setPendingEventDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
