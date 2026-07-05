'use client'

import { useState, useEffect } from 'react'

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
  advance_paid: boolean
  balance_due: number
  line_items: InvoiceItem[] | null
  payment_schedule: PaymentStep[] | null
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

          {/* Logout button on the right */}
          <button
            onClick={handleLogout}
            className="text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 px-4 py-2 rounded-xl text-neutral-600 transition-all duration-300"
          >
            Logout
          </button>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <h4 className="font-bold text-neutral-900 text-base">
                            {ev.event_type}
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
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Billing Summary
                </h3>

                <div className="space-y-4 text-sm">
                  <div className="flex justify-between pb-3 border-b border-neutral-100">
                    <span className="text-neutral-500">Total Contract Value</span>
                    <span className="font-bold text-neutral-900">{formatCurrency(invoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between pb-3 border-b border-neutral-100">
                    <span className="text-neutral-500">Advance Paid</span>
                    <span className="font-bold text-emerald-600">
                      {invoice.advance_paid ? 'Fully Paid' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="font-bold text-neutral-600">Remaining Balance</span>
                    <span className="font-extrabold text-neutral-900 text-lg">
                      {formatCurrency(invoice.balance_due)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
