'use client'

import React, { useState, useEffect } from 'react'
import {
  Film,
  FileText,
  Image as ImageIcon,
  Eye,
  Camera,
  Landmark,
  Sparkles,
  BookHeart,
  HeartHandshake,
  Music,
  ExternalLink,
  User,
  Play,
  X
} from 'lucide-react'

function SelectedCard({ label }: { label: string }) {
  return (
    <div className="px-3.5 py-2.5 rounded-xl text-xs bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold flex items-center justify-between">
      <span className="truncate mr-2">{label}</span>
      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
    </div>
  )
}

function TextResponse({ text }: { text: string }) {
  return (
    <div className="p-3.5 bg-neutral-50/80 rounded-2xl border border-neutral-200 text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed">
      {text}
    </div>
  )
}

function uniqueArray(arr: (string | undefined | null)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => Boolean(v && v.trim()))))
}

function normalizeMediaUrl(url: string | undefined | null, storageKey?: string | null): string {
  const publicDomain = 'gallery.mistyvisuals.com'
  if (!url || typeof url !== 'string') {
    if (storageKey) return `https://${publicDomain}/${storageKey.replace(/^\/+/, '')}`
    return ''
  }
  const trimmed = url.trim()
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }
  if (trimmed.startsWith('/api/photos/file/')) {
    const subKey = trimmed.replace('/api/photos/file/', '')
    return `https://${publicDomain}/${subKey}`
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return `https://${publicDomain}${trimmed}`
  }
  return `https://${trimmed}`
}

interface WeddingVisionReviewProps {
  projectId: string
}

