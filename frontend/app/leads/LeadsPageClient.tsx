'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { SalesKanbanView } from '../sales/components/SalesKanbanView'
import { SalesTableView } from '../sales/components/SalesTableView'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneField from '@/components/PhoneField'
import DuplicateContactModal, { type DuplicateResults } from '@/components/DuplicateContactModal'
import { checkContactDuplicates, hasDuplicates } from '@/lib/contactDuplicates'
import { getRouteStateKey, readRouteState, shouldRestoreScroll, writeRouteState } from '@/lib/routeState'

export default function LeadsPage() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [hydrated, setHydrated] = useState(false)
  const [viewInitialized, setViewInitialized] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })
  const [leads, setLeads] = useState<any[]>([])
  const [totalStatusCounts, setTotalStatusCounts] = useState<Record<string, number>>({})
  const [totalCountsLoaded, setTotalCountsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  type Filters = {
    statuses: string[]
    sources: string[]
    heats: string[]
    priorities: string[]
    overdue: boolean
    followupDone: boolean
    lastContactedMode: string
    lastContactedFrom: string
    lastContactedTo: string
    notContactedMin: string
    createdMode: string
    createdFrom: string
    createdTo: string
    eventMode: string
    eventFrom: string
    eventTo: string
    amountMin: string
    amountMax: string
    budgetMin: string
    budgetMax: string
    discountMin: string
    discountMax: string
  }
  type RangeKey = 'amountMin' | 'amountMax' | 'budgetMin' | 'budgetMax' | 'discountMin' | 'discountMax'

  const defaultFilters: Filters = {
    statuses: [] as string[],
    sources: [] as string[],
    heats: [] as string[],
    priorities: [] as string[],
    overdue: false,
    followupDone: false,
    lastContactedMode: 'any',
    lastContactedFrom: '',
    lastContactedTo: '',
    notContactedMin: '',
    createdMode: 'any',
    createdFrom: '',
    createdTo: '',
    eventMode: 'any',
    eventFrom: '',
    eventTo: '',
    amountMin: '',
    amountMax: '',
    budgetMin: '',
    budgetMax: '',
    discountMin: '',
    discountMax: '',
  }
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [filtersReady, setFiltersReady] = useState(false)
  const lastQueryRef = useRef('')
  const [showFilters, setShowFilters] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const stageMenuRef = useRef<HTMLDivElement | null>(null)
  const [stagePos, setStagePos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)
  const sourceRef = useRef<HTMLDivElement | null>(null)
  const sourceMenuRef = useRef<HTMLDivElement | null>(null)
  const [sourcePos, setSourcePos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const [heatOpen, setHeatOpen] = useState(false)
  const heatRef = useRef<HTMLDivElement | null>(null)
  const heatMenuRef = useRef<HTMLDivElement | null>(null)
  const [heatPos, setHeatPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const priorityRef = useRef<HTMLDivElement | null>(null)
  const priorityMenuRef = useRef<HTMLDivElement | null>(null)
  const [priorityPos, setPriorityPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const [activeSlider, setActiveSlider] = useState<{
    key: 'amount' | 'budget' | 'discount'
    handle: 'min' | 'max'
  } | null>(null)

  type SortKey = 'newest' | 'oldest' | 'value_high' | 'value_low' | 'event_soon' | 'name_az'
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [source, setSource] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [addError, setAddError] = useState('')
  const [addFieldErrors, setAddFieldErrors] = useState<{
    name?: string
    primaryPhone?: string
    source?: string
    sourceName?: string
  }>({})
  const [addShake, setAddShake] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicateData, setDuplicateData] = useState<DuplicateResults | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [pendingAddSave, setPendingAddSave] = useState<(() => void) | null>(null)
  const routeKey = typeof window !== 'undefined' ? getRouteStateKey(window.location.pathname) : ''

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

  const SOURCES = [
    'Instagram',
    'Direct Call',
    'WhatsApp',
    'Reference',
    'Website',
    'Unknown',
  ]

  const HEATS = ['Hot', 'Warm', 'Cold']
  const PRIORITIES = [
    { key: 'important', label: 'Important' },
    { key: 'potential', label: 'Potential' },
  ]
  const MAX_MONEY = 1000000

  const formatMoneyInput = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const num = Number(trimmed.replace(/,/g, ''))
    if (!Number.isFinite(num)) return value
    return num.toLocaleString('en-IN')
  }

  const isDefaultFilters = (value: Filters) =>
    value.statuses.length === 0 &&
    value.sources.length === 0 &&
    value.heats.length === 0 &&
    value.priorities.length === 0 &&
    !value.overdue &&
    !value.followupDone &&
    value.lastContactedMode === 'any' &&
    !value.lastContactedFrom &&
    !value.lastContactedTo &&
    !value.notContactedMin &&
    value.createdMode === 'any' &&
    !value.createdFrom &&
    !value.createdTo &&
    value.eventMode === 'any' &&
    !value.eventFrom &&
    !value.eventTo &&
    !value.amountMin &&
    !value.amountMax &&
    !value.budgetMin &&
    !value.budgetMax &&
    !value.discountMin &&
    !value.discountMax

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const paramView = searchParams.get('view')
    if (paramView === 'kanban' || paramView === 'table') {
      setView(paramView)
      sessionStorage.setItem('leads_view', paramView)
      setViewInitialized(true)
      return
    }

    const restoreAllowed = shouldRestoreScroll()
    const storedState = restoreAllowed && routeKey ? readRouteState(routeKey) : null
    const storedView = storedState?.activeTab
    if (storedView === 'kanban' || storedView === 'table') {
      setView(storedView)
      sessionStorage.setItem('leads_view', storedView)
      setViewInitialized(true)
      return
    }

    if (restoreAllowed) {
      const stored = sessionStorage.getItem('leads_view')
      if (stored === 'kanban' || stored === 'table') {
        setView(stored)
        setViewInitialized(true)
        return
      }
    }

    setView('kanban')
    sessionStorage.setItem('leads_view', 'kanban')
    setViewInitialized(true)
  }, [searchParams, routeKey, hydrated])

  useEffect(() => {
    if (!hydrated || !viewInitialized) return
    sessionStorage.setItem('leads_view', view)
    const params = new URLSearchParams(searchParams.toString())
    const currentView = params.get('view')
    if (currentView !== view) {
      params.set('view', view)
      router.replace(`/leads?${params.toString()}`, { scroll: false })
    }
    if (routeKey) {
      writeRouteState(routeKey, { activeTab: view })
    }
  }, [view, routeKey, searchParams, hydrated, viewInitialized])

  // Scroll restore is handled globally by ScrollRestoration.

  const refreshLeads = (nextFilters = filters) => {
    setLoading(true)
    setLoadError('')
    const params = buildLeadsQuery(nextFilters)
    const query = params.toString()
    const url = query ? `/api/leads?${query}` : '/api/leads'
    apiFetch(url)
      .then(res => res.json())
      .then(data => {
        setLeads(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setLoadError('Unable to load leads right now.')
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!hydrated) return
    apiFetch('/api/dashboard/metrics')
      .then(res => res.json())
      .then(data => {
        const counts = data?.status_counts
        if (counts && typeof counts === 'object') {
          setTotalStatusCounts(counts)
          setTotalCountsLoaded(true)
          return
        }
        setTotalCountsLoaded(false)
      })
      .catch(() => {
        setTotalCountsLoaded(false)
      })
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return
    const params = new URLSearchParams(searchParams.toString())
    const key = params.toString()
    if (filtersReady && key === lastQueryRef.current) return
    lastQueryRef.current = key
    const next = parseFiltersFromParams(params)
    setFilters(next)
    setFiltersReady(true)
    refreshLeads(next)
  }, [searchParams, hydrated])

  useEffect(() => {
    if (!stageOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (stageRef.current && stageRef.current.contains(target)) return
      if (stageMenuRef.current && stageMenuRef.current.contains(target)) return
      setStageOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [stageOpen])

  useEffect(() => {
    if (!stageOpen || !stageRef.current) return
    const frame = requestAnimationFrame(() => {
      const rect = stageRef.current!.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const padding = 12
      const spaceBelow = viewportHeight - rect.bottom - padding
      const spaceAbove = rect.top - padding
      const rawHeight = stageMenuRef.current?.scrollHeight ?? 0
      const menuHeight = rawHeight > 0 ? rawHeight : 200
      const shouldFlip = spaceBelow < menuHeight && spaceAbove > spaceBelow
      const available = shouldFlip ? spaceAbove : spaceBelow
      const fits = available >= menuHeight
      const top = shouldFlip ? Math.max(padding, rect.top - menuHeight - 6) : rect.bottom + 6
      setStagePos({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight: fits ? 0 : Math.max(160, Math.floor(available)),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [stageOpen])

  useEffect(() => {
    if (!sourceOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (sourceRef.current && sourceRef.current.contains(target)) return
      if (sourceMenuRef.current && sourceMenuRef.current.contains(target)) return
      setSourceOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [sourceOpen])

  useEffect(() => {
    if (!sourceOpen || !sourceRef.current) return
    const frame = requestAnimationFrame(() => {
      const rect = sourceRef.current!.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const padding = 12
      const spaceBelow = viewportHeight - rect.bottom - padding
      const spaceAbove = rect.top - padding
      const rawHeight = sourceMenuRef.current?.scrollHeight ?? 0
      const menuHeight = rawHeight > 0 ? rawHeight : 200
      const shouldFlip = spaceBelow < menuHeight && spaceAbove > spaceBelow
      const available = shouldFlip ? spaceAbove : spaceBelow
      const fits = available >= menuHeight
      const top = shouldFlip ? Math.max(padding, rect.top - menuHeight - 6) : rect.bottom + 6
      setSourcePos({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight: fits ? 0 : Math.max(160, Math.floor(available)),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [sourceOpen])

  useEffect(() => {
    if (!heatOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (heatRef.current && heatRef.current.contains(target)) return
      if (heatMenuRef.current && heatMenuRef.current.contains(target)) return
      setHeatOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [heatOpen])

  useEffect(() => {
    if (!heatOpen || !heatRef.current) return
    const frame = requestAnimationFrame(() => {
      const rect = heatRef.current!.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const padding = 12
      const spaceBelow = viewportHeight - rect.bottom - padding
      const spaceAbove = rect.top - padding
      const rawHeight = heatMenuRef.current?.scrollHeight ?? 0
      const menuHeight = rawHeight > 0 ? rawHeight : 200
      const shouldFlip = spaceBelow < menuHeight && spaceAbove > spaceBelow
      const available = shouldFlip ? spaceAbove : spaceBelow
      const fits = available >= menuHeight
      const top = shouldFlip ? Math.max(padding, rect.top - menuHeight - 6) : rect.bottom + 6
      setHeatPos({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight: fits ? 0 : Math.max(160, Math.floor(available)),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [heatOpen])

  useEffect(() => {
    if (!priorityOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (priorityRef.current && priorityRef.current.contains(target)) return
      if (priorityMenuRef.current && priorityMenuRef.current.contains(target)) return
      setPriorityOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [priorityOpen])

  useEffect(() => {
    if (!priorityOpen || !priorityRef.current) return
    const frame = requestAnimationFrame(() => {
      const rect = priorityRef.current!.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const padding = 12
      const spaceBelow = viewportHeight - rect.bottom - padding
      const spaceAbove = rect.top - padding
      const rawHeight = priorityMenuRef.current?.scrollHeight ?? 0
      const menuHeight = rawHeight > 0 ? rawHeight : 200
      const shouldFlip = spaceBelow < menuHeight && spaceAbove > spaceBelow
      const available = shouldFlip ? spaceAbove : spaceBelow
      const fits = available >= menuHeight
      const top = shouldFlip ? Math.max(padding, rect.top - menuHeight - 6) : rect.bottom + 6
      setPriorityPos({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight: fits ? 0 : Math.max(160, Math.floor(available)),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [priorityOpen])

  const formatName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed
      .split(/\s+/)
      .map(part =>
        part
          ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          : ''
      )
      .join(' ')
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

  const dateToYMD = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const getMonthRange = (offset: number) => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
    return {
      from: dateToYMD(first),
      to: dateToYMD(last),
    }
  }

  const addDays = (days: number) => {
    const now = new Date()
    const next = new Date(now)
    next.setDate(now.getDate() + days)
    return dateToYMD(next)
  }

  const normalizeNumberInput = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const num = Number(trimmed.replace(/,/g, ''))
    if (!Number.isFinite(num)) return ''
    return String(num)
  }

  const formatMoneyValue = (value: string) => {
    const normalized = normalizeNumberInput(value)
    if (!normalized) return ''
    const num = Number(normalized)
    if (!Number.isFinite(num)) return ''
    return num.toLocaleString('en-IN')
  }

  const updateRange = (
    minKey: RangeKey,
    maxKey: RangeKey,
    rawValue: string,
    isMin: boolean
  ) => {
    setFilters(prev => {
      const next: Filters = { ...prev }
      const currentMin = String(prev[minKey] || '')
      const currentMax = String(prev[maxKey] || '')
      const currentMinNum = parseMoneyValue(currentMin, 0)
      const currentMaxNum = parseMoneyValue(currentMax, MAX_MONEY)
      const incomingNum = parseMoneyValue(rawValue, isMin ? 0 : MAX_MONEY)

      if (isMin) {
        const clamped = Math.min(incomingNum, currentMaxNum)
        next[minKey] = formatMoneyValue(String(clamped))
      } else {
        const clamped = Math.max(incomingNum, currentMinNum)
        next[maxKey] = formatMoneyValue(String(clamped))
      }

      return next
    })
  }

  const parseMoneyValue = (value: string, fallback: number) => {
    if (!value) return fallback
    const num = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(num) ? num : fallback
  }

  const toPercent = (value: number) => Math.min(100, Math.max(0, (value / MAX_MONEY) * 100))

  const buildLeadsQuery = (nextFilters: Filters = filters) => {
    const params = new URLSearchParams()
    if (nextFilters.statuses.length) params.set('status', nextFilters.statuses.join(','))
    if (nextFilters.sources.length) params.set('source', nextFilters.sources.join(','))
    if (nextFilters.heats.length) params.set('heat', nextFilters.heats.join(','))
    if (nextFilters.priorities.length) params.set('priority', nextFilters.priorities.join(','))
    if (nextFilters.overdue) params.set('overdue', '1')
    if (nextFilters.followupDone) params.set('followup_done', '1')
    if (nextFilters.lastContactedMode && nextFilters.lastContactedMode !== 'any') {
      params.set('last_contacted_mode', nextFilters.lastContactedMode)
    }
    if (nextFilters.lastContactedMode === 'custom') {
      if (nextFilters.lastContactedFrom) params.set('last_contacted_from', nextFilters.lastContactedFrom)
      if (nextFilters.lastContactedTo) params.set('last_contacted_to', nextFilters.lastContactedTo)
    }
    if (nextFilters.notContactedMin) params.set('not_contacted_min', nextFilters.notContactedMin)
    if (nextFilters.createdMode && nextFilters.createdMode !== 'any') {
      params.set('created_mode', nextFilters.createdMode)
    }
    if (nextFilters.createdMode === 'custom') {
      if (nextFilters.createdFrom) params.set('created_from', nextFilters.createdFrom)
      if (nextFilters.createdTo) params.set('created_to', nextFilters.createdTo)
    }
    if (nextFilters.eventFrom) params.set('event_from', nextFilters.eventFrom)
    if (nextFilters.eventTo) params.set('event_to', nextFilters.eventTo)
    const amountMin = normalizeNumberInput(nextFilters.amountMin)
    const amountMax = normalizeNumberInput(nextFilters.amountMax)
    const budgetMin = normalizeNumberInput(nextFilters.budgetMin)
    const budgetMax = normalizeNumberInput(nextFilters.budgetMax)
    const discountMin = normalizeNumberInput(nextFilters.discountMin)
    const discountMax = normalizeNumberInput(nextFilters.discountMax)
    if (amountMin) params.set('amount_min', amountMin)
    if (amountMax) params.set('amount_max', amountMax)
    if (budgetMin) params.set('budget_min', budgetMin)
    if (budgetMax) params.set('budget_max', budgetMax)
    if (discountMin) params.set('discount_min', discountMin)
    if (discountMax) params.set('discount_max', discountMax)
    return params
  }

  const parseFiltersFromParams = (params: URLSearchParams): Filters => {
    const next: Filters = {
      statuses: (params.get('status') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      sources: (params.get('source') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
      heats: (params.get('heat') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
      priorities: (params.get('priority') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
      overdue: params.get('overdue') === '1',
      followupDone: params.get('followup_done') === '1',
      lastContactedMode: params.get('last_contacted_mode') || 'any',
      lastContactedFrom: params.get('last_contacted_from') || '',
      lastContactedTo: params.get('last_contacted_to') || '',
      notContactedMin: params.get('not_contacted_min') || '',
      createdMode: params.get('created_mode') || 'any',
      createdFrom: params.get('created_from') || '',
      createdTo: params.get('created_to') || '',
      eventMode: 'any',
      eventFrom: params.get('event_from') || '',
      eventTo: params.get('event_to') || '',
      amountMin: params.get('amount_min') || '',
      amountMax: params.get('amount_max') || '',
      budgetMin: params.get('budget_min') || '',
      budgetMax: params.get('budget_max') || '',
      discountMin: params.get('discount_min') || '',
      discountMax: params.get('discount_max') || '',
    }
    if (next.createdMode === 'last_30') {
      next.createdMode = 'between_7_30'
    }
    if (next.lastContactedFrom || next.lastContactedTo) {
      next.lastContactedMode = next.lastContactedMode === 'any' ? 'custom' : next.lastContactedMode
    }
    if (next.createdFrom || next.createdTo) {
      next.createdMode = next.createdMode === 'any' ? 'custom' : next.createdMode
    }
    if (next.eventFrom || next.eventTo) {
      next.eventMode = 'custom'
    }
    if (next.createdMode !== 'custom') {
      next.createdFrom = ''
      next.createdTo = ''
    }
    if (next.lastContactedMode !== 'custom') {
      next.lastContactedFrom = ''
      next.lastContactedTo = ''
    }
    return next
  }

  const scrollToFirstError = () => {
    if (typeof document === 'undefined') return
    const target = document.querySelector('.field-error') as HTMLElement | null
    if (target?.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }


  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = leads
    if (q) {
      const qDigits = q.replace(/\D/g, '')
      result = leads.filter(l => {
        const fields = [
          l.name,
          l.bride_name,
          l.groom_name,
          l.primary_phone,
          l.phone_primary,
          l.phone_secondary,
          l.bride_phone_primary,
          l.bride_phone_secondary,
          l.groom_phone_primary,
          l.groom_phone_secondary,
        ]
          .filter(Boolean)
          .map((v: string) => v.toLowerCase())
        if (fields.some(v => v.includes(q))) return true
        if (!qDigits) return false
        const phoneDigits = fields.map(v => v.replace(/\D/g, ''))
        return phoneDigits.some(v => v.includes(qDigits))
      })
    }

    // Sort
    const sorted = [...result]
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        break
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        break
      case 'value_high':
        sorted.sort((a, b) => (Number(b.amount || b.deal_value || 0)) - (Number(a.amount || a.deal_value || 0)))
        break
      case 'value_low':
        sorted.sort((a, b) => (Number(a.amount || a.deal_value || 0)) - (Number(b.amount || b.deal_value || 0)))
        break
      case 'event_soon':
        sorted.sort((a, b) => {
          const da = a.event_date ? new Date(a.event_date).getTime() : Infinity
          const db = b.event_date ? new Date(b.event_date).getTime() : Infinity
          return da - db
        })
        break
      case 'name_az':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        break
    }
    return sorted
  }, [leads, search, sortBy])

  const applyFilters = () => {
    let next = {
      ...filters,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      eventFrom: filters.eventFrom,
      eventTo: filters.eventTo,
    }

    if (filters.eventMode === 'within_30') {
      next = { ...next, eventFrom: dateToYMD(new Date()), eventTo: addDays(30) }
    } else if (filters.eventMode === 'within_90') {
      next = { ...next, eventFrom: dateToYMD(new Date()), eventTo: addDays(90) }
    } else if (filters.eventMode === 'between_90_180') {
      next = { ...next, eventFrom: addDays(90), eventTo: addDays(180) }
    } else if (filters.eventMode === 'after_180') {
      next = { ...next, eventFrom: addDays(180), eventTo: '' }
    } else if (filters.eventMode === 'any') {
      next = { ...next, eventFrom: '', eventTo: '' }
    }

    setFilters(next)
    setStageOpen(false)
    setShowFilters(false)
    setFiltersReady(true)
    const params = new URLSearchParams()
    params.set('view', view)
    buildLeadsQuery(next).forEach((value, key) => params.set(key, value))
    const key = params.toString()
    lastQueryRef.current = key
    router.replace(`/leads?${params.toString()}`, { scroll: false })
    refreshLeads(next)
  }

  const clearFilters = () => {
    if (isDefaultFilters(filters)) {
      setShowFilters(false)
      return
    }
    setFiltersReady(false)
    setFilters(defaultFilters)
    setStageOpen(false)
    setSourceOpen(false)
    setHeatOpen(false)
    setPriorityOpen(false)
    const params = new URLSearchParams()
    params.set('view', view)
    const key = params.toString()
    lastQueryRef.current = key
    router.replace(`/leads?${params.toString()}`, { scroll: false })
    refreshLeads(defaultFilters)
  }

  const quickFilter = (preset: Partial<Filters>) => {
    const next = { ...defaultFilters, ...preset }
    setFilters(next)
    setFiltersReady(true)
    setShowFilters(false)
    const params = new URLSearchParams()
    params.set('view', view)
    buildLeadsQuery(next).forEach((value, key) => params.set(key, value))
    const key = params.toString()
    lastQueryRef.current = key
    router.replace(`/leads?${params.toString()}`, { scroll: false })
    refreshLeads(next)
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) {
      const key = lead.status || 'New'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [leads])

  const showFilteredTotals = !isDefaultFilters(filters) && totalCountsLoaded

  const appliedFilters = useMemo(() => {
    const labels: string[] = []

    if (filters.statuses.length) {
      labels.push(`Status: ${filters.statuses.join(', ')}`)
    }
    if (filters.sources.length) {
      labels.push(`Source: ${filters.sources.join(', ')}`)
    }
    if (filters.heats.length) {
      labels.push(`Heat: ${filters.heats.join(', ')}`)
    }
    if (filters.priorities.length) {
      const priorityLabels = filters.priorities.map(
        value => PRIORITIES.find(item => item.key === value)?.label || value
      )
      labels.push(`Priority: ${priorityLabels.join(', ')}`)
    }
    if (filters.overdue) labels.push('Follow-up overdue')
    if (filters.followupDone) labels.push('Follow-up done')

    if (filters.lastContactedMode && filters.lastContactedMode !== 'any') {
      if (filters.lastContactedMode === 'within_7') {
        labels.push('Last contacted: within 7 days')
      } else if (filters.lastContactedMode === 'within_30') {
        labels.push('Last contacted: within 30 days')
      } else {
        const from = filters.lastContactedFrom
        const to = filters.lastContactedTo
        const range = from || to ? `${from || 'any'} to ${to || 'any'}` : 'custom range'
        labels.push(`Last contacted: ${range}`)
      }
    }

    if (filters.notContactedMin) {
      labels.push(`Not contacted: ${filters.notContactedMin}+ attempts`)
    }

    if (filters.createdMode && filters.createdMode !== 'any') {
      if (filters.createdMode === 'last_7') {
        labels.push('Created: last 7 days')
      } else if (filters.createdMode === 'between_7_30') {
        labels.push('Created: 7 to 30 days')
      } else if (filters.createdMode === 'before_30') {
        labels.push('Created: before 30 days')
      } else {
        const from = filters.createdFrom
        const to = filters.createdTo
        const range = from || to ? `${from || 'any'} to ${to || 'any'}` : 'custom range'
        labels.push(`Created: ${range}`)
      }
    }

    if (filters.eventMode && filters.eventMode !== 'any') {
      if (filters.eventMode === 'within_30') {
        labels.push('Event: within 30 days')
      } else if (filters.eventMode === 'within_90') {
        labels.push('Event: within 3 months')
      } else if (filters.eventMode === 'between_90_180') {
        labels.push('Event: 3 to 6 months out')
      } else if (filters.eventMode === 'after_180') {
        labels.push('Event: after 6 months')
      } else {
        const from = filters.eventFrom
        const to = filters.eventTo
        const range = from || to ? `${from || 'any'} to ${to || 'any'}` : 'custom range'
        labels.push(`Event: ${range}`)
      }
    }

    const formatMoneyRange = (label: string, minRaw: string, maxRaw: string) => {
      const minVal = formatMoneyValue(minRaw)
      const maxVal = formatMoneyValue(maxRaw)
      if (!minVal && !maxVal) return ''
      if (minVal && maxVal) return `${label}: ₹${minVal}–₹${maxVal}`
      if (minVal) return `${label}: >= ₹${minVal}`
      return `${label}: <= ₹${maxVal}`
    }

    const amountLabel = formatMoneyRange('Amount', filters.amountMin, filters.amountMax)
    if (amountLabel) labels.push(amountLabel)
    const budgetLabel = formatMoneyRange('Budget', filters.budgetMin, filters.budgetMax)
    if (budgetLabel) labels.push(budgetLabel)
    const discountLabel = formatMoneyRange('Discounted', filters.discountMin, filters.discountMax)
    if (discountLabel) labels.push(discountLabel)

    return labels
  }, [filters])

  const handleAddLead = async () => {
    setAddError('')
    const formattedName = formatName(name)
    const nextErrors: { name?: string; primaryPhone?: string; source?: string; sourceName?: string } = {}
    if (!formattedName) {
      nextErrors.name = 'Full name is required'
    }
    const normalized = normalizePhone(primaryPhone)
    if (!normalized) {
      nextErrors.primaryPhone = 'Valid contact number required'
    }
    if (!source) {
      nextErrors.source = 'Source is required'
    }
    const needsSourceName = ['Direct Call', 'WhatsApp', 'Reference'].includes(source)
    if (needsSourceName && !sourceName.trim()) {
      nextErrors.sourceName = 'Name is required for this source'
    }
    if (Object.keys(nextErrors).length) {
      setAddFieldErrors(nextErrors)
      setAddShake(true)
      setTimeout(() => setAddShake(false), 300)
      requestAnimationFrame(scrollToFirstError)
      return
    }
    setAddFieldErrors({})

    const doSave = async () => {
      setIsSubmitting(true)
    const res = await apiFetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: formattedName,
        primary_phone: normalized,
        source,
          source_name: needsSourceName ? sourceName.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data?.error || 'Failed to add lead')
        setIsSubmitting(false)
        return
      }
      setLeads(prev => [data, ...prev])
      setName('')
      setPrimaryPhone('')
      setSource('')
      setSourceName('')
      setShowAdd(false)
      setIsSubmitting(false)
      if (data?.id) {
        const params = new URLSearchParams()
        params.set('from', `/leads?view=${view}`)
        router.push(`/leads/${data.id}/intake?${params.toString()}`)
      }
    }

    const phonesToCheck = normalized ? [normalized] : []
    if (phonesToCheck.length) {
      const duplicates = await checkContactDuplicates({
        phones: phonesToCheck,
      })
      if (hasDuplicates(duplicates)) {
        setDuplicateData(duplicates)
        setPendingAddSave(() => doSave)
        setShowDuplicateModal(true)
        return
      }
    }

    await doSave()
  }

  return (
    <div className="max-w-[1400px] px-3 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
      {/* Header Card — matches Sales Dashboard */}
      <div className="relative bg-[var(--surface)] rounded-[1.5rem] md:rounded-[2rem] border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-violet-50/40 via-sky-50/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-blue-50/30 via-teal-50/10 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 p-6 md:p-10">
          <div>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-[var(--foreground)]">Leads</h2>
            <p className="text-xs md:text-sm text-neutral-500 font-light mt-1.5 md:mt-2 max-w-md">
              Track inquiries, manage status, and follow up without losing context.
            </p>
          </div>
          {hydrated && (
            <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 md:gap-3 w-full lg:w-auto shrink-0">
              <input
                className="w-full md:w-64 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm px-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition placeholder:text-neutral-400 text-[var(--foreground)]"
                placeholder="Search by Name or Phone"
                value={search}
                autoComplete="off"
                onChange={e => setSearch(e.target.value)}
              />
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => {
                    setAddFieldErrors({})
                    setAddError('')
                    setAddShake(false)
                    setShowAdd(true)
                  }}
                  className="flex-1 md:flex-none justify-center rounded-full bg-neutral-900 dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-neutral-900 shadow-sm hover:bg-neutral-800 dark:hover:bg-neutral-100 transition whitespace-nowrap"
                >
                  + Add Lead
                </button>
                <div className="flex-1 md:flex-none flex justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm p-1 text-sm shadow-sm whitespace-nowrap">
                  <button
                    onClick={() => setView('kanban')}
                    className={`flex-1 flex justify-center items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full transition ${
                      view === 'kanban'
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                    Kanban
                  </button>
                  <button
                    onClick={() => setView('table')}
                    className={`flex-1 flex justify-center items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full transition ${
                      view === 'table'
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    Table
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Status Pills (Clickable) + Quick Presets + Sort */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 shadow-sm overflow-hidden">
        {/* Clickable Status Pills - Scrollable horizontally on mobile */}
        <div className="flex overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1 -mx-2 px-2 items-center gap-2 text-xs">
          <button
            onClick={() => clearFilters()}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 transition font-medium ${
              isDefaultFilters(filters)
                ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] opacity-80 hover:opacity-100'
            }`}
          >
            All <span className="font-semibold">{Object.values(totalStatusCounts).reduce((s, c) => s + (Number(c) || 0), 0)}</span>
          </button>
          {STATUSES.map(s => {
            const isActive = filters.statuses.length === 1 && filters.statuses[0] === s
            const count = totalStatusCounts[s] || 0
            return (
              <button
                key={s}
                onClick={() => {
                  if (isActive) {
                    clearFilters()
                  } else {
                    quickFilter({ statuses: [s] })
                  }
                }}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 transition ${
                  isActive
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm font-medium'
                    : 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] opacity-80 hover:opacity-100'
                }`}
              >
                <span>{s}</span>
                <span className={`font-semibold ${isActive ? 'text-white dark:text-neutral-900' : 'text-neutral-900 dark:text-white'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Quick Presets + Sort - Scrollable horizontally on mobile */}
        <div className="mt-3 flex overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-2 px-2 items-center gap-2 justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => quickFilter({ heats: ['Hot'] })}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                filters.heats.length === 1 && filters.heats[0] === 'Hot'
                  ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                  : 'border border-[var(--border)] text-neutral-600 dark:text-neutral-400 hover:bg-[var(--surface-muted)]'
              }`}
            >
              🔥 Hot Leads
            </button>
            <button
              onClick={() => quickFilter({ overdue: true })}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                filters.overdue
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                  : 'border border-[var(--border)] text-neutral-600 dark:text-neutral-400 hover:bg-[var(--surface-muted)]'
              }`}
            >
              ⏰ Overdue Follow-ups
            </button>
            <button
              onClick={() => quickFilter({ statuses: ['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance'], lastContactedMode: 'custom', lastContactedFrom: '', lastContactedTo: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() })}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium border border-[var(--border)] text-neutral-600 dark:text-neutral-400 hover:bg-[var(--surface-muted)] transition"
            >
              ⚠️ Stale 7d+
            </button>
            <button
              onClick={() => quickFilter({ eventMode: 'within_30', eventFrom: dateToYMD(new Date()), eventTo: addDays(30) })}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium border border-[var(--border)] text-neutral-600 dark:text-neutral-400 hover:bg-[var(--surface-muted)] transition"
            >
              📅 Events This Month
            </button>
          </div>

          <div className="flex items-center gap-2 pr-1 ml-auto shrink-0 flex-nowrap">
            {/* Sort Dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSortMenu(prev => !prev)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] hover:border-[var(--border-strong)] transition shadow-sm whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'value_high' ? 'Value ↓' : sortBy === 'value_low' ? 'Value ↑' : sortBy === 'event_soon' ? 'Event' : 'A-Z'}
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-md z-50 py-1 overflow-hidden">
                  {([
                    { key: 'newest' as SortKey, label: 'Newest First' },
                    { key: 'oldest' as SortKey, label: 'Oldest First' },
                    { key: 'value_high' as SortKey, label: 'Value: High → Low' },
                    { key: 'value_low' as SortKey, label: 'Value: Low → High' },
                    { key: 'event_soon' as SortKey, label: 'Event: Soonest' },
                    { key: 'name_az' as SortKey, label: 'Name: A → Z' },
                  ]).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortBy(opt.key); setShowSortMenu(false) }}
                      className={`w-full text-left px-3 py-2 text-xs transition ${
                        sortBy === opt.key ? 'bg-[var(--surface-muted)] font-semibold text-[var(--foreground)]' : 'text-neutral-500 hover:bg-[var(--surface-muted)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowFilters(prev => !prev)}
              className="rounded-full bg-[var(--foreground)] px-4 py-1.5 text-[11px] font-medium text-[var(--surface)] shadow-sm hover:opacity-90 transition whitespace-nowrap"
            >
              {showFilters ? 'Hide Filters' : 'Filters'}
            </button>
          </div>
        </div>

        {/* Active filter labels */}
        {appliedFilters.length > 0 && (
          <div className="mt-3 flex overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-2 px-2 items-center gap-2 text-[11px]">
            {appliedFilters.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-neutral-600 dark:text-neutral-300"
              >
                {label}
              </div>
            ))}
            <button
              onClick={clearFilters}
              className="rounded-full px-3 py-1 text-neutral-500 hover:text-[var(--foreground)] transition font-medium"
            >
              Clear all ×
            </button>
          </div>
        )}
      </div>

      {/* Filter Drawer — slides in from right */}
      {hydrated && (
        <>
          {/* Overlay */}
          <div
            className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${
              showFilters ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setShowFilters(false)}
          />
          {/* Drawer */}
          <div
            className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white border-l border-neutral-200 shadow-[0_0_40px_rgba(0,0,0,0.08)] transform transition-transform duration-300 ease-out ${
              showFilters ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex flex-col h-full">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">Filters</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Refine your lead pipeline</p>
                </div>
                <button
                  onClick={() => setShowFilters(false)}
                  className="p-2 rounded-full hover:bg-neutral-100 transition text-neutral-400 hover:text-neutral-700"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                <div className="grid grid-cols-1 gap-5 text-sm">
                  <div className="space-y-2">
                    <div className="text-xs text-neutral-500 font-medium">Stage</div>
                    <div className="relative" ref={stageRef}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm hover:border-neutral-300 transition"
                        onClick={() => {
                          if (!stageOpen && stageRef.current) {
                            const rect = stageRef.current.getBoundingClientRect()
                            setStagePos({ top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: 0 })
                          }
                          setStageOpen(prev => !prev)
                        }}
                      >
                        {filters.statuses.length
                          ? filters.statuses.length <= 2
                            ? filters.statuses.join(', ')
                            : `${filters.statuses.slice(0, 2).join(', ')} +${filters.statuses.length - 2}`
                          : 'All stages'}
                      </button>
                {stageOpen && stagePos && hydrated
                  ? createPortal(
                      <div
                        ref={stageMenuRef}
                        className="fixed z-[9999] rounded-lg border border-[var(--border)] bg-white p-2 shadow"
                        style={{
                          top: stagePos.top,
                          left: stagePos.left,
                          width: stagePos.width,
                          ...(stagePos.maxHeight
                            ? { maxHeight: stagePos.maxHeight, overflowY: 'auto' }
                            : { overflowY: 'visible' }),
                        }}
                      >
                        <div className="flex flex-wrap gap-2 mb-2">
                          <button
                            type="button"
                            className="rounded-full border border-[var(--border)] px-2 py-1 text-xs"
                            onClick={() =>
                              setFilters(prev => {
                                const next = ['Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance']
                                const allSelected =
                                  prev.statuses.length === next.length &&
                                  next.every(status => prev.statuses.includes(status))
                                return { ...prev, statuses: allSelected ? [] : next }
                              })
                            }
                          >
                            Follow Up
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[var(--border)] px-2 py-1 text-xs"
                            onClick={() =>
                              setFilters(prev => {
                                const next = STATUSES.filter(s => s !== 'Lost' && s !== 'Rejected')
                                const allSelected =
                                  prev.statuses.length === next.length &&
                                  next.every(status => prev.statuses.includes(status))
                                return { ...prev, statuses: allSelected ? [] : next }
                              })
                            }
                          >
                            All except Lost/Rejected
                          </button>
                        </div>
                        <div>
                          {STATUSES.map(status => {
                            const checked = filters.statuses.includes(status)
                            return (
                              <label key={status} className="flex items-center gap-2 px-2 py-1 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setFilters(prev => {
                                      const exists = prev.statuses.includes(status)
                                      return {
                                        ...prev,
                                        statuses: exists
                                          ? prev.statuses.filter(s => s !== status)
                                          : [...prev.statuses, status],
                                      }
                                    })
                                  }
                                />
                                <span>{status}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Source</div>
              <div className="relative" ref={sourceRef}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm"
                  onClick={() => {
                    if (!sourceOpen && sourceRef.current) {
                      const rect = sourceRef.current.getBoundingClientRect()
                      setSourcePos({ top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: 0 })
                    }
                    setSourceOpen(prev => !prev)
                  }}
                >
                  {filters.sources.length
                    ? filters.sources.length <= 2
                      ? filters.sources.join(', ')
                      : `${filters.sources.slice(0, 2).join(', ')} +${filters.sources.length - 2}`
                    : 'All sources'}
                </button>
                {sourceOpen && sourcePos && hydrated
                  ? createPortal(
                      <div
                        ref={sourceMenuRef}
                        className="fixed z-[9999] rounded-lg border border-[var(--border)] bg-white p-2 shadow"
                        style={{
                          top: sourcePos.top,
                          left: sourcePos.left,
                          width: sourcePos.width,
                          ...(sourcePos.maxHeight
                            ? { maxHeight: sourcePos.maxHeight, overflowY: 'auto' }
                            : { overflowY: 'visible' }),
                        }}
                      >
                        {SOURCES.map(source => {
                          const checked = filters.sources.includes(source)
                          return (
                            <label key={source} className="flex items-center gap-2 px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setFilters(prev => {
                                    const exists = prev.sources.includes(source)
                                    return {
                                      ...prev,
                                      sources: exists
                                        ? prev.sources.filter(item => item !== source)
                                        : [...prev.sources, source],
                                    }
                                  })
                                }
                              />
                              <span>{source}</span>
                            </label>
                          )
                        })}
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Heat</div>
              <div className="relative" ref={heatRef}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm"
                  onClick={() => {
                    if (!heatOpen && heatRef.current) {
                      const rect = heatRef.current.getBoundingClientRect()
                      setHeatPos({ top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: 0 })
                    }
                    setHeatOpen(prev => !prev)
                  }}
                >
                  {filters.heats.length
                    ? filters.heats.length <= 2
                      ? filters.heats.join(', ')
                      : `${filters.heats.slice(0, 2).join(', ')} +${filters.heats.length - 2}`
                    : 'All heat'}
                </button>
                {heatOpen && heatPos && hydrated
                  ? createPortal(
                      <div
                        ref={heatMenuRef}
                        className="fixed z-[9999] rounded-lg border border-[var(--border)] bg-white p-2 shadow"
                        style={{
                          top: heatPos.top,
                          left: heatPos.left,
                          width: heatPos.width,
                          ...(heatPos.maxHeight
                            ? { maxHeight: heatPos.maxHeight, overflowY: 'auto' }
                            : { overflowY: 'visible' }),
                        }}
                      >
                        {HEATS.map(heat => {
                          const checked = filters.heats.includes(heat)
                          return (
                            <label key={heat} className="flex items-center gap-2 px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setFilters(prev => {
                                    const exists = prev.heats.includes(heat)
                                    return {
                                      ...prev,
                                      heats: exists
                                        ? prev.heats.filter(item => item !== heat)
                                        : [...prev.heats, heat],
                                    }
                                  })
                                }
                              />
                              <span>{heat}</span>
                            </label>
                          )
                        })}
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Lead created</div>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={filters.createdMode}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    createdMode: e.target.value,
                    createdFrom: e.target.value === 'custom' ? prev.createdFrom : '',
                    createdTo: e.target.value === 'custom' ? prev.createdTo : '',
                  }))
                }
              >
                <option value="any">Any time</option>
                <option value="last_7">Last 7 days</option>
                <option value="between_7_30">7 to 30 days</option>
                <option value="before_30">Before 30 days</option>
                <option value="custom">Custom range</option>
              </select>
              {filters.createdMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.createdFrom}
                    onChange={val => setFilters(prev => ({ ...prev, createdFrom: val }))}
                  />
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.createdTo}
                    onChange={val => setFilters(prev => ({ ...prev, createdTo: val }))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Event date</div>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={filters.eventMode}
                onChange={e => setFilters(prev => ({ ...prev, eventMode: e.target.value }))}
              >
                <option value="any">Any month</option>
                <option value="within_30">Within 30 days</option>
                <option value="within_90">Within 3 months</option>
                <option value="between_90_180">3–6 months out</option>
                <option value="after_180">After 6 months</option>
                <option value="custom">Custom range</option>
              </select>
              {filters.eventMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.eventFrom}
                    onChange={val => setFilters(prev => ({ ...prev, eventFrom: val }))}
                  />
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.eventTo}
                    onChange={val => setFilters(prev => ({ ...prev, eventTo: val }))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Priority</div>
              <div className="relative" ref={priorityRef}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm"
                  onClick={() => {
                    if (!priorityOpen && priorityRef.current) {
                      const rect = priorityRef.current.getBoundingClientRect()
                      setPriorityPos({ top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: 0 })
                    }
                    setPriorityOpen(prev => !prev)
                  }}
                >
                  {filters.priorities.length
                    ? filters.priorities.length <= 2
                      ? filters.priorities
                          .map(value => PRIORITIES.find(item => item.key === value)?.label || value)
                          .join(', ')
                      : `${filters.priorities
                          .slice(0, 2)
                          .map(value => PRIORITIES.find(item => item.key === value)?.label || value)
                          .join(', ')} +${filters.priorities.length - 2}`
                    : 'All priorities'}
                </button>
                {priorityOpen && priorityPos && hydrated
                  ? createPortal(
                      <div
                        ref={priorityMenuRef}
                        className="fixed z-[9999] rounded-lg border border-[var(--border)] bg-white p-2 shadow"
                        style={{
                          top: priorityPos.top,
                          left: priorityPos.left,
                          width: priorityPos.width,
                          ...(priorityPos.maxHeight
                            ? { maxHeight: priorityPos.maxHeight, overflowY: 'auto' }
                            : { overflowY: 'visible' }),
                        }}
                      >
                        {PRIORITIES.map(item => {
                          const checked = filters.priorities.includes(item.key)
                          return (
                            <label key={item.key} className="flex items-center gap-2 px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setFilters(prev => {
                                    const exists = prev.priorities.includes(item.key)
                                    return {
                                      ...prev,
                                      priorities: exists
                                        ? prev.priorities.filter(value => value !== item.key)
                                        : [...prev.priorities, item.key],
                                    }
                                  })
                                }
                              />
                              <span>{item.label}</span>
                            </label>
                          )
                        })}
                      </div>,
                      document.body
                    )
                  : null}
              </div>
            </div>


              <div className="space-y-2">
                <div className="text-xs text-neutral-500">Amount quoted (₹)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Min"
                    value={filters.amountMin}
                    onChange={e => setFilters(prev => ({ ...prev, amountMin: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, amountMin: formatMoneyInput(e.target.value) }))}
                  />
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Max"
                    value={filters.amountMax}
                    onChange={e => setFilters(prev => ({ ...prev, amountMax: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, amountMax: formatMoneyInput(e.target.value) }))}
                  />
                </div>
                {(() => {
                  const minVal = parseMoneyValue(filters.amountMin, 0)
                  const maxVal = parseMoneyValue(filters.amountMax, MAX_MONEY)
                  const minPct = toPercent(minVal)
                  const maxPct = toPercent(maxVal)
                  const leftPct = Math.min(minPct, maxPct)
                  const rightPct = Math.max(minPct, maxPct)
                  const minOnTop =
                    activeSlider?.key === 'amount'
                      ? activeSlider.handle === 'min'
                      : minVal >= maxVal - 20000
                  return (
                    <div className="relative h-8">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-neutral-200" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-blue-500"
                        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-20' : 'z-10'
                        }`}
                        value={minVal}
                        onMouseDown={() => setActiveSlider({ key: 'amount', handle: 'min' })}
                        onTouchStart={() => setActiveSlider({ key: 'amount', handle: 'min' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('amountMin', 'amountMax', e.target.value, true)}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-10' : 'z-20'
                        }`}
                        value={maxVal}
                        onMouseDown={() => setActiveSlider({ key: 'amount', handle: 'max' })}
                        onTouchStart={() => setActiveSlider({ key: 'amount', handle: 'max' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('amountMin', 'amountMax', e.target.value, false)}
                      />
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <div className="text-xs text-neutral-500">Discounted price (₹)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Min"
                    value={filters.discountMin}
                    onChange={e => setFilters(prev => ({ ...prev, discountMin: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, discountMin: formatMoneyInput(e.target.value) }))}
                  />
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Max"
                    value={filters.discountMax}
                    onChange={e => setFilters(prev => ({ ...prev, discountMax: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, discountMax: formatMoneyInput(e.target.value) }))}
                  />
                </div>
                {(() => {
                  const minVal = parseMoneyValue(filters.discountMin, 0)
                  const maxVal = parseMoneyValue(filters.discountMax, MAX_MONEY)
                  const minPct = toPercent(minVal)
                  const maxPct = toPercent(maxVal)
                  const leftPct = Math.min(minPct, maxPct)
                  const rightPct = Math.max(minPct, maxPct)
                  const minOnTop =
                    activeSlider?.key === 'discount'
                      ? activeSlider.handle === 'min'
                      : minVal >= maxVal - 20000
                  return (
                    <div className="relative h-8">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-neutral-200" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-blue-500"
                        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-20' : 'z-10'
                        }`}
                        value={minVal}
                        onMouseDown={() => setActiveSlider({ key: 'discount', handle: 'min' })}
                        onTouchStart={() => setActiveSlider({ key: 'discount', handle: 'min' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('discountMin', 'discountMax', e.target.value, true)}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-10' : 'z-20'
                        }`}
                        value={maxVal}
                        onMouseDown={() => setActiveSlider({ key: 'discount', handle: 'max' })}
                        onTouchStart={() => setActiveSlider({ key: 'discount', handle: 'max' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('discountMin', 'discountMax', e.target.value, false)}
                      />
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-2">
                <div className="text-xs text-neutral-500">Client budget (₹)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Min"
                    value={filters.budgetMin}
                    onChange={e => setFilters(prev => ({ ...prev, budgetMin: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, budgetMin: formatMoneyInput(e.target.value) }))}
                  />
                  <input
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    placeholder="Max"
                    value={filters.budgetMax}
                    onChange={e => setFilters(prev => ({ ...prev, budgetMax: e.target.value }))}
                    onBlur={e => setFilters(prev => ({ ...prev, budgetMax: formatMoneyInput(e.target.value) }))}
                  />
                </div>
                {(() => {
                  const minVal = parseMoneyValue(filters.budgetMin, 0)
                  const maxVal = parseMoneyValue(filters.budgetMax, MAX_MONEY)
                  const minPct = toPercent(minVal)
                  const maxPct = toPercent(maxVal)
                  const leftPct = Math.min(minPct, maxPct)
                  const rightPct = Math.max(minPct, maxPct)
                  const minOnTop =
                    activeSlider?.key === 'budget'
                      ? activeSlider.handle === 'min'
                      : minVal >= maxVal - 20000
                  return (
                    <div className="relative h-8">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-neutral-200" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-blue-500"
                        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-20' : 'z-10'
                        }`}
                        value={minVal}
                        onMouseDown={() => setActiveSlider({ key: 'budget', handle: 'min' })}
                        onTouchStart={() => setActiveSlider({ key: 'budget', handle: 'min' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('budgetMin', 'budgetMax', e.target.value, true)}
                      />
                      <input
                        type="range"
                        min={0}
                        max={MAX_MONEY}
                        step={20000}
                        className={`dual-range absolute inset-0 w-full bg-transparent ${
                          minOnTop ? 'z-10' : 'z-20'
                        }`}
                        value={maxVal}
                        onMouseDown={() => setActiveSlider({ key: 'budget', handle: 'max' })}
                        onTouchStart={() => setActiveSlider({ key: 'budget', handle: 'max' })}
                        onMouseUp={() => setActiveSlider(null)}
                        onTouchEnd={() => setActiveSlider(null)}
                        onChange={e => updateRange('budgetMin', 'budgetMax', e.target.value, false)}
                      />
                    </div>
                  )
                })()}
              </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Follow-up hygiene</div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.overdue}
                    onChange={e => setFilters(prev => ({ ...prev, overdue: e.target.checked }))}
                  />
                  <span>Follow-up overdue</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.followupDone}
                    onChange={e => setFilters(prev => ({ ...prev, followupDone: e.target.checked }))}
                  />
                  <span>Follow-up done</span>
                </label>
              </div>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={filters.lastContactedMode}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    lastContactedMode: e.target.value,
                    lastContactedFrom: e.target.value === 'custom' ? prev.lastContactedFrom : '',
                    lastContactedTo: e.target.value === 'custom' ? prev.lastContactedTo : '',
                  }))
                }
              >
                <option value="any">Last contacted (any)</option>
                <option value="within_7">Last contacted within 7 days</option>
                <option value="within_30">Last contacted within 30 days</option>
                <option value="custom">Last contacted (custom)</option>
              </select>
              {filters.lastContactedMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.lastContactedFrom}
                    onChange={val => setFilters(prev => ({ ...prev, lastContactedFrom: val }))}
                  />
                  <CalendarInput
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={filters.lastContactedTo}
                    onChange={val => setFilters(prev => ({ ...prev, lastContactedTo: val }))}
                  />
                </div>
              )}
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={filters.notContactedMin}
                onChange={e => setFilters(prev => ({ ...prev, notContactedMin: e.target.value }))}
              >
                <option value="">Not contacted attempts (any)</option>
                <option value="2">Not contacted 2+ times</option>
                <option value="5">Not contacted 5+ times</option>
                <option value="10">Not contacted 10+ times</option>
              </select>
            </div>
          </div>

              {/* Drawer Footer */}
              </div>
              <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
                <button
                  onClick={applyFilters}
                  className="flex-1 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition"
                >
                  Apply Filters
                </button>
                <button
                  onClick={() => { clearFilters(); setShowFilters(false); }}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
                >
                  {isDefaultFilters(filters) ? 'Close' : 'Clear All'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}


      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        {!hydrated ? (
          <div className="text-sm text-neutral-500">Loading leads…</div>
        ) : view === 'kanban' ? (
          <SalesKanbanView
            showHeader={false}
            leads={filteredLeads}
            loading={loading}
            loadError={loadError}
            onLeadsChange={setLeads}
            onRefresh={refreshLeads}
          />
        ) : (
          <SalesTableView
            showHeader={false}
            leads={filteredLeads}
            loading={loading}
            loadError={loadError}
            onLeadsChange={setLeads}
          />
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Lead</h3>
              <button
                onClick={() => {
                  setAddFieldErrors({})
                  setAddError('')
                  setAddShake(false)
                  setShowAdd(false)
                }}
                className="text-sm text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <input
                className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] placeholder:text-neutral-400 ${addFieldErrors.name ? 'field-error' : ''} ${addFieldErrors.name && addShake ? 'shake' : ''}`}
                placeholder="Full Name*"
                value={name}
                autoComplete="new-password"
                onChange={e => {
                  setName(e.target.value)
                  if (addFieldErrors.name && e.target.value.trim()) {
                    setAddFieldErrors(prev => ({ ...prev, name: undefined }))
                  }
                }}
                onBlur={e => setName(formatName(e.target.value))}
              />
              {addFieldErrors.name && (
                <div className="text-xs text-red-600">{addFieldErrors.name}</div>
              )}
              <PhoneField
                className={`border-black ${addFieldErrors.primaryPhone ? 'field-error' : ''} ${addFieldErrors.primaryPhone && addShake ? 'shake' : ''}`}
                placeholder="Contact Number*"
                value={primaryPhone || null}
                onChange={v => {
                  setPrimaryPhone(String(v ?? ''))
                  if (addFieldErrors.primaryPhone && isValidPhone(String(v ?? ''))) {
                    setAddFieldErrors(prev => ({ ...prev, primaryPhone: undefined }))
                  }
                }}
              />
              {addFieldErrors.primaryPhone && (
                <div className="text-xs text-red-600">{addFieldErrors.primaryPhone}</div>
              )}
              <select
                className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] ${!source ? 'text-neutral-400' : ''} ${addFieldErrors.source ? 'field-error' : ''} ${addFieldErrors.source && addShake ? 'shake' : ''}`}
                value={source}
                onChange={e => {
                  setSource(e.target.value)
                  if (!['Direct Call', 'WhatsApp', 'Reference'].includes(e.target.value)) {
                    setSourceName('')
                  }
                  if (addFieldErrors.source && e.target.value) {
                    setAddFieldErrors(prev => ({ ...prev, source: undefined }))
                  }
                }}
              >
                <option value="" disabled>Source*</option>
                <option value="Instagram">Instagram</option>
                <option value="Direct Call">Direct Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Reference">Reference</option>
                <option value="Website">Website</option>
                <option value="Unknown">Unknown</option>
              </select>
              {['Direct Call', 'WhatsApp', 'Reference'].includes(source) && (
                <input
                  className={`border border-black rounded-lg px-3 py-2 bg-[var(--surface)] placeholder:text-neutral-400 ${addFieldErrors.sourceName ? 'field-error' : ''} ${addFieldErrors.sourceName && addShake ? 'shake' : ''}`}
                  placeholder="Name *"
                  value={sourceName}
                  autoComplete="new-password"
                  onChange={e => {
                    setSourceName(e.target.value)
                    if (addFieldErrors.sourceName && e.target.value.trim()) {
                      setAddFieldErrors(prev => ({ ...prev, sourceName: undefined }))
                    }
                  }}
                />
              )}
              {addFieldErrors.sourceName && (
                <div className="text-xs text-red-600">{addFieldErrors.sourceName}</div>
              )}
              {addFieldErrors.source && (
                <div className="text-xs text-red-600">{addFieldErrors.source}</div>
              )}
            </div>
            {addError && (
              <div className="mt-3 text-sm text-red-600">{addError}</div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAddFieldErrors({})
                  setAddError('')
                  setAddShake(false)
                  setShowAdd(false)
                }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .dual-range {
          pointer-events: none;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        .dual-range::-webkit-slider-thumb {
          pointer-events: auto;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #111827;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
        }
        .dual-range::-moz-range-thumb {
          pointer-events: auto;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #111827;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
        }
        .dual-range::-ms-thumb {
          pointer-events: auto;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #111827;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
        }
        .dual-range::-webkit-slider-runnable-track {
          background: transparent;
        }
        .dual-range::-moz-range-track {
          background: transparent;
        }
        .dual-range::-ms-track {
          background: transparent;
        }
        .dual-range::-moz-range-progress {
          background: transparent;
        }
        .dual-range::-ms-fill-lower {
          background: transparent;
        }
        .dual-range::-ms-fill-upper {
          background: transparent;
        }
      `}</style>

      <DuplicateContactModal
        open={showDuplicateModal}
        duplicates={duplicateData}
        onContinue={() => {
          const action = pendingAddSave
          setShowDuplicateModal(false)
          setDuplicateData(null)
          setPendingAddSave(null)
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
    </div>
  )
}
