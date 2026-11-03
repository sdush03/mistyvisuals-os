'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import SectionStory, { StoryAnswers } from './SectionStory'
import SectionTraditions, { TraditionsAnswers } from './SectionTraditions'
import SectionSchedule, { ProjectEventItem, InvitationItem } from './SectionSchedule'
import SectionFamilyTree, { FamilyMemberItem } from './SectionFamilyTree'
import SectionPhotography, { PhotographyAnswers } from './SectionPhotography'
import SectionVideography, { VideographyAnswers, MusicReferenceItem, VideoDeliverableItem } from './SectionVideography'
import SectionSpecialConsiderations, { SpecialConsiderationsAnswers } from './SectionSpecialConsiderations'
import SectionFinalTouches, { FinalTouchesAnswers } from './SectionFinalTouches'

interface QuestionnaireModalProps {
  slug: string
  initialStep?: number
  onClose: () => void
  onQuestionnaireUpdated?: () => void
}

const SECTIONS = [
  { id: 1, title: 'Your Story', icon: '📖' },
  { id: 2, title: 'Traditions', icon: '🪔' },
  { id: 3, title: 'Schedule', icon: '🗓️' },
  { id: 4, title: 'Family Tree', icon: '🌳' },
  { id: 5, title: 'Photography', icon: '📸' },
  { id: 6, title: 'Films & Music', icon: '🎬' },
  { id: 7, title: 'Special Care', icon: '🕊️' },
  { id: 8, title: 'Final Touches', icon: '✨' }
]