export default function WeddingVisionReview({ projectId }: WeddingVisionReviewProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'family' | 'traditions' | 'schedule' | 'photo' | 'cinema' | 'final' | 'story' | 'special'>('family')
  const [previewMedia, setPreviewMedia] = useState<any>(null)

  const fetchReview = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`/api/projects/${projectId}/wedding-vision`)
      if (!res.ok) {
        if (res.status === 404) {
          setData(null)
          setLoading(false)
          return
        }
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to load wedding vision')
      }
      const json = await res.json()
      setData(json.data)
    } catch (err: any) {
      setError(err.message || 'Error loading wedding vision')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) {
      fetchReview()
    }
  }, [projectId])

  if (loading) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 text-center space-y-3">
        <div className="w-6 h-6 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-neutral-500 font-medium">Loading Wedding Vision data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            ✨ Wedding Vision Questionnaire
          </h2>
          <button
            onClick={fetchReview}
            className="text-xs text-neutral-600 hover:text-neutral-900 underline font-semibold"
          >
            Retry
          </button>
        </div>
        <p className="text-xs text-rose-600">{error}</p>
      </div>
    )
  }

  const questionnaire = data?.questionnaire
  const status = questionnaire?.status || 'not_started'
  const isStarted = status !== 'not_started' || Boolean(questionnaire?.has_opened)
  const familyMembers = data?.familyMembers || []
  const schedules = data?.schedules || []
  const invitations = data?.invitations || []
  const musicReferences = data?.musicReferences || []
  const stats = data?.stats || {}
  const couple = data?.couple || null

  const story = questionnaire?.story || {}
  const traditions = questionnaire?.traditions || {}
  const photoPrefs = questionnaire?.photo_preferences || {}
  const videoPrefs = questionnaire?.video_preferences || {}
  const specialCare = questionnaire?.special_considerations || {}
  const finalTouches = questionnaire?.final_touches || {}

  const brideFamily = familyMembers.filter((m: any) => m.side === 'bride')
  const groomFamily = familyMembers.filter((m: any) => m.side === 'groom')

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 md:p-6 space-y-6 animate-fade-in text-neutral-900">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-base">✨</span>
            <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
              Client Wedding Vision & Questionnaire
            </h2>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
              status === 'completed'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : status === 'in_progress'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-neutral-100 text-neutral-600 border-neutral-200'
            }`}>
              {status === 'completed' ? '✓ Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started'}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Shared questionnaire answers, family tree portraits, ceremony schedule, and visual/music references.
          </p>
        </div>

        {questionnaire?.completed_at && (
          <div className="text-[11px] text-neutral-500 font-medium">
            Submitted: {new Date(questionnaire.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {!isStarted && familyMembers.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto text-lg">
            📋
          </div>
          <p className="text-xs font-semibold text-neutral-700">The couple has not started this questionnaire yet.</p>
          <p className="text-[11px] text-neutral-400">Answers will appear here automatically as soon as the couple saves their draft or submits responses.</p>
        </div>
      ) : (
        <>
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Family VIPs</div>
              <div className="text-lg font-extrabold text-neutral-900 mt-0.5">{familyMembers.length}</div>
              <div className="text-[10px] text-neutral-500">
                {stats?.bride?.total || 0} Bride · {stats?.groom?.total || 0} Groom
              </div>
            </div>

            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">High Priority VIPs</div>
              <div className="text-lg font-extrabold text-rose-600 mt-0.5">
                {(stats?.bride?.high_priority || 0) + (stats?.groom?.high_priority || 0)}
              </div>
              <div className="text-[10px] text-neutral-500">Key focus for photo/cinema</div>
            </div>

            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Invitations Uploaded</div>
              <div className="text-lg font-extrabold text-blue-600 mt-0.5">{invitations.length}</div>
              <div className="text-[10px] text-neutral-500">PDFs, images & video invites</div>
            </div>

            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Music Tracks</div>
              <div className="text-lg font-extrabold text-emerald-600 mt-0.5">{musicReferences.length}</div>
              <div className="text-[10px] text-neutral-500">Mapped to video deliverables</div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-100 no-scrollbar">
            {[
              { id: 'family', label: 'Family Tree', icon: '🌳', count: familyMembers.length },
              { id: 'schedule', label: 'Schedule & Invites', icon: '🗓️', count: invitations.length },
              { id: 'traditions', label: 'Traditions', icon: '🪔' },
              { id: 'photo', label: 'Photo Preferences', icon: '📸' },
              { id: 'cinema', label: 'Films & Music', icon: '🎬', count: musicReferences.length },
              { id: 'final', label: 'Final Touches', icon: '✨' },
              { id: 'story', label: 'Couple Story', icon: '📖' },
              { id: 'special', label: 'Special Care', icon: '🕊️' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-100/70 hover:bg-neutral-100 text-neutral-600'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* TAB 1: FAMILY TREE */}
          {activeTab === 'family' && (
            <div className="space-y-6">
              {/* The Couple */}
              {(couple?.bride?.name || couple?.groom?.name) && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    The Couple
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:gap-6">
                    {/* Bride Card */}
                    <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
                        {couple?.bride?.photo_url ? (
                          <img
                            src={normalizeMediaUrl(couple.bride.photo_url)}
                            alt={couple.bride.name || 'Bride'}
                            className="w-full h-full object-cover object-top"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <User className="w-7 h-7 text-neutral-300 stroke-[1.5]" />
                        )}
                      </div>
                      <div className="w-full space-y-0.5 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                          {couple?.bride?.name || 'Bride'}
                        </h4>
                        <p className="text-[11px] font-semibold text-neutral-500">Bride</p>
                      </div>
                    </div>

                    {/* Groom Card */}
                    <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
                        {couple?.groom?.photo_url ? (
                          <img
                            src={normalizeMediaUrl(couple.groom.photo_url)}
                            alt={couple.groom.name || 'Groom'}
                            className="w-full h-full object-cover object-top"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <User className="w-7 h-7 text-neutral-300 stroke-[1.5]" />
                        )}
                      </div>
                      <div className="w-full space-y-0.5 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                          {couple?.groom?.name || 'Groom'}
                        </h4>
                        <p className="text-[11px] font-semibold text-neutral-500">Groom</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bride Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-rose-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                      <span>👰</span> Bride&apos;s Side ({brideFamily.length})
                    </h3>
                  </div>

                  {brideFamily.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic py-2">No family members added yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {brideFamily.map((m: any) => (
                        <div
                          key={m.id}
                          className="bg-white border border-neutral-200/80 rounded-2xl p-3 flex items-start gap-3 shadow-2xs hover:border-neutral-300 transition"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0 relative">
                            {m.photo_url || m.storage_key ? (
                              <img
                                src={normalizeMediaUrl(m.photo_url, m.storage_key)}
                                alt={m.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.currentTarget
                                  if (m.storage_key && !target.src.includes(m.storage_key)) {
                                    target.src = `https://gallery.mistyvisuals.com/${m.storage_key.replace(/^\/+/, '')}`
                                  } else {
                                    target.style.display = 'none'
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs">
                                👤
                              </div>
                            )}
                            {m.is_remembering && (
                              <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center text-[9px] font-bold text-white text-center px-1">
                                🕊️ In Memory
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-neutral-900 leading-tight">
                                  {m.name}
                                </h4>
                                <div className="text-[11px] text-neutral-500">
                                  {m.custom_relationship || m.relationship}
                                </div>
                              </div>
                              <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                m.priority === 'high'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : m.priority === 'low'
                                  ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {m.priority}
                              </span>
                            </div>

                            {m.notes && (
                              <p className="text-[11px] text-neutral-600 bg-neutral-50 rounded-lg p-1.5 mt-1 border border-neutral-100">
                                {m.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Groom Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1.5 border-b border-blue-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <span>🤵</span> Groom&apos;s Side ({groomFamily.length})
                    </h3>
                  </div>

                  {groomFamily.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic py-2">No family members added yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {groomFamily.map((m: any) => (
                        <div
                          key={m.id}
                          className="bg-white border border-neutral-200/80 rounded-2xl p-3 flex items-start gap-3 shadow-2xs hover:border-neutral-300 transition"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0 relative">
                            {m.photo_url || m.storage_key ? (
                              <img
                                src={normalizeMediaUrl(m.photo_url, m.storage_key)}
                                alt={m.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.currentTarget
                                  if (m.storage_key && !target.src.includes(m.storage_key)) {
                                    target.src = `https://gallery.mistyvisuals.com/${m.storage_key.replace(/^\/+/, '')}`
                                  } else {
                                    target.style.display = 'none'
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs">
                                👤
                              </div>
                            )}
                            {m.is_remembering && (
                              <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center text-[9px] font-bold text-white text-center px-1">
                                🕊️ In Memory
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-neutral-900 leading-tight">
                                  {m.name}
                                </h4>
                                <div className="text-[11px] text-neutral-500">
                                  {m.custom_relationship || m.relationship}
                                </div>
                              </div>
                              <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                m.priority === 'high'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : m.priority === 'low'
                                  ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {m.priority}
                              </span>
                            </div>

                            {m.notes && (
                              <p className="text-[11px] text-neutral-600 bg-neutral-50 rounded-lg p-1.5 mt-1 border border-neutral-100">
                                {m.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULE & INVITATIONS */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {/* Invitations Grid */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Uploaded Digital Invitations ({invitations.length})
                </h3>
                {invitations.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">No invitations uploaded by the couple.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {invitations.map((inv: any) => (
                      <div
                        key={inv.id}
                        className="bg-white border border-neutral-200 rounded-2xl overflow-hidden flex flex-col shadow-2xs hover:shadow-xs transition"
                      >
                        <div
                          className="relative w-full aspect-[4/3] bg-neutral-100 flex items-center justify-center overflow-hidden cursor-pointer select-none group"
                          onClick={() => setPreviewMedia(inv)}
                          title="Click to preview / play"
                        >
                          {inv.file_type === 'image' ? (
                            <>
                              <img
                                src={normalizeMediaUrl(inv.file_url, inv.storage_key)}
                                alt={inv.filename}
                                className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.currentTarget
                                  if (inv.storage_key && !target.src.includes(inv.storage_key)) {
                                    target.src = `https://gallery.mistyvisuals.com/${inv.storage_key.replace(/^\/+/, '')}`
                                  } else {
                                    target.style.display = 'none'
                                    const fallback = target.nextElementSibling as HTMLElement
                                    if (fallback) fallback.style.display = 'flex'
                                  }
                                }}
                              />
                              <div className="hidden w-full h-full flex-col items-center justify-center p-3 text-center bg-neutral-50">
                                <ImageIcon className="w-8 h-8 text-neutral-400 mb-1" />
                                <span className="text-[11px] font-semibold text-neutral-500 uppercase">Image Preview</span>
                              </div>
                              <div className="absolute inset-0 bg-neutral-900/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-3 py-1.5 rounded-full bg-white/95 text-neutral-900 text-xs font-semibold shadow-md flex items-center gap-1.5 backdrop-blur-xs">
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Image</span>
                                </span>
                              </div>
                            </>
                          ) : inv.file_type === 'video' ? (
                            <div className="w-full h-full bg-neutral-950 relative flex items-center justify-center">
                              <video
                                src={normalizeMediaUrl(inv.file_url, inv.storage_key)}
                                preload="metadata"
                                muted
                                playsInline
                                className="w-full h-full object-contain pointer-events-none"
                              />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition">
                                <div className="w-12 h-12 rounded-full bg-white/90 text-neutral-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                                  <Play className="w-5 h-5 fill-current ml-0.5" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-neutral-50 to-neutral-100/80">
                              <FileText className="w-8 h-8 text-amber-600 mb-1" />
                              <span className="text-[11px] font-semibold text-neutral-600 uppercase">PDF Document</span>
                              <span className="text-[10px] text-neutral-400 mt-1">Click to Preview</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3 space-y-2.5">
                          <div>
                            <div className="text-xs font-bold text-neutral-900 truncate" title={inv.filename}>{inv.filename}</div>
                            <div className="text-[10px] text-neutral-400 uppercase font-semibold">
                              {inv.file_type} {inv.file_size ? `· ${(inv.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewMedia(inv)}
                              className="text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl py-1.5 text-center transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              {inv.file_type === 'video' ? (
                                <>
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>Play</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </>
                              )}
                            </button>
                            <a
                              href={normalizeMediaUrl(inv.file_url, inv.storage_key)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl py-1.5 text-center transition flex items-center justify-center gap-1"
                            >
                              <span>Original</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Event Detailed Schedules */}
              <div className="space-y-3 pt-4 border-t border-neutral-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Event-Wise Detailed Flow & Schedules
                </h3>
                {schedules.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">No event schedules configured for this project.</p>
                ) : (
                  <div className="space-y-3">
                    {schedules.map((ev: any) => (
                      <div key={ev.id} className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-2 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                            <span>{ev.event_type}</span>
                            {ev.venue && <span className="text-neutral-400 font-normal">· {ev.venue}</span>}
                          </h4>
                          <span className="text-[11px] text-neutral-500 font-medium">
                            {ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date TBA'}
                          </span>
                        </div>
                        <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
                          {ev.schedule_text || <span className="italic text-neutral-400">No custom schedule notes entered for this event yet.</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TRADITIONS */}
          {activeTab === 'traditions' && (() => {
            const primaryTradition = traditions.primary_tradition || traditions.main_traditions?.[0]
            const regions = traditions.indian_regions || []
            const communities = uniqueArray([
              ...(traditions.north_indian_communities || []),
              ...(traditions.south_indian_communities || []),
              ...(traditions.west_indian_communities || []),
              ...(traditions.east_indian_communities || []),
              ...(traditions.northeast_indian_communities || []),
              ...(traditions.international_styles || []),
              traditions.north_indian_other_custom,
              traditions.south_indian_other_custom,
              traditions.west_indian_other_custom,
              traditions.east_indian_other_custom,
              traditions.northeast_indian_other_custom,
              traditions.other_indian_community_custom,
              traditions.international_other_custom,
              traditions.main_other_custom
            ])

            const customDetails = uniqueArray([
              traditions.hindu_community,
              traditions.sikh_community,
              traditions.christian_community,
              traditions.muslim_community,
              traditions.multicultural_details
            ])

            const celebrations = traditions.celebrations || traditions.q2_sacred_rituals || []
            const notes = traditions.q7_important_details || traditions.importance_notes || traditions.q1_religious_cultural_elements || traditions.q3_cultural_significance

            const selectedTraditionsList = uniqueArray([
              primaryTradition,
              ...regions,
              ...communities,
              ...celebrations
            ])

            const hasAnyTradition = selectedTraditionsList.length > 0 || customDetails.length > 0 || Boolean(notes)

            return (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
                {!hasAnyTradition ? (
                  <p className="text-neutral-400 italic">No cultural traditions entered yet.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {(selectedTraditionsList.length > 0 || customDetails.length > 0) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. Which cultural, religious or regional wedding traditions are you following?
                        </label>
                        {selectedTraditionsList.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {selectedTraditionsList.map(opt => (
                              <SelectedCard key={opt} label={opt} />
                            ))}
                          </div>
                        )}
                        {customDetails.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {customDetails.map((det, idx) => (
                              <TextResponse key={idx} text={det} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Q2 */}
                    {notes && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. Are there any traditions or cultural details that are particularly important for our photography and film teams to understand?
                        </label>
                        <TextResponse text={notes} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* TAB 4: PHOTOGRAPHY PREFERENCES */}
          {activeTab === 'photo' && (() => {
            const stylesAndMoments = uniqueArray([
              ...(photoPrefs.q8_styles || []),
              ...(photoPrefs.q10_matters_most || []),
              photoPrefs.preferred_styles,
              photoPrefs.q16_photo_aesthetic_preferences,
              photoPrefs.q8_other,
              photoPrefs.q10_other
            ])

            const colorPalette = uniqueArray([
              ...(photoPrefs.q12_mood_palette || []),
              ...(photoPrefs.q13_editing_styles || []),
              photoPrefs.q12_other,
              photoPrefs.q13_other,
              photoPrefs.editing_palette,
              photoPrefs.q17_editing_color_palette
            ])

            const visualReferences = photoPrefs.q11_inspirations || photoPrefs.references || []
            const cameraComfort = photoPrefs.q9_camera_comfort
            const dislikedStyles = photoPrefs.q14_disliked_styles || photoPrefs.disliked_styles
            const romanticComfort = photoPrefs.q15_romantic_comfort
            const posesToAvoid = photoPrefs.q15_poses_to_avoid

            const hasAnyPhoto = Boolean(
              stylesAndMoments.length > 0 ||
              cameraComfort ||
              visualReferences.length > 0 ||
              colorPalette.length > 0 ||
              dislikedStyles ||
              romanticComfort ||
              posesToAvoid
            )

            return (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
                {!hasAnyPhoto ? (
                  <p className="text-neutral-400 italic">No photography preferences entered yet.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {stylesAndMoments.length > 0 && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. What photography styles and moments matter most to you?
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {stylesAndMoments.map(opt => (
                            <SelectedCard key={opt} label={opt} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Q2 */}
                    {cameraComfort && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. How comfortable are you in front of the camera?
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <SelectedCard label={cameraComfort} />
                        </div>
                      </div>
                    )}

                    {/* Q3 */}
                    {visualReferences.length > 0 && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q3. Are there any photographs or visual styles that inspire you?
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {visualReferences.map((ref: any, idx: number) => (
                            <div key={idx} className="p-3 bg-white border border-neutral-200 rounded-2xl flex items-center gap-3 shadow-2xs">
                              {ref.type === 'upload' && (ref.url || ref.file_url || ref.storage_key) ? (
                                <img
                                  src={normalizeMediaUrl(ref.url || ref.file_url, ref.storage_key)}
                                  alt="Inspiration"
                                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-200"
                                  onError={(e) => {
                                    const target = e.currentTarget
                                    if (ref.storage_key && !target.src.includes(ref.storage_key)) {
                                      target.src = `https://gallery.mistyvisuals.com/${ref.storage_key.replace(/^\/+/, '')}`
                                    } else {
                                      target.style.display = 'none'
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0 text-base">
                                  🔗
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <a
                                  href={ref.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-neutral-800 hover:underline truncate block"
                                >
                                  {ref.description || ref.platform || ref.url}
                                </a>
                                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                                  {ref.platform || ref.type || 'Link'} ↗
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Q4 */}
                    {colorPalette.length > 0 && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q4. What mood, colour palette, and editing style do you prefer for your wedding photographs?
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {colorPalette.map(opt => (
                            <SelectedCard key={opt} label={opt} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Q5 */}
                    {dislikedStyles && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q5. Are there any photography styles or editing treatments you dislike?
                        </label>
                        <TextResponse text={dislikedStyles} />
                      </div>
                    )}

                    {/* Q6 */}
                    {(romanticComfort || posesToAvoid) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q6. How comfortable are you with romantic and intimate couple portraits?
                        </label>
                        {romanticComfort && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={romanticComfort} />
                          </div>
                        )}
                        {posesToAvoid && (
                          <div className="pt-2 space-y-1">
                            <span className="text-xs font-semibold text-neutral-700 block">Poses or types of photographs to avoid:</span>
                            <TextResponse text={posesToAvoid} />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* TAB 5: FILMS & MUSIC */}
          {activeTab === 'cinema' && (() => {
            const filmStylesAndFeel = uniqueArray([
              ...(videoPrefs.q16_film_styles || []),
              ...(videoPrefs.q17_overall_feel || []),
              videoPrefs.film_vibe,
              videoPrefs.q16_other,
              videoPrefs.q17_other
            ])

            const focusMoments = uniqueArray([
              ...(videoPrefs.q18_focus_moments || []),
              videoPrefs.q18_other
            ])

            const videoRefs = videoPrefs.q19_references || []
            const videoDislikes = videoPrefs.q20_disliked_styles || videoPrefs.disliked_styles

            const musicGenres = uniqueArray([
              ...(videoPrefs.q21_music_genres || []),
              videoPrefs.q21_other
            ])

            const musicSelector = videoPrefs.q22_music_selector
              ? videoPrefs.q22_music_selector === 'couple_selected'
                ? 'Our selected music'
                : 'Editor-selected music'
              : undefined

            const coupleInterview = videoPrefs.q25_couple_interview || videoPrefs.interview_preferences || videoPrefs.q22_speech_interview_preference
            const interviewSelections = videoPrefs.q26_interview_selections || []
            const interviewTopics = videoPrefs.q27_interview_topics

            const hasAnyVideo = Boolean(
              filmStylesAndFeel.length > 0 ||
              focusMoments.length > 0 ||
              videoRefs.length > 0 ||
              videoDislikes ||
              musicGenres.length > 0 ||
              musicSelector ||
              musicReferences.length > 0 ||
              coupleInterview ||
              interviewSelections.length > 0 ||
              interviewTopics
            )

            return (
              <div className="space-y-5">
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
                  {!hasAnyVideo ? (
                    <p className="text-neutral-400 italic">No videography preferences entered yet.</p>
                  ) : (
                    <>
                      {/* Q1 */}
                      {filmStylesAndFeel.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q1. What kind of wedding films and overall feel do you connect with the most?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {filmStylesAndFeel.map(opt => (
                              <SelectedCard key={opt} label={opt} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q2 */}
                      {focusMoments.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q2. What moments would you most like your wedding film to focus on?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {focusMoments.map(opt => (
                              <SelectedCard key={opt} label={opt} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q3 */}
                      {videoRefs.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q3. Are there any film styles, wedding films or video references that inspire you?
                          </label>
                          <div className="space-y-2">
                            {videoRefs.map((r: any, idx: number) => (
                              <div key={idx} className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between text-xs">
                                <div className="truncate">
                                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold text-neutral-900 hover:underline">
                                    {r.url}
                                  </a>
                                  {r.note && <span className="text-neutral-500 ml-2">({r.note})</span>}
                                </div>
                                <span className="text-neutral-400 text-xs shrink-0 ml-2">↗</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q4 */}
                      {videoDislikes && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q4. Are there any videography styles or editing treatments you dislike?
                          </label>
                          <TextResponse text={videoDislikes} />
                        </div>
                      )}

                      {/* Q5 */}
                      {musicGenres.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q5. What kind of music do you generally enjoy?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {musicGenres.map(opt => (
                              <SelectedCard key={opt} label={opt} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q6 */}
                      {musicSelector && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q6. Who would you prefer to select the music for your wedding films?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={musicSelector} />
                          </div>
                        </div>
                      )}

                      {/* Q7 */}
                      {musicReferences.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q7. Share your music references
                          </label>
                          <div className="space-y-2.5">
                            {musicReferences.map((m: any) => (
                              <div key={m.id} className="bg-white border border-neutral-200 rounded-2xl p-3.5 space-y-2 shadow-2xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <a
                                    href={m.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold text-neutral-900 hover:text-blue-600 underline flex items-center gap-1.5 truncate"
                                  >
                                    <span>🎵</span>
                                    <span className="truncate">{m.notes || m.url}</span>
                                    <span>↗</span>
                                  </a>
                                  <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border self-start sm:self-auto ${
                                    m.reference_type === 'exact_song'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                  }`}>
                                    {m.reference_type === 'exact_song' ? 'Exact Track' : 'Vibe Inspiration'}
                                  </span>
                                </div>

                                {Array.isArray(m.deliverable_names) && m.deliverable_names.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className="text-[10px] font-semibold text-neutral-400">Target Deliverables:</span>
                                    {m.deliverable_names.map((name: string, i: number) => (
                                      <span key={i} className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-lg text-[10px] font-medium">
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {m.notes && m.notes !== m.url && (
                                  <p className="text-[11px] text-neutral-600 bg-neutral-50 rounded-xl p-2 border border-neutral-100">
                                    {m.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q8 */}
                      {coupleInterview && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q8. Would you be comfortable participating in a couple interview or sharing short personal bites for your wedding film?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={coupleInterview} />
                          </div>
                        </div>
                      )}

                      {/* Q9 */}
                      {interviewSelections.length > 0 && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q9. Would you like us to interview or capture short bites from particular family members or friends?
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {interviewSelections.map((item: any, idx: number) => (
                              <SelectedCard
                                key={idx}
                                label={`${item.name || item.relationship || 'VIP'}${item.relationship && item.name ? ` (${item.relationship})` : ''}${item.notes ? ` - ${item.notes}` : ''}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Q10 */}
                      {interviewTopics && (
                        <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                          <label className="block text-sm font-bold text-neutral-900">
                            Q10. Any specific questions, memories or topics you&apos;d like us to cover in these interviews?
                          </label>
                          <TextResponse text={interviewTopics} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })()}

          {/* TAB: FINAL TOUCHES */}
          {activeTab === 'final' && (
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
              {!finalTouches.q31_perfect_wedding && !finalTouches.q32_additional_notes ? (
                <p className="text-neutral-400 italic">No final touches entered yet.</p>
              ) : (
                <>
                  {/* Q1 */}
                  {finalTouches.q31_perfect_wedding && (
                    <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                      <label className="block text-sm font-bold text-neutral-900">
                        Q1. What would make you feel that Misty Visuals has captured your wedding perfectly?
                      </label>
                      <TextResponse text={finalTouches.q31_perfect_wedding} />
                    </div>
                  )}

                  {/* Q2 */}
                  {finalTouches.q32_additional_notes && (
                    <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                      <label className="block text-sm font-bold text-neutral-900">
                        Q2. Is there anything else you&apos;d like to tell our team before the celebrations begin?
                      </label>
                      <TextResponse text={finalTouches.q32_additional_notes} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 6: STORY */}
          {activeTab === 'story' && (() => {
            const howWeMet = story.q1_how_we_met || story.how_we_met
            const relationship = story.q2_relationship_description || story.q4_three_defining_things || story.relationship_dynamics
            const proposal = story.q3_special_memory || story.proposal
            const additionalStory = story.q5_additional_story

            const hasAnyStory = Boolean(howWeMet || relationship || proposal || additionalStory)

            return (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
                {!hasAnyStory ? (
                  <p className="text-neutral-400 italic">No story details shared yet.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {howWeMet && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. How did you both meet?
                        </label>
                        <TextResponse text={howWeMet} />
                      </div>
                    )}

                    {/* Q2 */}
                    {relationship && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. How would you describe your relationship, and what are three things that define you as a couple?
                        </label>
                        <TextResponse text={relationship} />
                      </div>
                    )}

                    {/* Q3 */}
                    {proposal && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q3. Is there a special story, memory, or moment you&apos;d love us to capture?
                        </label>
                        <TextResponse text={proposal} />
                      </div>
                    )}

                    {/* Q4 */}
                    {additionalStory && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q4. Is there anything else about your story that you would like us to know?
                        </label>
                        <TextResponse text={additionalStory} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* TAB 7: SPECIAL CONSIDERATIONS */}
          {activeTab === 'special' && (() => {
            const restrictedRituals = specialCare.q28_restricted_rituals
            const restrictedDetails = specialCare.q28_details || specialCare.sensitive_rituals
            const discreetMoments = specialCare.q29_discreet_moments
            const avoidFilming = specialCare.q30_avoid_filming
            const avoidPeople = specialCare.q30_people || specialCare.people_to_avoid

            const hasAnySpecial = Boolean(
              restrictedRituals !== undefined ||
              restrictedDetails ||
              discreetMoments ||
              avoidFilming !== undefined ||
              (Array.isArray(avoidPeople) && avoidPeople.length > 0) ||
              (typeof avoidPeople === 'string' && avoidPeople.trim())
            )

            return (
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 space-y-5 text-xs shadow-2xs">
                {!hasAnySpecial ? (
                  <p className="text-neutral-400 italic">No sensitive considerations noted.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {(restrictedRituals !== undefined || restrictedDetails) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. Are there any rituals where photography or videography is restricted?
                        </label>
                        {restrictedRituals !== undefined && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={restrictedRituals ? 'Yes, there are restrictions' : 'No restrictions'} />
                          </div>
                        )}
                        {restrictedDetails && (
                          <div className="pt-2 space-y-1">
                            <span className="text-xs font-semibold text-neutral-700 block">Restriction details:</span>
                            <TextResponse text={restrictedDetails} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Q2 */}
                    {discreetMoments && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. Are there any moments where we should be especially discreet or avoid interfering?
                        </label>
                        <TextResponse text={discreetMoments} />
                      </div>
                    )}

                    {/* Q3 */}
                    {(avoidFilming !== undefined || (Array.isArray(avoidPeople) && avoidPeople.length > 0) || (typeof avoidPeople === 'string' && avoidPeople.trim())) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q3. Are there any guests or individuals who should not be photographed or filmed?
                        </label>
                        {avoidFilming !== undefined && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={avoidFilming ? 'Yes, some individuals prefer not to be filmed' : 'No, all guests can be captured'} />
                          </div>
                        )}
                        {Array.isArray(avoidPeople) && avoidPeople.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <span className="text-xs font-semibold text-neutral-700 block">Individuals to avoid:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {avoidPeople.map((p: any, idx: number) => (
                                <div key={idx} className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs flex items-center justify-between">
                                  <span className="font-bold text-rose-950">{p.name}</span>
                                  {p.note && <span className="text-rose-800 text-[11px] font-medium">{p.note}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {typeof avoidPeople === 'string' && avoidPeople.trim() && (
                          <div className="pt-2">
                            <TextResponse text={avoidPeople} />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}

      {/* FULLSCREEN PREVIEW LIGHTBOX MODAL */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                  {previewMedia.filename}
                </h3>
                <p className="text-[11px] text-neutral-400 uppercase font-semibold">
                  {previewMedia.file_type} {previewMedia.file_size ? `· ${(previewMedia.file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  className="p-2 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto bg-neutral-900/5 p-4 flex items-center justify-center min-h-[350px]">
              {previewMedia.file_type === 'image' ? (
                <img
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  alt={previewMedia.filename}
                  className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-md"
                />
              ) : previewMedia.file_type === 'video' ? (
                <video
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] max-w-full rounded-xl shadow-md bg-black"
                />
              ) : (
                <iframe
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  title={previewMedia.filename}
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
