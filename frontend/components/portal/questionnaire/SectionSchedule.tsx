'use client'

import React, { useState } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'
import {
  Mail,
  PenTool,
  UploadCloud,
  Film,
  FileText,
  Image as ImageIcon,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  Eye,
  ExternalLink,
  Play,
  X
} from 'lucide-react'

export interface ProjectEventItem {
  id: string
  event_type: string
  event_date: string | null
  venue: string | null
  start_time: string | null
  end_time: string | null
  slot: string | null
  schedule_text?: string
}

export interface InvitationItem {
  id: string
  file_url: string
  storage_key: string
  filename: string
  file_type: 'pdf' | 'image' | 'video'
  file_size?: number
  created_at?: string
}

const MAX_INVITATIONS = 10
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB
const MAX_PDF_SIZE = 30 * 1024 * 1024    // 30 MB
const MAX_IMAGE_SIZE = 25 * 1024 * 1024  // 25 MB

function normalizeMediaUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }
  return `https://${trimmed}`
}

interface SectionScheduleProps {
  slug: string
  events: ProjectEventItem[]
  invitations: InvitationItem[]
  onUpdateScheduleText: (eventId: string, text: string) => Promise<void>
  onAddInvitation: (inv: Omit<InvitationItem, 'id'>) => Promise<void>
  onDeleteInvitation: (id: string) => Promise<void>
}

