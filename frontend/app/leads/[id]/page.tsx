"use client"

import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneField from '@/components/PhoneField'
import PhoneActions from '@/components/PhoneActions'
import FollowUpActionPopup from '@/components/FollowUpActionPopup'
import { formatDate, formatDateTime, formatINR } from '@/lib/formatters'
import { buildConversionSummary, type ConversionSummary } from '@/lib/conversionSummary'
import { sanitizeText } from '@/lib/sanitize'
import { getRouteStateKey, markScrollRestore, readRouteState, shouldRestoreScroll, writeRouteState } from '@/lib/routeState'
import { getAuth } from '@/lib/authClient'
import DateField from '@/components/DateField'
import { getAutoNegotiationPromptText, mapAutoNegotiationReasonToFocus } from '@/lib/autoNegotiation'
import DuplicateContactModal, { type DuplicateResults } from '@/components/DuplicateContactModal'
import { checkContactDuplicates, hasDuplicates } from '@/lib/contactDuplicates'
import SwipeConfirmModal from '@/components/SwipeConfirmModal'

export default function SalesLeadPage() {
  const { id } = useParams() as { id: string }
  const searchParams = useSearchParams()
  const router = useRouter()
  const routeKey = typeof window !== 'undefined' ? getRouteStateKey(window.location.pathname) : ''

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
    'Wedding & Pre Wedding',
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

  const SLOT_ORDER: Record<string, number> = { Morning: 1, Day: 2, Evening: 3 }
  const HEAT_VALUES = ['Cold', 'Warm', 'Hot']
  const STATUSES = [
    'New',
    'Contacted',
    'Quoted',
    'Follow Up',
    'Negotiation',
    'Awaiting Advance',
    'Converted',
    'Lost',
    'Rejected',
  ]
  const REJECT_REASONS = [
    'Low budget',
    'Not our type of work',
    'Dates not available',
    'Client not responsive',
    'Other',
  ]
  const COVERAGE_SCOPES = ['Both Sides', 'Bride Side', 'Groom Side']
  const SOURCE_OPTIONS = ['Instagram', 'Direct Call', 'WhatsApp', 'Reference', 'Website', 'Unknown']
  const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const totalMinutes = i * 30
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    return `${hh}:${mm}`
  })

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })

  /* ===================== CORE STATE ===================== */
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [backHref, setBackHref] = useState('/leads')
  const [leadMetrics, setLeadMetrics] = useState<any | null>(null)
  const [leadMetricsLoading, setLeadMetricsLoading] = useState(false)

  const [notes, setNotes] = useState<any[]>([])
  const [noteText, setNoteText] = useState('')
  const [notesError, setNotesError] = useState<string | null>(null)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isEditingFollowup, setIsEditingFollowup] = useState(false)
  const [followupDraft, setFollowupDraft] = useState('')
  const [isSavingFollowup, setIsSavingFollowup] = useState(false)
  const [followupError, setFollowupError] = useState<string | null>(null)
  const [followupPrompt, setFollowupPrompt] = useState<string | null>(null)
  const followupInputRef = useRef<HTMLInputElement | null>(null)
  const [showFollowupDone, setShowFollowupDone] = useState(false)
  const [followupOutcome, setFollowupOutcome] = useState('')
  const [followupMode, setFollowupMode] = useState('')
  const [followupTopics, setFollowupTopics] = useState<string[]>([])
  const [followupNote, setFollowupNote] = useState('')
  const [followupNotConnectedReason, setFollowupNotConnectedReason] = useState('')
  const [followupNextDate, setFollowupNextDate] = useState('')
  const [followupDoneError, setFollowupDoneError] = useState<string | null>(null)
  const [isSavingFollowupDone, setIsSavingFollowupDone] = useState(false)
  const [followupPopupOpen, setFollowupPopupOpen] = useState(false)
  const [followupPopupDefaultDone, setFollowupPopupDefaultDone] = useState(false)
  const usageLogIdRef = useRef<number | null>(null)
  const usageEndedRef = useRef(false)

  const [activities, setActivities] = useState<any[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(true)

  type ProposalTeamCounts = {
    candid: string
    cinema: string
    traditional_photo: string
    traditional_video: string
    aerial: string
  }

  type ProposalDeliverable = {
    id: string
    label: string
    checked: boolean
    detail?: string
    detailLabel?: string
    detail2?: string
    detail2Label?: string
  }

  type LeadEventRow = {
    id?: number
    __tempId?: string
    event_date?: string | null
    slot?: string | null
    start_time?: string | null
    end_time?: string | null
    event_type?: string | null
    pax?: string | number | null
    venue?: string | null
    description?: string | null
    city_id?: number | null
    city_name?: string | null
    city?: string | null
    city_state?: string | null
  }

  type ProposalEvent = LeadEventRow & {
    dateKey: string
    name: string
    slot: string
    venue: string
    pax: string | number
  }

  type ProposalGroup = {
    dateKey: string
    events: ProposalEvent[]
  }

  type FollowupSuccessMeta = {
    outcome?: string
    status?: string
    discussedPricing?: boolean
  }

  type FollowupUpdatedLead = {
    id?: number | string
    status?: string
    next_followup_date?: string | null
    auto_contacted?: boolean
    intake_completed?: boolean
    auto_negotiation?: { attempted?: boolean; success?: boolean; reason?: string }
    last_followup_outcome?: string | null
    last_not_connected_at?: string | null
    not_contacted_count?: number | null
    [key: string]: unknown
  }

  const defaultDeliverables: ProposalDeliverable[] = [
    {
      id: 'raw-photos',
      label: 'All Raw Photos (Delivered via Facial Recognition App)',
      checked: true,
    },
    {
      id: 'edited',
      label: 'Edited Photos (Delivered via AI Facial Recognition App)',
      checked: true,
      detail: '200–300',
      detailLabel: 'Range',
    },
    { id: 'reels', label: 'Instagram Reels', checked: true, detail: '3', detailLabel: 'Count' },
    { id: 'trailer', label: 'Cinematic Trailer', checked: true, detail: '3–4 min', detailLabel: 'Duration' },
    { id: 'film', label: 'Full Wedding Film', checked: true, detail: '30–40 min', detailLabel: 'Duration' },
    {
      id: 'books',
      label: 'Coffee Table Books',
      checked: true,
      detail: '2',
      detailLabel: 'Qty',
      detail2: '35',
      detail2Label: 'Leaves',
    },
    { id: 'raw-videos', label: 'All Raw Videos', checked: true },
  ]

  const [proposalDeliverables, setProposalDeliverables] = useState<ProposalDeliverable[]>(
    () => defaultDeliverables
  )
  const [proposalTeamByDate, setProposalTeamByDate] = useState<Record<string, ProposalTeamCounts>>(
    {}
  )
  const [proposalPricing, setProposalPricing] = useState<{
    amount_quoted: string
    discounted_amount: string
  }>({ amount_quoted: '', discounted_amount: '' })
  const [proposalEditMode, setProposalEditMode] = useState(false)
  const [proposalEditSnapshot, setProposalEditSnapshot] = useState<{
    teamByDate: Record<string, ProposalTeamCounts>
    deliverables: ProposalDeliverable[]
    pricing: { amount_quoted: string; discounted_amount: string }
  } | null>(null)
  const [quoteHistory, setQuoteHistory] = useState<any[]>([])
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [proposalNotice, setProposalNotice] = useState<string | null>(null)
  const [proposalSaving, setProposalSaving] = useState(false)
  const [proposalPreviewText, setProposalPreviewText] = useState<string | null>(null)
  const [proposalDraftLoaded, setProposalDraftLoaded] = useState(false)
  const proposalDraftSaveRef = useRef<number | null>(null)

  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const instagramInputRefs = useRef<Record<string, HTMLInputElement | null>>({})


  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('Low budget')
  const [rejectOther, setRejectOther] = useState('')
  const [statusConfirm, setStatusConfirm] = useState<{ nextStatus: string } | null>(null)
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false)
  const [awaitingAdvancePromptOpen, setAwaitingAdvancePromptOpen] = useState(false)
  const [convertSummary, setConvertSummary] = useState<ConversionSummary | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertLeadSnapshot, setConvertLeadSnapshot] = useState<any | null>(null)
  const [convertSaving, setConvertSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [statusChangeOrigin, setStatusChangeOrigin] = useState<'lead' | 'kanban' | null>(null)
  const [statusChangedInfo, setStatusChangedInfo] = useState<{ message: string; origin: 'lead' | 'kanban' } | null>(null)
  const [nextFixDialog, setNextFixDialog] = useState<{ message: string; focus: string; desiredStatus: string; origin: 'lead' | 'kanban' } | null>(null)
  const [pendingFollowupSuggestion, setPendingFollowupSuggestion] = useState(false)

  const isConverted = lead?.status === 'Converted'

  /* ===================== TABS ===================== */
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'contact' | 'notes' | 'activity' | 'enrichment' | 'negotiation' | 'proposal'
  >('dashboard')
  const [tabInitialized, setTabInitialized] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !id) return
    const tabParam = searchParams.get('tab')
    const restoreAllowed = shouldRestoreScroll()
    const storedState = restoreAllowed && routeKey ? readRouteState(routeKey) : null
    const storedTab = storedState?.activeTab
    if (
      tabParam === 'dashboard' ||
      tabParam === 'contact' ||
      tabParam === 'notes' ||
      tabParam === 'activity' ||
      tabParam === 'enrichment' ||
      tabParam === 'negotiation' ||
      tabParam === 'proposal'
    ) {
      setActiveTab(
        tabParam as
          | 'dashboard'
          | 'contact'
          | 'notes'
          | 'activity'
          | 'enrichment'
          | 'negotiation'
          | 'proposal'
      )
      setTabInitialized(true)
      return
    }
    if (
      storedTab === 'dashboard' ||
      storedTab === 'contact' ||
      storedTab === 'notes' ||
      storedTab === 'activity' ||
      storedTab === 'enrichment' ||
      storedTab === 'negotiation' ||
      storedTab === 'proposal'
    ) {
      setActiveTab(
        storedTab as
          | 'dashboard'
          | 'contact'
          | 'notes'
          | 'activity'
          | 'enrichment'
          | 'negotiation'
          | 'proposal'
      )
      setTabInitialized(true)
      return
    }
    if (restoreAllowed) {
      const key = `lead_tab:${id}`
      const saved = sessionStorage.getItem(key)
      if (
        saved === 'dashboard' ||
        saved === 'contact' ||
        saved === 'notes' ||
        saved === 'activity' ||
        saved === 'enrichment' ||
        saved === 'negotiation' ||
        saved === 'proposal'
      ) {
        setActiveTab(
          saved as
            | 'dashboard'
            | 'contact'
            | 'notes'
            | 'activity'
            | 'enrichment'
            | 'negotiation'
            | 'proposal'
        )
        setTabInitialized(true)
        return
      }
    }
    setActiveTab('dashboard')
    setTabInitialized(true)
  }, [id, searchParams?.toString(), routeKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !id) return
    const key = `lead_tab:${id}`
    sessionStorage.setItem(key, activeTab)
    if (routeKey) {
      writeRouteState(routeKey, { activeTab })
    }
  }, [id, activeTab, routeKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !id) return
    if (!tabInitialized) return
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (params.get('tab') === activeTab) return
    params.set('tab', activeTab)
    window.history.replaceState(null, '', `/leads/${id}?${params.toString()}`)
  }, [id, activeTab, searchParams?.toString(), tabInitialized])

  type EditSection = 'contact' | 'details' | 'events' | 'negotiation' | null
  const [activeEditSection, setActiveEditSection] = useState<EditSection>(null)

  const contactEditMode = activeEditSection === 'contact'
  const editMode = activeEditSection === 'details'
  const eventsEditMode = activeEditSection === 'events'
  const pricingEditMode = activeEditSection === 'negotiation'

  /* ===================== CONTACT ===================== */
  const [contactForm, setContactForm] = useState<any>({})
  const [contactSnapshot, setContactSnapshot] = useState<any>(null)
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({})
  const [contactWarnings, setContactWarnings] = useState<Record<string, string>>({})
  const [contactNotice, setContactNotice] = useState<string | null>(null)
  const [contactShake, setContactShake] = useState(false)
  const [contactDuplicateData, setContactDuplicateData] = useState<DuplicateResults | null>(null)
  const [showContactDuplicate, setShowContactDuplicate] = useState(false)
  const [pendingContactSave, setPendingContactSave] = useState<(() => void) | null>(null)

  /* ===================== ENRICHMENT ===================== */
  const [enrichment, setEnrichment] = useState<any>(null)
  const [enrichmentErrors, setEnrichmentErrors] = useState<Record<string, string>>({})
  const [enrichmentNotice, setEnrichmentNotice] = useState<string | null>(null)
  const [enrichmentShake, setEnrichmentShake] = useState(false)
  const [formData, setFormData] = useState<any>({})
  const [selectedCities, setSelectedCities] = useState<any[]>([])
  const [cityQuery, setCityQuery] = useState('')
  const [allCities, setAllCities] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pendingCity, setPendingCity] = useState<any>(null)

  /* ===================== EVENTS ===================== */
  const [eventNotice, setEventNotice] = useState<string | null>(null)
  const [eventDeleteError, setEventDeleteError] = useState<string | null>(null)
  const [eventsDraft, setEventsDraft] = useState<LeadEventRow[]>([])
  const [eventsDraftErrors, setEventsDraftErrors] = useState<Record<string, Record<string, string>>>({})
  const [deletedEventIds, setDeletedEventIds] = useState<number[]>([])
  const [isSavingEvents, setIsSavingEvents] = useState(false)
  const [eventTypeSuggestRow, setEventTypeSuggestRow] = useState<string | null>(null)
  const [pendingEventDelete, setPendingEventDelete] = useState<string | null>(null)
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({})

  /* ===================== FOLLOW UPS ===================== */
  const [followups, setFollowups] = useState<any[]>([])
  const [followUpAt, setFollowUpAt] = useState('')
  const [followUpType, setFollowUpType] = useState('call')
  const [followUpNote, setFollowUpNote] = useState('')
  const [followupErrors, setFollowupErrors] = useState<Record<string, string>>({})
  const [followupNotice, setFollowupNotice] = useState<string | null>(null)
  const [autoNegotiationError, setAutoNegotiationError] = useState<{
    reason: string
    focus: string | null
  } | null>(null)
  const [autoNegotiationFixDialog, setAutoNegotiationFixDialog] = useState<{
    reason: string
    focus: string | null
  } | null>(null)
  const [autoContactedPrompt, setAutoContactedPrompt] = useState<{
    message: string
    forceIntake: boolean
  } | null>(null)
  const [negotiationStatusNotice, setNegotiationStatusNotice] = useState<string | null>(null)
  const [showNegotiationEditPrompt, setShowNegotiationEditPrompt] = useState(false)

  /* ===================== NEGOTIATION ===================== */
  const [negotiations, setNegotiations] = useState<any[]>([])
  const [negTopic, setNegTopic] = useState('')
  const [negNote, setNegNote] = useState('')
  const [negErrors, setNegErrors] = useState<Record<string, string>>({})
  const [negNotice, setNegNotice] = useState<string | null>(null)
  const [importantTouched, setImportantTouched] = useState(false)

  const [pricingForm, setPricingForm] = useState<any>({
    client_offer_amount: '',
    discounted_amount: '',
  })
  const [pricingLogs, setPricingLogs] = useState<any[]>([])
  const [pricingNotice, setPricingNotice] = useState<string | null>(null)
  const pricingDraftRef = useRef<any>({ client_offer_amount: '', discounted_amount: '' })
  const [pricingInputKey, setPricingInputKey] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !id || !enrichment) return
    const editParam = searchParams.get('edit')
    if (activeTab !== 'negotiation' || editParam !== 'pricing') return
    if (pricingEditMode || isConverted) return
    setPricingForm({
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    })
    pricingDraftRef.current = {
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    }
    setPricingNotice(null)
    activateEditSection('negotiation')
    setPricingInputKey(k => k + 1)
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('edit')
    router.replace(`/leads/${id}?${params.toString()}`, { scroll: false })
  }, [id, activeTab, searchParams?.toString(), enrichment, pricingEditMode, isConverted, router])

  /* ===================== HELPERS ===================== */
  const parseYesNo = (value: any) => String(value || '').toLowerCase() === 'yes'
  const toYesNo = (value: boolean) => (value ? 'Yes' : 'No')

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

  const scrollToFirstError = () => {
    if (typeof document === 'undefined') return
    const target = document.querySelector('.field-error') as HTMLElement | null
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const normalizeLeadSignals = (row: any) => ({
    ...row,
    potential: parseYesNo(row?.potential) ? true : row?.potential === true,
    important: parseYesNo(row?.important) ? true : row?.important === true,
  })

  const formatName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const formatEventType = (value: string) => {
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

  const suggestedPax = (eventType: string) => {
    const t = eventType.toLowerCase()
    if (t.includes('wedding') || t.includes('reception') || t.includes('engagement')) return 250
    if (t.includes('(bride)') || t.includes('(groom)')) return 60
    return 120
  }

  const createEmptyEventRow = (): LeadEventRow => ({
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
  })

  const isEventRowEmpty = (row?: LeadEventRow | null) => {
    return (
      !row?.event_date &&
      !row?.slot &&
      !row?.start_time &&
      !row?.end_time &&
      !row?.event_type &&
      !row?.pax &&
      !row?.venue &&
      !row?.description &&
      !row?.city_id
    )
  }

  const normalizeEventRows = (rows: LeadEventRow[]) => {
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

  const getEventRowKey = (row: LeadEventRow, index?: number) =>
    row?.id ? `event-${row.id}` : row.__tempId || `event-row-${index ?? 0}`

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

  const updateEventRow = (index: number, patch: Partial<LeadEventRow>, field?: string, rowKey?: string) => {
    setEventsDraft(prev => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      return normalizeEventRows(next)
    })
    if (field && rowKey) clearEventRowError(rowKey, field)
  }

  const removeEventRow = (index: number, row: LeadEventRow, opts?: { skipTrack?: boolean }) => {
    const rowId = row?.id
    if (rowId != null && !opts?.skipTrack) {
      setDeletedEventIds(prev => (prev.includes(rowId) ? prev : [...prev, rowId]))
    }
    setEventsDraftErrors(prev => {
      const next = { ...prev }
      const key = getEventRowKey(row)
      delete next[key]
      return next
    })
    setEventsDraft(prev => normalizeEventRows(prev.filter((_, i) => i !== index)))
  }

  const cancelContactEdit = (resetActive = true) => {
    setContactForm(contactSnapshot ?? contactForm)
    setContactErrors({})
    setContactWarnings({})
    setContactNotice(null)
    setContactShake(false)
    if (resetActive) setActiveEditSection(null)
  }

  const cancelDetailsEdit = (resetActive = true) => {
    setFormData({
      event_type: enrichment?.event_type,
      is_destination: enrichment?.is_destination,
      client_budget_amount: enrichment?.client_budget_amount,
      amount_quoted: enrichment?.amount_quoted,
      potential: enrichment?.potential ?? false,
      important: enrichment?.important ?? false,
      coverage_scope: enrichment?.coverage_scope ?? 'Both Sides',
      assigned_user_id: lead?.assigned_user_id ?? null,
    })
    setEnrichmentErrors({})
    setEnrichmentNotice(null)
    setEnrichmentShake(false)
    setImportantTouched(false)
    if (resetActive) setActiveEditSection(null)
  }

  const cancelNegotiationEdit = (resetActive = true) => {
    setPricingForm({
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    })
    pricingDraftRef.current = {
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    }
    setPricingNotice(null)
    if (resetActive) setActiveEditSection(null)
  }

  const cancelEventsEdit = (
    resetActiveOrEvent: boolean | MouseEvent<HTMLButtonElement> = true
  ) => {
    const resetActive = typeof resetActiveOrEvent === 'boolean' ? resetActiveOrEvent : true
    setEventsDraft([])
    setDeletedEventIds([])
    setEventsDraftErrors({})
    setEventNotice(null)
    setEventDeleteError(null)
    setEventTypeSuggestRow(null)
    if (resetActive) setActiveEditSection(null)
  }

  const activateEditSection = (section: EditSection) => {
    if (activeEditSection === section) return
    if (activeEditSection === 'contact') cancelContactEdit(false)
    if (activeEditSection === 'details') cancelDetailsEdit(false)
    if (activeEditSection === 'events') cancelEventsEdit(false)
    if (activeEditSection === 'negotiation') cancelNegotiationEdit(false)
    setActiveEditSection(section)
  }

  const startEventsEdit = () => {
    const existing = (enrichment?.events || []).map((e: any) => ({
      ...e,
      __tempId: `event-${e.id}`,
      event_date: toDateOnly(e.event_date),
      slot: e.slot || '',
      start_time: toTimeOnly(e.start_time),
      end_time: toTimeOnly(e.end_time),
      event_type: e.event_type || '',
      pax: e.pax ?? '',
      venue: e.venue || '',
      description: e.description || '',
      city_id: e.city_id ?? null,
    }))
    setEventsDraft(normalizeEventRows(existing))
    setDeletedEventIds([])
    setEventsDraftErrors({})
    setEventNotice(null)
    setEventDeleteError(null)
    setEventTypeSuggestRow(null)
    activateEditSection('events')
  }

  const saveEventsBulk = async () => {
    if (isConverted) return
    setEventNotice(null)
    setEventDeleteError(null)
    const primaryCityId =
      selectedCities.find(c => c.is_primary)?.id ??
      selectedCities.find(c => c.is_primary)?.city_id ??
      null
    const activeRows = eventsDraft.filter(row => row?.id || !isEventRowEmpty(row))
    const nextErrors: Record<string, Record<string, string>> = {}
    activeRows.forEach(row => {
      const rowErrors: Record<string, string> = {}
      if (!row.event_date) rowErrors.event_date = 'Required'
      if (!row.slot) rowErrors.slot = 'Required'
      if (!row.event_type) rowErrors.event_type = 'Required'
      if (row.event_type && String(row.event_type).trim().length > 50) {
        rowErrors.event_type = 'Max 50 characters'
      }
      if (!row.pax) rowErrors.pax = 'Required'
      if (row.venue && String(row.venue).trim().length > 150) {
        rowErrors.venue = 'Max 150 characters'
      }
      const resolvedCityId = row.city_id ?? primaryCityId
      if (!resolvedCityId) rowErrors.city_id = 'Required'
      if (Object.keys(rowErrors).length) {
        nextErrors[getEventRowKey(row)] = rowErrors
      }
    })
    if (Object.keys(nextErrors).length) {
      setEventsDraftErrors(nextErrors)
      setEventNotice('Please fix highlighted fields for active rows.')
      requestAnimationFrame(scrollToFirstError)
      return
    }

    setIsSavingEvents(true)
    try {
      for (const eventId of deletedEventIds) {
        const res = await apiFetch(`/api/leads/${id}/events/${eventId}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setEventDeleteError(err?.error || 'Unable to delete this event. Please try again.')
          setIsSavingEvents(false)
          return
        }
      }

      for (const row of activeRows) {
        const payload = {
          event_date: row.event_date,
          slot: row.slot,
          start_time: row.start_time || null,
          end_time: row.end_time || null,
          event_type: formatEventType(row.event_type || ''),
          pax: row.pax,
          venue: row.venue || '',
          description: row.description || '',
          city_id:
            row.city_id ??
            selectedCities.find(c => c.is_primary)?.id ??
            selectedCities.find(c => c.is_primary)?.city_id ??
            null,
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
            setIsSavingEvents(false)
            return
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
            setIsSavingEvents(false)
            return
          }
        }
      }

      const refreshedRaw = await apiFetch(`/api/leads/${id}/enrichment`).then(r => r.json())
      const refreshed = normalizeLeadSignals(refreshedRaw)
      setEnrichment(refreshed)
      setSelectedCities(Array.isArray(refreshedRaw.cities) ? refreshedRaw.cities : [])
      setPricingLogs(Array.isArray(refreshedRaw.pricing_logs) ? refreshedRaw.pricing_logs : [])
      if (!editMode) {
        setFormData({
          event_type: refreshed.event_type,
          is_destination: refreshed.is_destination,
          client_budget_amount: refreshed.client_budget_amount,
          amount_quoted: refreshed.amount_quoted,
          potential: parseYesNo(refreshed.potential),
          important: parseYesNo(refreshed.important),
          coverage_scope: refreshed.coverage_scope ?? 'Both Sides',
          assigned_user_id: lead?.assigned_user_id ?? null,
        })
      }
      await attemptPendingStatusChange(msg => setEventNotice(msg))
      cancelEventsEdit()
    } finally {
      setIsSavingEvents(false)
    }
  }

  function normalizePhone(value?: string | null) {
    if (!value) return null
    const parsed = parsePhoneNumberFromString(value, 'IN')
    if (!parsed || !parsed.isValid()) return null
    return parsed.format('E.164')
  }

  function isValidPhone(value?: string | null) {
    if (!value) return false
    const parsed = parsePhoneNumberFromString(value, 'IN')
    return Boolean(parsed && parsed.isValid())
  }

  const normalizeInstagramInput = (value: string) => {
    const trimmed = value.trim().toLowerCase()
    const noProtocol = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')
    const noDomain = noProtocol.replace(/^instagram\.com\/?/i, '')
    const noAt = noDomain.replace(/^@/, '')
    const firstSegment = noAt.split(/[/?#]/)[0]
    return firstSegment.trim()
  }

  const extractInstagramUsername = (value?: string | null) => {
    if (!value) return ''
    const v = value.trim().toLowerCase()
    if (v.includes('instagram.com/')) {
      return v.split('instagram.com/')[1]?.replace('/', '') || ''
    }
    return v.replace(/^@/, '')
  }

  const getPhoneActionInfo = (value?: string | null) => {
    if (!value) return { e164: '', digits: '' }
    const trimmed = String(value).trim()
    if (!trimmed) return { e164: '', digits: '' }
    const parsed = parsePhoneNumberFromString(trimmed)
    const e164 = parsed?.number || (trimmed.startsWith('+') ? trimmed : `+${trimmed}`)
    const digits = e164.replace(/\D/g, '')
    return { e164, digits }
  }

  const isValidInstagramUsername = (value: string) => /^[a-z0-9._]{1,30}$/.test(value)

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

  const getDuplicateCount = (fieldKey: string, rawValue?: string | null) => {
    if (!contactDuplicateData || !rawValue) return 0
    if (fieldKey.includes('phone')) {
      const normalized = normalizePhone(rawValue)
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

  const normalizeLeadSource = (source?: string | null, name?: string | null) => {
    if (!source) return 'Unknown'
    if (['Reference', 'Direct Call', 'WhatsApp'].includes(source) && name) {
      if (source === 'Reference') return `Reference of ${name}`
      if (source === 'Direct Call') return `Direct Call to ${name}`
      if (source === 'WhatsApp') return `WhatsApp to ${name}`
    }
    return source
  }

  const dateToYMD = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const toDateOnly = (value?: string | null) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return dateToYMD(parsed)
    }
    return value.split('T')[0].split(' ')[0]
  }

  const formatDateDisplay = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const getEventName = (event: any) => {
    const raw = event?.event_name ?? event?.event_type ?? event?.eventType ?? ''
    return String(raw || '').trim()
  }

  const getEventSlotRank = (slot?: string | null) => {
    const value = String(slot || '').toLowerCase()
    if (value.includes('morning')) return 0
    if (value.includes('day')) return 1
    if (value.includes('evening')) return 2
    if (value.includes('night')) return 3
    return 9
  }

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    const diffMs = Date.now() - parsed.getTime()
    if (diffMs < 60_000) return 'just now'
    const mins = Math.floor(diffMs / 60_000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    const years = Math.floor(days / 365)
    return `${years}y ago`
  }

  const MS_DAY = 24 * 60 * 60 * 1000
  const getAwaitingAdvanceDays = (value?: string | null) => {
    if (!value) return null
    const dateOnly = toDateOnly(value)
    if (!dateOnly) return null
    const start = new Date(`${dateOnly}T00:00:00`)
    if (Number.isNaN(start.getTime())) return null
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diff = Math.floor((todayStart.getTime() - start.getTime()) / MS_DAY)
    return diff < 0 ? 0 : diff
  }

  const awaitingDays =
    lead?.status === 'Awaiting Advance'
      ? (getAwaitingAdvanceDays(lead?.awaiting_advance_since) ?? 0)
      : null
  const lockHint = 'Locked in Converted stage'
  const LockHint = ({ enabled, message, children }: { enabled: boolean; message?: string; children: ReactNode }) =>
    enabled ? (
      <div className="group relative inline-flex items-center">
        {children}
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100">
          {message || lockHint}
        </span>
      </div>
    ) : (
      <>{children}</>
    )

  const awaitingAdvanceClass = (days: number) => {
    if (days >= 7) return 'bg-red-100 text-red-700'
    if (days >= 4) return 'bg-amber-100 text-amber-700'
    return 'bg-neutral-100 text-neutral-700'
  }

  const getNotePreview = (noteText?: string | null) => {
    if (!noteText) return ''
    const line = sanitizeText(noteText).split('\n')[0].trim()
    if (!line) return ''
    return line.length > 120 ? `${line.slice(0, 117)}...` : line
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

  const toMetricNumber = (value: any) => {
    if (value === null || value === undefined || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  const formatMetricDays = (value: any) => {
    const num = toMetricNumber(value)
    if (num === null) return '—'
    return `${num.toFixed(1)} days`
  }

  const formatMetricMinutes = (seconds: any) => {
    const num = toMetricNumber(seconds)
    if (num === null) return '—'
    const minutes = Math.round(num / 60)
    return `${minutes} min`
  }

  const getUserLabelById = (id: any) => {
    if (id === null || id === undefined) return 'Unassigned'
    const fromList = assignableUsers.find(u => u.id === id)
    if (fromList) return getUserDisplayName(fromList) || `User #${id}`
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

  const formatActivityDetails = (activity: any) => {
    const type = activity?.activity_type
    const meta = activity?.metadata || {}
    let title = 'Activity updated'
    let metaText = ''

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
      const fromValue =
        typeof meta?.from === 'number' ? formatINR(meta.from) : meta?.from ?? '—'
      const toValue =
        typeof meta?.to === 'number' ? formatINR(meta.to) : meta?.to ?? '—'
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
          metaText = `${field.replace(/_/g, ' ')}: ${from} → ${to}`
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
    }

    return { title, metaText }
  }

  const EventDateInput = ({
    value,
    onChange,
    className,
  }: {
    value: string
    onChange: (value: string) => void
    className: string
  }) => {
    const hiddenRef = useRef<HTMLInputElement | null>(null)
    const displayValue = value ? formatDateDisplay(value) : ''
    return (
      <div className="relative">
        <input
          type="text"
          readOnly
          className={`${className} cursor-pointer`}
          value={displayValue}
          placeholder="DD MMM YYYY"
          onClick={() => {
            const el = hiddenRef.current
            if (!el) return
            if (typeof (el as any).showPicker === 'function') {
              ;(el as any).showPicker()
            } else {
              el.focus()
              el.click()
            }
          }}
        />
        <input
          ref={hiddenRef}
          type="date"
          className="absolute inset-0 opacity-0 pointer-events-none"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  const firstName = (value?: string | null) => {
    if (!value) return ''
    return value.trim().split(/\s+/)[0] || ''
  }

  const buildHeaderName = () => {
    const leadName = (lead?.name || '').trim()
    const brideFirst = firstName(lead?.bride_name)
    const groomFirst = firstName(lead?.groom_name)
    let suffix = ''
    if (brideFirst && groomFirst) {
      suffix = `${brideFirst} ${groomFirst}`
    } else if (brideFirst) {
      suffix = `Bride ${brideFirst}`
    } else if (groomFirst) {
      suffix = `Groom ${groomFirst}`
    }
    return { leadName, suffix }
  }

  const openTabSection = (
    tab: 'dashboard' | 'contact' | 'notes' | 'activity' | 'enrichment' | 'negotiation' | 'proposal',
    targetId?: string
  ) => {
    setActiveTab(tab)
    if (typeof window === 'undefined') return
    const scrollTarget = targetId
    setTimeout(() => {
      if (scrollTarget) {
        const el = document.getElementById(scrollTarget)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 80)
  }

  const openNegotiationEdit = () => {
    openTabSection('negotiation', 'pricing-section')
    if (isConverted) return
    if (lead?.status !== 'Negotiation') {
      cancelNegotiationEdit(false)
      return
    }
    setPricingForm({
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    })
    pricingDraftRef.current = {
      client_offer_amount: enrichment?.client_offer_amount ?? '',
      discounted_amount: enrichment?.discounted_amount ?? '',
    }
    setPricingNotice(null)
    activateEditSection('negotiation')
    setPricingInputKey(k => k + 1)
  }

  const FOLLOWUP_REQUIRED_STATUSES = ['Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance']
  const TERMINAL_STATUSES = ['Lost', 'Rejected', 'Converted']
  const isFollowupRequired = (status?: string | null) =>
    status ? FOLLOWUP_REQUIRED_STATUSES.includes(status) : false
  const isTerminalStatus = (status?: string | null) =>
    status ? TERMINAL_STATUSES.includes(status) : false

  const startOfToday = () => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }

  const isPastDate = (value?: string | null) => {
    const dateOnly = toDateOnly(value)
    if (!dateOnly) return false
    const todayStr = dateToYMD(new Date())
    return dateOnly < todayStr
  }

  const suggestFollowupDate = (status?: string | null) => {
    if (!status) return ''
    const today = startOfToday()
    let offset = 0
    if (status === 'Contacted') offset = 2
    if (status === 'Quoted') offset = 3
    if (status === 'Negotiation') offset = 1
    if (status === 'Follow Up') offset = 2
    if (status === 'Awaiting Advance') offset = 3
    if (offset === 0) return ''
    const next = new Date(today)
    next.setDate(today.getDate() + offset)
    return next.toISOString().slice(0, 10)
  }

  const isFollowupDueOrOverdue = (value?: string | null) => {
    const dateOnly = toDateOnly(value)
    if (!dateOnly) return false
    const todayStr = dateToYMD(new Date())
    return dateOnly <= todayStr
  }

  const suggestNextFollowupFromOutcome = (status: string, outcome: string) => {
    const today = startOfToday()
    let offset = 0
    if (outcome === 'Not connected') offset = 1
    if (outcome === 'Connected') {
      if (status === 'Awaiting Advance') offset = 3
      else if (status === 'Quoted') offset = 3
      else if (status === 'Negotiation') offset = 1
      else if (status === 'Contacted') offset = 2
      else offset = 2
    }
    if (status === 'Awaiting Advance' && offset === 1) offset = 3
    if (offset <= 0) return ''
    const next = new Date(today)
    next.setDate(today.getDate() + offset)
    return dateToYMD(next)
  }

  const withError = (base: string, hasError: boolean) =>
    hasError ? `${base} field-error` : base

  const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'
  const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm'
  const softCardClass = 'rounded-2xl border border-[var(--border)] bg-white/60'
  const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
  const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
  const errorTextClass = 'text-sm text-red-600'
  const warningBadge = 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
  const compactInput = 'rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-xs leading-tight'

  const getPrimaryCityLabel = () => {
    const primary = selectedCities.find(c => c.is_primary)
    if (!primary) return '—'
    const country = primary.country && primary.country !== 'India' ? `, ${primary.country}` : ''
    return `${primary.name}, ${primary.state}${country}`
  }

  const getAllCitiesLabel = () => {
    if (!selectedCities.length) return '—'
    return selectedCities
      .map(city => {
        const country = city.country && city.country !== 'India' ? `, ${city.country}` : ''
        return `${city.name}, ${city.state}${country}`
      })
      .join(' | ')
  }

  const getCityId = (c: any) => c?.city_id ?? c?.id ?? c?.cityId ?? null
  const isInternational = selectedCities.some(c => (c.country || '').toLowerCase() !== 'india')
  const shouldSuggestImportant = isInternational || !!formData?.is_destination
  const primaryCityId =
    getCityId(selectedCities.find((c: any) => c.is_primary)) ??
    getCityId(enrichment?.cities?.find((c: any) => c.is_primary)) ??
    null
  const hasAllCityEvents =
    selectedCities.length === 0
      ? true
      : selectedCities.every(c => {
          const cityId = getCityId(c)
          return (enrichment?.events || []).some((e: any) => {
            const eventCityId = getCityId(e) ?? getCityId(e?.city)
            return eventCityId === cityId
          })
        })
  const backLabelBase = (() => {
    try {
      const url = new URL(backHref, 'http://local')
      const path = url.pathname
      const view = url.searchParams.get('view')
      if (path.startsWith('/follow-ups')) return 'Back to Daily Actions'
      if (path.startsWith('/leads')) {
        return 'Back to Leads'
      }
      if (path.startsWith('/dashboard')) return 'Back to Dashboard'
      if (path.startsWith('/me') || path.startsWith('/profile')) return 'Back to Profile'
    } catch {}
    return 'Back to Leads'
  })()

  const isDashboardTab = activeTab === 'dashboard'
  const backLabel = isDashboardTab ? backLabelBase : 'Back to Dashboard'
  const canEditNegotiation = lead?.status === 'Negotiation' && !isConverted

  const getUserDisplayName = (user: any) => {
    if (!user) return ''
    const nickname = String(user.nickname || '').trim()
    if (nickname) return nickname
    const name = String(user.name || '').trim()
    if (name) return name.split(/\s+/)[0] || name
    const email = String(user.email || '').trim()
    if (email) return email.split('@')[0]
    return ''
  }

  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [assignableUsers, setAssignableUsers] = useState<any[]>([])
  const assignedUserDisplay = (() => {
    if (!lead?.assigned_user_id) return 'Unassigned'
    const fromList = assignableUsers.find(u => u.id === lead.assigned_user_id)
    if (fromList) return getUserDisplayName(fromList) || 'Unassigned'
    const nick = String(lead.assigned_user_nickname || '').trim()
    if (nick) return nick
    const name = String(lead.assigned_user_name || '').trim()
    if (name) return name.split(/\s+/)[0] || name
    return 'Unassigned'
  })()

  const proposalTeamLabels: Record<keyof ProposalTeamCounts, string> = {
    candid: 'Candid Photographers',
    cinema: 'Cinematographers',
    traditional_photo: 'Traditional Photographer',
    traditional_video: 'Traditional Videographer',
    aerial: 'Aerial Videographer',
  }

  const cloneProposalTeam = (value: Record<string, ProposalTeamCounts>) =>
    JSON.parse(JSON.stringify(value || {}))

  const cloneProposalDeliverables = (value: ProposalDeliverable[]) =>
    JSON.parse(JSON.stringify(value || []))

  const formatDeliverableLines = (item: ProposalDeliverable) => {
    const lines: string[] = []
    const label = item.label || 'Deliverable'
    const detail = item.detail ? String(item.detail).trim() : ''
    const detail2 = item.detail2 ? String(item.detail2).trim() : ''

    if (label.toLowerCase().includes('coffee table books')) {
      const base = detail ? `${detail} ${label}` : label
      const note = detail2 ? ` (${detail2} Leaves Each)` : ''
      lines.push(`• ${base}${note}`)
      return lines
    }

    if (detail) {
      lines.push(`• ${detail} ${label}`)
    } else {
      lines.push(`• ${label}`)
    }

    if (detail2 && (item.detail2Label || '').toLowerCase().includes('note')) {
      lines.push(`  (${detail2})`)
    }

    return lines
  }

  const getWhatsAppNumber = () => {
    const raw = String(lead?.primary_phone || lead?.phone_primary || '').trim()
    if (!raw) return ''
    const parsed = parsePhoneNumberFromString(raw)
    if (parsed?.number) return parsed.number.replace('+', '')
    return raw.replace(/\D/g, '')
  }

  const buildProposalText = () => {
    const name = lead?.name || '—'
    const leadNumber = lead?.lead_number ?? lead?.id ?? ''
    const coverage =
      lead?.coverage_scope === 'Both Sides' ? 'Both Side' : lead?.coverage_scope || 'Both Side'
    const cityLabel = getPrimaryCityLabel()
    const hasMultipleCities = selectedCities.length > 1
    const lines: string[] = []
    lines.push('*Misty Visuals – Wedding Proposal*')
    lines.push('')
    lines.push(`Name: *${name}*`)
    lines.push(`L#${leadNumber}`)
          lines.push(`City: ${getAllCitiesLabel()}`)
    lines.push(`Coverage: ${coverage}`)
    lines.push('')
    lines.push('━━━━━━━━━━━━━━━━━━')
    lines.push('')

    const singularTeamLabels: Record<keyof ProposalTeamCounts, string> = {
      candid: 'Candid Photographer',
      cinema: 'Cinematographer',
      traditional_photo: 'Traditional Photographer',
      traditional_video: 'Traditional Videographer',
      aerial: 'Aerial Videographer',
    }

    if (proposalGroups.length) {
      proposalGroups.forEach((group, idx) => {
        const dateLabel = group.dateKey === 'TBD' ? 'Date TBD' : formatDate(group.dateKey)
        const team: ProposalTeamCounts =
          proposalTeamByDate[group.dateKey] || {
            candid: '',
            cinema: '',
            traditional_photo: '',
            traditional_video: '',
            aerial: '',
          }
        const teamEntries = Object.entries(singularTeamLabels)
          .map(([key, label]) => {
            const raw = team[key as keyof ProposalTeamCounts]
            const count = Number(raw)
            if (!raw || Number.isNaN(count) || count <= 0) return null
            const plural = count > 1 ? 's' : ''
            return `${count} ${label}${plural}`
          })
          .filter(Boolean) as string[]

        lines.push(`*${dateLabel}*`)
        group.events.forEach(event => {
          const paxLabel = event.pax ? `${event.pax} pax` : null
          const cityLabel = hasMultipleCities && event.city_name ? `${event.city_name}` : ''
          const venueCity = [event.venue ? event.venue : null, cityLabel || null]
            .filter(Boolean)
            .join(', ')
          const parts = [
            event.name || 'Event',
            venueCity || null,
            paxLabel,
          ].filter(Boolean) as string[]
          lines.push(`• ${parts.join(' – ')}`)
        })
        if (teamEntries.length) {
          lines.push('')
          lines.push('Team:')
          teamEntries.forEach(entry => lines.push(entry))
        }
        lines.push('')
        if (idx < proposalGroups.length - 1) {
          lines.push('━━━━━━━━━━━━━━━━━━')
          lines.push('')
        }
      })
      lines.push('━━━━━━━━━━━━━━━━━━')
      lines.push('')
    } else {
      lines.push('No events added yet.')
      lines.push('')
    }

    lines.push('*What’s Included*')
    lines.push('')
    const checked = proposalDeliverables.filter(item => item.checked)
    if (checked.length) {
      checked.forEach(item => {
        formatDeliverableLines(item).forEach(line => lines.push(line))
      })
    } else {
      lines.push('• —')
    }
    lines.push('')
    lines.push('━━━━━━━━━━━━━━━━━━')
    lines.push('')
    const quotedText = formatINR(lead?.amount_quoted) || '—'
    const discountedText = formatINR(lead?.discounted_amount) || '—'
    lines.push(`*Total Investment: ${quotedText}/-*`)
    if (lead?.discounted_amount != null && lead?.discounted_amount !== '') {
      lines.push(`Special Price: ${discountedText}/-`)
    }
    lines.push('')
    lines.push('Travel, food & accommodation for outstation weddings')
    lines.push('are to be covered by the client.')
    return lines.join('\n')
  }

  useEffect(() => {
    let active = true
    getAuth()
      .then(data => {
        if (!active) return
        const name =
          data?.user?.name?.trim() ||
          data?.user?.email?.split('@')[0] ||
          ''
        setUserName(name)
        setUserRole(data?.user?.role || '')
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (userRole !== 'admin') {
      setAssignableUsers([])
      return
    }
    let active = true
    apiFetch('/api/users', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!active) return
        setAssignableUsers(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [userRole])

  useEffect(() => {
    if (followupNotice) {
      const timer = window.setTimeout(() => setFollowupNotice(null), 2500)
      return () => window.clearTimeout(timer)
    }
  }, [followupNotice])

  useEffect(() => {
    if (!canEditNegotiation && pricingEditMode) {
      cancelNegotiationEdit()
    }
  }, [canEditNegotiation, pricingEditMode])

  const lastFollowupActivity = activities.find((activity: any) => activity?.activity_type === 'followup_done')
  const followupConnectedCount = activities.filter(
    (activity: any) =>
      activity?.activity_type === 'followup_done' &&
      activity?.metadata?.outcome === 'Connected'
  ).length
  const followupNotConnectedCount = activities.filter(
    (activity: any) =>
      activity?.activity_type === 'followup_done' &&
      activity?.metadata?.outcome === 'Not connected'
  ).length
  const lastContactMode = lastFollowupActivity
    ? lastFollowupActivity?.metadata?.follow_up_mode ||
      (lastFollowupActivity?.metadata?.outcome === 'Not connected' ? 'Not connected' : '')
    : ''
  const followupNoteCandidate = [...notes]
    .reverse()
    .find((note: any) => /follow[- ]?up|follow up attempted|discussed:/i.test(note?.note_text || ''))
  const lastContactNote = getNotePreview(
    followupNoteCandidate?.note_text || (notes.length ? notes[notes.length - 1]?.note_text : '')
  )
  const requiredMissing: string[] = []
  const optionalMissing: string[] = []

  if (!lead?.name || !String(lead.name).trim()) requiredMissing.push('Full Name')
  if (!lead?.primary_phone) requiredMissing.push('Contact Number')
  if (!lead?.source || lead.source === 'Unknown') requiredMissing.push('Source')
  if (['Reference', 'Direct Call', 'WhatsApp'].includes(lead?.source || '') && !lead?.source_name) {
    requiredMissing.push('Source Name')
  }
  if (!lead?.event_type) requiredMissing.push('Event Name')
  if (selectedCities.length === 0) requiredMissing.push('City')
  if (selectedCities.filter(c => c.is_primary).length !== 1) requiredMissing.push('Primary City')
  if (lead?.amount_quoted == null || lead?.amount_quoted === '') requiredMissing.push('Amount Quoted')
  if (!(enrichment?.events?.length ?? 0)) requiredMissing.push('No events')
  if (!hasAllCityEvents) requiredMissing.push('Each city linked to an event')

  const proposalEvents: ProposalEvent[] = (enrichment?.events || []).map((event: LeadEventRow) => ({
    ...event,
    dateKey: toDateOnly(event.event_date),
    name: getEventName(event),
    slot: event.slot || '',
    venue: event.venue || '',
    pax: event.pax || '',
  }))

  const proposalGroups: ProposalGroup[] = (() => {
    const groups: Record<string, ProposalEvent[]> = {}
    proposalEvents.forEach(event => {
      const key = event.dateKey || 'TBD'
      if (!groups[key]) groups[key] = []
      groups[key].push(event)
    })
    return (Object.entries(groups) as [string, ProposalEvent[]][])
      .sort((a, b) => {
        if (a[0] === 'TBD') return 1
        if (b[0] === 'TBD') return -1
        return a[0].localeCompare(b[0])
      })
      .map(([dateKey, events]) => ({
        dateKey,
        events: events
          .slice()
          .sort((a, b) => getEventSlotRank(a.slot) - getEventSlotRank(b.slot)),
      }))
  })()

  const proposalDateKey = proposalGroups.map(group => group.dateKey).join('|')

  useEffect(() => {
    if (!proposalDateKey) {
      setProposalTeamByDate({})
      return
    }
    setProposalTeamByDate(prev => {
      const next: Record<string, ProposalTeamCounts> = {}
      proposalGroups.forEach(group => {
        next[group.dateKey] =
          prev[group.dateKey] || {
            candid: '',
            cinema: '',
            traditional_photo: '',
            traditional_video: '',
            aerial: '',
          }
      })
      return next
    })
  }, [proposalDateKey])

  useEffect(() => {
    if (!lead || proposalDraftLoaded) return
    const draft = lead?.proposal_draft
    if (draft && typeof draft === 'object') {
      if (draft.team_by_date && typeof draft.team_by_date === 'object') {
        setProposalTeamByDate(draft.team_by_date)
      }
      if (Array.isArray(draft.deliverables)) {
        setProposalDeliverables(draft.deliverables)
      }
    }
    setProposalPricing({
      amount_quoted: lead?.amount_quoted != null ? String(lead.amount_quoted) : '',
      discounted_amount: lead?.discounted_amount != null ? String(lead.discounted_amount) : '',
    })
    setProposalDraftLoaded(true)
  }, [lead, proposalDraftLoaded])

  useEffect(() => {
    if (!proposalDraftLoaded || !id || proposalEditMode) return
    if (proposalDraftSaveRef.current) {
      window.clearTimeout(proposalDraftSaveRef.current)
    }
    proposalDraftSaveRef.current = window.setTimeout(() => {
      apiFetch(`/api/leads/${id}/proposal-draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_draft: {
            team_by_date: proposalTeamByDate,
            deliverables: proposalDeliverables,
          },
        }),
      }).catch(() => {})
    }, 600)
    return () => {
      if (proposalDraftSaveRef.current) {
        window.clearTimeout(proposalDraftSaveRef.current)
      }
    }
  }, [proposalTeamByDate, proposalDeliverables, proposalDraftLoaded, id, proposalEditMode])

  useEffect(() => {
    if (!lead || proposalEditMode) return
    setProposalPricing({
      amount_quoted: lead?.amount_quoted != null ? String(lead.amount_quoted) : '',
      discounted_amount: lead?.discounted_amount != null ? String(lead.discounted_amount) : '',
    })
  }, [lead?.amount_quoted, lead?.discounted_amount, proposalEditMode])

  useEffect(() => {
    if (!proposalPreviewText || !lead) return
    const current = buildProposalText()
    if (current !== proposalPreviewText) {
      setProposalPreviewText(null)
    }
  }, [
    proposalPreviewText,
    proposalTeamByDate,
    proposalDeliverables,
    proposalGroups,
    lead?.amount_quoted,
    lead?.discounted_amount,
    lead?.coverage_scope,
    lead?.name,
    lead?.lead_number,
    lead?.id,
    selectedCities,
  ])

  useEffect(() => {
    if (!id) return
    let active = true
    setQuoteLoading(true)
    apiFetch(`/api/leads/${id}/quotes`)
      .then(res => res.json())
      .then(data => {
        if (!active) return
        setQuoteHistory(Array.isArray(data) ? data : [])
        setQuoteError(null)
      })
      .catch(() => {
        if (!active) return
        setQuoteError('Unable to load quotes right now.')
      })
      .finally(() => {
        if (active) setQuoteLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])



  /* ===================== DATA LOAD ===================== */
  useEffect(() => {
    if (!id) return
    const fromParam = searchParams.get('from')
    if (fromParam) {
      try {
        const decoded = decodeURIComponent(fromParam)
        if (decoded.startsWith('/')) {
          setBackHref(decoded)
        }
      } catch {}
    } else {
      const view = searchParams.get('view')
      if (view === 'kanban' || view === 'table') {
        setBackHref(`/leads?view=${view}`)
      } else if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('leads_view')
        if (stored === 'kanban' || stored === 'table') {
          setBackHref(`/leads?view=${stored}`)
        }
      }
    }
  }, [id, searchParams?.toString()])

  useEffect(() => {
    if (!id) return
    const fetchAll = async () => {
      try {
        setLoading(true)
        setActivitiesLoading(true)
        setActivitiesError(null)
        setLeadMetricsLoading(true)
        const leadRes = await apiFetch(`/api/leads/${id}`)
        const leadData = await leadRes.json()
        if (!leadRes.ok) {
          setLead(null)
          setLoading(false)
          return
        }
        const normalizedLead = normalizeLeadSignals(leadData)
        setLead(normalizedLead)
        setFollowupDraft(toDateOnly(normalizedLead.next_followup_date))

        setContactForm({
          name: normalizedLead.name || '',
          primary_phone: normalizedLead.primary_phone || '',
          phone_secondary: normalizedLead.phone_secondary || '',
          email: normalizedLead.email || '',
          instagram: extractInstagramUsername(normalizedLead.instagram),
          source: normalizedLead.source || 'Unknown',
          source_name: normalizedLead.source_name || '',

          bride_name: normalizedLead.bride_name || '',
          bride_phone_primary: normalizedLead.bride_phone_primary || '',
          bride_phone_secondary: normalizedLead.bride_phone_secondary || '',
          bride_email: normalizedLead.bride_email || '',
          bride_instagram: extractInstagramUsername(normalizedLead.bride_instagram),

          groom_name: normalizedLead.groom_name || '',
          groom_phone_primary: normalizedLead.groom_phone_primary || '',
          groom_phone_secondary: normalizedLead.groom_phone_secondary || '',
          groom_email: normalizedLead.groom_email || '',
          groom_instagram: extractInstagramUsername(normalizedLead.groom_instagram),
        })

        const enrichmentRes = await apiFetch(`/api/leads/${id}/enrichment`)
        const enrichmentData = await enrichmentRes.json()
        if (enrichmentRes.ok) {
          const normalizedEnrichment = normalizeLeadSignals(enrichmentData)
          setEnrichment(normalizedEnrichment)
          setSelectedCities(Array.isArray(enrichmentData.cities) ? enrichmentData.cities : [])
          setFormData({
            event_type: enrichmentData.event_type,
            is_destination: enrichmentData.is_destination,
            client_budget_amount: enrichmentData.client_budget_amount,
            amount_quoted: enrichmentData.amount_quoted,
            potential: parseYesNo(enrichmentData.potential),
            important: parseYesNo(enrichmentData.important),
            coverage_scope: enrichmentData.coverage_scope || 'Both Sides',
            assigned_user_id: normalizedLead.assigned_user_id ?? null,
          })
          setPricingForm({
            client_offer_amount: enrichmentData.client_offer_amount ?? '',
            discounted_amount: enrichmentData.discounted_amount ?? '',
          })
          pricingDraftRef.current = {
            client_offer_amount: enrichmentData.client_offer_amount ?? '',
            discounted_amount: enrichmentData.discounted_amount ?? '',
          }
          setPricingLogs(Array.isArray(enrichmentData.pricing_logs) ? enrichmentData.pricing_logs : [])
        }

        const notesRes = await apiFetch(`/api/leads/${id}/notes`)
        const notesData = await notesRes.json()
        setNotes(Array.isArray(notesData) ? notesData : [])

        const activitiesRes = await apiFetch(`/api/leads/${id}/activities`)
        const activitiesData = await activitiesRes.json().catch(() => [])
        if (activitiesRes.ok) {
          setActivities(Array.isArray(activitiesData) ? activitiesData : [])
        } else {
          setActivities([])
          setActivitiesError('Unable to load activity timeline right now.')
        }

        const metricsRes = await apiFetch(`/api/leads/${id}/metrics`)
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json().catch(() => null)
          setLeadMetrics(metricsData && typeof metricsData === 'object' ? metricsData : null)
        } else {
          setLeadMetrics(null)
        }

        const followupRes = await apiFetch(`/api/leads/${id}/followups`)
        const followupData = await followupRes.json()
        setFollowups(Array.isArray(followupData) ? followupData : [])

        const negRes = await apiFetch(`/api/leads/${id}/negotiations`)
        const negData = await negRes.json()
        setNegotiations(Array.isArray(negData) ? negData : [])

        const citiesRes = await apiFetch('/api/cities')
        const citiesData = await citiesRes.json().catch(() => [])
        setAllCities(Array.isArray(citiesData) ? citiesData : [])
      } finally {
        setLoading(false)
        setActivitiesLoading(false)
        setLeadMetricsLoading(false)
      }
    }

    fetchAll()
  }, [id])

  useEffect(() => {
    if (!id) return
    usageEndedRef.current = false
    usageLogIdRef.current = null

    const startUsage = async () => {
      try {
        const res = await apiFetch(`/api/leads/${id}/usage/start`, {
          method: 'POST',
        })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (data?.id) {
          usageLogIdRef.current = Number(data.id)
        }
      } catch {}
    }

    const endUsage = (force = false) => {
      if (usageEndedRef.current) return
      usageEndedRef.current = true
      const payload = {
        usage_id: usageLogIdRef.current,
      }
      try {
        fetch(`/api/leads/${id}/usage/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch {
        if (force) return
      }
    }

    startUsage()

    const handlePageHide = () => endUsage(true)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        endUsage(true)
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      endUsage(true)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [id])

  useEffect(() => {
    if (lead?.status !== 'Converted') return
    setActiveEditSection(null)
    setPricingInputKey(k => k + 1)
    setEventsDraft([])
    setDeletedEventIds([])
    setEventsDraftErrors({})
    setEventTypeSuggestRow(null)
    setPendingEventDelete(null)
  }, [lead?.status])

  useEffect(() => {
    if (!editMode) {
      setImportantTouched(false)
      return
    }
    if (shouldSuggestImportant && !importantTouched && !formData?.important) {
      setFormData((prev: any) => ({ ...prev, important: true }))
    }
  }, [editMode, shouldSuggestImportant, importantTouched, formData?.important])

  useEffect(() => {
    if (!lead) return
    if (!isEditingFollowup) {
      setFollowupDraft(toDateOnly(lead.next_followup_date))
    }
    if (isFollowupRequired(lead.status) && !lead.next_followup_date) {
      setFollowupPrompt('Follow-up required for this status')
    } else {
      setFollowupPrompt(null)
      setFollowupError(null)
    }
  }, [lead?.next_followup_date, lead?.status, isEditingFollowup])


  useEffect(() => {
    const el = document.getElementById('app-scroll')
    if (!el) return
    el.classList.add('smooth-scroll')
    return () => {
      el.classList.remove('smooth-scroll')
    }
  }, [])

  useEffect(() => {
    if (!isEditingFollowup) return
    const id = setTimeout(() => {
      followupInputRef.current?.focus()
      followupInputRef.current?.showPicker?.()
    }, 0)
    return () => clearTimeout(id)
  }, [isEditingFollowup])

  useEffect(() => {
    if (!headerRef.current) return
    const update = () => {
      const next = headerRef.current?.getBoundingClientRect().height || 0
      setHeaderHeight(next)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(headerRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const appliedFocusRef = useRef<string | null>(null)
  const desiredStatusParam = searchParams.get('desired_status')
  const originParam = searchParams.get('origin')
  const focusParam = searchParams.get('focus')

  useEffect(() => {
    if (!desiredStatusParam) return
    if (STATUSES.includes(desiredStatusParam)) {
      setPendingStatus(desiredStatusParam)
      if (originParam === 'lead' || originParam === 'kanban') {
        setStatusChangeOrigin(originParam)
      } else {
        setStatusChangeOrigin('kanban')
      }
    }
  }, [desiredStatusParam, originParam])

  useEffect(() => {
    if (!focusParam || !lead || !enrichment) return
    if (appliedFocusRef.current === focusParam) return
    appliedFocusRef.current = focusParam
    setActiveTab('enrichment')
    activateEditSection('details')

    const scrollTo = (targetId: string) => {
      const el = document.getElementById(targetId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    if (focusParam === 'amount_quoted') {
      setEnrichmentErrors((prev: any) => ({ ...prev, amount_quoted: 'Amount quoted is required' }))
      setEnrichmentShake(true)
      setTimeout(() => setEnrichmentShake(false), 300)
      setTimeout(() => scrollTo('amount-quoted-field'), 150)
    }

    if (focusParam === 'primary_city') {
      setEnrichmentErrors((prev: any) => ({ ...prev, primary_city: 'Primary city is required' }))
      setEnrichmentShake(true)
      setTimeout(() => setEnrichmentShake(false), 300)
      setTimeout(() => scrollTo('cities-section'), 150)
    }

    if (
      focusParam === 'events' ||
      focusParam === 'all_cities_event' ||
      focusParam === 'primary_city_event' ||
      focusParam === 'event_time'
    ) {
      const notice =
        focusParam === 'events'
          ? 'No events are added yet. Add an event before moving this lead forward'
          : focusParam === 'event_time'
          ? 'Start and end time are required for all events before converting the lead'
          : 'Each city must be linked to at least one event before moving this lead forward'
      setEventNotice(notice)
      startEventsEdit()
      setTimeout(() => scrollTo('events-section'), 150)

      if (focusParam === 'event_time') {
        setTimeout(() => {
          const nextErrors: Record<string, Record<string, string>> = {}
          ;(enrichment?.events || []).forEach((e: any) => {
            const rowErrors: Record<string, string> = {}
            if (!e.start_time) rowErrors.start_time = 'Required'
            if (!e.end_time) rowErrors.end_time = 'Required'
            if (Object.keys(rowErrors).length) {
              nextErrors[`event-${e.id}`] = rowErrors
            }
          })
          if (Object.keys(nextErrors).length) {
            setEventsDraftErrors(nextErrors)
          }
        }, 200)
      }
    }
  }, [focusParam, lead, enrichment])

  const attemptPendingStatusChange = async (setNotice?: (msg: string | null) => void) => {
    if (!pendingStatus) return
    const target = pendingStatus
    setPendingStatus(null)
    await updateLeadStatus(target, undefined, setNotice)
  }

  const handleStatusError = (err: any, desiredStatus: string) => {
    const code = err?.code
    let focus: string | null = null
    if (code === 'AMOUNT_QUOTED_REQUIRED') focus = 'amount_quoted'
    if (code === 'EVENT_REQUIRED') focus = 'events'
    if (code === 'PRIMARY_CITY_REQUIRED') focus = 'primary_city'
    if (code === 'PRIMARY_CITY_EVENT_REQUIRED') focus = 'all_cities_event'
    if (code === 'ALL_CITIES_EVENT_REQUIRED') focus = 'all_cities_event'
    if (code === 'EVENT_TIME_REQUIRED') focus = 'event_time'

    if (focus) {
      setNextFixDialog({
        message: err?.error || 'Action required',
        focus,
        desiredStatus,
        origin: statusChangeOrigin || 'lead',
      })
      return true
    }
    return false
  }

  const handleFollowupAfterStatusChange = (updatedLead: any, deferPrompt = false) => {
    if (!updatedLead) return
    if (isTerminalStatus(updatedLead.status)) {
      setFollowupDraft('')
      setIsEditingFollowup(false)
      setFollowupPrompt(null)
      setFollowupError(null)
      return
    }

    if (isFollowupRequired(updatedLead.status) && !updatedLead.next_followup_date) {
      const suggested = suggestFollowupDate(updatedLead.status)
      if (suggested) setFollowupDraft(suggested)
      setFollowupPrompt('Follow-up required for this status')
      if (deferPrompt) {
        setPendingFollowupSuggestion(true)
      } else {
        setIsEditingFollowup(true)
      }
      return
    }

    setFollowupPrompt(null)
    setFollowupDraft(toDateOnly(updatedLead.next_followup_date))
    setIsEditingFollowup(false)
  }


  const refreshActivities = async () => {
    try {
      const res = await apiFetch(`/api/leads/${id}/activities`)
      const data = await res.json()
      if (!res.ok) {
        setActivitiesError('Unable to load activity timeline right now.')
        return
      }
      setActivities(Array.isArray(data) ? data : [])
      setActivitiesError(null)
    } catch {
      setActivitiesError('Unable to load activity timeline right now.')
    }
  }

  const updateLeadStatus = async (
    status: string,
    reason?: string | null,
    noticeSetter?: (msg: string | null) => void,
    advanceReceived?: boolean
  ) => {
    if (status === 'Lost') {
      const res = await apiFetch(`/api/leads/${id}/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Client stopped responding' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        noticeSetter?.(err?.error || 'Failed to change status')
        return
      }
      const updated = normalizeLeadSignals(await res.json())
      setLead(updated)
      handleFollowupAfterStatusChange(updated, true)
      void refreshActivities()
      setStatusChangedInfo({ message: `Status changed to ${status}`, origin: statusChangeOrigin || 'lead' })
      return
    }

    const res = await apiFetch(`/api/leads/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        status,
        rejected_reason: reason,
        advance_received: advanceReceived === true ? true : undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (err?.code === 'ADVANCE_REQUIRED') {
        setConvertError('Please collect the advance amount before marking this lead as Converted.')
        return
      }
      if (handleStatusError(err, status)) return
      noticeSetter?.(err?.error || 'Failed to change status')
      return
    }

    const updated = normalizeLeadSignals(await res.json())
    setLead(updated)
    handleFollowupAfterStatusChange(updated, true)
    void refreshActivities()
    if (status === 'Converted' && advanceReceived) {
      return
    }
    let pendingNegotiationPrompt = false
    if (status === 'Negotiation' && typeof window !== 'undefined') {
      pendingNegotiationPrompt = sessionStorage.getItem('pending_negotiation_prompt') === '1'
      if (pendingNegotiationPrompt) {
        sessionStorage.removeItem('pending_negotiation_prompt')
      }
    }
    if (pendingNegotiationPrompt) {
      setShowNegotiationEditPrompt(true)
    } else {
      setStatusChangedInfo({ message: `Status changed to ${status}`, origin: statusChangeOrigin || 'lead' })
    }
  }

  const openConversionSummary = () => {
    if (!convertLeadSnapshot) return
    const summary = buildConversionSummary(convertLeadSnapshot, activities)
    setConvertSummary(summary)
    setConvertConfirmOpen(false)
    setConvertLeadSnapshot(null)
  }

  const finalizeConversion = async (viewProject: boolean) => {
    if (!convertSummary) return
    setConvertSaving(true)
    setStatusChangeOrigin('lead')
    await updateLeadStatus('Converted', null, undefined, true)
    setConvertSaving(false)
    const leadId = convertSummary.leadId
    setConvertSummary(null)
    if (viewProject && leadId) {
      window.location.href = `/leads/${leadId}`
    }
  }

  const updateLeadHeat = async (heat: string) => {
    const res = await apiFetch(`/api/leads/${id}/heat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heat }),
    })
    if (!res.ok) return
    const updated = normalizeLeadSignals(await res.json())
    setLead(updated)
    void refreshActivities()
  }

  const updateCoverageScope = async (scope: string) => {
    if (!lead) return
    const res = await apiFetch(`/api/leads/${lead.id}/enrichment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverage_scope: scope }),
    })
    if (!res.ok) return
    const updated = normalizeLeadSignals(await res.json())
    setEnrichment((prev: any) => ({ ...prev, coverage_scope: updated.coverage_scope }))
  }

  const addCity = (city: any) => {
    const isInternationalCity = (city?.country || '').toLowerCase() !== 'india'
    const next = isInternationalCity
      ? [
          { ...city, is_primary: true },
          ...selectedCities.map(c => ({ ...c, is_primary: false })),
        ]
      : [...selectedCities, { ...city, is_primary: selectedCities.length === 0 }]
    setSelectedCities(next)
    setPendingCity(null)
    setCityQuery('')
  }

  const removeCity = (cityId: number) => {
    setSelectedCities((prev: any) =>
      prev.filter((c: any) => (c.city_id ?? c.id ?? c.cityId) !== cityId)
    )
  }

  const isValidDate = (value: string) => {
    if (!value) return false
    const d = new Date(value)
    return !Number.isNaN(d.getTime())
  }

  const saveFollowupDate = async (date: string) => {
    if (isPastDate(date)) {
      setFollowupError('Follow-up date cannot be in the past')
      return
    }
    setFollowupError(null)
    setIsSavingFollowup(true)
    const res = await apiFetch(`/api/leads/${id}/followup-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_followup_date: date }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFollowupError(err?.error || 'Unable to save follow-up date')
      setIsSavingFollowup(false)
      return
    }
    const updated = await res.json().catch(() => ({}))
    setLead((prev: any) =>
      prev ? { ...prev, next_followup_date: updated.next_followup_date || date } : prev
    )
    setIsSavingFollowup(false)
    setIsEditingFollowup(false)
  }

  const saveFollowupDone = async () => {
    if (!followupOutcome) {
      setFollowupDoneError('Select an outcome')
      return
    }
    if (followupOutcome === 'Connected' && !followupMode) {
      setFollowupDoneError('Select follow-up mode')
      return
    }
    if (followupOutcome === 'Not connected' && !followupNotConnectedReason) {
      setFollowupDoneError('Select a reason')
      return
    }
    if (!followupNextDate) {
      setFollowupDoneError('Select a follow-up date')
      return
    }
    if (isPastDate(followupNextDate)) {
      setFollowupDoneError('Follow-up date cannot be in the past')
      return
    }

    setIsSavingFollowupDone(true)
    setFollowupDoneError(null)
    const res = await apiFetch(`/api/leads/${id}/followup-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outcome: followupOutcome,
        follow_up_mode: followupOutcome === 'Connected' ? followupMode : null,
        discussed_topics: followupOutcome === 'Connected' && followupTopics.length ? followupTopics : null,
        note:
          followupOutcome === 'Connected'
            ? followupNote || null
            : followupNotConnectedReason === 'Other'
              ? followupNote || null
              : null,
        not_connected_reason: followupOutcome === 'Not connected' ? followupNotConnectedReason : null,
        next_followup_date: followupNextDate,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setFollowupDoneError(err?.error || 'Unable to save follow-up')
      setIsSavingFollowupDone(false)
      return
    }

    const updated = normalizeLeadSignals(await res.json())
    setLead((prev: any) =>
      prev ? { ...prev, next_followup_date: updated.next_followup_date } : prev
    )
    setFollowupDraft(toDateOnly(updated.next_followup_date))
    setShowFollowupDone(false)
    setFollowupOutcome('')
    setFollowupMode('')
    setFollowupTopics([])
    setFollowupNote('')
    setFollowupNotConnectedReason('')
    setFollowupNextDate('')
    setFollowupPrompt(null)
    setIsSavingFollowupDone(false)
    void refreshActivities()
  }

  const startFollowupEdit = () => {
    if (!lead) return
    setFollowupError(null)
    if (lead.next_followup_date) {
      setFollowupDraft(toDateOnly(lead.next_followup_date))
    } else if (isFollowupRequired(lead.status)) {
      const suggested = suggestFollowupDate(lead.status)
      if (suggested) setFollowupDraft(suggested)
    }
    setIsEditingFollowup(true)
  }

  const openFollowupPopup = (defaultToDone = false) => {
    setFollowupPopupDefaultDone(defaultToDone)
    setFollowupPopupOpen(true)
  }

  const openFollowupPanel = (showDone = false) => {
    setShowFollowupDone(showDone)
    if (showDone) {
      setFollowupOutcome('')
      setFollowupMode('')
      setFollowupTopics([])
      setFollowupNote('')
      setFollowupNotConnectedReason('')
      setFollowupNextDate('')
      setFollowupDoneError(null)
    }
    startFollowupEdit()
  }

  const todayIso = dateToYMD(new Date())

  if (loading) return (
    <div className="min-h-screen bg-[var(--background)] px-4 md:px-6 py-12 text-sm text-neutral-500">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        Loading lead details…
      </div>
    </div>
  )
  if (!lead) return (
    <div className="min-h-screen bg-[var(--background)] px-4 md:px-6 py-12 text-sm text-red-600">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        Lead not found
      </div>
    </div>
  )

  /* ===================== RENDER HELPERS ===================== */
  function renderContactCard(title: string, fields: Record<string, string>) {
    const isRequiredField = (key: string) =>
      title === 'Lead' && (key === 'name' || key === 'primary_phone')

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

        {Object.entries(fields).every(([_, key]) => !contactForm?.[key]) && !contactEditMode ? (
          <div className="text-neutral-400 text-sm">— No details added</div>
        ) : (
          Object.entries(fields).map(([label, key]) => {
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

            if (!contactEditMode) {
              if (!value) return null
              if (isInstagram) {
                const username = extractInstagramUsername(value)
                if (!username) return null
                return (
                  <div key={label} className="text-sm text-neutral-700">
                    <span className="text-neutral-500">Instagram:</span>{' '}
                    <a
                      href={`https://instagram.com/${username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-700 hover:text-neutral-900"
                    >
                      @{username}
                    </a>
                  </div>
                )
              }
              if (isPhone) {
                return (
                  <div key={label} className="text-sm text-neutral-700">
                    <span className="text-neutral-500">{formatLabel(label)}:</span>{' '}
                    <PhoneActions phone={value} leadId={lead?.id} />
                  </div>
                )
              }
              if (isSource) {
                return (
                  <div key={label} className="text-sm text-neutral-700">
                    <span className="text-neutral-500">Source:</span>{' '}
                    {normalizeLeadSource(contactForm?.source, contactForm?.source_name)}
                  </div>
                )
              }
              if (isSourceName) return null

              return (
                <div key={label} className="text-sm text-neutral-700">
                  <span className="text-neutral-500">{formatLabel(label)}:</span> {value}
                </div>
              )
            }

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
          })
        )}
      </div>
    )
  }

  const updateDeliverable = (id: string, updates: Partial<ProposalDeliverable>) => {
    setProposalDeliverables(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    )
  }

  const addDeliverable = () => {
    const id = `custom-${Date.now()}`
    setProposalDeliverables(prev => [
      ...prev,
      { id, label: 'Custom Deliverable', checked: true },
    ])
  }

  const removeDeliverable = (id: string) => {
    setProposalDeliverables(prev => prev.filter(item => item.id !== id))
  }

  const handleGenerateProposal = async (sendWhatsApp: boolean) => {
    if (!lead) return
    setProposalNotice(null)
    if (sendWhatsApp) {
      const number = getWhatsAppNumber()
      if (!number) {
        setProposalNotice('Primary phone number is required to send on WhatsApp.')
        return
      }
    }
    const generatedText = buildProposalText()
    setProposalPreviewText(generatedText)
    const lastQuote = quoteHistory[0]
    const lastMatches =
      lastQuote &&
      String(lastQuote.generated_text || '').trim() === String(generatedText || '').trim() &&
      String(lastQuote.amount_quoted ?? '') === String(lead?.amount_quoted ?? '') &&
      String(lastQuote.discounted_amount ?? '') === String(lead?.discounted_amount ?? '')
    setProposalSaving(true)
    try {
      const res = await apiFetch(`/api/leads/${id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generated_text: generatedText,
          amount_quoted: lead?.amount_quoted ?? null,
          discounted_amount: lead?.discounted_amount ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setProposalNotice(data?.error || 'Unable to generate proposal.')
        return
      }
      if (data?.reused || lastMatches) {
        setProposalNotice('No changes since the last proposal.')
        void refreshActivities()
      } else {
        setQuoteHistory(prev => [data, ...prev])
        setProposalNotice('Proposal generated.')
        void refreshActivities()
      }
      if (sendWhatsApp) {
        const number = getWhatsAppNumber()
        const encoded = encodeURIComponent(generatedText)
        window.open(`https://wa.me/${number}?text=${encoded}`, '_blank')
        apiFetch(`/api/leads/${id}/quotes/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'whatsapp',
            quote_id: data?.id ?? null,
            quote_number: data?.quote_number ?? null,
          }),
        })
          .then(() => refreshActivities())
          .catch(() => {})
      }
    } catch {
      setProposalNotice('Unable to generate proposal right now.')
    } finally {
      setProposalSaving(false)
    }
  }

  const startProposalEdit = () => {
    setProposalEditSnapshot({
      teamByDate: cloneProposalTeam(proposalTeamByDate),
      deliverables: cloneProposalDeliverables(proposalDeliverables),
      pricing: {
        amount_quoted: proposalPricing.amount_quoted,
        discounted_amount: proposalPricing.discounted_amount,
      },
    })
    setProposalEditMode(true)
  }

  const cancelProposalEdit = () => {
    if (proposalEditSnapshot) {
      setProposalTeamByDate(cloneProposalTeam(proposalEditSnapshot.teamByDate))
      setProposalDeliverables(cloneProposalDeliverables(proposalEditSnapshot.deliverables))
      if (proposalEditSnapshot.pricing) {
        setProposalPricing({
          amount_quoted: proposalEditSnapshot.pricing.amount_quoted,
          discounted_amount: proposalEditSnapshot.pricing.discounted_amount,
        })
      }
    }
    setProposalEditMode(false)
    setProposalEditSnapshot(null)
  }

  const finishProposalEdit = async () => {
    if (!lead) return
    setProposalNotice(null)
    const normalizedQuoted = normalizeLakhInput(String(proposalPricing.amount_quoted || ''))
    const normalizedDiscounted = normalizeLakhInput(String(proposalPricing.discounted_amount || ''))
    setProposalPricing(prev => ({
      ...prev,
      amount_quoted: normalizedQuoted,
      discounted_amount: normalizedDiscounted,
    }))
    try {
      const res = await apiFetch(`/api/leads/${id}/enrichment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_quoted: normalizedQuoted,
          discounted_amount: normalizedDiscounted,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setProposalNotice(err?.error || 'Failed to save pricing')
        return
      }
      const refreshedRaw = await apiFetch(`/api/leads/${id}/enrichment`).then(r => r.json())
      const refreshed = normalizeLeadSignals(refreshedRaw)
      setEnrichment(refreshed)
      setPricingLogs(Array.isArray(refreshed.pricing_logs) ? refreshed.pricing_logs : [])
      setPricingForm({
        client_offer_amount: refreshed.client_offer_amount ?? '',
        discounted_amount: refreshed.discounted_amount ?? '',
      })
      pricingDraftRef.current = {
        client_offer_amount: refreshed.client_offer_amount ?? '',
        discounted_amount: refreshed.discounted_amount ?? '',
      }
      setFormData((prev: any) => ({
        ...prev,
        amount_quoted: refreshed.amount_quoted,
      }))
      setLead((prev: any) =>
        prev
          ? {
              ...prev,
              amount_quoted: refreshed.amount_quoted,
              discounted_amount: refreshed.discounted_amount,
            }
          : prev
      )
      void refreshActivities()
    } catch {
      setProposalNotice('Failed to save pricing')
      return
    }
    setProposalEditMode(false)
    setProposalEditSnapshot(null)
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 md:px-6 pt-0 pb-8 space-y-8">
        {/* ===================== HEADER ===================== */}
        <div
          ref={headerRef}
          className="sticky top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 pt-6 pb-2 bg-[var(--background)] flex flex-col gap-2 shadow-[0_6px_12px_-8px_rgba(0,0,0,0.25)]"
        >
          {isDashboardTab ? (
            <Link
              href={backHref}
              onClick={() => markScrollRestore(backHref)}
              className="btn-pill inline-flex w-fit rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800"
            >
              {backLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="btn-pill inline-flex w-fit rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800"
            >
              {backLabel}
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  lead?.heat === 'Hot' ? 'bg-red-500' : lead?.heat === 'Cold' ? 'bg-blue-500' : 'bg-yellow-500'
                }`}
              />
              {(() => {
                const header = buildHeaderName()
                return (
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
                    {header.leadName}
                    {header.suffix ? (
                      <span className="ml-2 text-xl md:text-2xl font-semibold text-neutral-700">
                        ({header.suffix})
                      </span>
                    ) : null}
                  </h1>
                )
              })()}
            </div>
            <div className="text-left sm:text-right">
              {(lead?.lead_number != null || lead?.id != null) && (
                <div className="text-xs font-medium text-neutral-500">
                  Lead #{lead.lead_number ?? lead.id}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
            <select
              value={lead.status}
              onChange={e => {
                const nextStatus = e.target.value
                if (lead.status === 'Converted' && nextStatus !== 'Converted') {
                  setStatusConfirm({ nextStatus })
                  return
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
                setStatusChangeOrigin('lead')
                updateLeadStatus(nextStatus)
              }}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm"
            >
              {STATUSES.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {lead?.status === 'Awaiting Advance' && awaitingDays != null && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${awaitingAdvanceClass(
                  awaitingDays
                )}`}
              >
                Awaiting Advance • {awaitingDays} days pending
              </span>
            )}
            <LockHint enabled={isConverted}>
              <select
                value={lead.heat || ''}
                onChange={e => updateLeadHeat(e.target.value)}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm"
                disabled={isConverted}
              >
                <option value="" disabled>
                  Heat
                </option>
                {HEAT_VALUES.map(h => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </LockHint>

            <div className="w-full sm:w-auto rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs text-neutral-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-700">Next follow-up:</span>
                <button
                  className="text-xs font-medium text-neutral-800 hover:text-neutral-900"
                  onClick={() => openFollowupPopup(false)}
                >
                  {lead?.next_followup_date ? formatDateDisplay(lead.next_followup_date) : 'Not set'}
                </button>
                {lead?.next_followup_date &&
                  !isTerminalStatus(lead.status) &&
                  isFollowupDueOrOverdue(lead.next_followup_date) && (
                    <button
                      className="text-xs font-medium text-neutral-700 hover:text-neutral-900"
                      onClick={() => openFollowupPopup(true)}
                    >
                      Mark Done
                    </button>
                  )}
              </div>
              {!isEditingFollowup && !lead?.next_followup_date && followupPrompt && (
                <div className="mt-1 text-xs text-amber-700">{followupPrompt}</div>
              )}
              {isEditingFollowup && followupPrompt && !lead?.next_followup_date && (
                <div className="mt-1 text-xs text-amber-700">{followupPrompt}</div>
              )}
              {followupError && (
                <div className="mt-1 text-xs text-red-600">{followupError}</div>
              )}
            </div>
            </div>

            {(lead.important || lead.potential || (lead?.not_contacted_count ?? 0) >= 5 || (lead?.next_followup_date && !isTerminalStatus(lead.status) && isPastDate(lead.next_followup_date))) && (
              <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                {lead.important && (
                  <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                    Important
                  </span>
                )}
                {lead.potential && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                    Potential
                  </span>
                )}
                {(lead?.not_contacted_count ?? 0) >= 5 && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                    Non Responsive
                  </span>
                )}
                {lead?.next_followup_date &&
                  !isTerminalStatus(lead.status) &&
                  isPastDate(lead.next_followup_date) && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      Follow-up overdue
                    </span>
                  )}
              </div>
            )}
            {followupNotice && (
              <div className="mt-1 text-xs text-emerald-700">{followupNotice}</div>
            )}
          </div>

          {lead.status === 'Rejected' && (
            <div className="text-sm text-red-700">
              Rejection Reason: {lead.rejected_reason || 'Low budget'}
            </div>
          )}

          {!hasAllCityEvents && (
            <div className={`mt-1 ${warningBadge}`}>
              Each city should have at least one linked event
            </div>
          )}
        </div>

        {/* Action Strip removed — Follow-up uses reusable popup. */}
        <FollowUpActionPopup
          open={followupPopupOpen}
          leadId={lead.id}
          status={lead.status}
          nextFollowupDate={lead.next_followup_date}
          defaultToDone={followupPopupDefaultDone}
          onClose={() => setFollowupPopupOpen(false)}
          onSuccess={async (updated: FollowupUpdatedLead, meta?: FollowupSuccessMeta) => {
            const outcome = meta?.outcome
            const leadId = updated?.id ?? lead?.id ?? id
            if (updated?.auto_contacted) {
              const needsIntake = !updated?.intake_completed
              setAutoContactedPrompt({
                message: needsIntake
                  ? 'Status changed to Contacted. Please fill the Lead intake form.'
                  : 'Status changed to Contacted.',
                forceIntake: needsIntake,
              })
              return
            }
            const normalized = normalizeLeadSignals(updated)
            setLead((prev: any) =>
              prev
                ? {
                    ...prev,
                    ...normalized,
                    next_followup_date:
                      normalized.next_followup_date ?? updated.next_followup_date ?? prev.next_followup_date,
                  }
                : prev
            )
            if (updated?.auto_negotiation?.attempted && !updated?.auto_negotiation?.success) {
              const reason = updated?.auto_negotiation?.reason || 'Unable to change status to Negotiation'
              setAutoNegotiationError({
                reason,
                focus: mapAutoNegotiationReasonToFocus(reason),
              })
            } else if (
              meta?.outcome === 'Connected' &&
              meta?.discussedPricing &&
              normalized.status === 'Negotiation'
            ) {
              setNegotiationStatusNotice(
                meta?.status === 'Negotiation'
                  ? 'Status already Negotiation'
                  : 'Status changed to Negotiation'
              )
            }
            try {
              const res = await apiFetch(`/api/leads/${id}/notes`)
              const data = await res.json()
              if (res.ok) setNotes(Array.isArray(data) ? data : [])
            } catch {}
            void refreshActivities()
          }}
        />

        {/* ===================== TABS ===================== */}
        <div className="flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 py-1 shadow-sm">
          {['dashboard', 'enrichment', 'contact', 'notes', 'activity', 'negotiation', 'proposal'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                activeTab === tab
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-[var(--surface-muted)]'
              }`}
            >
              {tab === 'enrichment'
                ? 'Details'
                : tab === 'notes'
                  ? 'Notes'
                  : tab === 'proposal'
                    ? 'Proposal'
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ===================== DASHBOARD ===================== */}
        {activeTab === 'dashboard' && lead && (
          <div className="columns-1 lg:columns-2 lg:[column-gap:1.5rem]">
            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('enrichment', 'details-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Lead Snapshot
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-700">
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Wedding Type</div>
                  <div className="font-medium">{lead.is_destination ? 'Destination' : 'Local'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Coverage</div>
                  <div className="font-medium">{lead.coverage_scope || 'Both Sides'}</div>
                </div>
                <div>
                <div className="text-xs uppercase tracking-widest text-neutral-500">Event Name</div>
                  <div className="font-medium">{lead.event_type || '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">City</div>
                  <div className="font-medium">
                    {(() => {
                      const primary = selectedCities.find(c => c.is_primary)
                      if (!primary) return '—'
                      const country = primary.country && primary.country !== 'India' ? `, ${primary.country}` : ''
                      return `${primary.name}, ${primary.state}${country}`
                    })()}
                  </div>
                </div>
                
              </div>
            </div>

            {requiredMissing.length > 0 && (
              <div className={`${cardClass} p-4 space-y-2 break-inside-avoid mb-6`}>
                <div className="text-xs uppercase tracking-widest text-neutral-500">Required Missing Fields</div>
                <div className="flex flex-wrap gap-2">
                  {requiredMissing.map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-neutral-500">These are required before moving forward.</div>
              </div>
            )}

            {optionalMissing.length > 0 && (
              <div className={`${cardClass} p-4 space-y-2 break-inside-avoid mb-6`}>
                <div className="text-xs uppercase tracking-widest text-neutral-500">Missing (Not Required)</div>
                <div className="flex flex-wrap gap-2">
                  {optionalMissing.map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('contact', 'contact-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Contact Info
              </button>
              <div className="space-y-3 text-sm text-neutral-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Primary Phone</div>
                  {lead.primary_phone ? (
                    <PhoneActions phone={lead.primary_phone} leadId={lead.id} />
                  ) : (
                    <span className="text-neutral-400">Not provided</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Email</div>
                  <div className="font-medium">{lead.email || 'Not provided'}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Instagram</div>
                  {extractInstagramUsername(lead.instagram) ? (
                    <a
                      href={`https://instagram.com/${extractInstagramUsername(lead.instagram)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-neutral-800 hover:text-neutral-900"
                    >
                      @{extractInstagramUsername(lead.instagram)}
                    </a>
                  ) : (
                    <span className="text-neutral-400">Not provided</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Source</div>
                  <div className="font-medium">
                    {lead.source
                      ? lead.source_name
                        ? `${lead.source} of ${lead.source_name}`
                        : lead.source
                      : 'Not provided'}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('notes', 'notes-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Action Summary
              </button>
              <div className="space-y-3 text-sm text-neutral-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Primary Phone</div>
                  {lead.primary_phone ? (
                    <PhoneActions phone={lead.primary_phone} leadId={lead.id} />
                  ) : (
                    <span className="text-neutral-400">Not provided</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Next Follow-up</div>
                  <div className={`font-medium ${lead.next_followup_date && isPastDate(lead.next_followup_date) ? 'text-amber-700' : ''}`}>
                    {lead.next_followup_date ? formatDateDisplay(lead.next_followup_date) : 'Not set'}
                  </div>
                </div>
                {lead.next_followup_date && isPastDate(lead.next_followup_date) && !isTerminalStatus(lead.status) && (
                  <div className="text-xs text-amber-700">Follow-up overdue</div>
                )}
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <div className="text-sm font-semibold text-neutral-800">Contact Summary</div>
              {!lastFollowupActivity ? (
                <div className="text-sm text-neutral-500">No contact yet</div>
              ) : (
                <div className="space-y-3 text-sm text-neutral-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Last Contact</div>
                    <div className="font-medium">
                      {formatRelativeTime(lastFollowupActivity.created_at) || '—'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Follow-up Mode</div>
                    <div className="font-medium">{lastContactMode || '—'}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Note</div>
                    <div className="font-medium text-right">{lastContactNote || '—'}</div>
                  </div>
                </div>
              )}
              <div className="space-y-2 text-sm text-neutral-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Total Follow-up</div>
                  <div className="font-medium text-right">
                    Contacted: {followupConnectedCount} · Not contacted: {followupNotConnectedCount}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <div className="text-sm font-semibold text-neutral-800">Lead Insights</div>
              {leadMetricsLoading ? (
                <div className="text-sm text-neutral-500">Loading insights…</div>
              ) : !leadMetrics ? (
                <div className="text-sm text-neutral-500">No insights available yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-700">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Total Follow-ups</div>
                    <div className="font-medium">{toMetricNumber(leadMetrics.total_followups) ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Connected vs Not Connected</div>
                    <div className="font-medium">
                      {toMetricNumber(leadMetrics.connected_followups) ?? 0} · {toMetricNumber(leadMetrics.not_connected_count) ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Avg Follow-up Gap</div>
                    <div className="font-medium">{formatMetricDays(leadMetrics.avg_days_between_followups)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Time Spent by Team</div>
                    <div className="font-medium">{formatMetricMinutes(leadMetrics.total_time_spent_seconds)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Days to First Contact</div>
                    <div className="font-medium">{formatMetricDays(leadMetrics.days_to_first_contact)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Days to Conversion</div>
                    <div className="font-medium">
                      {lead?.status === 'Converted'
                        ? formatMetricDays(leadMetrics.days_to_conversion)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Reopen Count</div>
                    <div className="font-medium">{toMetricNumber(leadMetrics.reopen_count) ?? 0}</div>
                  </div>
                </div>
              )}
              <div className="text-xs text-neutral-500 leading-relaxed">
                Follow-ups reflect context, not pressure. Avg follow-up gap varies by lead type.
                High time spent doesn’t always mean high intent. Reopen count often signals an evolving scope,
                not a failure.
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('enrichment', 'events-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Events
              </button>
              {!(enrichment?.events?.length ?? 0) && (
                <div className="text-sm text-neutral-500">No events added yet.</div>
              )}
              {!!(enrichment?.events?.length ?? 0) && (
                <div className="overflow-x-auto">
                  {(() => {
                    const slotOrder: Record<string, number> = { morning: 0, day: 1, evening: 2 }
                    const sortedEvents = [...(enrichment.events as LeadEventRow[])].sort(
                      (a, b) => {
                      const aDate = toDateOnly(a.event_date)
                      const bDate = toDateOnly(b.event_date)
                      if (aDate !== bDate) return aDate.localeCompare(bDate)
                      const aSlot = slotOrder[(a.slot || '').toLowerCase()] ?? 9
                      const bSlot = slotOrder[(b.slot || '').toLowerCase()] ?? 9
                      if (aSlot !== bSlot) return aSlot - bSlot
                      return 0
                      }
                    )

                    return (
                      <table className="w-full text-sm text-neutral-700">
                        <thead>
                          <tr className="text-xs uppercase tracking-widest text-neutral-500">
                            <th className="py-1 text-left font-medium">Date</th>
                            <th className="py-1 text-left font-medium">Event</th>
                            <th className="py-1 text-left font-medium">Pax</th>
                            <th className="py-1 text-left font-medium">Venue</th>
                            <th className="py-1 text-left font-medium">City</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedEvents.map((event, idx) => {
                            const prev = sortedEvents[idx - 1]
                            const currentDate = toDateOnly(event.event_date)
                            const prevDate = prev ? toDateOnly(prev.event_date) : null
                            const showDate = currentDate && currentDate !== prevDate
                            return (
                              <tr key={event.id} className="border-t border-[var(--border)]">
                                <td className="py-2 pr-3 align-top text-neutral-800">
                                  {showDate ? formatDateShort(event.event_date) : ''}
                                </td>
                                <td className="py-2 pr-3 align-top text-neutral-800">
                                  {sanitizeText(event.event_type) || '—'}
                                </td>
                                <td className="py-2 pr-3 align-top text-neutral-800">
                                  {event.pax ?? '—'}
                                </td>
                                <td className="py-2 pr-3 align-top text-neutral-800">
                                  {sanitizeText(event.venue) || '—'}
                                </td>
                                <td className="py-2 align-top text-neutral-800">
                                  {sanitizeText(event.city_name) || sanitizeText(event.city) || '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('negotiation', 'pricing-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Pricing
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-700">
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Amount Quoted</div>
                  <div className="font-medium">
                    {lead.amount_quoted != null && lead.amount_quoted !== '' ? formatINR(lead.amount_quoted) : 'Not quoted yet'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Client Budget</div>
                  <div className="font-medium">
                    {lead.client_budget_amount != null && lead.client_budget_amount !== '' ? formatINR(lead.client_budget_amount) : 'Not provided'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Discounted Price</div>
                  <div className="font-medium">
                    {lead.discounted_amount != null && lead.discounted_amount !== '' ? formatINR(lead.discounted_amount) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Client Offer</div>
                  <div className="font-medium">
                    {lead.client_offer_amount != null && lead.client_offer_amount !== '' ? formatINR(lead.client_offer_amount) : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('notes', 'notes-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Notes
              </button>
              {notes.length === 0 && !notesError && (
                <div className="text-sm text-neutral-500">No notes yet.</div>
              )}
              {notesError && (
                <div className="text-sm text-red-600">{notesError}</div>
              )}
              {!notesError && notes.length > 0 && (
                <div className="space-y-2 text-sm">
                  {notes.slice(-3).reverse().map(n => (
                    <div
                      key={n.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                    >
                      <div className="text-neutral-800 whitespace-pre-line">{sanitizeText(n.note_text)}</div>
                      <div className="text-xs text-neutral-500">
                        {formatDateTime(n.created_at)}
                        {n.status_at_time ? ` • ${n.status_at_time}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
                <textarea
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={e => {
                    const value = e.target.value
                    setNoteText(value)
                    if (notesError && value.trim().length <= 1000) {
                      setNotesError(null)
                    }
                  }}
                  autoComplete="off"
                  maxLength={1000}
                  rows={1}
                  style={{ resize: 'none', maxHeight: 72 }}
                  onInput={e => {
                    const target = e.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 72)}px`
                  }}
                />
                <button
                  className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                  disabled={isAddingNote}
                  onClick={async () => {
                    const trimmed = noteText.trim()
                    if (!trimmed) return
                    if (trimmed.length > 1000) {
                      setNotesError('Note must be 1000 characters or fewer')
                      return
                    }
                    setIsAddingNote(true)
                    setNotesError(null)
                    const res = await apiFetch(`/api/leads/${id}/notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note_text: trimmed }),
                    })
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      setNotesError(err.error || 'Failed to add note')
                      setIsAddingNote(false)
                      return
                    }
                    const created = await res.json()
                    setNotes((prev: any) => [...prev, created])
                    setNoteText('')
                    setIsAddingNote(false)
                  }}
                >
                  {isAddingNote ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-4 break-inside-avoid mb-6`}>
              <button
                type="button"
                onClick={() => openTabSection('activity', 'activity-section')}
                className="text-sm font-semibold text-neutral-800 hover:text-neutral-900 hover:underline"
              >
                Recent Activity
              </button>
              {activitiesLoading && (
                <div className="text-sm text-neutral-500">Loading activity…</div>
              )}
              {!activitiesLoading && activities.length === 0 && (
                <div className="text-sm text-neutral-500">No recent activity yet.</div>
              )}
              {!activitiesLoading && activities.length > 0 && (
                <div className="space-y-2 text-sm">
                  {activities.slice(0, 5).map((activity: any) => (
                    <div
                      key={activity.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                    >
                      {(() => {
                        const display = formatActivityDetails(activity)
                        const actor = getActivityActor(activity)
                        return (
                          <>
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
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-neutral-500">See full Activity in the Activity tab.</div>
            </div>
          </div>
        )}

        {/* ===================== CONTACT ===================== */}
        {activeTab === 'contact' && (
          <div id="contact-section" className={`${cardClass} p-6 space-y-5`}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Contact Information</h3>

              {!contactEditMode ? (
                <button
                  className={buttonOutline}
                  onClick={() => {
                    setContactSnapshot(contactForm)
                    setContactErrors({})
                    setContactNotice(null)
                    setContactShake(false)
                    activateEditSection('contact')
                  }}
                >
                  Edit
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {contactNotice && <div className={errorTextClass}>{contactNotice}</div>}
                  <div className="flex gap-2">
                    <button
                      className={buttonPrimary}
                      onClick={async () => {
                        setContactNotice(null)
                        const contactNextErrors: Record<string, string> = {}
                        const needsSourceName = ['Reference', 'Direct Call', 'WhatsApp'].includes(contactForm?.source)
                        if (needsSourceName && !contactForm?.source_name?.trim()) {
                          contactNextErrors.source_name = 'Name is required for this source'
                        }
                        if (!contactForm?.name || !contactForm.name.trim()) {
                          contactNextErrors.name = 'Name is required'
                        }
                        const primaryPhone = normalizePhone(contactForm.primary_phone)
                        if (!primaryPhone) {
                          contactNextErrors.primary_phone = 'Valid phone number required'
                        }

                        const optionalPhoneFields = [
                          'phone_secondary',
                          'bride_phone_primary',
                          'bride_phone_secondary',
                          'groom_phone_primary',
                          'groom_phone_secondary',
                        ] as const

                        optionalPhoneFields.forEach(field => {
                          const value = contactForm?.[field]
                          if (value && !isValidPhone(value)) {
                            contactNextErrors[field] = 'Invalid phone number'
                          }
                        })

                        const emailFields = ['email', 'bride_email', 'groom_email'] as const
                        const normalizedEmails: Record<string, string> = {}
                        const nextWarnings: Record<string, string> = {}
                        emailFields.forEach(field => {
                          const value = contactForm?.[field]
                          if (value) {
                            const { valid, normalized, warning } = validateEmail(value)
                            if (!valid) {
                              contactNextErrors[field] = 'Please enter a valid email address'
                            } else {
                              normalizedEmails[field] = normalized
                              if (warning) {
                                nextWarnings[field] = warning
                              }
                            }
                          }
                        })

                        const instagramFields = ['instagram', 'bride_instagram', 'groom_instagram'] as const
                        instagramFields.forEach(field => {
                          const value = contactForm?.[field]
                          if (value && !isValidInstagramUsername(value)) {
                            contactNextErrors[field] = 'Enter a valid Instagram username'
                          }
                        })

                        if (Object.keys(contactNextErrors).length) {
                          setContactErrors(contactNextErrors)
                          setContactWarnings({})
                          setContactShake(true)
                          setTimeout(() => setContactShake(false), 300)
                          requestAnimationFrame(scrollToFirstError)
                          return
                        }
                        setContactErrors({})
                        setContactWarnings(nextWarnings)

                        if (Object.keys(normalizedEmails).length) {
                          setContactForm((p: any) => ({
                            ...p,
                            ...normalizedEmails,
                          }))
                        }

                        const payload = {
                          ...contactForm,
                          name: formatName(contactForm.name),
                          primary_phone: primaryPhone,
                          phone_secondary: normalizePhone(contactForm.phone_secondary),
                          email: normalizedEmails.email || null,
                          instagram: contactForm.instagram
                            ? normalizeInstagramInput(contactForm.instagram)
                            : null,
                          source: contactForm.source || 'Unknown',
                          source_name: contactForm.source_name || null,

                          bride_name: formatName(contactForm.bride_name || ''),
                          bride_phone_primary: normalizePhone(contactForm.bride_phone_primary),
                          bride_phone_secondary: normalizePhone(contactForm.bride_phone_secondary),
                          bride_email: normalizedEmails.bride_email || null,
                          bride_instagram: contactForm.bride_instagram
                            ? normalizeInstagramInput(contactForm.bride_instagram)
                            : null,

                          groom_name: formatName(contactForm.groom_name || ''),
                          groom_phone_primary: normalizePhone(contactForm.groom_phone_primary),
                          groom_phone_secondary: normalizePhone(contactForm.groom_phone_secondary),
                          groom_email: normalizedEmails.groom_email || null,
                          groom_instagram: contactForm.groom_instagram
                            ? normalizeInstagramInput(contactForm.groom_instagram)
                            : null,
                        }

                        const doSave = async () => {
                          const res = await apiFetch(`/api/leads/${id}/contact`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          })
                          const result = await res.json().catch(() => null)
                          if (!res.ok) {
                            if (result?.field) {
                              setContactErrors({ [result.field]: result.error || 'Please enter a valid email address' })
                              setContactShake(true)
                              setTimeout(() => setContactShake(false), 300)
                              requestAnimationFrame(scrollToFirstError)
                            } else {
                              setContactNotice(result?.error || 'Failed to save contact info')
                            }
                            return
                          }

                          const updated = normalizeLeadSignals(result)
                          setLead((prev: any) => ({ ...prev, ...updated }))

                          setContactForm({
                            name: updated.name ?? '',
                            primary_phone: updated.primary_phone ?? '',
                            phone_secondary: updated.phone_secondary ?? '',
                            email: updated.email ?? '',
                            instagram: extractInstagramUsername(updated.instagram),
                            source: updated.source ?? contactForm.source ?? '',
                            source_name: updated.source_name ?? contactForm.source_name ?? '',

                            bride_name: updated.bride_name ?? '',
                            bride_phone_primary: updated.bride_phone_primary ?? '',
                            bride_phone_secondary: updated.bride_phone_secondary ?? '',
                            bride_email: updated.bride_email ?? '',
                            bride_instagram: extractInstagramUsername(updated.bride_instagram),

                            groom_name: updated.groom_name ?? '',
                            groom_phone_primary: updated.groom_phone_primary ?? '',
                            groom_phone_secondary: updated.groom_phone_secondary ?? '',
                            groom_email: updated.groom_email ?? '',
                            groom_instagram: extractInstagramUsername(updated.groom_instagram),
                          })

                          setActiveEditSection(null)
                        }

                        const duplicates = await checkContactDuplicates({
                          leadId: Number(id),
                          phones: [
                            primaryPhone,
                            normalizePhone(contactForm.phone_secondary),
                            normalizePhone(contactForm.bride_phone_primary),
                            normalizePhone(contactForm.bride_phone_secondary),
                            normalizePhone(contactForm.groom_phone_primary),
                            normalizePhone(contactForm.groom_phone_secondary),
                          ].filter(Boolean) as string[],
                          emails: [
                            normalizedEmails.email,
                            normalizedEmails.bride_email,
                            normalizedEmails.groom_email,
                          ].filter(Boolean) as string[],
                          instagrams: [
                            payload.instagram,
                            payload.bride_instagram,
                            payload.groom_instagram,
                          ].filter(Boolean) as string[],
                        })

                        if (hasDuplicates(duplicates)) {
                          setContactDuplicateData(duplicates)
                          setPendingContactSave(() => doSave)
                          setShowContactDuplicate(true)
                          return
                        }

                        setContactDuplicateData(null)
                        await doSave()
                      }}
                    >
                      Save
                    </button>

                    <button
                      className={buttonOutline}
                      onClick={() => {
                        setContactForm(contactSnapshot ?? contactForm)
                        setContactErrors({})
                        setContactNotice(null)
                        setContactShake(false)
                        cancelContactEdit()
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

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
        )}

        {/* ===================== ACTIVITY ===================== */}
        {activeTab === 'activity' && (
          <div id="activity-section" className={`${cardClass} p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Activity</h3>
              <button
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                onClick={() => setActivityOpen(prev => !prev)}
              >
                {activityOpen ? 'Hide' : 'Show'}
              </button>
            </div>

            {activityOpen && (
              <>
                {activitiesLoading && (
                  <div className="text-sm text-neutral-500">Loading activity…</div>
                )}
                {!activitiesLoading && activitiesError && (
                  <div className="text-sm text-red-600">{activitiesError}</div>
                )}
                {!activitiesLoading && !activitiesError && activities.length === 0 && (
                  <div className="text-sm text-neutral-500">No activity yet.</div>
                )}

                {!activitiesLoading && !activitiesError && activities.length > 0 && (
                  <div className="space-y-2 text-sm">
                    {activities.map((activity: any) => (
                      <div
                        key={activity.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      >
                        {(() => {
                          const display = formatActivityDetails(activity)
                          const actor = getActivityActor(activity)
                          return (
                            <>
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
                            </>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===================== NOTES ===================== */}
        {activeTab === 'notes' && (
          <div id="notes-section" className={`${cardClass} p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Notes</h3>
            </div>

            <div className="space-y-3">
              {notes.length === 0 && !notesError && (
                <div className="text-sm text-neutral-500">
                  No notes yet. Add the first update from your conversation.
                </div>
              )}
              {notesError && (
                <div className="text-sm text-red-600">{notesError}</div>
              )}
              {notes.map(n => (
                <div key={n.id} className="rounded-lg border border-[var(--border)] bg-white p-3 text-sm">
                  {editingNoteId === n.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                        rows={3}
                        autoComplete="off"
                        maxLength={1000}
                        value={editingNoteText}
                        onChange={e => {
                          const value = e.target.value
                          setEditingNoteText(value)
                          if (notesError && value.trim().length <= 1000) {
                            setNotesError(null)
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          className={buttonOutline}
                          disabled={isSavingNote}
                          onClick={() => {
                            setEditingNoteId(null)
                            setEditingNoteText('')
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className={buttonPrimary}
                          disabled={isSavingNote}
                          onClick={async () => {
                            const trimmed = editingNoteText.trim()
                            if (!trimmed) return
                            if (trimmed.length > 1000) {
                              setNotesError('Note must be 1000 characters or fewer')
                              return
                            }
                            setIsSavingNote(true)
                            const res = await apiFetch(`/api/leads/${id}/notes/${n.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ note_text: trimmed }),
                            })
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}))
                              setNotesError(err.error || 'Failed to update note')
                              setIsSavingNote(false)
                              return
                            }
                            const updated = await res.json()
                            setNotes((prev: any) => prev.map((note: any) => (note.id === updated.id ? updated : note)))
                            setEditingNoteId(null)
                            setEditingNoteText('')
                            setIsSavingNote(false)
                          }}
                        >
                          {isSavingNote ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-neutral-800 whitespace-pre-line">{sanitizeText(n.note_text)}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                        <span>
                          {formatDateTime(n.created_at)}
                          {n.status_at_time ? ` • Status: ${n.status_at_time}` : ''}
                        </span>
                        <button
                          className="text-neutral-600 hover:text-neutral-900"
                          onClick={() => {
                            setNotesError(null)
                            setEditingNoteId(n.id)
                            setEditingNoteText(n.note_text)
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                rows={3}
                placeholder="Add a Note…"
                autoComplete="off"
                value={noteText}
                onChange={e => {
                  const value = e.target.value
                  setNoteText(value)
                  if (notesError && value.trim().length <= 1000) {
                    setNotesError(null)
                  }
                }}
                maxLength={1000}
              />
              <div className="flex justify-end">
                <button
                  className={buttonPrimary}
                  disabled={isAddingNote}
                  onClick={async () => {
                    const trimmed = noteText.trim()
                    if (!trimmed) return
                    if (trimmed.length > 1000) {
                      setNotesError('Note must be 1000 characters or fewer')
                      return
                    }
                    setIsAddingNote(true)
                    setNotesError(null)
                    const res = await apiFetch(`/api/leads/${id}/notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note_text: trimmed }),
                    })
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      setNotesError(err.error || 'Failed to add note')
                      setIsAddingNote(false)
                      return
                    }
                    const created = await res.json()
                    setNotes((prev: any) => [...prev, created])
                    setNoteText('')
                    setIsAddingNote(false)
                  }}
                >
                  {isAddingNote ? 'Adding…' : 'Add Note'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== ENRICHMENT ===================== */}
        {activeTab === 'enrichment' && enrichment && (
          <div className="space-y-4">
          <div id="details-section" className={`${cardClass} p-4 space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Lead Details</h3>

              {!editMode ? (
                <LockHint enabled={isConverted}>
                  <button
                    onClick={() => {
                      setEnrichmentErrors({})
                      setEnrichmentNotice(null)
                      setEnrichmentShake(false)
                      setImportantTouched(false)
                      activateEditSection('details')
                    }}
                    className={buttonOutline}
                    disabled={isConverted}
                  >
                    Edit
                  </button>
                </LockHint>
              ) : (
                <div className="flex flex-col gap-2">
                  {enrichmentNotice && (
                    <div className={errorTextClass}>{enrichmentNotice}</div>
                  )}
                  <div className="flex gap-2">
                    <LockHint enabled={isConverted}>
                      <button
                      onClick={async () => {
                        setEnrichmentNotice(null)
                        const nextErrors: Record<string, string> = {}
                        if (!formData?.event_type) nextErrors.event_type = 'Required'
                        if (selectedCities.length === 0) nextErrors.cities = 'Add at least one city'
                        const primaryCount = selectedCities.filter(c => c.is_primary).length
                        if (primaryCount !== 1) nextErrors.primary_city = 'Select exactly one primary city'
                        if (Object.keys(nextErrors).length) {
                          setEnrichmentErrors(nextErrors)
                          setEnrichmentShake(true)
                          setTimeout(() => setEnrichmentShake(false), 300)
                          requestAnimationFrame(scrollToFirstError)
                          return
                        }
                        setEnrichmentErrors({})

                        const enrichmentRes = await apiFetch(`/api/leads/${id}/enrichment`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            event_type: formData.event_type,
                            is_destination: isInternational ? true : formData.is_destination,
                            client_budget_amount: formData.client_budget_amount,
                            amount_quoted: formData.amount_quoted,
                            potential: toYesNo(!!formData.potential),
                            important: toYesNo(!!formData.important),
                            coverage_scope: formData.coverage_scope ?? 'Both Sides',
                            ...(userRole === 'admin'
                              ? { assigned_user_id: formData.assigned_user_id ?? null }
                              : {}),
                          }),
                        })
                        if (!enrichmentRes.ok) {
                          const err = await enrichmentRes.json().catch(() => ({}))
                          setEnrichmentNotice(err?.error || 'Failed to save lead details')
                          return
                        }

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
                          setEnrichmentNotice(err?.error || 'Failed to save cities')
                          return
                        }

                        const refreshedRaw = await apiFetch(
                          `/api/leads/${id}/enrichment`
                        ).then(r => r.json())
                        const refreshed = normalizeLeadSignals(refreshedRaw)

                        setEnrichment(refreshed)
                        setSelectedCities(Array.isArray(refreshedRaw.cities) ? refreshedRaw.cities : [])
                        setFormData({
                          event_type: refreshed.event_type,
                          is_destination: refreshed.is_destination,
                          client_budget_amount: refreshed.client_budget_amount,
                          amount_quoted: refreshed.amount_quoted,
                          potential: !!refreshed.potential,
                          important: !!refreshed.important,
                          coverage_scope: refreshed.coverage_scope ?? 'Both Sides',
                          assigned_user_id:
                            userRole === 'admin'
                              ? (formData.assigned_user_id ?? lead?.assigned_user_id ?? null)
                              : (lead?.assigned_user_id ?? null),
                        })
                        setPricingForm({
                          client_offer_amount: refreshed.client_offer_amount ?? '',
                          discounted_amount: refreshed.discounted_amount ?? '',
                        })
                        pricingDraftRef.current = {
                          client_offer_amount: refreshed.client_offer_amount ?? '',
                          discounted_amount: refreshed.discounted_amount ?? '',
                        }
                        setPricingLogs(Array.isArray(refreshed.pricing_logs) ? refreshed.pricing_logs : [])
                        setLead((prev: any) =>
                          prev
                            ? {
                                ...prev,
                                event_type: refreshed.event_type,
                                is_destination: refreshed.is_destination,
                                coverage_scope: refreshed.coverage_scope ?? 'Both Sides',
                                client_budget_amount: refreshed.client_budget_amount,
                                amount_quoted: refreshed.amount_quoted,
                                potential: refreshed.potential,
                                important: refreshed.important,
                                assigned_user_id:
                                  userRole === 'admin'
                                    ? (formData.assigned_user_id ?? prev?.assigned_user_id ?? null)
                                    : prev?.assigned_user_id ?? null,
                                assigned_user_name:
                                  userRole === 'admin'
                                    ? (assignableUsers.find(u => u.id === formData.assigned_user_id)?.name ??
                                        prev?.assigned_user_name ??
                                        null)
                                    : prev?.assigned_user_name ?? null,
                                assigned_user_nickname:
                                  userRole === 'admin'
                                    ? (assignableUsers.find(u => u.id === formData.assigned_user_id)?.nickname ??
                                        prev?.assigned_user_nickname ??
                                        null)
                                    : prev?.assigned_user_nickname ?? null,
                              }
                            : prev
                        )
                        setActiveEditSection(null)
                        await attemptPendingStatusChange(msg => setEnrichmentNotice(msg))
                      }}

                      className={buttonPrimary}
                      disabled={isConverted}
                      >
                        Save
                      </button>
                    </LockHint>

                    <button
                      onClick={() => {
                        cancelDetailsEdit()
                      }}
                      className={buttonOutline}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Event Name{editMode ? ' *' : ''}</div>
                {!editMode ? (
                  <div>{enrichment.event_type}</div>
                ) : (
                  <>
                    <select
                      className={`${withError(inputClass, !!enrichmentErrors.event_type)} ${enrichmentErrors.event_type && enrichmentShake ? 'shake' : ''}`}
                      value={formData.event_type}
                      onChange={e => {
                        setFormData({ ...formData, event_type: e.target.value })
                        if (enrichmentErrors.event_type) {
                          setEnrichmentErrors((prev: any) => {
                            const next = { ...prev }
                            delete next.event_type
                            return next
                          })
                        }
                      }}
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
                    {enrichmentErrors.event_type && (
                      <div className={errorTextClass}>{enrichmentErrors.event_type}</div>
                    )}
                  </>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">
                  Coverage Scope
                </div>
                {!editMode ? (
                  <div>{enrichment.coverage_scope || 'Both Sides'}</div>
                ) : (
                  <div className="inline-flex rounded-full border border-[var(--border)] bg-white p-1 text-xs font-medium">
                    {COVERAGE_SCOPES.map(scope => (
                      <button
                        key={scope}
                        type="button"
                        className={`px-3 py-1 rounded-full transition ${
                          (formData.coverage_scope || 'Both Sides') === scope
                            ? 'bg-neutral-900 text-white shadow-sm'
                            : 'text-neutral-700 hover:bg-[var(--surface-muted)]'
                        }`}
                        onClick={() => {
                          setFormData((prev: any) => ({
                            ...prev,
                            coverage_scope: scope,
                          }))
                          updateCoverageScope(scope)
                        }}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Wedding Type</div>

                {!editMode ? (
                  <div>
                    {enrichment.is_destination ? 'Destination' : 'Local'}
                  </div>
                ) : (
                  <>
                    <select
                      className={inputClass}
                      disabled={isInternational}
                      value={
                        isInternational
                          ? 'Destination'
                          : formData.is_destination
                            ? 'Destination'
                            : 'Local'
                      }
                      onChange={e =>
                        setFormData({
                          ...formData,
                          is_destination: e.target.value === 'Destination',
                        })
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
                  </>
                )}
              </div>

              <div id="cities-section" className="text-sm space-y-2">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  {selectedCities.length <= 1 ? `City${editMode ? ' *' : ''}` : `Cities${editMode ? ' *' : ''}`}
                </div>
                {editMode && (enrichmentErrors.cities || enrichmentErrors.primary_city) && (
                  <div className={errorTextClass}>
                    {enrichmentErrors.cities || enrichmentErrors.primary_city}
                  </div>
                )}

                {!editMode && (
                  <div className="space-y-1 w-full">
                    {selectedCities.length === 0 && (
                      <div className="text-sm text-neutral-400">
                        No cities added yet.
                        <br />
                        <span className="text-xs">
                          Add at least one city to proceed.
                        </span>
                      </div>
                    )}
                    {selectedCities.map(c => (
                      <div key={c.id || c.city_id}>
                        {c.name}, {c.state}
                        {c.country && c.country !== 'India' ? `, ${c.country}` : ''}
                        {c.is_primary && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {editMode && (
                  <div className="space-y-2">
                    {selectedCities.map(c => (
                      <div
                        key={c.id || c.city_id}
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
                                is_primary: (p.id || p.city_id) === (c.id || c.city_id)
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

                        {c.is_primary && (
                          <span className="text-xs text-neutral-500">
                            Primary city
                          </span>
                        )}
                      </div>
                    ))}

                    <div className="relative">
                      <input
                        className={`${withError(inputClass, !!enrichmentErrors.cities)} ${enrichmentErrors.cities && enrichmentShake ? 'shake' : ''}`}
                        placeholder="Type City Name…"
                        value={cityQuery}
                        autoComplete="off"
                        onChange={e => {
                          setCityQuery(e.target.value)
                          setShowSuggestions(true)
                          if (enrichmentErrors.cities) {
                            setEnrichmentErrors((prev: any) => {
                              const next = { ...prev }
                              delete next.cities
                              return next
                            })
                          }
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
                              const alreadySelected = selectedCities.some(
                                s => (s.id || s.city_id) === c.id
                              )
                              return !alreadySelected && (name.includes(q) || state.includes(q) || country.includes(q))
                            })
                            .slice(0, 8)
                            .map(c => (
                              <div
                                key={c.id}
                                className="px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer"
                                onClick={() => {
                                  addCity({ ...c, city_id: c.id })
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
                            list="city-options"
                            value={pendingCity.name}
                            className={inputClass}
                            placeholder="City *"
                            autoComplete="off"
                            onChange={e => {
                              setPendingCity({ ...pendingCity, name: e.target.value })
                              if (enrichmentErrors.cities) {
                                setEnrichmentErrors((prev: any) => {
                                  const next = { ...prev }
                                  delete next.cities
                                  return next
                                })
                              }
                            }}
                          />
                          <datalist id="city-options">
                            {allCities.map(c => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </datalist>

                          {pendingCity.country === 'India' ? (
                            <select
                              className={inputClass}
                              value={pendingCity.state}
                              onChange={e => {
                                setPendingCity({ ...pendingCity, state: e.target.value })
                                if (enrichmentErrors.cities) {
                                  setEnrichmentErrors((prev: any) => {
                                    const next = { ...prev }
                                    delete next.cities
                                    return next
                                  })
                                }
                              }}
                            >
                              <option value="">State *</option>
                              {INDIA_STATES_UT.map(state => (
                                <option key={state} value={state}>{state}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <input
                                list="state-options"
                                className={inputClass}
                                placeholder="State *"
                                value={pendingCity.state}
                                autoComplete="off"
                                onChange={e => {
                                  setPendingCity({ ...pendingCity, state: e.target.value })
                                  if (enrichmentErrors.cities) {
                                    setEnrichmentErrors((prev: any) => {
                                      const next = { ...prev }
                                      delete next.cities
                                      return next
                                    })
                                  }
                                }}
                              />
                              <datalist id="state-options">
                                {[]}
                              </datalist>
                            </>
                          )}

                          <input
                            list="country-options"
                            className={inputClass}
                            placeholder="Country"
                            value={pendingCity.country}
                            autoComplete="off"
                            onChange={e =>
                              setPendingCity({ ...pendingCity, country: e.target.value, state: '' })
                            }
                          />
                          <datalist id="country-options">
                            {[]}
                          </datalist>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              className={buttonOutline}
                              onClick={() => {
                                setPendingCity(null)
                                setEnrichmentErrors((prev: any) => {
                                  const next = { ...prev }
                                  delete next.cities
                                  return next
                                })
                                setEnrichmentShake(false)
                              }}
                            >
                              Cancel
                            </button>

                            <button
                              className={buttonPrimary}
                              onClick={() => {
                                if (!pendingCity.name.trim() || !pendingCity.state.trim()) {
                                  setEnrichmentErrors({
                                    ...enrichmentErrors,
                                    cities: 'City and state are required',
                                  })
                                  return
                                }

                                addCity(pendingCity)
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
                )}

              </div>

              <div id="amount-quoted-field">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Amount Quoted</div>
                {!editMode ? (
                  <div>
                    {enrichment.amount_quoted != null && enrichment.amount_quoted !== ''
                      ? formatINR(enrichment.amount_quoted)
                      : 'Not quoted yet'}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="10000"
                    className={`${withError(inputClass, !!enrichmentErrors.amount_quoted)} ${enrichmentErrors.amount_quoted && enrichmentShake ? 'shake' : ''}`}
                    placeholder="Enter Amount in ₹ (e.g. 1,25,000)"
                    value={formData.amount_quoted ?? ''}
                    autoComplete="off"
                    onChange={e => {
                      setFormData({ ...formData, amount_quoted: e.target.value })
                      if (enrichmentErrors.amount_quoted && e.target.value) {
                        setEnrichmentErrors((prev: any) => {
                          const next = { ...prev }
                          delete next.amount_quoted
                          return next
                        })
                      }
                    }}
                    onBlur={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const normalized = normalizeLakhInput(raw)
                      setFormData({ ...formData, amount_quoted: normalized })
                    }}
                  />
                )}
                {enrichmentErrors.amount_quoted && (
                  <div className={errorTextClass}>{enrichmentErrors.amount_quoted}</div>
                )}
                {editMode && formData.amount_quoted && (
                  <div className="mt-1 text-xs text-neutral-500">
                    {formatINR(formData.amount_quoted)}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-1">Client Budget</div>
                {!editMode ? (
                  <div>
                    {enrichment.client_budget_amount != null && enrichment.client_budget_amount !== ''
                      ? formatINR(enrichment.client_budget_amount)
                      : 'Not provided'}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="10000"
                    className={withError(inputClass, false)}
                    placeholder="Enter Amount in ₹ (e.g. 5,00,000)"
                    value={formData.client_budget_amount ?? ''}
                    autoComplete="off"
                    onChange={e => {
                      setFormData({ ...formData, client_budget_amount: e.target.value })
                    }}
                    onBlur={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const normalized = normalizeLakhInput(raw)
                      setFormData({ ...formData, client_budget_amount: normalized })
                    }}
                  />
                )}
                {editMode && formData.client_budget_amount && (
                  <div className="mt-1 text-xs text-neutral-500">
                    {formatINR(formData.client_budget_amount)}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  Potential
                </div>
                {!editMode ? (
                  <div className="text-sm text-neutral-700">
                    {enrichment.potential ? 'Yep, Yohoo' : 'Not Yet'}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <LockHint enabled={isConverted}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(formData.potential)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          formData.potential ? 'bg-emerald-600' : 'bg-neutral-300'
                        } ${isConverted ? 'opacity-60' : ''}`}
                        onClick={() => {
                          if (isConverted) return
                          setFormData((prev: any) => ({
                            ...prev,
                            potential: !prev.potential,
                          }))
                        }}
                        disabled={isConverted}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            formData.potential ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </LockHint>
                    <span className="text-xs text-neutral-500">
                      Couple seems inclined towards us
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  Important
                </div>
                {!editMode ? (
                  <div className="text-sm text-neutral-700">
                    {enrichment.important ? 'Hell Yeah' : 'Every Couple is Important'}
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <LockHint enabled={isConverted}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(formData.important)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          formData.important ? 'bg-emerald-600' : 'bg-neutral-300'
                        } ${isConverted ? 'opacity-60' : ''}`}
                        onClick={() => {
                          if (isConverted) return
                          setImportantTouched(true)
                          setFormData((prev: any) => ({
                            ...prev,
                            important: !prev.important,
                          }))
                        }}
                        disabled={isConverted}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            formData.important ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </LockHint>
                    <div className="space-y-1">
                      <div className="text-xs text-neutral-500">Wedding seems cool</div>
                      {shouldSuggestImportant && (
                        <div className="text-xs text-amber-600">Suggested for destination / international lead</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  Assigned To
                </div>
                {!editMode || userRole !== 'admin' ? (
                  <div className="text-sm text-neutral-700">{assignedUserDisplay}</div>
                ) : (
                  <select
                    className={inputClass}
                    value={formData.assigned_user_id ?? ''}
                    onChange={e => {
                      const value = e.target.value
                      setFormData({ ...formData, assigned_user_id: value ? Number(value) : null })
                    }}
                  >
                    <option value="">Unassigned</option>
                    {assignableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {getUserDisplayName(u) || u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* ===================== EVENTS ===================== */}
          <div className={`${cardClass} p-4 space-y-4`}>
            <div id="events-section" className="space-y-3">
              {eventNotice && <div className={errorTextClass}>{eventNotice}</div>}
              {eventDeleteError && <div className={errorTextClass}>{eventDeleteError}</div>}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-semibold">Events</h4>
                {!eventsEditMode ? (
                  <LockHint enabled={isConverted}>
                    <button
                      className={buttonOutline}
                      onClick={startEventsEdit}
                      disabled={isConverted}
                    >
                      Edit
                    </button>
                  </LockHint>
                ) : (
                  <LockHint enabled={isConverted}>
                    <button
                      className={buttonOutline}
                      onClick={() => cancelEventsEdit()}
                      disabled={isSavingEvents || isConverted}
                    >
                      Cancel
                    </button>
                  </LockHint>
                )}
              </div>

              {!eventsEditMode && (enrichment.events?.length ?? 0) === 0 && (
                <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm space-y-1">
                  <div className="font-medium text-neutral-700">No events added yet</div>
                  <div className="text-neutral-500">
                    Add all wedding functions (Haldi, Mehendi, Wedding, Reception, etc.).
                  </div>
                  <div className="text-xs text-neutral-500">
                    Each city should have at least one linked event before moving ahead.
                  </div>
                </div>
              )}

              {!eventsEditMode &&
                [...(enrichment.events || [])]
                  .sort((a: LeadEventRow, b: LeadEventRow) => {
                    const d1 = a.event_date ? new Date(a.event_date).getTime() : 0
                    const d2 = b.event_date ? new Date(b.event_date).getTime() : 0
                    if (d1 !== d2) return d1 - d2
                    return (SLOT_ORDER[a.slot || ''] ?? 99) - (SLOT_ORDER[b.slot || ''] ?? 99)
                  })
                  .map((event: LeadEventRow) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-neutral-200/70 bg-neutral-50 p-4 text-sm shadow-sm"
                    >
                      <div className="min-w-0 font-semibold text-neutral-900">
                        {sanitizeText(event.event_type) || '—'}
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-5 text-sm text-neutral-700">
                        <div className="space-y-1">
                          <div className="text-xs text-neutral-500">Date</div>
                          <div className="leading-snug">{formatDateDisplay(event.event_date) || '—'}</div>
                          <div className="pt-2 text-xs text-neutral-500">Venue</div>
                          <div className="leading-snug">{sanitizeText(event.venue) || '—'}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-neutral-500">Slot</div>
                          <div className="leading-snug">{event.slot || '—'}</div>
                          <div className="pt-2 text-xs text-neutral-500">Time</div>
                          <div>
                            {event.start_time || event.end_time
                              ? `${formatTimeDisplay(event.start_time)}${event.end_time ? ` – ${formatTimeDisplay(event.end_time)}` : ''}`
                              : '—'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-neutral-500">Pax</div>
                          <div className="leading-snug">{event.pax || '—'}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-neutral-500">City</div>
                          <div className="leading-snug">
                            {event.city_name
                              ? `${sanitizeText(event.city_name)}, ${sanitizeText(event.city_state)}`
                              : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-neutral-700">
                        <div className="text-xs text-neutral-500">Description</div>
                        <div className="whitespace-pre-line">
                          {event.description ? sanitizeText(event.description) : '—'}
                        </div>
                      </div>
                    </div>
                  ))}

              {eventsEditMode && (
                <div className="space-y-2">
                  {eventsDraft.map((row: LeadEventRow, index: number) => {
                    const rowKey = getEventRowKey(row, index)
                    const rowErrors = eventsDraftErrors[rowKey] || {}
                    const showSuggestions =
                      eventTypeSuggestRow === rowKey && (row.event_type || '').length > 0
                    const isEmptyRow = isEventRowEmpty(row)
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

                    return (
                      <div key={rowKey} className={`${softCardClass} p-3 border-neutral-400`}>
                        <div className="mb-2 flex justify-end">
                          <LockHint enabled={isConverted}>
                            <button
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                              disabled={isEmptyRow || isConverted}
                              onClick={() => {
                                if (isEmptyRow) return
                                setPendingEventDelete(rowKey)
                              }}
                            >
                              Delete
                            </button>
                          </LockHint>
                        </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm items-end">
                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-neutral-500">Date *</div>
                            <EventDateInput
                              className={`${withError(inputClass, !!rowErrors.event_date)} h-10`}
                              value={row.event_date || ''}
                              onChange={v => updateEventRow(index, { event_date: v }, 'event_date', rowKey)}
                            />
                            {rowErrors.event_date && <div className={errorTextClass}>{rowErrors.event_date}</div>}
                          </div>

                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-neutral-500">Slot *</div>
                            <select
                              className={`${withError(inputClass, !!rowErrors.slot)} h-10`}
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
                                className={`${withError(inputClass, !!rowErrors.event_type)} h-10 ${!row.event_type ? 'text-neutral-300' : 'text-neutral-700'}`}
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
                                  const formatted = formatEventType(String(e.target.value || ''))
                                  if (formatted && formatted !== row.event_type) {
                                    updateEventRow(index, { event_type: formatted }, 'event_type', rowKey)
                                  }
                                  setEventTypeSuggestRow(null)
                                }}
                              />
                              {showSuggestions && (
                                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                                  {EVENT_TYPES
                                    .filter(t => t.toLowerCase().includes(String(row.event_type || '').toLowerCase()))
                                    .map(t => (
                                      <div
                                        key={t}
                                        className="px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                          updateEventRow(
                                            index,
                                            {
                                              event_type: t,
                                              pax: row.pax ? row.pax : suggestedPax(t),
                                            },
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
                                      const formatted = formatEventType(String(row.event_type || ''))
                                      updateEventRow(
                                        index,
                                        {
                                          event_type: formatted,
                                          pax: row.pax ? row.pax : suggestedPax(formatted),
                                        },
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
                              className={`${withError(inputClass, !!rowErrors.pax)} h-10`}
                              placeholder="Pax"
                              value={row.pax ?? ''}
                              autoComplete="off"
                              onChange={e => updateEventRow(index, { pax: e.target.value }, 'pax', rowKey)}
                            />
                            {rowErrors.pax && <div className={errorTextClass}>{rowErrors.pax}</div>}
                          </div>

                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-neutral-500">Venue</div>
                            <input
                              className={`${inputClass} h-10`}
                              placeholder="Venue"
                              value={row.venue || ''}
                              maxLength={150}
                              autoComplete="off"
                              onChange={e => updateEventRow(index, { venue: e.target.value }, 'venue', rowKey)}
                            />
                            {rowErrors.venue && <div className={errorTextClass}>{rowErrors.venue}</div>}
                          </div>

                          <div className="space-y-1 md:col-span-3">
                            <div className="text-xs text-neutral-500">City *</div>
                            <select
                              className={`${withError(inputClass, !!rowErrors.city_id)} h-10 ${!row.city_id ? 'text-neutral-400' : ''}`}
                              value={
                                row.city_id ??
                                selectedCities.find(c => c.is_primary)?.id ??
                                selectedCities.find(c => c.is_primary)?.city_id ??
                                ''
                              }
                              onChange={e => updateEventRow(index, { city_id: Number(e.target.value) }, 'city_id', rowKey)}
                            >
                              {selectedCities.map(c => (
                                <option key={c.id || c.city_id} value={c.id || c.city_id}>
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
                            className={`${inputClass}`}
                            placeholder="Event Description / Notes"
                            autoComplete="off"
                            value={row.description || ''}
                            onChange={e => updateEventRow(index, { description: e.target.value })}
                          />
                        </div>

                      </div>
                    )
                  })}

                  <div className="flex justify-end gap-2 pt-2">
                    <LockHint enabled={isConverted}>
                      <button
                        className={buttonPrimary}
                        onClick={saveEventsBulk}
                        disabled={isSavingEvents || isConverted}
                      >
                        {isSavingEvents ? 'Saving...' : 'Save'}
                      </button>
                    </LockHint>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        )}
        {/* ===================== NEGOTIATION ===================== */}
        {activeTab === 'negotiation' && (
          <div className="space-y-4">
            <div id="pricing-section" className={`${cardClass} p-4 space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-neutral-800">Pricing</div>
                {!pricingEditMode ? (
                  <LockHint
                    enabled={isConverted || !canEditNegotiation}
                    message={
                      !canEditNegotiation && !isConverted
                        ? 'Available when in Negotiation stage'
                        : undefined
                    }
                  >
                    <button
                      className={buttonOutline}
                      onClick={() => {
                        if (!canEditNegotiation || isConverted) return
                        setPricingForm({
                          client_offer_amount: enrichment?.client_offer_amount ?? '',
                          discounted_amount: enrichment?.discounted_amount ?? '',
                        })
                        pricingDraftRef.current = {
                          client_offer_amount: enrichment?.client_offer_amount ?? '',
                          discounted_amount: enrichment?.discounted_amount ?? '',
                        }
                        setPricingNotice(null)
                        activateEditSection('negotiation')
                        setPricingInputKey(k => k + 1)
                      }}
                      disabled={isConverted || !canEditNegotiation}
                    >
                      Edit
                    </button>
                  </LockHint>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      className={buttonPrimary}
                      disabled={isConverted}
                      onClick={async () => {
                        setPricingNotice(null)
                        const res = await apiFetch(`/api/leads/${id}/enrichment`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            client_offer_amount: pricingForm.client_offer_amount,
                            discounted_amount: pricingForm.discounted_amount,
                          }),
                        })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          setPricingNotice(err?.error || 'Failed to save pricing')
                          return
                        }
                        const refreshed = await apiFetch(
                          `/api/leads/${id}/enrichment`
                        ).then(r => r.json())
                        setEnrichment(refreshed)
                        setPricingLogs(Array.isArray(refreshed.pricing_logs) ? refreshed.pricing_logs : [])
                        setActiveEditSection(null)
                        void refreshActivities()
                      }}
                    >
                      Save
                    </button>
                    <button
                      className={buttonOutline}
                      onClick={() => {
                        cancelNegotiationEdit()
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">Amount Quoted</div>
                  <div className="text-sm text-neutral-700">
                    {lead?.amount_quoted != null && lead.amount_quoted !== ''
                      ? formatINR(lead.amount_quoted)
                      : 'Not quoted yet'}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">Client Budget</div>
                  <div className="text-sm text-neutral-700">
                    {lead?.client_budget_amount != null && lead.client_budget_amount !== ''
                      ? formatINR(lead.client_budget_amount)
                      : 'Not provided'}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">Discounted Amount Quoted</div>
                  {pricingEditMode ? (
                    <input
                      key={`discounted-${pricingInputKey}`}
                      type="text"
                      className={inputClass}
                      value={pricingForm.discounted_amount ?? ''}
                      autoComplete="off"
                      onChange={e => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                        const parts = cleaned.split('.')
                        const val = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0]
                        setPricingForm((prev: any) => ({ ...prev, discounted_amount: val }))
                      }}
                      onBlur={e => {
                        const raw = e.target.value.replace(/,/g, '')
                        const normalized = normalizeLakhInput(raw)
                        setPricingForm((prev: any) => ({ ...prev, discounted_amount: normalized }))
                      }}
                    />
                  ) : (
                    <div className="text-sm text-neutral-700">
                      {enrichment?.discounted_amount ? formatINR(enrichment.discounted_amount) : '—'}
                    </div>
                  )}
                  {pricingEditMode && pricingForm.discounted_amount && (
                    <div className="mt-1 text-xs text-neutral-500">
                      {formatINR(pricingForm.discounted_amount)}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">Client Offer Amount</div>
                  {pricingEditMode ? (
                    <input
                      key={`client-offer-${pricingInputKey}`}
                      type="text"
                      className={inputClass}
                      value={pricingForm.client_offer_amount ?? ''}
                      autoComplete="off"
                      onChange={e => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                        const parts = cleaned.split('.')
                        const val = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0]
                        setPricingForm((prev: any) => ({ ...prev, client_offer_amount: val }))
                      }}
                      onBlur={e => {
                        const raw = e.target.value.replace(/,/g, '')
                        const normalized = normalizeLakhInput(raw)
                        setPricingForm((prev: any) => ({ ...prev, client_offer_amount: normalized }))
                      }}
                    />
                  ) : (
                    <div className="text-sm text-neutral-700">
                      {enrichment?.client_offer_amount ? formatINR(enrichment.client_offer_amount) : '—'}
                    </div>
                  )}
                  {pricingEditMode && pricingForm.client_offer_amount && (
                    <div className="mt-1 text-xs text-neutral-500">
                      {formatINR(pricingForm.client_offer_amount)}
                    </div>
                  )}
                </div>
              </div>

              {pricingNotice && (
                <div className={errorTextClass}>{pricingNotice}</div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  Offer &amp; Discount History
                </div>
                {pricingLogs.length === 0 ? (
                  <div className="text-sm text-neutral-400">No history yet</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {pricingLogs.map((log: any) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
                      >
                        <div className="font-medium text-neutral-700 w-32 whitespace-nowrap">
                          {log.field_type === 'client_offer' ? 'Client Offer' : 'Discounted Amount'}
                        </div>
                        <div className="text-neutral-700 w-28 text-left">
                          {log.field_type === 'discounted' ? formatINR(log.amount) : '—'}
                        </div>
                        <div className="text-neutral-700 w-28 text-right">
                          {log.field_type === 'client_offer' ? formatINR(log.amount) : '—'}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {formatDateTime(log.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ===================== PROPOSAL ===================== */}
        {activeTab === 'proposal' && lead && (
          <div className="space-y-6">
            <div className={`${cardClass} p-5 space-y-6`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-800">Proposal Details</div>
                {!proposalEditMode ? (
                  <button type="button" className={buttonOutline} onClick={startProposalEdit}>
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" className={buttonPrimary} onClick={finishProposalEdit}>
                      Save
                    </button>
                    <button type="button" className={buttonOutline} onClick={cancelProposalEdit}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Lead Snapshot</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-700">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Name</div>
                    <div className="font-medium">{lead.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Lead #</div>
                    <div className="font-medium">L#{lead.lead_number ?? lead.id}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">City</div>
                    <div className="font-medium">{getAllCitiesLabel()}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500">Coverage</div>
                    <div className="font-medium">{lead.coverage_scope || 'Both Sides'}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border)]" />

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Events &amp; Team</div>
                {proposalGroups.length === 0 ? (
                  <div className="text-sm text-neutral-500">No events added yet.</div>
                ) : (
                  <div className="space-y-6">
                    {proposalGroups.map(group => (
                      <div key={group.dateKey} className="space-y-3">
                        <div className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                          {group.dateKey === 'TBD' ? 'Date TBD' : formatDate(group.dateKey)}
                        </div>
                        <div className="space-y-1 text-sm text-neutral-700">
                          {group.events.map((event, index) => {
                            const cityLabel =
                              selectedCities.length > 1 && event.city_name ? event.city_name : ''
                            const venueCity = [event.venue ? event.venue : null, cityLabel || null]
                              .filter(Boolean)
                              .join(', ')
                            const paxLabel = event.pax ? `${event.pax} pax` : null
                            const parts = [
                              event.name || 'Event',
                              venueCity || null,
                              paxLabel,
                            ].filter(Boolean) as string[]
                            return (
                              <div key={`${group.dateKey}-${event.id || index}`}>
                                • {parts.join(' – ')}
                              </div>
                            )
                          })}
                        </div>
                        <div className="space-y-2 text-sm pt-2">
                          {proposalEditMode ? (
                            Object.entries(proposalTeamLabels).map(([key, label]) => (
                              <div key={`${group.dateKey}-${key}`} className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  className={`${compactInput} proposal-number w-12 text-center`}
                                  value={
                                    proposalTeamByDate[group.dateKey]?.[key as keyof ProposalTeamCounts] || ''
                                  }
                                  onChange={e => {
                                    const value = e.target.value
                                    setProposalTeamByDate(prev => ({
                                      ...prev,
                                      [group.dateKey]: {
                                        ...prev[group.dateKey],
                                        [key]: value,
                                      },
                                    }))
                                  }}
                                />
                                <div className="text-xs text-neutral-500">{label}</div>
                              </div>
                            ))
                          ) : (
                            (() => {
                              const team = proposalTeamByDate[group.dateKey] || {}
                              const entries = Object.entries(proposalTeamLabels)
                                .map(([key, label]) => {
                                  const raw = team[key as keyof ProposalTeamCounts]
                                  const count = Number(raw)
                                  if (!raw || Number.isNaN(count) || count <= 0) return null
                                  const plural = count > 1 ? 's' : ''
                                  return `${count} ${label}${plural}`
                                })
                                .filter(Boolean) as string[]
                              if (!entries.length) {
                                return <div className="text-xs text-neutral-500">No team set.</div>
                              }
                              return (
                                <div className="space-y-1 text-xs text-neutral-500">
                                  {entries.map(entry => (
                                    <div key={entry}>{entry}</div>
                                  ))}
                                </div>
                              )
                            })()
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border)]" />

              <div className="space-y-3">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Deliverables</div>
                {proposalEditMode ? (
                  <>
                    <div className="space-y-3">
                      {proposalDeliverables.map(item => (
                        <div key={item.id} className="flex flex-wrap items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                            checked={item.checked}
                            onChange={e => updateDeliverable(item.id, { checked: e.target.checked })}
                          />
                          {item.detailLabel && (
                            <input
                              className={`${compactInput} h-10 text-left mr-auto ${
                                item.id === 'edited'
                                  ? 'w-24'
                                  : item.id === 'trailer' || item.id === 'film'
                                    ? 'w-28'
                                    : item.id === 'reels' || item.id === 'books'
                                      ? 'w-12'
                                      : 'w-28'
                              }`}
                              placeholder={item.detailLabel}
                              value={item.detail || ''}
                              onChange={e => updateDeliverable(item.id, { detail: e.target.value })}
                            />
                          )}
                          {item.detail2Label && (
                            <input
                              className={`${compactInput} h-10 text-left mr-auto ${
                                item.id === 'books'
                                  ? 'w-12'
                                  : item.id === 'edited'
                                    ? 'w-24'
                                    : 'w-28'
                              }`}
                              placeholder={item.detail2Label}
                              value={item.detail2 || ''}
                              onChange={e => updateDeliverable(item.id, { detail2: e.target.value })}
                            />
                          )}
                          <div className="flex flex-1 flex-wrap gap-2 items-center">
                            <input
                              className={`${inputClass} h-10 flex-1 min-w-[180px] text-left`}
                              value={item.label}
                              onChange={e => updateDeliverable(item.id, { label: e.target.value })}
                            />
                          </div>
                          <button
                            type="button"
                            className="text-xs text-neutral-500 hover:text-neutral-700"
                            onClick={() => removeDeliverable(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className={buttonOutline} onClick={addDeliverable}>
                      Add item
                    </button>
                  </>
                ) : (
                  (() => {
                    const checked = proposalDeliverables.filter(item => item.checked)
                    if (!checked.length) {
                      return <div className="text-sm text-neutral-500">No deliverables selected.</div>
                    }
                    return (
                      <div className="space-y-1 text-sm text-neutral-700">
                        {checked.flatMap(item => formatDeliverableLines(item)).map((line, idx) => (
                          <div key={`${line}-${idx}`}>{line}</div>
                        ))}
                      </div>
                    )
                  })()
                )}
              </div>

              <div className="border-t border-[var(--border)]" />

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Pricing</div>
                {proposalEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-neutral-500">Amount Quoted</div>
                      <input
                        type="text"
                        className={inputClass}
                        value={proposalPricing.amount_quoted}
                        onChange={e => setProposalPricing(prev => ({ ...prev, amount_quoted: e.target.value }))}
                        onBlur={e => {
                          const normalized = normalizeLakhInput(e.target.value || '')
                          setProposalPricing(prev => ({ ...prev, amount_quoted: normalized }))
                        }}
                        autoComplete="off"
                      />
                      {proposalPricing.amount_quoted && (
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatINR(proposalPricing.amount_quoted)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-neutral-500">Discounted Price</div>
                      <input
                        type="text"
                        className={inputClass}
                        value={proposalPricing.discounted_amount}
                        onChange={e =>
                          setProposalPricing(prev => ({ ...prev, discounted_amount: e.target.value }))
                        }
                        onBlur={e => {
                          const normalized = normalizeLakhInput(e.target.value || '')
                          setProposalPricing(prev => ({ ...prev, discounted_amount: normalized }))
                        }}
                        autoComplete="off"
                      />
                      {proposalPricing.discounted_amount && (
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatINR(proposalPricing.discounted_amount)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : lead?.discounted_amount != null && lead.discounted_amount !== '' ? (
                  <div className="space-y-1 text-sm text-neutral-700">
                    <div>Total Investment: {formatINR(lead.amount_quoted) || '—'}</div>
                    <div>Special Price: {formatINR(lead.discounted_amount) || '—'}</div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-700">
                    Total Investment: {formatINR(lead.amount_quoted) || '—'}
                  </div>
                )}
              </div>
            </div>

            <div className={`${cardClass} p-5 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-800">Generate Proposal</div>
                {proposalNotice && <div className="text-xs text-neutral-600">{proposalNotice}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonPrimary}
                  onClick={() => handleGenerateProposal(false)}
                  disabled={proposalSaving}
                >
                  {proposalSaving ? 'Generating...' : 'Generate Proposal'}
                </button>
                <button
                  className={buttonOutline}
                  onClick={() => handleGenerateProposal(true)}
                  disabled={proposalSaving}
                >
                  Send on WhatsApp
                </button>
              </div>
            </div>

            {proposalPreviewText && (
              <div className={`${cardClass} p-5 space-y-3`}>
                <div className="text-sm font-semibold text-neutral-800">Proposal Preview (Read-only)</div>
                <textarea
                  className="w-full rounded-xl border border-[var(--border)] bg-white/70 p-3 text-sm text-neutral-700"
                  rows={12}
                  readOnly
                  value={proposalPreviewText}
                />
                <div className="text-xs text-neutral-500">
                  This is exactly what will be sent on WhatsApp.
                </div>
              </div>
            )}

            <div className={`${cardClass} p-5 space-y-3`}>
              <div className="text-sm font-semibold text-neutral-800">Quote History</div>
              {quoteLoading ? (
                <div className="text-sm text-neutral-500">Loading...</div>
              ) : quoteError ? (
                <div className="text-sm text-red-600">{quoteError}</div>
              ) : quoteHistory.length === 0 ? (
                <div className="text-sm text-neutral-500">No proposals generated yet.</div>
              ) : (
                <div className="space-y-2 text-sm text-neutral-700">
                  {quoteHistory.map((quote: any) => (
                    <div
                      key={quote.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
                    >
                      <div className="font-medium">{quote.quote_number}</div>
                      <div className="text-xs text-neutral-500">{formatDateTime(quote.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Reason for rejection</div>
            <div className="mt-4 space-y-3 text-sm">
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              >
                {REJECT_REASONS.map(r => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              {rejectReason === 'Other' && (
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                  placeholder="Enter reason"
                  value={rejectOther}
                  autoComplete="off"
                  onChange={e => setRejectOther(e.target.value)}
                />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button
                className={buttonPrimary}
                disabled={rejectReason === 'Other' && !rejectOther.trim()}
                onClick={async () => {
                  const finalReason = rejectReason === 'Other' ? rejectOther.trim() : rejectReason
                  await updateLeadStatus('Rejected', finalReason)
                  setShowRejectModal(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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
                    setIsSavingEvents(true)
                    const res = await apiFetch(`/api/leads/${id}/events/${row.id}`, {
                      method: 'DELETE',
                    })
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      setEventDeleteError(err?.error || 'Unable to delete this event. Please try again.')
                      setIsSavingEvents(false)
                      setPendingEventDelete(null)
                      return
                    }
                    const refreshedRaw = await apiFetch(
                      `/api/leads/${id}/enrichment`
                    ).then(r => r.json())
                    const refreshed = normalizeLeadSignals(refreshedRaw)
                    setEnrichment(refreshed)
                    setSelectedCities(Array.isArray(refreshedRaw.cities) ? refreshedRaw.cities : [])
                    setPricingLogs(Array.isArray(refreshedRaw.pricing_logs) ? refreshedRaw.pricing_logs : [])
                    if (!editMode) {
                      setFormData({
                        event_type: refreshed.event_type,
                        is_destination: refreshed.is_destination,
                        client_budget_amount: refreshed.client_budget_amount,
                        amount_quoted: refreshed.amount_quoted,
                        potential: parseYesNo(refreshed.potential),
                        important: parseYesNo(refreshed.important),
                        coverage_scope: refreshed.coverage_scope ?? 'Both Sides',
                        assigned_user_id: lead?.assigned_user_id ?? null,
                      })
                    }
                    setIsSavingEvents(false)
                  }

                  removeEventRow(index, row, { skipTrack: true })
                  setPendingEventDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <DuplicateContactModal
        open={showContactDuplicate}
        duplicates={contactDuplicateData}
        onContinue={() => {
          const action = pendingContactSave
          setShowContactDuplicate(false)
          setPendingContactSave(null)
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

      <SwipeConfirmModal
        open={Boolean(statusConfirm)}
        title="Reopen Converted Lead"
        body="This lead is currently marked as Converted. Changing the stage may affect revenue reports and performance metrics."
        subtext="Only proceed if this conversion was marked incorrectly."
        confirmLabel="Swipe right to reopen lead"
        onClose={() => setStatusConfirm(null)}
        onConfirm={() => {
          const nextStatus = statusConfirm?.nextStatus
          setStatusConfirm(null)
          if (!nextStatus) return
          setStatusChangeOrigin('lead')
          if (nextStatus === 'Rejected') {
            setRejectReason('Low budget')
            setRejectOther('')
            setShowRejectModal(true)
            return
          }
          updateLeadStatus(nextStatus)
        }}
      />

      {convertConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Confirm Conversion</div>
            <div className="mt-2 text-sm text-neutral-700">Has the advance amount been credited?</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className={buttonOutline}
                onClick={() => {
                  setConvertConfirmOpen(false)
                  setConvertLeadSnapshot(null)
                  if (lead?.status === 'Awaiting Advance') return
                  setAwaitingAdvancePromptOpen(true)
                }}
              >
                Not yet
              </button>
              <button
                className={buttonPrimary}
                onClick={() => {
                  openConversionSummary()
                }}
              >
                Yes, advance received
              </button>
            </div>
          </div>
        </div>
      )}

      {awaitingAdvancePromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Advance Not Received</div>
            <div className="mt-2 text-sm text-neutral-700">
              This lead cannot be marked as Converted without receiving the advance.
              Would you like to move it to Awaiting Advance instead?
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setAwaitingAdvancePromptOpen(false)}>
                Cancel
              </button>
              <button
                className={buttonPrimary}
                onClick={() => {
                  setAwaitingAdvancePromptOpen(false)
                  setStatusChangeOrigin('lead')
                  updateLeadStatus('Awaiting Advance')
                }}
              >
                Move to Awaiting Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {convertSummary && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Deal Closed 🎉</div>
            <div className="mt-2 text-sm text-neutral-700">
              {`Congratulations, ${userName || 'there'}!`}
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {`You’ve successfully converted this lead at ${
                convertSummary.finalAmount != null ? formatINR(convertSummary.finalAmount) : '—'
              }.`}
            </div>
            <div className="mt-4 space-y-1 text-xs text-neutral-600">
              <div className="flex items-center justify-between">
                <span>Stage duration</span>
                <span>
                  {convertSummary.stageDurationDays != null
                    ? `${convertSummary.stageDurationDays} days`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total follow-ups</span>
                <span>{convertSummary.followupCount}</span>
              </div>
              {convertSummary.discountValue != null && (
                <div className="flex items-center justify-between">
                  <span>Discount applied</span>
                  <span>{formatINR(convertSummary.discountValue)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className={buttonOutline}
                onClick={() => finalizeConversion(false)}
                disabled={convertSaving}
              >
                Continue
              </button>
              <button
                className={buttonPrimary}
                onClick={() => finalizeConversion(true)}
                disabled={convertSaving}
              >
                View Project
              </button>
            </div>
          </div>
        </div>
      )}

      {convertError && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Confirm Conversion</div>
            <div className="mt-2 text-sm text-neutral-700">{convertError}</div>
            <div className="mt-4 flex justify-end">
              <button className={buttonPrimary} onClick={() => setConvertError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {statusChangedInfo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Status changed</div>
            <div className="mt-2 text-sm text-neutral-700">{statusChangedInfo.message}</div>
            <div className="mt-4 flex justify-end">
              <button
                className={buttonPrimary}
                onClick={() => {
                  const origin = statusChangedInfo.origin
                  setStatusChangedInfo(null)
                  if (pendingFollowupSuggestion) {
                    setPendingFollowupSuggestion(false)
                    setIsEditingFollowup(true)
                    return
                  }
                  if (origin === 'kanban') {
                    const storedView = typeof window !== 'undefined'
                      ? sessionStorage.getItem('leads_view')
                      : null
                    if (storedView === 'kanban' || storedView === 'table') {
                      window.location.href = `/leads?view=${storedView}`
                    } else {
                      window.location.href = '/leads'
                    }
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {autoNegotiationError && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Unable to change status to Negotiation</div>
            <div className="mt-2 text-sm text-neutral-700">{autoNegotiationError.reason}</div>
            <div className="mt-4 flex justify-end">
              <button
                className={buttonPrimary}
                onClick={() => {
                  const current = autoNegotiationError
                  setAutoNegotiationError(null)
                  if (current) {
                    setAutoNegotiationFixDialog({
                      reason: current.reason,
                      focus: current.focus,
                    })
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {autoNegotiationFixDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">{getAutoNegotiationPromptText(autoNegotiationFixDialog.reason).title}</div>
            {autoNegotiationFixDialog.reason ? (
              <div className="mt-2 text-sm text-neutral-700">{autoNegotiationFixDialog.reason}</div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setAutoNegotiationFixDialog(null)}>
                No
              </button>
              <button
                className={buttonPrimary}
                onClick={() => {
                  const focus = autoNegotiationFixDialog.focus || 'amount_quoted'
                  setAutoNegotiationFixDialog(null)
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('pending_negotiation_prompt', '1')
                  }
                  const qs = new URLSearchParams()
                  qs.set('focus', focus)
                  qs.set('desired_status', 'Negotiation')
                  qs.set('origin', 'lead')
                  window.location.href = `/leads/${lead?.id}?${qs.toString()}`
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {negotiationStatusNotice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">{negotiationStatusNotice}</div>
            <div className="mt-4 flex justify-end">
              <button
                className={buttonPrimary}
                onClick={() => {
                  setNegotiationStatusNotice(null)
                  setShowNegotiationEditPrompt(true)
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {autoContactedPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Status Changed</div>
            <div className="mt-2 text-sm text-neutral-700">{autoContactedPrompt.message}</div>
            <div className="mt-4 flex justify-end">
              <button
                className={buttonPrimary}
                onClick={() => {
                  const force = autoContactedPrompt.forceIntake
                  setAutoContactedPrompt(null)
                  if (!force) return
                  const from = backHref || `/leads/${id}`
                  const qs = new URLSearchParams()
                  qs.set('from', from)
                  qs.set('force_intake', '1')
                  window.location.href = `/leads/${id}/intake?${qs.toString()}`
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showNegotiationEditPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold text-neutral-900">Update Negotiations?</div>
            <div className="mt-2 text-sm text-neutral-700">
              <div className="mb-1">Status changed to Negotiation.</div>
              <div>Do you want to update the Negotiations tab?</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className={buttonOutline}
                onClick={() => setShowNegotiationEditPrompt(false)}
              >
                No
              </button>
              <button
                className={buttonPrimary}
                onClick={() => {
                  setShowNegotiationEditPrompt(false)
                  openNegotiationEdit()
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {eventDeleteError && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Unable to delete event</div>
            <div className="mt-2 text-sm text-neutral-700">{eventDeleteError}</div>
            <div className="mt-4 flex justify-end">
              <button className={buttonPrimary} onClick={() => setEventDeleteError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {nextFixDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <div className="text-lg font-semibold">Action required</div>
            <div className="mt-2 text-sm text-neutral-700">{nextFixDialog.message}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setNextFixDialog(null)}>
                Cancel
              </button>
              <button
                className={buttonPrimary}
                onClick={() => {
                  const qs = new URLSearchParams()
                  qs.set('focus', nextFixDialog.focus)
                  qs.set('desired_status', nextFixDialog.desiredStatus)
                  qs.set('origin', nextFixDialog.origin)
                  setNextFixDialog(null)
                  window.location.href = `/leads/${lead?.id}?${qs.toString()}`
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes field-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          50% { transform: translateX(3px); }
          75% { transform: translateX(-2px); }
        }
        .field-error {
          border-color: #f87171 !important;
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.18);
          animation: field-shake 0.25s ease-in-out;
        }
      `}</style>
    </div>
  )
}
