'use client'

import React, { useState, useEffect } from 'react'

interface WeddingVisionReviewProps {
  projectId: string
}

export default function WeddingVisionReview({ projectId }: WeddingVisionReviewProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'family' | 'traditions' | 'schedule' | 'photo' | 'cinema' | 'story' | 'special'>('family')

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
                            {m.photo_url ? (
                              <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
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
                            {m.photo_url ? (
                              <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
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
                        className="bg-white border border-neutral-200 rounded-2xl p-3 flex flex-col justify-between space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {inv.file_type === 'video' ? '🎬' : inv.file_type === 'pdf' ? '📄' : '🖼️'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-neutral-900 truncate">{inv.filename}</div>
                            <div className="text-[10px] text-neutral-400 uppercase font-semibold">{inv.file_type}</div>
                          </div>
                        </div>
                        <a
                          href={inv.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-neutral-900 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl py-1.5 text-center transition block"
                        >
                          View / Download File ↗
                        </a>
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
          {activeTab === 'traditions' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Selected Celebrations & Rituals
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(traditions.celebrations) && traditions.celebrations.length > 0 ? (
                    traditions.celebrations.map((c: string, idx: number) => (
                      <span key={idx} className="bg-neutral-100 text-neutral-800 px-3 py-1 rounded-xl text-xs font-semibold border border-neutral-200">
                        🪔 {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400 italic">No specific traditions recorded.</span>
                  )}
                </div>

                {traditions.importance_notes && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Significance & Details:
                    </span>
                    <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                      {traditions.importance_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PHOTOGRAPHY PREFERENCES */}
          {activeTab === 'photo' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Photography Style & Shot Expectations
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Preferred Style:
                    </span>
                    <p className="text-neutral-800 font-medium">
                      {photoPrefs.preferred_styles?.join(', ') || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Editing / Color Palette:
                    </span>
                    <p className="text-neutral-800 font-medium">
                      {photoPrefs.editing_palette || 'Not specified'}
                    </p>
                  </div>
                </div>

                {photoPrefs.must_have_shots && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Must-Have Photographs:
                    </span>
                    <p className="text-xs text-neutral-700 whitespace-pre-wrap">{photoPrefs.must_have_shots}</p>
                  </div>
                )}

                {photoPrefs.disliked_styles && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">
                      Poses / Angles to Avoid:
                    </span>
                    <p className="text-xs text-rose-700 whitespace-pre-wrap">{photoPrefs.disliked_styles}</p>
                  </div>
                )}

                {Array.isArray(photoPrefs.references) && photoPrefs.references.length > 0 && (
                  <div className="pt-3 border-t border-neutral-100 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                      Visual Reference Items ({photoPrefs.references.length}):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {photoPrefs.references.map((ref: any, idx: number) => (
                        <div key={idx} className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 p-2 text-center text-xs">
                          {ref.type === 'upload' && ref.url ? (
                            <img src={ref.url} alt="Reference" className="w-full h-24 object-cover rounded-lg mb-1" />
                          ) : (
                            <div className="h-16 flex items-center justify-center text-xl">🔗</div>
                          )}
                          <a href={ref.url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-neutral-800 underline truncate block">
                            {ref.platform || 'Link'} ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: FILMS & MUSIC */}
          {activeTab === 'cinema' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Wedding Film & Music Preferences
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Film Vibe & Mood:
                    </span>
                    <p className="text-neutral-800 font-medium">
                      {videoPrefs.film_vibe?.join(', ') || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Interviews / Audio Speeches:
                    </span>
                    <p className="text-neutral-800 font-medium">
                      {videoPrefs.interview_preferences || 'Not specified'}
                    </p>
                  </div>
                </div>

                {videoPrefs.disliked_styles && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">
                      Videography Elements to Avoid:
                    </span>
                    <p className="text-xs text-rose-700 whitespace-pre-wrap">{videoPrefs.disliked_styles}</p>
                  </div>
                )}
              </div>

              {/* Music References List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Track References Linked to Deliverables ({musicReferences.length})
                </h3>
                {musicReferences.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">No specific songs submitted.</p>
                ) : (
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
                            <span className="truncate">{m.url}</span>
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

                        {m.notes && (
                          <p className="text-[11px] text-neutral-600 bg-neutral-50 rounded-xl p-2 border border-neutral-100">
                            {m.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: STORY */}
          {activeTab === 'story' && (
            <div className="space-y-3">
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  How They Met & Their Journey
                </h3>
                {story.how_we_met && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      How they met:
                    </span>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">{story.how_we_met}</p>
                  </div>
                )}
                {story.proposal && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      The Proposal:
                    </span>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">{story.proposal}</p>
                  </div>
                )}
                {story.relationship_dynamics && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      Unique Relationship Dynamic:
                    </span>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">{story.relationship_dynamics}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: SPECIAL CONSIDERATIONS */}
          {activeTab === 'special' && (
            <div className="space-y-3">
              <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Special Care, Avoidances & Private Notes
                </h3>
                {specialCare.sensitive_rituals && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                      Sensitive Rituals / Moments Needing Discretion:
                    </span>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">{specialCare.sensitive_rituals}</p>
                  </div>
                )}
                {specialCare.people_to_avoid && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block mb-1">
                      People or Situations to Avoid / Handle with Care:
                    </span>
                    <p className="text-xs text-rose-700 leading-relaxed whitespace-pre-wrap">{specialCare.people_to_avoid}</p>
                  </div>
                )}
                {specialCare.notes && (
                  <div className="pt-2 border-t border-neutral-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                      General Notes:
                    </span>
                    <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap">{specialCare.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
