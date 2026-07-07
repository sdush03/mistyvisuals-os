'use client'

import { useState, useEffect } from 'react'
import PhoneField from '@/components/PhoneField'

interface PortalClientProps {
  slug: string
}

interface ProjectEvent {
  id: string
  event_type: string
  event_date: string | null
  pax: number | null
  venue: string | null
  start_time: string | null
  end_time: string | null
  slot: string | null
  is_verified: boolean
}

interface ProjectDeliverable {
  id: string
  title: string
  type: string
  quantity: number
  status: 'pending' | 'in_progress' | 'client_preview' | 'revision' | 'delivered'
  due_date: string | null
  notes: string | null
}

interface ProjectChecklist {
  id: string
  title: string
  phase: string
  is_completed: boolean
}

interface InvoiceItem {
  id: number
  name: string
  description: string
  quantity: number
  rate: number
  amount: number
}

interface PaymentStep {
  id: number
  step_order: number
  label: string
  percentage: number
  amount: number
  due_date: string | null
  status: 'pending' | 'paid'
}

interface ProjectInvoice {
  id: number
  invoice_number: string
  status: string
  issue_date: string | null
  due_date: string | null
  total_amount: number
  advance_amount: number
  advance_paid: boolean
  balance_due: number
  line_items: InvoiceItem[] | null
  payment_schedule: PaymentStep[] | null
  is_verified: boolean
}

interface ProjectData {
  project: {
    id: string
    name: string
    status: string
    start_date: string | null
    end_date: string | null
    city: string | null
    is_destination: boolean
    bride_name?: string | null
    bride_phone_primary?: string | null
    bride_email?: string | null
    bride_instagram?: string | null
    groom_name?: string | null
    groom_phone_primary?: string | null
    groom_email?: string | null
    groom_instagram?: string | null
  }
  events: ProjectEvent[]
  deliverables: ProjectDeliverable[]
  checklist: ProjectChecklist[]
  invoice: ProjectInvoice | null
}

