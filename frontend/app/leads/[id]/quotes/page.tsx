'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatDate } from '@/lib/formatters'
import { formatLeadName } from '@/lib/leadNameFormat'

type QuoteGroup = {
  id: number
  title: string
  createdAt: string
}

type QuoteVersion = {
  id: number
  versionNumber: number
  status: string
  createdAt: string
  isLatest: boolean
}

type LeadSummary = {
  id: number
  lead_number?: number | null
  name?: string | null
  bride_name?: string | null
  groom_name?: string | null
  events?: { id: number; event_type: string; event_date?: string; slot?: string | null }[]
}

export default function LeadQuotesPage() {
  const params = useParams() as { id: string }
  const leadId = params.id
  const router = useRouter()
  const [lead, setLead] = useState<LeadSummary | null>(null)
  const [groups, setGroups] = useState<QuoteGroup[]>([])
  const [versionsByGroup, setVersionsByGroup] = useState<Record<number, QuoteVersion[]>>({})
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({})
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [creatingVersion, setCreatingVersion] = useState<number | null>(null)
  const [showNewQuoteForm, setShowNewQuoteForm] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<number[]>([])
  
  // Custom Delete Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'group' | 'version', id: number, groupId?: number, title: string} | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

  const leadTitle = useMemo(() => {
    if (!lead) return 'Lead Quotes'
    const formatted = formatLeadName(lead)
    const leadLabel = lead.lead_number ? `L#${lead.lead_number}` : `Lead #${lead.id}`
    const displayName = formatted.leadName || formatted.suffix || 'Quotes'
    return `${leadLabel} · ${displayName}`
  }, [lead])

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

  const getEventSlotRank = (slot?: string | null) => {
    const value = String(slot || '').toLowerCase()
    if (value.includes('morning')) return 0
    if (value.includes('day')) return 1
    if (value.includes('evening')) return 2
    if (value.includes('night')) return 3
    return 9
  }

  const sortedLeadEvents = useMemo(() => {
    const events = Array.isArray(lead?.events) ? lead!.events : []
    return [...events].sort((a, b) => {
      const aDate = toDateOnly(a.event_date)
      const bDate = toDateOnly(b.event_date)
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      const aSlot = getEventSlotRank(a.slot)
      const bSlot = getEventSlotRank(b.slot)
      if (aSlot !== bSlot) return aSlot - bSlot
      return 0
    })
  }, [lead])

  const formatEventList = (names: string[]) => {
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
  }

  useEffect(() => {
    if (!leadId) return
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const [leadRes, groupRes] = await Promise.all([
          apiFetch(`/api/leads/${leadId}`),
          apiFetch(`/api/leads/${leadId}/quote-groups`),
        ])
        const leadData = await leadRes.json().catch(() => null)
        const groupData = await groupRes.json().catch(() => [])
        if (!active) return
        if (leadRes.ok && leadData) {
          setLead(leadData)
        }
        if (!groupRes.ok) {
          setError('Unable to load quote groups.')
          setGroups([])
          setVersionsByGroup({})
          return
        }
        const list = Array.isArray(groupData) ? groupData : []
        setGroups(list)
        const open: Record<number, boolean> = {}
        list.forEach((group: QuoteGroup) => {
          open[group.id] = true
        })
        setOpenGroups(open)
        const versionResponses = await Promise.all(
          list.map((group: QuoteGroup) =>
            apiFetch(`/api/quote-groups/${group.id}/versions`)
              .then(async (res) => ({
                id: group.id,
                ok: res.ok,
                data: await res.json().catch(() => []),
              }))
              .catch(() => ({ id: group.id, ok: false, data: [] }))
          )
        )
        const nextVersions: Record<number, QuoteVersion[]> = {}
        versionResponses.forEach((entry) => {
          nextVersions[entry.id] = Array.isArray(entry.data) ? entry.data : []
        })
        setVersionsByGroup(nextVersions)
      } catch {
        if (!active) return
        setError('Unable to load quote groups.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [leadId])

  const handleCreateGroup = async () => {
    const title = newGroupTitle.trim()
    if (!title) return
    setCreatingGroup(true)
    setError(null)
    try {
      // Create Quote Group
      const res = await apiFetch('/api/quote-groups', {
        method: 'POST',
        body: JSON.stringify({ leadId: Number(leadId), title }),
      })
      const groupData = await res.json().catch(() => null)
      if (!res.ok) {
        setError(groupData?.error || 'Failed to create quote group.')
        return
      }
      
      // Auto-create initial version with selected events
      let selectedEvs: any[] = []
      if (lead?.events) {
         selectedEvs = sortedLeadEvents
           .filter((e) => selectedEvents.includes(e.id))
           .map((e) => ({
             name: e.event_type,
             date: e.event_date || '',
             location: '',
             slot: e.slot || null,
           }))
      }

      const vRes = await apiFetch(`/api/quote-groups/${groupData.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          draftDataJson: selectedEvs.length > 0 ? { events: selectedEvs } : {}
        }),
      })
      const vData = await vRes.json().catch(() => null)
      
      if (vRes.ok && vData?.id) {
         router.push(`/leads/${leadId}/quotes/${vData.id}`)
         return
      }

      setGroups((prev) => [groupData, ...prev])
      setVersionsByGroup((prev) => ({ ...prev, [groupData.id]: vData ? [vData] : [] }))
      setOpenGroups((prev) => ({ ...prev, [groupData.id]: true }))
      setNewGroupTitle('')
      setShowNewQuoteForm(false)
      setSelectedEvents([])
    } catch {
      setError('Failed to create quote.')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleCreateVersion = async (groupId: number) => {
    setCreatingVersion(groupId)
    setError(null)
    try {
      const res = await apiFetch(`/api/quote-groups/${groupId}/versions`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.id) {
        setError(data?.error || 'Failed to create version.')
        return
      }
      router.push(`/leads/${leadId}/quotes/${data.id}`)
    } catch {
      setError('Failed to create version.')
    } finally {
      setCreatingVersion(null)
    }
  }

  const handleDeleteConfirm = async () => {
     if (!deleteConfirm) return
     setIsDeleting(true)
     setError(null)
     try {
        if (deleteConfirm.type === 'group') {
           const res = await apiFetch(`/api/quote-groups/${deleteConfirm.id}`, { method: 'DELETE', body: JSON.stringify({}) })
           if (!res.ok) throw new Error()
           setGroups(prev => prev.filter(g => g.id !== deleteConfirm.id))
           const nextVersions = { ...versionsByGroup }
           delete nextVersions[deleteConfirm.id]
           setVersionsByGroup(nextVersions)
        } else if (deleteConfirm.type === 'version' && deleteConfirm.groupId) {
           const res = await apiFetch(`/api/quote-versions/${deleteConfirm.id}`, { method: 'DELETE', body: JSON.stringify({}) })
           if (!res.ok) throw new Error((await res.json())?.error || 'Failed')
           setVersionsByGroup(prev => ({
              ...prev,
              [deleteConfirm.groupId!]: prev[deleteConfirm.groupId!].filter(v => v.id !== deleteConfirm.id)
           }))
        }
        setDeleteConfirm(null)
     } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Deletion failed. It may have active dependencies.')
        setDeleteConfirm(null)
     } finally {
        setIsDeleting(false)
     }
  }

  const promptDeleteGroup = (e: React.MouseEvent, id: number, title: string) => {
    e.stopPropagation()
    setDeleteConfirm({ type: 'group', id, title })
  }

  const promptDeleteVersion = (e: React.MouseEvent, id: number, groupId: number, versionNumber: number) => {
    e.stopPropagation()
    setDeleteConfirm({ type: 'version', id, groupId, title: `Version ${versionNumber}` })
  }

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 pb-20">
      
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-neutral-200 shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => router.push(`/leads/${leadId}?tab=proposal`)}
                className="mb-3 inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Back to Lead
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-neutral-100 text-neutral-700 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                  Lead Quotes
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                {leadTitle}
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                Manage all quotes and their subsequent versions for this lead.
              </p>
            </div>
            
            <div className="flex items-center relative">
              {showNewQuoteForm ? (
                <div className="absolute right-0 top-14 w-80 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl z-20 flex flex-col gap-4">
                  <div className="text-sm font-semibold text-neutral-900">Create New Quote</div>
                  
                  {sortedLeadEvents.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Select Events</div>
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                        {sortedLeadEvents.map((ev) => (
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
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewQuoteForm(true)}
                  className="mt-1 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-all flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create New Quote
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        
{/* Error State */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
            <svg
              className="w-5 h-5 flex-shrink-0 text-red-500"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Quotes List Section */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-32 bg-white rounded-2xl animate-pulse border border-neutral-100 shadow-sm"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border border-neutral-200 border-dashed rounded-3xl">
            <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-neutral-500"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-neutral-800">No Quotes Yet</h3>
            <p className="text-neutral-500 max-w-sm mt-2 text-sm">
              Create your first quote above to start preparing a proposal.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => {
              const versions = versionsByGroup[group.id] || []
              const isOpen = openGroups[group.id]
              return (
                <div
                  key={group.id}
                  className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden group hover:border-neutral-300 transition-colors"
                >
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 bg-neutral-50/50">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5 ring-4 ring-white shadow-sm">
                        <svg
                          className="w-5 h-5 text-neutral-900"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-900 group-hover:text-neutral-900 transition-colors">
                          {group.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 mt-1.5 font-medium">
                          <span className="flex items-center gap-1.5">
                            <svg
                              className="w-3.5 h-3.5 text-neutral-400"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            {formatDate(group.createdAt)}
                          </span>
                          <span className="text-neutral-300">•</span>
                          <span className="flex items-center gap-1.5">
                            <svg
                              className="w-3.5 h-3.5 text-neutral-400"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                              <path d="M3 3v5h5" />
                              <path d="M12 7v5l4 2" />
                            </svg>
                            {versions.length} {versions.length === 1 ? 'Version' : 'Versions'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pr-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({
                            ...prev,
                            [group.id]: !prev[group.id],
                          }))
                        }
                        className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 px-4 py-2.5 rounded-xl hover:bg-neutral-100 transition-colors flex items-center gap-2"
                      >
                        {isOpen ? 'Hide Versions' : 'View Versions'}
                        <svg
                          className={`w-4 h-4 transition-transform duration-300 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <button 
                         onClick={(e) => promptDeleteGroup(e, group.id, group.title)}
                         className="p-2.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all ml-1"
                         title="Delete Quote Group"
                      >
                         <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="p-6 bg-white space-y-5">
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                        <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
                          Quote Versions
                        </h4>
                        <button
                          type="button"
                          onClick={() => handleCreateVersion(group.id)}
                          disabled={creatingVersion === group.id}
                          className="text-xs font-bold bg-neutral-900 text-white px-4 py-2 rounded-xl hover:bg-neutral-800 focus:ring-4 focus:ring-neutral-900/10 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          {creatingVersion === group.id ? 'Creating...' : 'New Version'}
                        </button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {versions.length === 0 ? (
                          <div className="col-span-full py-10 px-6 text-center border-2 border-dashed border-neutral-100 rounded-2xl">
                            <h5 className="text-sm font-semibold text-neutral-700">
                              No versions added yet
                            </h5>
                            <p className="text-xs text-neutral-500 mt-1">
                              Create a new version to start drafting your proposal.
                            </p>
                          </div>
                        ) : (
                          versions.map((version) => (
                            <div key={version.id} className="relative group/version">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`/leads/${leadId}/quotes/${version.id}`)
                                }
                                className="relative flex w-full flex-col p-5 text-left rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-lg hover:-translate-y-0.5 hover:ring-1 hover:ring-neutral-300/50 transition-all duration-200"
                              >
                              <div className="flex items-start justify-between mb-4">
                                <span className="inline-flex items-center gap-2 bg-neutral-100 text-neutral-700 group-hover/version:bg-neutral-50 group-hover/version:text-neutral-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                  <svg
                                    className="w-4 h-4"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                    <path d="M3 3v5h5" />
                                    <path d="M12 7v5l4 2" />
                                  </svg>
                                  Version {version.versionNumber}
                                </span>
                                {['SENT', 'ACCEPTED'].includes(version.status) && (
                                  <span className="flex h-2.5 w-2.5 relative mt-1" title="Live: Visible to Client">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-auto pt-4 border-t border-neutral-50">
                                <span className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
                                  <svg
                                    className="w-3.5 h-3.5 text-neutral-400"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  {formatDate(version.createdAt)}
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${
                                    version.status === 'Draft'
                                      ? 'bg-amber-100/80 text-amber-700'
                                      : version.status === 'Sent'
                                      ? 'bg-blue-100/80 text-blue-700'
                                      : version.status === 'Accepted'
                                      ? 'bg-emerald-100/80 text-emerald-700'
                                      : 'bg-neutral-100 text-neutral-700'
                                  }`}
                                >
                                  {version.status}
                                </span>
                              </div>
                              </button>
                              {version.status?.toUpperCase() === 'DRAFT' && (
                                <div className="absolute top-4 right-4 opacity-0 group-hover/version:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => promptDeleteVersion(e, version.id, group.id, version.versionNumber)}
                                    className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition shadow-sm"
                                    title="Delete Draft"
                                  >
                                    <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Elegant Custom Deletion Modal */}
      {deleteConfirm && (
         <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
               <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                     <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Delete {deleteConfirm.type === 'group' ? 'Quote Group' : 'Draft'}?</h3>
                  <p className="text-sm text-neutral-500">
                     Are you sure you want to permanently delete <strong>{deleteConfirm.title}</strong>? 
                     {deleteConfirm.type === 'group' && " This will wipe all its versions. "} 
                     This action cannot be undone.
                  </p>
               </div>
               <div className="bg-neutral-50 p-4 sm:px-8 sm:py-5 flex gap-3 border-t border-neutral-100">
                  <button 
                     onClick={() => setDeleteConfirm(null)}
                     disabled={isDeleting}
                     className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-700 font-semibold rounded-xl hover:bg-neutral-50 transition"
                  >
                     Cancel
                  </button>
                  <button 
                     onClick={handleDeleteConfirm}
                     disabled={isDeleting}
                     className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition shadow-sm shadow-red-200"
                  >
                     {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
               </div>
            </div>
         </div>
      )}

    </div>
  )
}
