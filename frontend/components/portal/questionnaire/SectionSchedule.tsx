'use client'

import React, { useState } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'

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
  const [activeTab, setActiveTab] = useState<'write' | 'upload'>('write')
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
    setUploading(true)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const mime = file.type.toLowerCase()
        const isVideo = mime.startsWith('video/') || file.name.match(/\.(mp4|mov|m4v|webm)$/i) !== null
        const isPdf = mime.includes('pdf') || file.name.endsWith('.pdf')
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
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 03 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Your Wedding Schedule
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;We&apos;d love to understand how your celebrations will unfold, so our team can prepare for every important moment.&rdquo;
        </p>
      </div>

      {/* Two Clear Ways to Share Schedule */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('write')}
          className={`p-4 rounded-3xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeTab === 'write'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md'
              : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xl">✍️</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeTab === 'write' ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}>
              Option A
            </span>
          </div>
          <div>
            <div className="text-sm font-bold">Write Your Schedule</div>
            <div className={`text-xs mt-0.5 ${activeTab === 'write' ? 'text-neutral-300' : 'text-neutral-500'}`}>
              Type event timelines naturally for each celebration.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`p-4 rounded-3xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeTab === 'upload'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md'
              : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xl">💌</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeTab === 'upload' ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}>
              Option B
            </span>
          </div>
          <div>
            <div className="text-sm font-bold">Upload Your Wedding Invitations</div>
            <div className={`text-xs mt-0.5 ${activeTab === 'upload' ? 'text-neutral-300' : 'text-neutral-500'}`}>
              Upload digital invitations, itinerary cards, PDFs, or video invites.
            </div>
          </div>
        </button>
      </div>

      {/* Option B: Upload Invitations Area */}
      {activeTab === 'upload' && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 bg-neutral-50/60 rounded-3xl p-8 text-center space-y-3">
            <div className="text-3xl">💌</div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-neutral-900">
                Upload Digital Invitations & Schedule Documents
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Got itinerary cards, digital invitation PDFs, images, or a video invitation? Upload them here so our team has the complete flow!
              </p>
            </div>

            <label className="inline-block bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-6 py-3 rounded-2xl cursor-pointer transition shadow-sm">
              {uploading ? `Uploading (${uploadProgress}%)...` : '+ Select Invitation / Schedule Files'}
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                disabled={uploading}
                onChange={handleInvitationUpload}
                className="hidden"
              />
            </label>

            <div className="text-[11px] text-neutral-400">
              Supported: PDF, JPG, PNG, WebP, MP4, MOV · Multiple files supported
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {uploadError}
            </div>
          )}

          {/* Uploaded Invitations List */}
          {invitations.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Uploaded Invitations ({invitations.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3.5 bg-white border border-neutral-200 rounded-2xl flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-lg shrink-0">
                        {inv.file_type === 'video' ? '🎬' : inv.file_type === 'pdf' ? '📄' : '🖼️'}
                      </div>
                      <div className="min-w-0">
                        <a
                          href={inv.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-neutral-800 hover:text-black hover:underline truncate block"
                          title={inv.filename}
                        >
                          {inv.filename}
                        </a>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                          {inv.file_type} {inv.file_size ? `· ${(inv.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteInvitation(inv.id)}
                      className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer shrink-0"
                      title="Remove file"
                    >
                      🗑️
                    </button>
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
              No events configured for this project yet. You can upload digital invitations using Option B above!
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
                        <span>🗓️</span> {ev.event_type} Schedule
                      </h3>
                      <div className="flex flex-wrap gap-x-3 text-xs text-neutral-500 mt-0.5">
                        {ev.event_date && (
                          <span>📅 {new Date(ev.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        )}
                        {ev.venue && <span>🏛️ {ev.venue}</span>}
                        {ev.start_time && <span>⏰ {ev.start_time}{ev.end_time ? ` - ${ev.end_time}` : ''}</span>}
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
    </div>
  )
}
