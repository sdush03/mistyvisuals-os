'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  const router = useRouter()
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
  const [isEditingPortal, setIsEditingPortal] = useState(false)

  // Client Details Edit State
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [brideName, setBrideName] = useState('')
  const [groomName, setGroomName] = useState('')
  const [bridePhone, setBridePhone] = useState('')
  const [groomPhone, setGroomPhone] = useState('')
  const [brideEmail, setBrideEmail] = useState('')
  const [groomEmail, setGroomEmail] = useState('')
  const [brideInsta, setBrideInsta] = useState('')
  const [groomInsta, setGroomInsta] = useState('')
  const [city, setCity] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isDestination, setIsDestination] = useState(false)
  const [projNotes, setProjNotes] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const [portalDomain, setPortalDomain] = useState('https://mistyvisuals.com')
  const [portalDomainLabel, setPortalDomainLabel] = useState('mistyvisuals.com')

  // AI Gallery States
  const [galleryEvent, setGalleryEvent] = useState<any>(null)
  const [galleryPhotos, setGalleryPhotos] = useState<any[]>([])
  const [loadingGallery, setLoadingGallery] = useState(false)
  const [creatingGallery, setCreatingGallery] = useState(false)
  const [showUploaderPrompt, setShowUploaderPrompt] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [activeGalleryTab, setActiveGalleryTab] = useState('All')
  const [gallerySort, setGallerySort] = useState<'capture' | 'filename'>('capture')

  const [uploadingHorizontal, setUploadingHorizontal] = useState(false)
  const [uploadingVertical, setUploadingVertical] = useState(false)

  const horizontalInputRef = useRef<HTMLInputElement>(null)
  const verticalInputRef = useRef<HTMLInputElement>(null)

  const handleCoverUpload = async (file: File, type: 'horizontal' | 'vertical') => {
    if (!galleryEvent) return
    
    if (type === 'horizontal') setUploadingHorizontal(true)
    else setUploadingVertical(true)

    try {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        const base64Content = (reader.result as string).split(',')[1]
        
        const res = await fetch(`/api/gallery/events/${galleryEvent.id}/covers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type,
            filename: file.name,
            fileContent: base64Content
          })
        })

        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || 'Failed to upload cover')
        }

        // Refresh gallery info using project UUID
        await fetchGalleryDetails(project.id)
        setToastMessage(`${type === 'horizontal' ? 'Landscape' : 'Portrait'} cover updated successfully!`)
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Upload failed')
    } finally {
      if (type === 'horizontal') setUploadingHorizontal(false)
      else setUploadingVertical(false)
    }
  }

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  // Fetches gallery by project UUID (stable — unaffected by slug changes)
  const fetchGalleryDetails = useCallback(async (projId: string) => {
    setLoadingGallery(true)
    try {
      // Admin route: lookup by project UUID, not slug
      const res = await fetch(`/api/gallery/events/by-project/${projId}`, { credentials: 'include' })
      if (res.ok) {
        const eventData = await res.json()
        setGalleryEvent(eventData)

        // Fetch photos using the gallery's own slug (the public endpoint)
        const photosRes = await fetch(`/api/gallery/public/events/${eventData.slug}/photos`)
        if (photosRes.ok) {
          const photosData = await photosRes.json()
          setGalleryPhotos(photosData.photos || [])
        }
      } else {
        setGalleryEvent(null)
        setGalleryPhotos([])
      }
    } catch (err) {
      console.error('Error loading gallery details:', err)
    } finally {
      setLoadingGallery(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost') {
        setPortalDomain('http://localhost:3000')
        setPortalDomainLabel('localhost:3000')
      } else {
        setPortalDomain('https://mistyvisuals.com')
        setPortalDomainLabel('mistyvisuals.com')
      }
    }
  }, [])

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

  useEffect(() => {
    // Use the project's UUID (not slug) so gallery lookup is unaffected by slug changes
    if (project?.id) {
      fetchGalleryDetails(project.id)
    }
  }, [project?.id, fetchGalleryDetails])
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

  // Gallery tabs and sorted photos
  const galleryTabs = useMemo(() => {
    const tabs = new Set<string>()
    galleryPhotos.forEach(p => {
      if (p.tabName) tabs.add(p.tabName)
    })
    return Array.from(tabs)
  }, [galleryPhotos])

  const sortedPhotos = useMemo(() => {
    let list = [...galleryPhotos]
    if (activeGalleryTab !== 'All') {
      list = list.filter(p => p.tabName === activeGalleryTab)
    }
    if (gallerySort === 'capture') {
      list.sort((a, b) => {
        const tA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0
        const tB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0
        return tA - tB
      })
    } else {
      list.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''))
    }
    return list
  }, [galleryPhotos, activeGalleryTab, gallerySort])

  useEffect(() => {
    if (project && !portalInitialized) {
      let recommendedSlug = project.slug || ''
      if (!recommendedSlug) {
        let nameBase = '';
        const bName = (project.bride_name || '').trim();
        const gName = (project.groom_name || '').trim();
        if (bName && gName) {
          const brideFirst = bName.split(/\s+/)[0];
          const groomFirst = gName.split(/\s+/)[0];
          nameBase = `${brideFirst}-${groomFirst}`;
        } else if (bName) {
          nameBase = bName.split(/\s+/)[0];
        } else if (gName) {
          nameBase = gName.split(/\s+/)[0];
        } else {
          nameBase = (project.name || '');
        }

        nameBase = nameBase.toLowerCase()
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

  useEffect(() => {
    if (project) {
      setBrideName(project.bride_name || '')
      setGroomName(project.groom_name || '')
      setBridePhone(project.bride_phone_primary || '')
      setGroomPhone(project.groom_phone_primary || '')
      setBrideEmail(project.bride_email || '')
      setGroomEmail(project.groom_email || '')
      setBrideInsta(project.bride_instagram || '')
      setGroomInsta(project.groom_instagram || '')
      setCity(project.city || '')
      setStartDate(project.start_date ? project.start_date.split('T')[0] : '')
      setEndDate(project.end_date ? project.end_date.split('T')[0] : '')
      setIsDestination(!!project.is_destination)
      setProjNotes(project.notes || '')
    }
  }, [project])

  const handleSaveDetails = async () => {
    try {
      setSavingDetails(true)
      setDetailsError('')
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bride_name: brideName,
          groom_name: groomName,
          bride_phone_primary: bridePhone,
          groom_phone_primary: groomPhone,
          bride_email: brideEmail,
          groom_email: groomEmail,
          bride_instagram: brideInsta,
          groom_instagram: groomInsta,
          city,
          start_date: startDate || null,
          end_date: endDate || null,
          is_destination: isDestination,
          notes: projNotes
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save details')
      }
      setIsEditingDetails(false)
      mutate()
    } catch (e: any) {
      setDetailsError(e.message)
    } finally {
      setSavingDetails(false)
    }
  }

  const handleRevisePricing = async () => {
    if (!project?.quote_group_id) {
      alert('No active quote group associated with this project.')
      return
    }
    try {
      const res = await fetch(`/api/quote-groups/${project.quote_group_id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Copies latest version.
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create pricing revision draft.')
      }
      const newVersion = await res.json()
      router.push(`/projects/${projectId}/quotes/${newVersion.id}`)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleCreateGallery = useCallback(async () => {
    if (!project?.id || !project?.slug) return
    setCreatingGallery(true)
    try {
      const res = await fetch(`/api/gallery/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,           // UUID — stable, used for upsert (no duplicates)
          slug: project.slug,
          title: project.name || `${project.bride_name || ''} & ${project.groom_name || ''}'s Wedding`,
          date: project.start_date || new Date().toISOString(),
          coverPhotoUrl: null,
          leadId: project.lead_id
          // qrToken omitted — backend derives it deterministically as `${slug}_qr`
        }),
      })
      if (res.ok) {
        await fetchGalleryDetails(project.id)  // Refresh using project UUID
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create gallery')
      }
    } catch (err) {
      console.error('Error creating gallery:', err)
    } finally {
      setCreatingGallery(false)
    }
  }, [project, fetchGalleryDetails])

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
      const oldSlug = project?.slug
      setPortalSaved(true)
      setIsEditingPortal(false)
      mutate()
      setTimeout(() => setPortalSaved(false), 3000)
      if (localSlug !== oldSlug) {
        router.push(`/projects/${localSlug}`)
      }
    } catch (err: any) {
      setPortalError(err.message || 'Failed to update portal credentials.')
    } finally {
      setSavingPortal(false)
    }
  }, [localSlug, localPasscode, projectId, mutate, router, project])

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
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--foreground)] truncate">{project.name}</h1>
            {project.lead_name && <p className="text-xs text-neutral-500 mt-1">Created from: {project.lead_name}</p>}
          </div>
          <div className="flex items-center gap-3">
            {!isEditingDetails && (
              <button
                onClick={() => setIsEditingDetails(true)}
                className="text-xs font-semibold px-4 py-2 border border-[var(--border)] rounded-xl hover:bg-[var(--surface-muted)] text-[var(--foreground)] transition shadow-sm"
              >
                ✏️ Edit Project Details
              </button>
            )}
            <select
              value={project.status}
              onChange={e => handleStatusChange(e.target.value)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border cursor-pointer bg-transparent ${STATUS_COLORS[project.status]}`}
            >
              {['upcoming', 'ongoing', 'completed', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {!isEditingDetails ? (
          <div className="space-y-6 border-t border-[var(--border)] pt-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Dates & Location */}
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Project Meta</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="block text-neutral-400">City / Location</span>
                    <span className="font-semibold text-[var(--foreground)]">{project.city || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="block text-neutral-400">Type</span>
                    <span className="font-semibold text-[var(--foreground)]">{project.is_destination ? 'Destination' : 'Local'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-neutral-400">Event Dates</span>
                    <span className="font-semibold text-[var(--foreground)]">📅 {fmtDate(project.start_date)} → {fmtDate(project.end_date)}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Bride & Groom */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Bride Profile</h4>
                  {project.bride_name ? (
                    <div className="text-xs space-y-1 text-[var(--foreground)]">
                      <div className="font-semibold text-sm">{project.bride_name}</div>
                      <div>📞 {project.bride_phone_primary || '—'}</div>
                      <div>✉️ {project.bride_email || '—'}</div>
                      <div>📸 {project.bride_instagram ? `@${project.bride_instagram.replace('@', '')}` : '—'}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">No Bride details added</span>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Groom Profile</h4>
                  {project.groom_name ? (
                    <div className="text-xs space-y-1 text-[var(--foreground)]">
                      <div className="font-semibold text-sm">{project.groom_name}</div>
                      <div>📞 {project.groom_phone_primary || '—'}</div>
                      <div>✉️ {project.groom_email || '—'}</div>
                      <div>📸 {project.groom_instagram ? `@${project.groom_instagram.replace('@', '')}` : '—'}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">No Groom details added</span>
                  )}
                </div>
              </div>
            </div>

            {project.notes && (
              <div className="bg-[var(--surface-muted)] border border-[var(--border)] p-4 rounded-xl text-xs text-neutral-600">
                <span className="block uppercase tracking-wider text-neutral-400 font-bold mb-1">Internal Project Notes</span>
                <p className="whitespace-pre-wrap">{project.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-[var(--border)] pt-5 space-y-4 text-xs">
            <h3 className="text-xs font-semibold text-[var(--foreground)] mb-2">Edit Project details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Meta & Notes */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1">City / Location</label>
                    <input
                      type="text"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-neutral-400 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">Project Type</label>
                    <select
                      value={isDestination ? 'yes' : 'no'}
                      onChange={e => setIsDestination(e.target.value === 'yes')}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-neutral-400 text-xs text-[var(--foreground)] font-medium cursor-pointer"
                    >
                      <option value="no">Local</option>
                      <option value="yes">Destination</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-neutral-400 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-neutral-400 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Internal Notes</label>
                  <textarea
                    rows={3}
                    value={projNotes}
                    onChange={e => setProjNotes(e.target.value)}
                    className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-neutral-400 text-xs text-[var(--foreground)] font-medium"
                    placeholder="Wedding details, planner name, references..."
                  />
                </div>
              </div>

              {/* Bride & Groom Form */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="font-semibold text-neutral-500 border-b border-[var(--border)] pb-1 mb-1">Bride Profile</div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Bride Name</label>
                    <input
                      type="text"
                      value={brideName}
                      onChange={e => setBrideName(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Primary Phone</label>
                    <input
                      type="text"
                      value={bridePhone}
                      onChange={e => setBridePhone(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Email</label>
                    <input
                      type="email"
                      value={brideEmail}
                      onChange={e => setBrideEmail(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Instagram Handle</label>
                    <input
                      type="text"
                      value={brideInsta}
                      onChange={e => setBrideInsta(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                      placeholder="e.g. bride_insta"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-semibold text-neutral-500 border-b border-[var(--border)] pb-1 mb-1">Groom Profile</div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Groom Name</label>
                    <input
                      type="text"
                      value={groomName}
                      onChange={e => setGroomName(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Primary Phone</label>
                    <input
                      type="text"
                      value={groomPhone}
                      onChange={e => setGroomPhone(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Email</label>
                    <input
                      type="email"
                      value={groomEmail}
                      onChange={e => setGroomEmail(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5">Instagram Handle</label>
                    <input
                      type="text"
                      value={groomInsta}
                      onChange={e => setGroomInsta(e.target.value)}
                      className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-1.5 text-xs text-[var(--foreground)] font-medium"
                      placeholder="e.g. groom_insta"
                    />
                  </div>
                </div>
              </div>

            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-[var(--border)]">
              <button
                onClick={handleSaveDetails}
                disabled={savingDetails}
                className="bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl transition"
              >
                {savingDetails ? 'Saving...' : 'Save details'}
              </button>
              <button
                onClick={() => setIsEditingDetails(false)}
                className="bg-white border border-[var(--border)] hover:bg-[var(--surface-muted)] text-neutral-600 font-semibold px-4 py-2 rounded-xl transition"
              >
                Cancel
              </button>
              {detailsError && <span className="text-rose-500 font-medium">{detailsError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ══════ CLIENT PORTAL ══════ */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            🌐 Client Workspace Portal
          </h2>
          {!isEditingPortal && (
            <button
              onClick={() => setIsEditingPortal(true)}
              className="text-[10px] font-bold text-neutral-500 hover:text-neutral-900 px-3 py-1 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition"
            >
              Edit Settings
            </button>
          )}
        </div>

        {!isEditingPortal ? (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Custom Slug Display */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Custom URL Slug</label>
              <div className="flex items-center justify-between bg-neutral-50/50 border border-neutral-200 rounded-xl overflow-hidden pr-2">
                <div className="flex items-center min-w-0 py-2.5 pl-3">
                  <span className="text-xs text-neutral-400 select-none">{portalDomainLabel}/</span>
                  {project.slug ? (
                    <a
                      href={`${portalDomain}/${project.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-neutral-800 hover:text-neutral-900 hover:underline break-all"
                    >
                      {project.slug}
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-400 italic font-medium">{localSlug}</span>
                  )}
                </div>
                {project.slug && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${portalDomain}/${project.slug}`);
                    }}
                    className="p-1.5 hover:bg-neutral-200/50 rounded-lg transition shrink-0"
                    title="Copy Client Link"
                  >
                    <svg className="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-600 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Passcode Display */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Passcode (Last 4 digits phone)</label>
              <div className="flex items-center justify-between bg-neutral-50/50 border border-neutral-200 rounded-xl overflow-hidden py-2.5 px-3">
                <span className="text-xs font-mono font-semibold text-neutral-800">
                  {project.passcode || localPasscode || 'Not set'}
                </span>
                {project.passcode && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(project.passcode || '');
                    }}
                    className="p-1.5 hover:bg-neutral-200/50 rounded-lg transition shrink-0"
                    title="Copy Passcode"
                  >
                    <svg className="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-600 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Custom Slug Input */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Custom URL Slug</label>
                <div className="flex items-center bg-white rounded-xl border border-neutral-200 focus-within:border-neutral-400 transition-colors shadow-sm overflow-hidden">
                  <span className="text-xs text-neutral-400 pl-3 select-none">{portalDomainLabel}/</span>
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
                <button
                  onClick={() => {
                    setIsEditingPortal(false);
                    setLocalSlug(project.slug || '');
                    setLocalPasscode(project.passcode || '');
                  }}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                >
                  Cancel
                </button>
                {portalSaved && <span className="text-xs text-emerald-500 font-medium">✓ Settings saved!</span>}
                {portalError && <span className="text-xs text-rose-500 font-medium">{portalError}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Welcome Text Invitation Button */}
        {project.slug && !isEditingPortal && (
          <div className="pt-3 border-t border-neutral-100 flex justify-end">
            <button
              id="copy-invite-btn"
              onClick={() => {
                const inviteText = `Here is your Misty Visuals client portal link:\n${portalDomain}/${project.slug}\n\nPasscode: ${project.passcode}`
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
          </div>
        )}
      </div>

      {/* ══════ AI PHOTO GALLERY ══════ */}
      <div className="bg-[var(--surface)] p-5 md:p-6 rounded-2xl border border-[var(--border)] space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            📸 AI Photo Gallery
          </h2>
          {galleryEvent && (
            <button
              onClick={() => setShowShareModal(true)}
              className="bg-[#0f172a] hover:bg-[#1e293b] text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              🔗 Share Invite
            </button>
          )}
        </div>

        {loadingGallery ? (
          <div className="py-8 text-center text-xs text-neutral-500 animate-pulse">Loading gallery details...</div>
        ) : !galleryEvent ? (
          <div className="text-center py-6">
            <p className="text-xs text-neutral-500 mb-2">Gallery not found for this project.</p>
            <p className="text-[11px] text-neutral-600 mb-4">New projects get a gallery automatically. Use this only for older projects.</p>
            <button
              onClick={handleCreateGallery}
              disabled={creatingGallery || !project?.slug}
              className="bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              {creatingGallery ? 'Creating...' : 'Create Gallery'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Gallery Info & Link */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Gallery Portal URL</span>
                <a
                  href={`${portalDomain}/${project?.slug}/gallery`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-500 hover:underline break-all"
                >
                  {portalDomainLabel}/{project?.slug}/gallery
                </a>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Upload Photos</span>
                <button
                  onClick={() => setShowUploaderPrompt(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-sm cursor-pointer"
                >
                  📤 Upload Photos
                </button>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Preview Gallery</span>
                <a
                  href={`/projects/${project?.slug}/gallery`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer text-center"
                >
                  👁 View Gallery as Admin
                </a>
              </div>
            </div>

            {/* Responsive Covers Display */}
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Hidden Inputs */}
              <input
                type="file"
                ref={horizontalInputRef}
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleCoverUpload(file, 'horizontal')
                }}
              />
              <input
                type="file"
                ref={verticalInputRef}
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleCoverUpload(file, 'vertical')
                }}
              />

              <div>
                <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Landscape Cover (Widescreen)</span>
                <div 
                  onClick={() => horizontalInputRef.current?.click()}
                  className="relative h-[180px] md:h-[220px] aspect-video rounded-xl border border-[var(--border)] overflow-hidden bg-neutral-100 cursor-pointer group"
                >
                  {uploadingHorizontal ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs font-semibold">Uploading...</div>
                  ) : (
                    <>
                      {galleryEvent.coverPhotoUrl ? (
                        <img src={galleryEvent.coverPhotoUrl} alt="Landscape Cover" className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-400 italic">No landscape cover</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-semibold transition duration-200">
                        <span>📸 Change Landscape Cover</span>
                        <span className="text-[10px] opacity-75 font-normal mt-1">(Click to Upload)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mb-1.5 font-semibold">Portrait Cover (Mobile)</span>
                <div 
                  onClick={() => verticalInputRef.current?.click()}
                  className="relative h-[180px] md:h-[220px] aspect-[9/16] rounded-xl border border-[var(--border)] overflow-hidden bg-neutral-100 cursor-pointer group"
                >
                  {uploadingVertical ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs font-semibold">Uploading...</div>
                  ) : (
                    <>
                      {galleryEvent.coverPhotoMobileUrl ? (
                        <img src={galleryEvent.coverPhotoMobileUrl} alt="Portrait Cover" className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-400 italic text-center px-2">No portrait cover</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-xs font-semibold transition duration-200 text-center px-2">
                        <span>📸 Change Portrait Cover</span>
                        <span className="opacity-75 font-normal mt-1">(Click to Upload)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>


          </div>
        )}
      </div>

      {/* Uploader Prompt Modal */}
      {showUploaderPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-neutral-100 shadow-2xl animate-waterfall text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
            </div>
            <h3 className="font-lora text-lg font-semibold mb-2 text-[#111111]">Misty Visuals Uploader Required</h3>
            <p className="font-sans text-xs text-neutral-500 mb-6 max-w-xs">
              Uploading large batches of raw, high-resolution wedding photos is disabled on web browsers to protect memory and server bandwidth.
            </p>
            
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 w-full mb-6 text-left">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1 font-semibold">Event Code for Desktop App</p>
              <div className="flex items-center justify-between">
                <code className="text-xs font-mono font-bold text-neutral-800">{project?.slug}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(project?.slug || '');
                    alert('Copied event code!');
                  }}
                  className="text-[10px] text-blue-500 font-semibold hover:underline"
                >
                  Copy Code
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => {
                  alert('Launching Misty Visuals Desktop App...');
                  window.location.href = `mistyuploader://event/${project?.slug}`;
                }}
                className="w-full py-3 bg-[#0f172a] text-white rounded-xl font-sans text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                🚀 Open Desktop App
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => alert('Downloading Installer for macOS (Apple Silicon & Intel)...')}
                  className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-neutral-600 font-sans text-[10px] font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                   Download macOS
                </button>
                <button
                  onClick={() => alert('Downloading Installer for Windows (x64)...')}
                  className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-neutral-600 font-sans text-[10px] font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  ⊞ Download Windows
                </button>
              </div>
              <button
                onClick={() => setShowUploaderPrompt(false)}
                className="mt-2 text-xs text-neutral-500 hover:text-neutral-900 hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Group Invite Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4">
          {/* Toast Notification Container */}
          {toastMessage && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs bg-[#00a86b] text-white text-xs font-sans font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center justify-between animate-waterfall">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 w-4 h-4 rounded-full flex items-center justify-center text-[10px]">✓</span>
                <span>{toastMessage}</span>
              </div>
              <button onClick={() => setToastMessage('')} className="text-white/60 hover:text-white transition font-bold text-xs select-none pl-2">✕</button>
            </div>
          )}

          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-neutral-100 shadow-2xl relative">
            {/* Close button */}
            <button 
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition cursor-pointer text-base"
            >
              ✕
            </button>

            <h3 className="font-sans text-lg font-bold text-center mb-6 text-[#111111] tracking-tight">Share Group Invite</h3>

            <div className="space-y-4">
              {/* Card 1: Partial Access */}
              <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-sans font-bold text-xs text-[#111111]">Partial Access</h4>
                </div>
                
                <ul className="space-y-1.5 mb-4 text-[10px] text-neutral-600 font-sans">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> Face recognition - View OWN photos
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View highlights folder
                  </li>
                  <li className="flex items-center gap-1.5 text-rose-500">
                    <span>✕</span> Can't View all photos and folders
                  </li>
                </ul>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = `${portalDomain}/${project?.slug}/gallery`;
                      const text = `Misty Visuals is inviting you to join the gallery portal for ${project?.name}.\nGet your own photos instantly using Face Recognition!\n\nJoin via Link:\n${link}`;
                      navigator.clipboard.writeText(text);
                      setToastMessage('Message Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite links
                  </button>
                  <button 
                    onClick={() => {
                      const link = `${portalDomain}/${project?.slug}/gallery`;
                      window.open(`https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(link)}`, '_blank');
                    }}
                    className="flex-1 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    Print QR
                  </button>
                </div>
              </div>

              {/* Card 2: Full Access */}
              <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-sans font-bold text-xs text-[#111111]">Full Access</h4>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(project?.passcode || '');
                      setToastMessage('Message Copied to Clipboard');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  >
                    📋 {project?.passcode || '—'}
                  </button>
                </div>
                
                <ul className="space-y-1.5 mb-4 text-[10px] text-neutral-600 font-sans">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> Face recognition - View OWN photos
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View highlights folder
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View all photos and folders
                  </li>
                </ul>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = `${portalDomain}/${project?.slug}/gallery?code=${project?.passcode}`;
                      const text = `Misty Visuals is inviting you to join the gallery portal for ${project?.name}.\nAccess all photos and event categories.\n\nJoin via Link:\n${link}\n\nPasscode: ${project?.passcode}`;
                      navigator.clipboard.writeText(text);
                      setToastMessage('Message Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite links
                  </button>
                  <button 
                    onClick={() => {
                      const link = `${portalDomain}/${project?.slug}/gallery?code=${project?.passcode}`;
                      window.open(`https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(link)}`, '_blank');
                    }}
                    className="flex-1 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    Print QR
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">{ev.event_type || 'Event'}</span>
                      <span className="text-xs text-neutral-500">{fmtDate(ev.event_date)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        ev.is_verified 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      }`}>
                        {ev.is_verified ? '✓ Verified by Couple' : 'Awaiting Couple Verification'}
                      </span>
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
          <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            Payment Schedule
            {invoice && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                invoice.is_verified 
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
              }`}>
                {invoice.is_verified ? '✓ Verified by Couple' : '⚠️ Awaiting Couple Verification'}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            {project?.quote_group_id && (
              <button
                onClick={handleRevisePricing}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition px-2.5 py-1 rounded-md hover:bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1"
              >
                📝 Revise Pricing & Events
              </button>
            )}
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