export default function QuestionnaireModal({
  slug,
  initialStep = 1,
  onClose,
  onQuestionnaireUpdated
}: QuestionnaireModalProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Questionnaire state
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'not_started' | 'in_progress' | 'completed'>('not_started')
  const [storyAnswers, setStoryAnswers] = useState<StoryAnswers>({})
  const [traditionsAnswers, setTraditionsAnswers] = useState<TraditionsAnswers>({})
  const [scheduleEvents, setScheduleEvents] = useState<ProjectEventItem[]>([])
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberItem[]>([])
  const [photoAnswers, setPhotoAnswers] = useState<PhotographyAnswers>({})
  const [videoAnswers, setVideoAnswers] = useState<VideographyAnswers>({})
  const [deliverables, setDeliverables] = useState<VideoDeliverableItem[]>([])
  const [musicReferences, setMusicReferences] = useState<MusicReferenceItem[]>([])
  const [specialAnswers, setSpecialAnswers] = useState<SpecialConsiderationsAnswers>({})
  const [finalAnswers, setFinalAnswers] = useState<FinalTouchesAnswers>({})
  const [stats, setStats] = useState<any>(null)

  // Draft saving indicator state: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [missingRequirements, setMissingRequirements] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoadRef = useRef(true)

  // 1. Fetch complete questionnaire on mount
  const loadQuestionnaire = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const res = await fetch(`/api/client-portal/${slug}/questionnaire`, { credentials: 'include' })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `Failed to load questionnaire (status ${res.status})`)
      }
      const data = await res.json()
      const q = data.questionnaire || {}

      setQuestionnaireStatus(q.status || 'not_started')
      if (initialStep) {
        setCurrentStep(initialStep)
      } else if (q.current_step) {
        setCurrentStep(q.current_step)
      }

      setStoryAnswers(q.story || {})
      setTraditionsAnswers(q.traditions || {})
      setPhotoAnswers(q.photo_preferences || {})
      setVideoAnswers(q.video_preferences || {})
      setSpecialAnswers(q.special_considerations || {})
      setFinalAnswers(q.final_touches || {})

      setFamilyMembers(data.familyMembers || [])
      setScheduleEvents(data.events || [])
      setDeliverables(data.deliverables || [])
      setInvitations(data.invitations || [])
      setMusicReferences(data.musicReferences || [])
      setStats(data.stats || null)
    } catch (err: any) {
      setLoadError(err.message || 'Could not load your wedding vision questionnaire.')
    } finally {
      setLoading(false)
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 500)
    }
  }

  useEffect(() => {
    loadQuestionnaire()
  }, [slug])

  // 2. Draft Save Function (Optimistic & Non-blocking)
  const saveDraft = useCallback(async (explicitStep?: number) => {
    try {
      setSaveStatus('saving')
      const targetStep = explicitStep !== undefined ? explicitStep : currentStep

      const res = await fetch(`/api/client-portal/${slug}/questionnaire/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_step: targetStep,
          story: storyAnswers,
          traditions: traditionsAnswers,
          photo_preferences: photoAnswers,
          video_preferences: videoAnswers,
          special_considerations: specialAnswers,
          final_touches: finalAnswers
        })
      })

      if (!res.ok) {
        throw new Error('Save draft failed')
      }

      setSaveStatus('saved')
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      if (questionnaireStatus === 'not_started') {
        setQuestionnaireStatus('in_progress')
      }
      if (onQuestionnaireUpdated) {
        onQuestionnaireUpdated()
      }
    } catch {
      setSaveStatus('error')
    }
  }, [
    slug,
    currentStep,
    storyAnswers,
    traditionsAnswers,
    photoAnswers,
    videoAnswers,
    specialAnswers,
    finalAnswers,
    questionnaireStatus,
    onQuestionnaireUpdated
  ])

  // Trigger debounced autosave on answer changes
  const triggerDebouncedAutosave = () => {
    if (isInitialLoadRef.current) return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    setSaveStatus('saving')
    debounceTimerRef.current = setTimeout(() => {
      saveDraft()
    }, 1500)
  }

  // Final Submit Handler
  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setSubmitError('')
      setMissingRequirements([])

      await saveDraft(currentStep)

      const res = await fetch(`/api/client-portal/${slug}/questionnaire/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'Failed to complete questionnaire.')
        if (data.missingRequirements) {
          setMissingRequirements(data.missingRequirements)
        }
        return
      }

      setQuestionnaireStatus('completed')
      if (onQuestionnaireUpdated) onQuestionnaireUpdated()
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Family Tree Handlers
  const handleAddFamilyMember = async (member: Omit<FamilyMemberItem, 'id'>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(member)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to add family member')
    }
    const data = await res.json()
    setFamilyMembers(prev => [...prev, data.member])
    await loadQuestionnaire()
  }

  const handleUpdateFamilyMember = async (id: string, updates: Partial<FamilyMemberItem>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update member')
    }
    const data = await res.json()
    setFamilyMembers(prev => prev.map(m => (m.id === id ? data.member : m)))
    await loadQuestionnaire()
  }

  const handleDeleteFamilyMember = async (id: string) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Failed to delete member')
    setFamilyMembers(prev => prev.filter(m => m.id !== id))
    await loadQuestionnaire()
  }

  const handleUpdateScheduleText = async (project_event_id: string, schedule_text: string) => {
    await fetch(`/api/client-portal/${slug}/questionnaire/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ project_event_id, schedule_text })
    })
    setScheduleEvents(prev =>
      prev.map(e => (e.id === project_event_id ? { ...e, schedule_text } : e))
    )
  }

  const handleAddInvitation = async (inv: Omit<InvitationItem, 'id'>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(inv)
    })
    if (!res.ok) throw new Error('Failed to record invitation')
    const data = await res.json()
    setInvitations(prev => [...prev, data.invitation])
  }

  const handleDeleteInvitation = async (id: string) => {
    await fetch(`/api/client-portal/${slug}/questionnaire/invitations/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  const handleAddMusicReference = async (ref: Omit<MusicReferenceItem, 'id'>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/music-references`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(ref)
    })
    if (!res.ok) throw new Error('Failed to record music reference')
    const data = await res.json()
    setMusicReferences(prev => [...prev, data.musicReference])
  }

  const handleDeleteMusicReference = async (id: string) => {
    await fetch(`/api/client-portal/${slug}/questionnaire/music-references/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    setMusicReferences(prev => prev.filter(m => m.id !== id))
  }

  // Instant Synchronous Navigation Handlers
  const handleStepJump = (step: number) => {
    setCurrentStep(step)
    saveDraft(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNext = () => {
    if (currentStep < 8) {
      const next = currentStep + 1
      setCurrentStep(next)
      saveDraft(next)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      const prev = currentStep - 1
      setCurrentStep(prev)
      saveDraft(prev)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-50/95 backdrop-blur-md overflow-hidden text-neutral-900 force-light animate-fade-in" style={{ colorScheme: 'light' }}>
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-neutral-200/80 px-4 md:px-8 py-3.5 flex items-center justify-between gap-4 shrink-0 shadow-xs z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 p-2 rounded-xl hover:bg-neutral-100 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <span>←</span> <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <div className="h-4 w-px bg-neutral-200 hidden sm:block"></div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight text-neutral-900 hidden sm:inline">
              Your Wedding Vision
            </span>
            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2.5 py-0.5 rounded-full border border-neutral-200">
              Section {currentStep} of 8 · {SECTIONS[currentStep - 1]?.title}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          {saveStatus === 'saving' && (
            <span className="text-amber-600 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Saved {lastSavedAt ? `at ${lastSavedAt}` : ''}
            </span>
          )}
          {saveStatus === 'error' && (
            <button
              type="button"
              onClick={() => saveDraft()}
              className="text-rose-600 hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Unable to save · Click to retry
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => saveDraft()}
            disabled={saveStatus === 'saving'}
            className="bg-white hover:bg-neutral-50 text-neutral-700 font-semibold text-xs px-3.5 py-2 rounded-xl border border-neutral-200 transition shadow-2xs cursor-pointer"
          >
            💾 Save Draft
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </header>

      {/* Slide Navigation Strip */}
      <div className="bg-white border-b border-neutral-200/60 px-4 md:px-8 py-2 overflow-x-auto shrink-0 flex items-center gap-1.5 no-scrollbar z-10">
        {SECTIONS.map((sec) => {
          const isActive = currentStep === sec.id
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => handleStepJump(sec.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100/70 hover:bg-neutral-100 text-neutral-600'
              }`}
            >
              <span>{sec.icon}</span>
              <span>{sec.title}</span>
            </button>
          )
        })}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-neutral-100 overflow-hidden shrink-0">
        <div
          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${(currentStep / 8) * 100}%` }}
        />
      </div>

      {/* Main Slide Body */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10">
        {loading ? (
          <div className="max-w-xl mx-auto py-20 text-center space-y-4">
            <div className="w-10 h-10 border-3 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-semibold text-neutral-500">Loading your questionnaire...</p>
          </div>
        ) : loadError ? (
          <div className="max-w-md mx-auto py-16 text-center space-y-4">
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-600">
              {loadError}
            </div>
            <button
              onClick={loadQuestionnaire}
              className="bg-neutral-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Section 01: Your Story */}
            {currentStep === 1 && (
              <SectionStory
                answers={storyAnswers}
                onChange={(upd) => {
                  setStoryAnswers(upd)
                  triggerDebouncedAutosave()
                }}
              />
            )}

            {/* Section 02: Your Traditions & Celebrations */}
            {currentStep === 2 && (
              <SectionTraditions
                answers={traditionsAnswers}
                onChange={(upd) => {
                  setTraditionsAnswers(upd)
                  triggerDebouncedAutosave()
                }}
              />
            )}

            {/* Section 03: Your Wedding Schedule */}
            {currentStep === 3 && (
              <SectionSchedule
                slug={slug}
                events={scheduleEvents}
                invitations={invitations}
                onUpdateScheduleText={handleUpdateScheduleText}
                onAddInvitation={handleAddInvitation}
                onDeleteInvitation={handleDeleteInvitation}
              />
            )}

            {/* Section 04: Family Tree & Important People */}
            {currentStep === 4 && (
              <SectionFamilyTree
                slug={slug}
                familyMembers={familyMembers}
                stats={stats}
                onAddMember={handleAddFamilyMember}
                onUpdateMember={handleUpdateFamilyMember}
                onDeleteMember={handleDeleteFamilyMember}
              />
            )}

            {/* Section 05: Photography Preferences */}
            {currentStep === 5 && (
              <SectionPhotography
                slug={slug}
                answers={photoAnswers}
                onChange={(upd) => {
                  setPhotoAnswers(upd)
                  triggerDebouncedAutosave()
                }}
              />
            )}

            {/* Section 06: Films, Music & Videography */}
            {currentStep === 6 && (
              <SectionVideography
                answers={videoAnswers}
                deliverables={deliverables}
                musicReferences={musicReferences}
                familyMembers={familyMembers}
                onChange={(upd) => {
                  setVideoAnswers(upd)
                  triggerDebouncedAutosave()
                }}
                onAddMusicReference={handleAddMusicReference}
                onDeleteMusicReference={handleDeleteMusicReference}
              />
            )}

            {/* Section 07: Special Considerations */}
            {currentStep === 7 && (
              <SectionSpecialConsiderations
                answers={specialAnswers}
                familyMembers={familyMembers}
                onChange={(upd) => {
                  setSpecialAnswers(upd)
                  triggerDebouncedAutosave()
                }}
              />
            )}

            {/* Section 08: The Final Touches */}
            {currentStep === 8 && (
              <div className="space-y-6">
                <SectionFinalTouches
                  answers={finalAnswers}
                  onChange={(upd) => {
                    setFinalAnswers(upd)
                    triggerDebouncedAutosave()
                  }}
                />

                {submitError && (
                  <div className="max-w-3xl mx-auto p-4 bg-rose-50 border border-rose-200 rounded-3xl text-left space-y-2">
                    <span className="text-xs font-bold text-rose-800 block">
                      ⚠️ Incomplete Mandatory Parent Details:
                    </span>
                    <p className="text-xs text-rose-700">{submitError}</p>
                    {missingRequirements.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-rose-600 space-y-0.5">
                        {missingRequirements.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => handleStepJump(4)}
                      className="text-xs font-bold text-rose-900 underline mt-2 block cursor-pointer"
                    >
                      → Go to Section 04: Family Tree to complete parent details
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Sticky Action Footer */}
      <footer className="bg-white border-t border-neutral-200/80 px-4 md:px-8 py-4 flex items-center justify-between gap-4 shrink-0 shadow-lg z-20">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="bg-neutral-100 hover:bg-neutral-200 disabled:opacity-30 disabled:pointer-events-none text-neutral-800 font-bold text-xs px-5 py-2.5 rounded-2xl transition cursor-pointer"
        >
          ← Previous Section
        </button>

        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
          <span>{SECTIONS[currentStep - 1]?.title}</span>
          <span>·</span>
          <span>Section {currentStep} of 8</span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              saveDraft()
              onClose()
            }}
            className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs px-4 py-2.5 rounded-2xl transition cursor-pointer hidden sm:block"
          >
            Save Draft & Resume Later
          </button>

          {currentStep < 8 ? (
            <button
              type="button"
              onClick={handleNext}
              className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-6 py-2.5 rounded-2xl transition shadow-sm cursor-pointer"
            >
              Next Section →
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-6 py-2.5 rounded-2xl transition shadow-md cursor-pointer flex items-center gap-2"
            >
              {submitting ? 'Submitting...' : '✓ Submit Questionnaire'}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