export default function SectionSchedule({
  slug,
  events,
  invitations,
  onUpdateScheduleText,
  onAddInvitation,
  onDeleteInvitation
}: SectionScheduleProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'write'>('upload')
  const [schedulesMap, setSchedulesMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    events.forEach(e => {
      map[e.id] = e.schedule_text || ''
    })
    return map
  })
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [savedEventIds, setSavedEventIds] = useState<Record<string, boolean>>({})

  // Invitation upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [previewInv, setPreviewInv] = useState<InvitationItem | null>(null)

  const handleScheduleChange = (eventId: string, text: string) => {
    setSchedulesMap(prev => ({ ...prev, [eventId]: text }))
    setSavedEventIds(prev => ({ ...prev, [eventId]: false }))
  }

  const handleScheduleBlur = async (eventId: string) => {
    const text = schedulesMap[eventId] || ''
    try {
      setSavingEventId(eventId)
      await onUpdateScheduleText(eventId, text)
      setSavedEventIds(prev => ({ ...prev, [eventId]: true }))
    } catch (e) {
      console.error(e)
    } finally {
      setSavingEventId(null)
    }
  }

  const handleInvitationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadError('')

    // 1. Validate total invitation count limit (max 10)
    if (invitations.length >= MAX_INVITATIONS) {
      setUploadError(`You have reached the maximum limit of ${MAX_INVITATIONS} invitations. Please remove an existing invitation before uploading a new one.`)
      if (e.target) e.target.value = ''
      return
    }

    const remainingSlots = MAX_INVITATIONS - invitations.length
    if (files.length > remainingSlots) {
      setUploadError(`You can only upload up to ${remainingSlots} more invitation${remainingSlots === 1 ? '' : 's'} (maximum ${MAX_INVITATIONS} total).`)
      if (e.target) e.target.value = ''
      return
    }

    // 2. Validate individual file sizes before starting upload
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const mime = file.type.toLowerCase()
      const isVideo = mime.startsWith('video/') || file.name.match(/\.(mp4|mov|m4v|webm)$/i) !== null
      const isPdf = mime.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')

      if (isVideo && file.size > MAX_VIDEO_SIZE) {
        setUploadError(`"${file.name}" exceeds the 100 MB limit for video invitations. Please choose a smaller file.`)
        if (e.target) e.target.value = ''
        return
      }
      if (isPdf && file.size > MAX_PDF_SIZE) {
        setUploadError(`"${file.name}" exceeds the 30 MB limit for PDF invitations. Please choose a smaller file.`)
        if (e.target) e.target.value = ''
        return
      }
      if (!isVideo && !isPdf && file.size > MAX_IMAGE_SIZE) {
        setUploadError(`"${file.name}" exceeds the 25 MB limit for photo/image invitations. Please choose a smaller file.`)
        if (e.target) e.target.value = ''
        return
      }
    }

    setUploading(true)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const mime = file.type.toLowerCase()
        const isVideo = mime.startsWith('video/') || file.name.match(/\.(mp4|mov|m4v|webm)$/i) !== null
        const isPdf = mime.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
        const fileType: 'pdf' | 'image' | 'video' = isVideo ? 'video' : isPdf ? 'pdf' : 'image'

        const res = await uploadMediaToR2({
          slug,
          file,
          section: 'invitations',
          isVideo,
          onProgress: (pct) => setUploadProgress(pct)
        })

        await onAddInvitation({
          file_url: res.fileUrl,
          storage_key: res.storageKey,
          filename: file.name,
          file_type: fileType,
          file_size: file.size
        })
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload invitation')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (e.target) e.target.value = ''
    }
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Your Wedding Schedule
        </h2>
        <p className="text-sm text-neutral-500">
          We&apos;d love to understand how your celebrations will unfold, so our team can prepare for every important moment.
        </p>
      </div>

      {/* Two Clear Ways to Share Schedule (Prioritizing E-Invites as Option A) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* OPTION A: UPLOAD E-INVITE (PRIORITIZED) */}
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`p-4 rounded-3xl text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 bg-white ${
            activeTab === 'upload'
              ? 'border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10'
              : 'border border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <Mail className="w-5 h-5 text-amber-600" />
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${
                activeTab === 'upload' ? 'bg-neutral-100 text-neutral-900 border border-neutral-300' : 'bg-neutral-100 text-neutral-600'
              }`}>
                Option A
              </span>
              {activeTab === 'upload' ? (
                <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
              ) : (
                <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-neutral-900">Upload E-Invite</div>
            <div className="text-xs mt-0.5 text-neutral-500">
              Upload digital cards, itinerary PDFs, or video invites (Fastest way to share your schedule!)
            </div>
          </div>
        </button>

        {/* OPTION B: WRITE SCHEDULE */}
        <button
          type="button"
          onClick={() => setActiveTab('write')}
          className={`p-4 rounded-3xl text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 bg-white ${
            activeTab === 'write'
              ? 'border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10'
              : 'border border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <PenTool className="w-5 h-5 text-amber-600" />
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors ${
                activeTab === 'write' ? 'bg-neutral-100 text-neutral-900 border border-neutral-300' : 'bg-neutral-100 text-neutral-600'
              }`}>
                Option B
              </span>
              {activeTab === 'write' ? (
                <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
              ) : (
                <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-neutral-900">Write Event-Wise Breakdown</div>
            <div className="text-xs mt-0.5 text-neutral-500">
              Type specific event timings and custom flow for each celebration.
            </div>
          </div>
        </button>
      </div>

      {/* Option A: Upload Invitations Area (Default) */}
      {activeTab === 'upload' && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 bg-neutral-50/60 rounded-3xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                Upload Digital Invitations & Schedule Documents
              </h3>
            </div>

            {invitations.length >= MAX_INVITATIONS ? (
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-neutral-100 text-neutral-600 font-semibold text-xs border border-neutral-200">
                <span>Maximum limit reached ({MAX_INVITATIONS}/{MAX_INVITATIONS})</span>
              </div>
            ) : (
              <label className="inline-block bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-6 py-3 rounded-2xl cursor-pointer transition shadow-sm">
                {uploading ? `Uploading (${uploadProgress}%)...` : 'Upload'}
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  disabled={uploading}
                  onChange={handleInvitationUpload}
                  className="hidden"
                />
              </label>
            )}

            <div className="text-[11px] text-neutral-400">
              PDF (up to 30MB) · Photos (up to 25MB) · Video (up to 100MB) · Max {MAX_INVITATIONS} invitations
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {uploadError}
            </div>
          )}

          {/* Uploaded Invitations Visual Grid */}
          {invitations.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Uploaded Invitations ({invitations.length}/{MAX_INVITATIONS})
                </h4>
                <span className="text-[11px] text-neutral-400 hidden sm:inline">
                  Click any invitation to view full size
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="group relative bg-white border border-neutral-200/90 hover:border-neutral-300 rounded-2xl overflow-hidden shadow-2xs hover:shadow-xs transition flex flex-col"
                  >
                    {/* Visual Media Preview Container */}
                    <div
                      className="relative w-full aspect-[4/3] bg-neutral-100/90 flex items-center justify-center overflow-hidden cursor-pointer select-none"
                      onClick={() => setPreviewInv(inv)}
                    >
                      {inv.file_type === 'image' ? (
                        <>
                          <img
                            src={normalizeMediaUrl(inv.file_url)}
                            alt={inv.filename}
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-neutral-900/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-3 py-1.5 rounded-full bg-white/95 text-neutral-900 text-xs font-semibold shadow-md flex items-center gap-1.5 backdrop-blur-xs">
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Invitation</span>
                            </span>
                          </div>
                        </>
                      ) : inv.file_type === 'video' ? (
                        <div className="w-full h-full bg-neutral-950 relative flex items-center justify-center">
                          <video
                            src={normalizeMediaUrl(inv.file_url)}
                            preload="metadata"
                            className="w-full h-full object-contain pointer-events-none"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition">
                            <div className="w-11 h-11 rounded-full bg-white/90 text-neutral-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* PDF Document Presentation */
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-neutral-50 to-neutral-100/80">
                          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mb-2 shadow-2xs group-hover:scale-105 transition">
                            <FileText className="w-6 h-6 stroke-[1.8]" />
                          </div>
                          <span className="text-xs font-bold text-neutral-800 line-clamp-2 max-w-[200px]">
                            {inv.filename}
                          </span>
                          <span className="mt-2 px-2.5 py-1 rounded-full bg-white border border-neutral-200 text-[10px] font-semibold text-neutral-600 shadow-2xs group-hover:border-neutral-300 transition">
                            PDF Document · Click to Preview
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metadata & Actions Bar */}
                    <div className="p-3 flex items-center justify-between gap-3 bg-white border-t border-neutral-100">
                      <div className="min-w-0 flex-1">
                        <p
                          onClick={() => setPreviewInv(inv)}
                          className="text-xs font-bold text-neutral-900 truncate hover:underline cursor-pointer"
                          title={inv.filename}
                        >
                          {inv.filename}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                            {inv.file_type}
                          </span>
                          {inv.file_size ? (
                            <>
                              <span className="text-neutral-300 text-[10px]">·</span>
                              <span className="text-[10px] text-neutral-400 font-medium">
                                {(inv.file_size / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewInv(inv)}
                          className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition cursor-pointer"
                          title="View full size"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvitation(inv.id)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Option A: Event-Wise Schedule Editors */}
      {activeTab === 'write' && (
        <div className="space-y-6 text-left animate-fade-in">
          {events.length === 0 ? (
            <div className="p-8 text-center bg-neutral-50 rounded-3xl border border-neutral-200 text-xs text-neutral-500">
              No events configured for this project yet. You can upload digital invitations using Option A above!
            </div>
          ) : (
            events.map((ev) => {
              const currentVal = schedulesMap[ev.id] ?? ''
              const isSaving = savingEventId === ev.id
              const isSaved = savedEventIds[ev.id]

              return (
                <div
                  key={ev.id}
                  className="p-6 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-600" />
                        <span>{ev.event_type} Schedule</span>
                      </h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 mt-1">
                        {ev.event_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{new Date(ev.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </span>
                        )}
                        {ev.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{ev.venue}</span>
                          </span>
                        )}
                        {ev.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{ev.start_time}{ev.end_time ? ` - ${ev.end_time}` : ''}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] font-semibold text-neutral-400">
                      {isSaving && <span className="text-amber-600">Saving...</span>}
                      {isSaved && !isSaving && <span className="text-emerald-600">✓ Saved</span>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Please share the schedule for this event:
                    </label>
                    <textarea
                      rows={5}
                      value={currentVal}
                      onChange={(e) => handleScheduleChange(ev.id, e.target.value)}
                      onBlur={() => handleScheduleBlur(ev.id)}
                      placeholder={`e.g.\n• 8:00 AM — Guests start arriving\n• 9:00 AM — Family entry\n• 10:00 AM — Main ceremony begins\n• 12:30 PM — Lunch & refreshments\n• 2:00 PM — Event concludes`}
                      className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-xs md:text-sm text-neutral-900 font-mono leading-relaxed placeholder:font-sans placeholder:text-neutral-400 transition"
                    />
                    <p className="text-[11px] text-neutral-400 italic">
                      Write your schedule freely in your own words. Auto-saves when you finish typing.
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Lightbox / Fullscreen Invitation Modal */}
      {previewInv && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setPreviewInv(null)}
        >
          <div
            className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-white shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                  {previewInv.filename}
                </h3>
                <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">
                  {previewInv.file_type} {previewInv.file_size ? `· ${(previewInv.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={normalizeMediaUrl(previewInv.file_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-1.5"
                  title="Open original file"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewInv(null)}
                  className="p-2 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Media Body */}
            <div className="flex-1 overflow-auto bg-neutral-900/5 p-4 flex items-center justify-center min-h-[350px]">
              {previewInv.file_type === 'image' ? (
                <img
                  src={normalizeMediaUrl(previewInv.file_url)}
                  alt={previewInv.filename}
                  className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-md"
                />
              ) : previewInv.file_type === 'video' ? (
                <video
                  src={normalizeMediaUrl(previewInv.file_url)}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] max-w-full rounded-xl shadow-md bg-black"
                />
              ) : (
                <iframe
                  src={normalizeMediaUrl(previewInv.file_url)}
                  title={previewInv.filename}
                  className="w-full h-[75vh] rounded-xl border border-neutral-200 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
