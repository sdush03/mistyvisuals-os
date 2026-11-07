'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SectionStory, { StoryAnswers } from '@/components/portal/questionnaire/SectionStory'
import SectionTraditions, { TraditionsAnswers } from '@/components/portal/questionnaire/SectionTraditions'
import SectionSchedule, { ProjectEventItem, InvitationItem } from '@/components/portal/questionnaire/SectionSchedule'
import SectionFamilyTree, { FamilyMemberItem, FamilyGroupItem } from '@/components/portal/questionnaire/SectionFamilyTree'
import SectionPhotography, { PhotographyAnswers } from '@/components/portal/questionnaire/SectionPhotography'
import SectionVideography, { VideographyAnswers, MusicReferenceItem, VideoDeliverableItem } from '@/components/portal/questionnaire/SectionVideography'
import SectionSpecialConsiderations, { SpecialConsiderationsAnswers } from '@/components/portal/questionnaire/SectionSpecialConsiderations'
import SectionFinalTouches, { FinalTouchesAnswers } from '@/components/portal/questionnaire/SectionFinalTouches'
import SectionReview from '@/components/portal/questionnaire/SectionReview'
import SectionOverview from '@/components/portal/questionnaire/SectionOverview'
import {
  Landmark,
  Calendar,
  Users,
  Camera,
  Film,
  Sparkles,
  BookHeart,
  HeartHandshake,
  LayoutList,
  Lock,
  AlertCircle,
  ClipboardCheck
} from 'lucide-react'

interface VisionClientProps {
  slug: string
  initialStep?: number
}

const SECTIONS = [
  { id: 1, title: 'Traditions & Culture', icon: Landmark, part: 1 },
  { id: 2, title: 'Schedule & Invites', icon: Calendar, part: 1 },
  { id: 3, title: 'Family Tree', icon: Users, part: 1 },
  { id: 4, title: 'Photography', icon: Camera, part: 1 },
  { id: 5, title: 'Films & Music', icon: Film, part: 1 },
  { id: 6, title: 'Final Touches', icon: Sparkles, part: 1 },
  { id: 7, title: 'Your Story', icon: BookHeart, part: 2 },
  { id: 8, title: 'Special Care', icon: HeartHandshake, part: 2 },
  { id: 9, title: 'Review & Submit', icon: ClipboardCheck, part: 3 }
]