export default function PortalClient({ slug }: PortalClientProps) {
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(true)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [hasGallery, setHasGallery] = useState(false)

  // Edit details state
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [brideName, setBrideName] = useState('')
  const [bridePhone, setBridePhone] = useState('')
  const [brideEmail, setBrideEmail] = useState('')
  const [brideEmailError, setBrideEmailError] = useState(false)
  const [brideInsta, setBrideInsta] = useState('')
  const [groomName, setGroomName] = useState('')
  const [groomPhone, setGroomPhone] = useState('')
  const [groomEmail, setGroomEmail] = useState('')
  const [groomEmailError, setGroomEmailError] = useState(false)
  const [groomInsta, setGroomInsta] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  // Event editing state
  const [editingEvent, setEditingEvent] = useState<ProjectEvent | null>(null)
  const [eventVenue, setEventVenue] = useState('')
  const [eventSlot, setEventSlot] = useState('')
  const [eventPax, setEventPax] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [eventError, setEventError] = useState('')


  // Fetch portal info
  const fetchPortalData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/client-portal/${slug}`, { credentials: 'include' })
      if (res.status === 404) {
        setError('Workspace not found.')
        setLoading(false)
        return
      }
      const data = await res.json()
      if (data.locked) {
        setLocked(true)
        if (data.projectName) {
          setProjectName(data.projectName)
        }
      } else {
        setLocked(false)
        setProjectData(data.data)
        if (data.data?.project?.name) {
          setProjectName(data.data.project.name)
        }
        const lead = data.data?.project || {}
        setBrideName(lead.bride_name || '')
        setBridePhone(lead.bride_phone_primary || '')
        setBrideEmail(lead.bride_email || '')
        setBrideInsta(lead.bride_instagram || '')
        setGroomName(lead.groom_name || '')
        setGroomPhone(lead.groom_phone_primary || '')
        setGroomEmail(lead.groom_email || '')
        setGroomInsta(lead.groom_instagram || '')

        // Check if event has AI gallery
        try {
          const gallRes = await fetch(`/api/gallery/public/events/${slug}`)
          if (gallRes.ok) {
            setHasGallery(true)
          } else {
            setHasGallery(false)
          }
        } catch {
          setHasGallery(false)
        }
      }
    } catch {
      setError('Failed to connect to workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPortalData()
  }, [slug])

  // Handle Passcode verification
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passcode.trim()) return

    try {
      setVerifying(true)
      setError('')
      const res = await fetch(`/api/client-portal/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Invalid passcode.')
      }

      setLocked(false)
      fetchPortalData()
    } catch (err: any) {
      setError(err.message || 'Verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  const handleLogout = async () => {
    await fetch(`/api/client-portal/${slug}/logout`, { method: 'POST' })
    setLocked(true)
    setProjectData(null)
    setPasscode('')
  }

  const handleSaveDetails = async () => {
    // Normalization helper for instagram handle
    const normalizeInsta = (val: string) => {
      let trimmed = val.trim();
      if (!trimmed) return '';
      trimmed = trimmed.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '');
      trimmed = trimmed.replace(/^@/, '');
      return trimmed.split('?')[0].replace(/\/$/, '');
    };

    try {
      setSavingDetails(true)
      setDetailsError('')

      // Normalize instagram handles
      const normalizedBrideInsta = normalizeInsta(brideInsta);
      const normalizedGroomInsta = normalizeInsta(groomInsta);

      // Validate email formatting
      if (brideEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brideEmail.trim())) {
        setDetailsError("Please enter a valid email address for the Bride");
        setSavingDetails(false);
        return;
      }
      if (groomEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groomEmail.trim())) {
        setDetailsError("Please enter a valid email address for the Groom");
        setSavingDetails(false);
        return;
      }

      // Validate phone number country codes (+ prefix followed by digits)
      const cleanedBridePhone = bridePhone.trim().replace(/[\s\-()]/g, '');
      if (cleanedBridePhone && !/^\+\d{10,15}$/.test(cleanedBridePhone)) {
        setDetailsError("Bride's phone number must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const cleanedGroomPhone = groomPhone.trim().replace(/[\s\-()]/g, '');
      if (cleanedGroomPhone && !/^\+\d{10,15}$/.test(cleanedGroomPhone)) {
        setDetailsError("Groom's phone number must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const res = await fetch(`/api/client-portal/${slug}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bride_name: brideName.trim(),
          bride_email: brideEmail.trim(),
          bride_phone_primary: cleanedBridePhone,
          bride_instagram: normalizedBrideInsta,
          groom_name: groomName.trim(),
          groom_email: groomEmail.trim(),
          groom_phone_primary: cleanedGroomPhone,
          groom_instagram: normalizedGroomInsta
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save details')
      }
      setIsEditingDetails(false)
      fetchPortalData()
    } catch (e: any) {
      setDetailsError(e.message)
    } finally {
      setSavingDetails(false)
    }
  }

  const handleVerifyEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/client-portal/${slug}/events/${eventId}/verify`, {
        method: 'POST'
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to verify event')
      }
      fetchPortalData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleStartEditEvent = (ev: ProjectEvent) => {
    setEditingEvent(ev)
    setEventVenue(ev.venue || '')
    setEventSlot(ev.slot || '')
    setEventPax(ev.pax ? String(ev.pax) : '')
    setEventStartTime(ev.start_time || '')
    setEventEndTime(ev.end_time || '')
    setEventError('')
  }

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    if (!eventSlot.trim() || !eventPax.trim() || !eventStartTime.trim() || !eventEndTime.trim()) {
      setEventError('PAX, slot, start time, and end time are required.')
      return
    }
    try {
      setSavingEvent(true)
      setEventError('')
      const res = await fetch(`/api/client-portal/${slug}/events/${editingEvent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue: eventVenue,
          slot: eventSlot,
          pax: Number(eventPax),
          start_time: eventStartTime,
          end_time: eventEndTime
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update event')
      }
      setEditingEvent(null)
      fetchPortalData()
    } catch (e: any) {
      setEventError(e.message)
    } finally {
      setSavingEvent(false)
    }
  }

  const handleVerifyInvoice = async () => {
    try {
      const res = await fetch(`/api/client-portal/${slug}/invoice/verify`, {
        method: 'POST'
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to verify billing')
      }
      alert('Billing successfully verified!')
      fetchPortalData()
    } catch (e: any) {
      alert(e.message)
    }
  }


  // Formatting helpers
  const formatFullDate = (dateStr: string | null) => {
    if (!dateStr || dateStr.startsWith('2099')) return 'TBA'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-neutral-400 font-medium tracking-wide">Securing connection...</p>
        </div>
      </div>
    )
  }

  // 1. LOCKED VIEW (PASSCODE ACCESS)
  if (locked) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 relative overflow-hidden transition-colors duration-300">
        {/* Decorative backdrop shapes */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>
 
        <div className="w-full max-w-md bg-white border border-neutral-200/50 p-8 rounded-3xl relative z-10 shadow-xl transition-all duration-300">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/logo_black.png" alt="Misty Visuals Logo" className="h-10 w-auto object-contain opacity-95 block dark:hidden" />
              <img src="/logo.png" alt="Misty Visuals Logo" className="h-10 w-auto object-contain opacity-95 hidden dark:block" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">{projectName || 'Your Workspace'}</h2>
            <p className="text-xs text-neutral-500 mt-2 max-w-xs mx-auto">
              Please enter the 4-digit passcode sent to your registered phone number or email to access your workspace.
            </p>
          </div>
 
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-neutral-50/50 border border-neutral-200 rounded-2xl py-4 text-center text-xl font-semibold text-neutral-900 placeholder-neutral-300 focus:outline-none focus:border-emerald-500/50 transition-all tracking-[0.2em] shadow-sm"
                required
              />
            </div>
 
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs text-center font-medium">
                {error}
              </div>
            )}
 
            <button
              type="submit"
              disabled={verifying}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {verifying ? 'Unlocking...' : 'Access Workspace'}
              {!verifying && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 10v2m-6-4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 2. UNLOCKED VIEW (CLIENT PORTAL DASHBOARD)
  const project = projectData?.project
  const events = projectData?.events || []
  const deliverables = projectData?.deliverables || []
  const checklist = projectData?.checklist || []
  const invoice = projectData?.invoice || null

  const upcomingEvents = events.filter(e => {
    if (!e.event_date || e.event_date.startsWith('2099')) return true
    return new Date(e.event_date) >= new Date(new Date().setHours(0,0,0,0))
  })

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 pb-16 relative overflow-hidden transition-colors duration-300">
      {/* Decorative Blur Backdrops */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Branded Header */}
      <header className="border-b border-neutral-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* Logo and Workspace Label in same line */}
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <img src="/logo_black.png" alt="Misty Visuals Logo" className="h-8 w-auto object-contain opacity-95 block dark:hidden" />
              <img src="/logo.png" alt="Misty Visuals Logo" className="h-8 w-auto object-contain opacity-95 hidden dark:block" />
            </div>
            <div className="h-4 w-px bg-neutral-300"></div>
            <span className="text-[10px] tracking-[0.25em] font-bold text-neutral-500 uppercase mt-0.5">Workspace</span>
          </div>

          {/* Action buttons on the right */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditingDetails(true)}
              className="text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-xl transition-all duration-300 shadow-sm"
            >
              👤 Edit Profile
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 px-4 py-2 rounded-xl text-neutral-600 transition-all duration-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 mt-8 grid gap-8">
        
        {/* Welcome Section */}
        <section className="bg-white border border-neutral-200/50 rounded-3xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm transition-all duration-300">
          <div className="relative z-10 space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
              Welcome, {project?.name || 'Client'}!
            </h1>
            <p className="text-sm text-neutral-500 max-w-xl">
              Track your wedding deliverables, confirm your shoot timeline details, and review invoices in real-time.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-center">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Status</div>
              <div className="text-xs font-bold text-neutral-900 uppercase mt-0.5">{project?.status || 'Active'}</div>
            </div>
            {project?.city && (
              <div className="bg-neutral-100 border border-neutral-200 px-4 py-2 rounded-xl text-center">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Location</div>
                <div className="text-xs font-bold text-neutral-900 mt-0.5">{project.city}</div>
              </div>
            )}
          </div>
        </section>

        {/* AI Photo Gallery Card */}
        {hasGallery && (
          <section className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                New Feature
              </span>
              <h3 className="text-lg font-bold text-neutral-900 mt-1">📸 AI Photo Gallery is Live!</h3>
              <p className="text-xs text-neutral-500 max-w-xl">
                Explore all your wedding photos instantly. Take a quick selfie on your phone to find every picture of you or your guests.
              </p>
            </div>
            <a
              href={`/${slug}/gallery`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-2xl transition shadow-md text-center text-xs shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Explore Photo Gallery
            </a>
          </section>
        )}

        {/* Unverified Warning Banner */}
        {((invoice && !invoice.is_verified) || events.some(e => !e.is_verified)) && (
          <section className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 md:p-6 text-amber-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="font-bold text-sm block mb-1">⚠️ Action Required: Contract/Timeline Revisions Pending</span>
              Our team has updated your event timeline or package details. Please review the highlighted sections below and click verify to lock in your contract.
            </div>
            {invoice && !invoice.is_verified && (
              <button
                onClick={handleVerifyInvoice}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-sm self-start md:self-auto shrink-0"
              >
                Confirm & Verify Invoice
              </button>
            )}
          </section>
        )}



        {/* Dashboard Panels */}
        <div className="grid md:grid-cols-3 gap-8">

          {/* LEFT: TIMELINE (2 Columns wide) */}
          <div className="md:col-span-2 space-y-8">
            <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Event Timeline
                </h3>
                <span className="text-xs text-neutral-500 font-medium">
                  {events.length} Event{events.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="relative pl-6 border-l border-neutral-200 space-y-8">
                {events.map((ev, index) => {
                  const isTBA = !ev.event_date || ev.event_date.startsWith('2099')
                  return (
                    <div key={ev.id} className="relative group">
                      {/* Timeline Node dot */}
                      <div className="absolute -left-[31px] top-1.5 w-4 h-4 bg-neutral-50 border-2 border-emerald-500 rounded-full group-hover:scale-110 transition-transform"></div>

                      <div className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <h4 className="font-bold text-neutral-900 text-base flex items-center gap-2 flex-wrap">
                            {ev.event_type}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              (ev as any).is_verified 
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20' 
                                : 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                            }`}>
                              {(ev as any).is_verified ? '✓ Verified' : 'Pending Verification'}
                            </span>
                          </h4>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            isTBA ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {isTBA ? 'Dates TBA' : formatFullDate(ev.event_date)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 pt-1">
                          {ev.venue && (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {ev.venue}
                            </span>
                          )}
                          {(ev.start_time || ev.slot) && (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {ev.start_time ? `${ev.start_time} ${ev.end_time ? `- ${ev.end_time}` : ''}` : ev.slot}
                            </span>
                          )}
                          {ev.pax && (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              {ev.pax} Pax
                            </span>
                          )}
                        </div>

                        {/* Verification Actions for clients */}
                        {!(ev as any).is_verified && (
                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={() => handleStartEditEvent(ev)}
                              className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition"
                            >
                              ✏️ Edit Details
                            </button>
                            <button
                              onClick={() => handleVerifyEvent(ev.id)}
                              className="text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition"
                            >
                              ✓ Verify Details
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* RIGHT Panel: DELIVERABLES & BILLING */}
          <div className="space-y-8">
            
            {/* Deliverables List */}
            <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
              <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Deliverables
              </h3>

              <div className="space-y-4">
                {deliverables.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">No deliverables assigned yet.</p>
                ) : (
                  deliverables.map((del) => {
                    const statusColors = {
                      pending: 'bg-neutral-100 text-neutral-600 border-neutral-200',
                      in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                      client_preview: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
                      revision: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                      delivered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                    }

                    return (
                      <div key={del.id} className="bg-neutral-50/50 border border-neutral-100 rounded-2xl p-4 space-y-2 transition-all duration-300">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-neutral-900 leading-tight">
                            {del.title}
                          </h4>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-lg whitespace-nowrap ${
                            statusColors[del.status] || statusColors.pending
                          }`}>
                            {del.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-500">
                          <span>Qty: {del.quantity}</span>
                          {del.due_date && <span>Due: {formatFullDate(del.due_date)}</span>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Billing Overview */}
            {invoice && (
              <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Billing Summary
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    invoice.is_verified 
                      ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20' 
                      : 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                  }`}>
                    {invoice.is_verified ? '✓ Verified' : 'Awaiting Verification'}
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Line items list */}
                  {invoice.line_items && invoice.line_items.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Package Contents</div>
                      <div className="divide-y divide-neutral-100">
                        {invoice.line_items.map((li: any, idx: number) => (
                          <div key={idx} className="flex justify-between py-1.5 text-neutral-700">
                            <span>{li.description}</span>
                            <span className="font-semibold text-neutral-900">{formatCurrency(li.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment schedule steps */}
                  {invoice.payment_schedule && invoice.payment_schedule.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-neutral-100">
                      <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Payment Milestones</div>
                      <div className="space-y-1.5">
                        {invoice.payment_schedule.map((step: any, idx: number) => (
                          <div key={idx} className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                            step.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-50 text-neutral-700'
                          }`}>
                            <span>{step.label} {step.percentage ? `(${step.percentage}%)` : ''}</span>
                            <span className="font-bold">{formatCurrency(step.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-neutral-100 pt-3 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Total Contract Value</span>
                      <span className="font-bold text-neutral-900">{formatCurrency(invoice.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500 font-semibold">Remaining Balance</span>
                      <span className="font-extrabold text-neutral-900 text-base">
                        {formatCurrency(invoice.total_amount - (invoice.advance_paid ? invoice.advance_amount : 0))}
                      </span>
                    </div>
                  </div>

                  {!invoice.is_verified && (
                    <div className="pt-2">
                      <button
                        onClick={handleVerifyInvoice}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-2.5 rounded-xl transition text-center shadow-sm"
                      >
                        Confirm & Verify Contract Billing
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Event Edit Modal Dialog */}
      {editingEvent && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200/50 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white">
              <h3 className="text-lg font-bold">Edit Event Details</h3>
              <p className="text-xs text-white/80 mt-1">Provide correct information for: {editingEvent.event_type}</p>
            </div>
            
            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-1">Venue / Location (Optional)</label>
                <input
                  type="text"
                  value={eventVenue}
                  onChange={e => setEventVenue(e.target.value)}
                  placeholder="e.g. ITC Grand Chola, Chennai"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 text-xs text-neutral-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-1">PAX Count (Required)</label>
                  <input
                    type="number"
                    value={eventPax}
                    onChange={e => setEventPax(e.target.value)}
                    placeholder="e.g. 150"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 text-xs text-neutral-800 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-1">Slot (Required)</label>
                  <select
                    value={eventSlot}
                    onChange={e => setEventSlot(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 text-xs text-neutral-800 font-medium cursor-pointer"
                    required
                  >
                    <option value="">Select slot</option>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Evening">Evening</option>
                    <option value="Night">Night</option>
                    <option value="Full Day">Full Day</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-1">Start Time (Required)</label>
                  <input
                    type="text"
                    value={eventStartTime}
                    onChange={e => setEventStartTime(e.target.value)}
                    placeholder="e.g. 09:00 AM"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 text-xs text-neutral-800 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-1">End Time (Required)</label>
                  <input
                    type="text"
                    value={eventEndTime}
                    onChange={e => setEventEndTime(e.target.value)}
                    placeholder="e.g. 02:00 PM"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 text-xs text-neutral-800 font-medium"
                    required
                  />
                </div>
              </div>

              {eventError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs text-center font-medium">
                  {eventError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold px-5 py-3 rounded-xl transition text-xs shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold px-5 py-3 rounded-xl transition text-xs shadow-md disabled:opacity-50"
                >
                  {savingEvent ? 'Saving...' : 'Save details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Settings Modal Dialog */}
      {isEditingDetails && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200/50 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">👤 Bride & Groom Profiles</h3>
                <p className="text-xs text-white/80 mt-1">Review and update contact details and social handles below.</p>
              </div>
              <button 
                onClick={() => setIsEditingDetails(false)}
                className="text-white/80 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bride Edit Form */}
                <div className="space-y-3">
                  <div className="font-bold text-neutral-500 border-b border-neutral-100 pb-1 mb-1">Bride Profile</div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Bride's Name</label>
                    <input
                      type="text"
                      value={brideName}
                      onChange={e => setBrideName(e.target.value)}
                      placeholder="Bride's Name (e.g. Priya)"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Primary Phone</label>
                    <PhoneField
                      value={bridePhone}
                      onChange={val => setBridePhone(val || '')}
                      placeholder="Phone Number"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Email</label>
                    <input
                      type="email"
                      value={brideEmail}
                      onChange={e => {
                        setBrideEmail(e.target.value)
                        if (brideEmailError) setBrideEmailError(false)
                      }}
                      onBlur={() => {
                        if (brideEmail.trim()) {
                          setBrideEmailError(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brideEmail.trim()))
                        } else {
                          setBrideEmailError(false)
                        }
                      }}
                      placeholder="priya@gmail.com"
                      className={`w-full bg-neutral-50 border rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none transition-colors ${
                        brideEmailError ? 'border-rose-500 bg-rose-50/10 focus:border-rose-500' : 'border-neutral-200 focus:border-neutral-300'
                      }`}
                    />
                    {brideEmailError && (
                      <span className="text-[10px] text-rose-500 font-medium mt-1 block">Please enter a valid email address</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Instagram Handle</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50/50 focus-within:border-neutral-300 transition-colors">
                      <span className="bg-neutral-100 px-3 py-2 text-neutral-400 select-none flex items-center text-xs border-r border-neutral-200 font-medium">instagram.com/</span>
                      <input
                        type="text"
                        value={brideInsta}
                        onChange={e => setBrideInsta(e.target.value)}
                        placeholder="username"
                        className="w-full bg-transparent p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Groom Edit Form */}
                <div className="space-y-3">
                  <div className="font-bold text-neutral-500 border-b border-neutral-100 pb-1 mb-1">Groom Profile</div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Groom's Name</label>
                    <input
                      type="text"
                      value={groomName}
                      onChange={e => setGroomName(e.target.value)}
                      placeholder="Groom's Name (e.g. Arjun)"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Primary Phone</label>
                    <PhoneField
                      value={groomPhone}
                      onChange={val => setGroomPhone(val || '')}
                      placeholder="Phone Number"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Email</label>
                    <input
                      type="email"
                      value={groomEmail}
                      onChange={e => {
                        setGroomEmail(e.target.value)
                        if (groomEmailError) setGroomEmailError(false)
                      }}
                      onBlur={() => {
                        if (groomEmail.trim()) {
                          setGroomEmailError(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groomEmail.trim()))
                        } else {
                          setGroomEmailError(false)
                        }
                      }}
                      placeholder="arjun@gmail.com"
                      className={`w-full bg-neutral-50 border rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none transition-colors ${
                        groomEmailError ? 'border-rose-500 bg-rose-50/10 focus:border-rose-500' : 'border-neutral-200 focus:border-neutral-300'
                      }`}
                    />
                    {groomEmailError && (
                      <span className="text-[10px] text-rose-500 font-medium mt-1 block">Please enter a valid email address</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Instagram Handle</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50/50 focus-within:border-neutral-300 transition-colors">
                      <span className="bg-neutral-100 px-3 py-2 text-neutral-400 select-none flex items-center text-xs border-r border-neutral-200 font-medium">instagram.com/</span>
                      <input
                        type="text"
                        value={groomInsta}
                        onChange={e => setGroomInsta(e.target.value)}
                        placeholder="username"
                        className="w-full bg-transparent p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {detailsError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs text-center font-medium">
                  {detailsError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setIsEditingDetails(false)}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold px-5 py-2.5 rounded-xl transition text-xs shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold px-5 py-2.5 rounded-xl transition text-xs shadow-md disabled:opacity-50"
                >
                  {savingDetails ? 'Saving...' : 'Save details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