export default function VisionClient({ slug, initialStep = 0 }: VisionClientProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [lastClosedStep, setLastClosedStep] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Passcode unlock state if unauthenticated
  const [isLocked, setIsLocked] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [verifyingPasscode, setVerifyingPasscode] = useState(false)
  const [passcodeError, setPasscodeError] = useState('')

  // Questionnaire state
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'not_started' | 'in_progress' | 'completed'>('not_started')
  const [storyAnswers, setStoryAnswers] = useState<StoryAnswers>({})
  const [traditionsAnswers, setTraditionsAnswers] = useState<TraditionsAnswers>({})
  const [scheduleEvents, setScheduleEvents] = useState<ProjectEventItem[]>([])
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberItem[]>([])
  const [familyGroups, setFamilyGroups] = useState<FamilyGroupItem[]>([])
  const [photoAnswers, setPhotoAnswers] = useState<PhotographyAnswers>({})
  const [videoAnswers, setVideoAnswers] = useState<VideographyAnswers>({})
  const [deliverables, setDeliverables] = useState<VideoDeliverableItem[]>([])
  const [musicReferences, setMusicReferences] = useState<MusicReferenceItem[]>([])
  const [specialAnswers, setSpecialAnswers] = useState<SpecialConsiderationsAnswers>({})
  const [finalAnswers, setFinalAnswers] = useState<FinalTouchesAnswers>({})
  const [stats, setStats] = useState<any>(null)
  const [gallery, setGallery] = useState<any>(null)
  const [couple, setCouple] = useState<any>(null)

  // Draft saving indicator state: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [missingRequirements, setMissingRequirements] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showPart1Transition, setShowPart1Transition] = useState(false)
  const [showAdditionalSections, setShowAdditionalSections] = useState(false)

  // Permanently unlock additional sections across current session and persistent storage
  const unlockAdditionalSections = useCallback(() => {
    setShowAdditionalSections(true)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`wedding_vision_unlocked_${slug}`, 'true')
      } catch (_) {}
    }
    setStoryAnswers(prev => ({ ...prev, unlocked_additional: true }))
  }, [slug])

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const savedStatusTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoadRef = useRef(true)
  const mainScrollRef = useRef<HTMLDivElement | null>(null)

  const latestAnswersRef = useRef({
    storyAnswers,
    traditionsAnswers,
    photoAnswers,
    videoAnswers,
    specialAnswers,
    finalAnswers,
    showAdditionalSections,
    currentStep,
    lastClosedStep,
    questionnaireStatus
  })

  useEffect(() => {
    latestAnswersRef.current = {
      storyAnswers,
      traditionsAnswers,
      photoAnswers,
      videoAnswers,
      specialAnswers,
      finalAnswers,
      showAdditionalSections,
      currentStep,
      lastClosedStep,
      questionnaireStatus
    }
  })

  useEffect(() => {
    return () => {
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  // 1. Fetch complete questionnaire on mount or refresh
  const loadQuestionnaire = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setLoadError('')
      setIsLocked(false)
      const res = await fetch(`/api/client-portal/${slug}/questionnaire`, { credentials: 'include' })

      if (res.status === 401) {
        setIsLocked(true)
        if (!silent) setLoading(false)
        return
      }

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}))
        if (errJson.requiresOnboarding) {
          router.push(`/${slug}`)
          return
        }
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `Failed to load questionnaire (status ${res.status})`)
      }

      const data = await res.json()
      const q = data.questionnaire || {}

      setQuestionnaireStatus(q.status || 'not_started')
      const savedStep = q.current_step && q.current_step >= 1 ? q.current_step : 1
      setLastClosedStep(savedStep)

      // Only set currentStep on initial load; NEVER reset during user editing/uploading!
      if (isInitialLoadRef.current) {
        if (initialStep !== undefined && initialStep >= 0 && initialStep <= 9) {
          setCurrentStep(initialStep)
        } else {
          setCurrentStep(0)
        }
      }

      const storyObj = q.story || {}
      const specialObj = q.special_considerations || {}
      const finalObj = q.final_touches || {}
      setStoryAnswers(storyObj)
      setTraditionsAnswers(q.traditions || {})
      setPhotoAnswers(q.photo_preferences || {})
      setVideoAnswers(q.video_preferences || {})
      setSpecialAnswers(specialObj)
      setFinalAnswers(finalObj)

      const isLocallyUnlocked = typeof window !== 'undefined' && localStorage.getItem(`wedding_vision_unlocked_${slug}`) === 'true'
      const isDraftUnlocked = Boolean(
        storyObj.unlocked_additional ||
        specialObj.unlocked_additional ||
        finalObj.unlocked_additional
      )
      const hasBonusAnswers = Boolean(
        storyObj.q1_how_we_met ||
        storyObj.q2_relationship_description ||
        storyObj.q3_special_memory ||
        storyObj.q5_additional_story ||
        specialObj.q28_restricted_rituals ||
        specialObj.q29_discreet_moments ||
        specialObj.q30_avoid_filming !== undefined
      )
      const targetStep = (initialStep && initialStep >= 1 && initialStep <= 9) ? initialStep : (q.current_step || 1)
      if (isLocallyUnlocked || isDraftUnlocked || targetStep > 6 || hasBonusAnswers) {
        setShowAdditionalSections(true)
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`wedding_vision_unlocked_${slug}`, 'true')
          } catch (_) {}
        }
      }

      setFamilyMembers(data.familyMembers || [])
      setFamilyGroups(data.familyGroups || [])
      setScheduleEvents(data.events || [])
      setDeliverables(data.deliverables || [])
      setInvitations(data.invitations || [])
      setMusicReferences(data.musicReferences || [])
      setStats(data.stats || null)
      setGallery(data.gallery || null)
      setCouple(data.couple || null)
    } catch (err: any) {
      setLoadError(err.message || 'Could not load your wedding vision questionnaire.')
    } finally {
      if (!silent) setLoading(false)
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 500)
    }
  }

  useEffect(() => {
    loadQuestionnaire()
  }, [slug])

  // Sync step if URL search param step changes
  useEffect(() => {
    if (initialStep !== undefined && initialStep >= 0 && initialStep <= 9) {
      setCurrentStep(initialStep)
    }
  }, [initialStep])

  // Silently re-sync questionnaire and couple profiles whenever user switches back to this tab/window
  useEffect(() => {
    const handleFocus = () => {
      loadQuestionnaire(true)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadQuestionnaire(true)
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [slug])

  // Handle Passcode verification when visiting standalone page directly
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passcode.trim()) return

    try {
      setVerifyingPasscode(true)
      setPasscodeError('')
      const res = await fetch(`/api/client-portal/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Invalid passcode.')
      }

      setIsLocked(false)
      await loadQuestionnaire()
    } catch (err: any) {
      setPasscodeError(err.message || 'Verification failed.')
    } finally {
      setVerifyingPasscode(false)
    }
  }

  // 2. Draft Save Function (Optimistic & Non-blocking)
  const saveDraft = useCallback(async (explicitStep?: number) => {
    try {
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
      setSaveStatus('saving')
      const targetStep = explicitStep !== undefined && explicitStep >= 1
        ? explicitStep
        : latestAnswersRef.current.currentStep >= 1
        ? latestAnswersRef.current.currentStep
        : latestAnswersRef.current.lastClosedStep || 1

      if (targetStep >= 1) {
        setLastClosedStep(targetStep)
      }

      const currentAnswers = latestAnswersRef.current
      const storyPayload = currentAnswers.showAdditionalSections
        ? { ...currentAnswers.storyAnswers, unlocked_additional: true }
        : currentAnswers.storyAnswers
      const finalPayload = currentAnswers.showAdditionalSections
        ? { ...currentAnswers.finalAnswers, unlocked_additional: true }
        : currentAnswers.finalAnswers

      const res = await fetch(`/api/client-portal/${slug}/questionnaire/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_step: targetStep,
          story: storyPayload,
          traditions: currentAnswers.traditionsAnswers,
          photo_preferences: currentAnswers.photoAnswers,
          video_preferences: currentAnswers.videoAnswers,
          special_considerations: currentAnswers.specialAnswers,
          final_touches: finalPayload
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

      // Automatically disappear after 2.5 seconds
      if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
      savedStatusTimerRef.current = setTimeout(() => {
        setSaveStatus('idle')
      }, 2500)
    } catch {
      setSaveStatus('error')
    }
  }, [slug, questionnaireStatus])

  // Trigger debounced autosave on answer changes
  const triggerDebouncedAutosave = () => {
    if (isInitialLoadRef.current) return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (savedStatusTimerRef.current) clearTimeout(savedStatusTimerRef.current)
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
      setTimeout(() => {
        router.push(`/${slug}`)
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
    await loadQuestionnaire(true)
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
    await loadQuestionnaire(true)
  }

  const handleDeleteFamilyMember = async (id: string) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Failed to delete member')
    setFamilyMembers(prev => prev.filter(m => m.id !== id))
    await loadQuestionnaire(true)
  }

  // Family Group Handlers
  const handleAddFamilyGroup = async (group: Omit<FamilyGroupItem, 'id'>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(group)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create family group')
    }
    const data = await res.json()
    setFamilyGroups(prev => [...prev, data.familyGroup])
    await loadQuestionnaire(true)
    return data.familyGroup
  }

  const handleUpdateFamilyGroup = async (id: string, updates: Partial<FamilyGroupItem>) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update family group')
    }
    const data = await res.json()
    setFamilyGroups(prev => prev.map(g => (g.id === id ? data.familyGroup : g)))
    await loadQuestionnaire(true)
  }

  const handleDeleteFamilyGroup = async (id: string) => {
    const res = await fetch(`/api/client-portal/${slug}/questionnaire/family-groups/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) throw new Error('Failed to delete family group')
    setFamilyGroups(prev => prev.filter(g => g.id !== id))
    setFamilyMembers(prev => prev.filter(m => m.family_group_id !== id))
    await loadQuestionnaire(true)
  }

  const handleUpdateCouplePhoto = async (
    role: 'bride' | 'groom',
    name: string,
    photo_url: string,
    storage_key?: string
  ) => {
    try {
      // Optimistically update couple state immediately so portrait updates instantly
      setCouple((prev: any) => ({
        ...prev,
        [role]: {
          ...(prev?.[role] || {}),
          name,
          photo_url,
          storage_key
        }
      }))
      await fetch(`/api/client-portal/${slug}/questionnaire/couple-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, name, photo_url, storage_key })
      })
      await loadQuestionnaire(true)
    } catch (e) {
      console.error(e)
    }
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

  // Instant Synchronous Navigation Handlers with URL query sync
  const updateStepUrl = (step: number) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('step', String(step))
      window.history.replaceState(null, '', url.toString())
    }
  }

  const handleStepJump = (step: number) => {
    setCurrentStep(step)
    updateStepUrl(step)
    if (step >= 1) {
      setLastClosedStep(step)
      saveDraft(step)
    } else {
      saveDraft(lastClosedStep || 1)
    }
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNext = () => {
    if (currentStep === 6 && !showAdditionalSections) {
      saveDraft(6)
      setShowPart1Transition(true)
      return
    }
    const maxSection = showAdditionalSections ? 8 : 6
    if (currentStep < maxSection) {
      const next = currentStep + 1
      handleStepJump(next)
    } else if (currentStep === maxSection) {
      handleStepJump(9)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (currentStep === 9) {
      handleStepJump(showAdditionalSections ? 8 : 6)
    } else if (currentStep > 0) {
      handleStepJump(currentStep - 1)
    }
  }

  const handleBackToDashboard = async () => {
    await saveDraft(currentStep)
    router.push(`/${slug}`)
  }

  // Render Passcode Screen if locked
  if (isLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 text-neutral-900 force-light" style={{ colorScheme: 'light' }}>
        <div className="w-full max-w-md bg-white rounded-3xl border border-neutral-200/80 shadow-xl p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-2xl mx-auto shadow-inner text-amber-600">
            <Lock className="w-8 h-8 stroke-[1.8]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Your Wedding Vision</h1>
            <p className="text-xs text-neutral-500">
              Please enter your 4-digit project passcode to view and edit your questionnaire.
            </p>
          </div>
          <form onSubmit={handleVerifyPasscode} className="space-y-4">
            <input
              type="password"
              maxLength={12}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="w-full text-center text-lg tracking-widest px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
              autoFocus
            />
            {passcodeError && (
              <p className="text-xs text-rose-500 font-semibold">{passcodeError}</p>
            )}
            <button
              type="submit"
              disabled={verifyingPasscode}
              className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-2xl transition shadow-sm cursor-pointer"
            >
              {verifyingPasscode ? 'Verifying...' : 'Unlock Wedding Vision →'}
            </button>
          </form>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => router.push(`/${slug}`)}
              className="text-xs text-neutral-400 hover:text-neutral-700 underline cursor-pointer"
            >
              ← Back to Workspace Portal
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-dvh bg-white sm:bg-neutral-50 p-0 sm:py-8 sm:px-4 md:px-6 flex flex-col text-neutral-900 force-light" style={{ colorScheme: 'light' }}>
      {/* Unified Modal Card Container */}
      <div className="max-w-5xl w-full mx-auto bg-white rounded-none sm:rounded-3xl border-0 sm:border border-neutral-200/80 shadow-none sm:shadow-md flex flex-col min-h-screen min-h-dvh sm:min-h-[90vh] my-0 sm:my-auto">
        {/* Top Header inside container */}
        <header className="bg-white border-b border-neutral-200/80 px-3.5 sm:px-8 py-3 sm:py-3.5 flex items-center justify-between gap-2 shrink-0 shadow-xs z-20 relative">
          <div className="flex items-center gap-2 z-10 shrink-0">
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="text-neutral-500 hover:text-neutral-900 p-1.5 sm:p-2 rounded-xl hover:bg-neutral-100 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              <span>←</span>
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden text-xs">Exit</span>
            </button>
          </div>

          {/* Centered Title */}
          <div className="text-center truncate px-2 max-w-[170px] sm:max-w-none">
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-neutral-900 block truncate">
              {currentStep === 0 ? 'Your Wedding Vision' : SECTIONS[currentStep - 1]?.title || 'Wedding Vision'}
            </span>
          </div>

          {/* Right actions: Saved! indicator */}
          <div className="flex items-center gap-2 z-10 shrink-0">
            {saveStatus === 'saving' && (
              <span className="text-[11px] sm:text-xs font-normal text-neutral-400 animate-pulse animate-in fade-in duration-200">
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[11px] sm:text-xs font-normal text-emerald-600 sm:text-neutral-500 animate-in fade-in duration-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>Saved!</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <button
                type="button"
                onClick={() => saveDraft()}
                className="text-xs font-normal text-rose-500 hover:underline cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        </header>

        {/* Slide Navigation Strip - Only shown when inside questionnaire sections */}
        {currentStep !== 0 && (
          <div className="bg-neutral-50/70 border-b border-neutral-200/60 px-3 sm:px-8 py-2 sm:py-2.5 overflow-x-auto shrink-0 flex items-center gap-1.5 sm:gap-2 no-scrollbar z-10 overscroll-x-contain">
            <button
              type="button"
              onClick={() => handleStepJump(0)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200/60"
            >
              <LayoutList className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>Overview</span>
            </button>

            <div className="h-4 w-px bg-neutral-200 shrink-0 mx-0.5" />

            <div className="flex items-center gap-1.5 shrink-0">
              {SECTIONS.filter(s => s.part === 1).map((sec) => {
                const isActive = currentStep === sec.id
                const Icon = sec.icon
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleStepJump(sec.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-white text-neutral-900 border-2 border-neutral-900 shadow-xs'
                        : 'bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-neutral-900' : 'text-amber-600'}`} />
                    <span>{sec.title}</span>
                  </button>
                )
              })}
            </div>

            {showAdditionalSections && (
              <>
                <div className="h-5 w-px bg-neutral-200 shrink-0 mx-1" />

                <div className="flex items-center gap-1.5 shrink-0">
                  {SECTIONS.filter(s => s.part === 2).map((sec) => {
                    const isActive = currentStep === sec.id
                    const Icon = sec.icon
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => handleStepJump(sec.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          isActive
                            ? 'bg-white text-neutral-900 border-2 border-neutral-900 shadow-xs'
                            : 'bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200/60'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-neutral-900' : 'text-amber-600'}`} />
                        <span>{sec.title}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Review & Submit Tab */}
            <div className="h-5 w-px bg-neutral-200 shrink-0 mx-1" />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStepJump(9)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  currentStep === 9
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200/60'
                }`}
              >
                <ClipboardCheck className={`w-3.5 h-3.5 shrink-0 ${currentStep === 9 ? 'text-white' : 'text-emerald-600'}`} />
                <span>Review &amp; Submit</span>
              </button>
            </div>
          </div>
        )}

        {/* Progress Bar inside container */}
        {currentStep !== 0 && (
          <div className="w-full h-1 bg-neutral-100 overflow-hidden shrink-0">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 ease-out"
              style={{
                width: currentStep === 9
                  ? '100%'
                  : `${Math.min(100, (currentStep / (showAdditionalSections ? 8 : 6)) * 100)}%`
              }}
            />
          </div>
        )}

        {/* Main Scrollable Slide Body inside container */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto px-3.5 sm:px-8 md:px-12 py-5 sm:py-8 bg-white overscroll-y-contain">
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
                onClick={() => loadQuestionnaire()}
                className="bg-neutral-900 text-white px-5 py-2.5 rounded-xl text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="animate-fade-in max-w-3xl mx-auto">
              {/* Step 0: Overview */}
              {currentStep === 0 && (() => {
                const computedStats = {
                  ...(stats || {}),
                  traditionsCompleted: Boolean(traditionsAnswers.primary_tradition || traditionsAnswers.main_traditions?.length || traditionsAnswers.q7_important_details),
                  scheduleCompleted: Boolean(scheduleEvents.some(e => e.schedule_text && e.schedule_text.trim()) || invitations.length > 0),
                  familyTreeCompleted: Boolean(stats?.allRequirementsMet),
                  photographyCompleted: Boolean(photoAnswers.q8_styles?.length || photoAnswers.q9_camera_comfort || photoAnswers.q11_inspirations?.length),
                  videographyCompleted: Boolean(videoAnswers.q16_film_styles?.length || videoAnswers.q21_music_genres?.length || musicReferences.length > 0),
                  finalTouchesCompleted: Boolean(finalAnswers.q31_perfect_wedding || finalAnswers.q32_additional_notes),
                  storyCompleted: Boolean(storyAnswers.q1_how_we_met || storyAnswers.q2_relationship_description || storyAnswers.q3_special_memory),
                  specialCareCompleted: Boolean(specialAnswers.q28_restricted_rituals !== undefined || specialAnswers.q29_discreet_moments || specialAnswers.q30_avoid_filming !== undefined)
                }
                return (
                  <SectionOverview
                    onSelectSection={(step) => handleStepJump(step)}
                    onStartOrContinue={() => handleStepJump(lastClosedStep || 1)}
                    onSaveDraft={() => saveDraft(lastClosedStep || 1)}
                    showAdditionalSections={showAdditionalSections}
                    onUnlockAdditional={() => {
                      unlockAdditionalSections()
                      handleStepJump(7)
                    }}
                    stats={computedStats}
                  />
                )
              })()}

              {/* Step 1: Traditions & Culture */}
              {currentStep === 1 && (
                <SectionTraditions
                  answers={traditionsAnswers}
                  onChange={(upd) => {
                    latestAnswersRef.current.traditionsAnswers = upd
                    setTraditionsAnswers(upd)
                    triggerDebouncedAutosave()
                  }}
                />
              )}

              {/* Step 2: Your Wedding Schedule & Invites */}
              {currentStep === 2 && (
                <SectionSchedule
                  slug={slug}
                  events={scheduleEvents}
                  invitations={invitations}
                  onUpdateScheduleText={handleUpdateScheduleText}
                  onAddInvitation={handleAddInvitation}
                  onDeleteInvitation={handleDeleteInvitation}
                />
              )}

              {/* Step 3: Family Tree & Important People */}
              {currentStep === 3 && (
                <SectionFamilyTree
                  slug={slug}
                  familyMembers={familyMembers}
                  familyGroups={familyGroups}
                  couple={couple}
                  stats={stats}
                  onAddMember={handleAddFamilyMember}
                  onUpdateMember={handleUpdateFamilyMember}
                  onDeleteMember={handleDeleteFamilyMember}
                  onAddFamilyGroup={handleAddFamilyGroup}
                  onUpdateFamilyGroup={handleUpdateFamilyGroup}
                  onDeleteFamilyGroup={handleDeleteFamilyGroup}
                  onUpdateCouplePhoto={handleUpdateCouplePhoto}
                />
              )}

              {/* Step 4: Photography Preferences */}
              {currentStep === 4 && (
                <SectionPhotography
                  slug={slug}
                  answers={photoAnswers}
                  gallery={gallery}
                  onChange={(upd) => {
                    latestAnswersRef.current.photoAnswers = upd
                    setPhotoAnswers(upd)
                    triggerDebouncedAutosave()
                  }}
                />
              )}

              {/* Step 5: Films, Music & Videography */}
              {currentStep === 5 && (
                <SectionVideography
                  answers={videoAnswers}
                  deliverables={deliverables}
                  musicReferences={musicReferences}
                  familyMembers={familyMembers}
                  onChange={(upd) => {
                    latestAnswersRef.current.videoAnswers = upd
                    setVideoAnswers(upd)
                    triggerDebouncedAutosave()
                  }}
                  onAddMusicReference={handleAddMusicReference}
                  onDeleteMusicReference={handleDeleteMusicReference}
                />
              )}

              {/* Step 6: The Final Touches */}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <SectionFinalTouches
                    answers={finalAnswers}
                    onChange={(upd) => {
                      latestAnswersRef.current.finalAnswers = upd
                      setFinalAnswers(upd)
                      triggerDebouncedAutosave()
                    }}
                  />

                  {submitError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-3xl text-left space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                        <span>Incomplete Mandatory Parent Details:</span>
                      </div>
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
                        onClick={() => handleStepJump(3)}
                        className="text-xs font-bold text-rose-900 underline mt-2 block cursor-pointer"
                      >
                        → Go to Section 03: Family Tree to complete parent details
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 7: Your Story (Part 2) */}
              {currentStep === 7 && (
                <SectionStory
                  answers={storyAnswers}
                  onChange={(upd) => {
                    unlockAdditionalSections()
                    latestAnswersRef.current.storyAnswers = upd
                    setStoryAnswers(upd)
                    triggerDebouncedAutosave()
                  }}
                />
              )}

              {/* Step 8: Special Considerations (Part 2) */}
              {currentStep === 8 && (
                <div className="space-y-6">
                  <SectionSpecialConsiderations
                    answers={specialAnswers}
                    familyMembers={familyMembers}
                    onChange={(upd) => {
                      unlockAdditionalSections()
                      latestAnswersRef.current.specialAnswers = upd
                      setSpecialAnswers(upd)
                      triggerDebouncedAutosave()
                    }}
                  />

                  {submitError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-3xl text-left space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                        <span>Incomplete Mandatory Parent Details:</span>
                      </div>
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
                        onClick={() => handleStepJump(3)}
                        className="text-xs font-bold text-rose-900 underline mt-2 block cursor-pointer"
                      >
                        → Go to Section 03: Family Tree to complete parent details
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 9: Review & Submit */}
              {currentStep === 9 && (
                <SectionReview
                  slug={slug}
                  couple={couple}
                  traditionsAnswers={traditionsAnswers}
                  scheduleEvents={scheduleEvents}
                  invitations={invitations}
                  familyMembers={familyMembers}
                  familyGroups={familyGroups}
                  photoAnswers={photoAnswers}
                  videoAnswers={videoAnswers}
                  deliverables={deliverables}
                  musicReferences={musicReferences}
                  finalAnswers={finalAnswers}
                  storyAnswers={storyAnswers}
                  specialAnswers={specialAnswers}
                  showAdditionalSections={showAdditionalSections}
                  onEditSection={(step) => handleStepJump(step)}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  submitError={submitError}
                  missingRequirements={missingRequirements}
                />
              )}
            </div>
          )}
        </main>

        {/* Bottom Action Footer inside container - Only shown inside questionnaire sections */}
        {currentStep !== 0 && (
          <footer className="bg-white border-t border-neutral-200/80 px-3 sm:px-8 py-2.5 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-xs z-20">
            <button
              type="button"
              onClick={handleBack}
              className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs px-3.5 sm:px-5 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
            >
              <span className="sm:hidden">← Prev</span>
              <span className="hidden sm:inline">← Previous</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
              <span>{currentStep === 9 ? 'Review & Submit' : SECTIONS[currentStep - 1]?.title}</span>
              <span>·</span>
              <span>
                {currentStep === 9
                  ? 'Final Review'
                  : showAdditionalSections
                  ? `Step ${currentStep} of 8`
                  : `Step ${currentStep} of 6`}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer hidden sm:block"
              >
                Save Draft &amp; Resume Later
              </button>

              {currentStep < 6 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="sm:hidden">Next →</span>
                  <span className="hidden sm:inline">Next Section →</span>
                </button>
              ) : currentStep === 6 && !showAdditionalSections ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-md cursor-pointer flex items-center gap-2 shrink-0"
                >
                  Review &amp; Submit
                </button>
              ) : currentStep === 6 && showAdditionalSections ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="sm:hidden">Next →</span>
                  <span className="hidden sm:inline">Next Section →</span>
                </button>
              ) : currentStep === 7 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="sm:hidden">Next →</span>
                  <span className="hidden sm:inline">Next Section →</span>
                </button>
              ) : currentStep === 8 ? (
                <button
                  type="button"
                  onClick={() => handleStepJump(9)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-md cursor-pointer flex items-center gap-2 shrink-0"
                >
                  Review &amp; Submit
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-4 sm:px-6 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-xl transition shadow-md cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {submitting ? 'Submitting...' : 'Confirm & Submit'}
                </button>
              )}
            </div>
          </footer>
        )}
      </div>

      {/* Completion & Deeper Story Checkpoint Modal */}
      {showPart1Transition && (
        <div className="fixed inset-0 z-60 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 text-center space-y-5 shadow-2xl border border-neutral-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
              <Sparkles className="w-8 h-8 text-emerald-600 stroke-[1.8]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight">
                Add to your story?
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed max-w-md mx-auto">
                Help us capture you even better with your couple journey, or proceed directly to review your questionnaire before submitting.
              </p>
            </div>

            {submitError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-left space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>Incomplete Mandatory Parent Details:</span>
                </div>
                <p className="text-xs text-rose-700">{submitError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowPart1Transition(false)
                    handleStepJump(3)
                  }}
                  className="text-xs font-bold text-rose-900 underline mt-1 block cursor-pointer"
                >
                  → Go to Section 03: Family Tree
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPart1Transition(false)
                  unlockAdditionalSections()
                  handleStepJump(7)
                }}
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs sm:text-sm py-3.5 px-4 rounded-2xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 group"
              >
                <span>Add to Your Story</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPart1Transition(false)
                  handleStepJump(9)
                }}
                className="w-full bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 font-bold text-xs sm:text-sm py-3.5 px-4 rounded-2xl transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Review &amp; Submit</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
