'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Film,
  FileText,
  Eye,
  Camera,
  Landmark,
  Sparkles,
  BookHeart,
  HeartHandshake,
  Music,
  ExternalLink,
  User,
  Users,
  Play,
  X,
  Phone,
  Printer,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

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
  if (trimmed.startsWith('/api/')) {
    return trimmed
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return `https://${publicDomain}${trimmed}`
  }
  return `https://${trimmed}`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return d
  }
}

function parseDateParts(dateStr: string | null | undefined) {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    return {
      weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      weekdayFull: d.toLocaleDateString('en-IN', { weekday: 'long' }),
      day: d.toLocaleDateString('en-IN', { day: 'numeric' }),
      month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
      monthFull: d.toLocaleDateString('en-IN', { month: 'long' }),
      year: d.getFullYear(),
      fullFormatted: d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    }
  } catch {
    return null
  }
}

function getEventDateStatus(dateStr: string | null | undefined): { isPast: boolean; isToday: boolean } {
  if (!dateStr) return { isPast: false, isToday: false }
  try {
    const target = new Date(dateStr)
    if (isNaN(target.getTime())) return { isPast: false, isToday: false }

    const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    return {
      isPast: targetMidnight < todayMidnight,
      isToday: targetMidnight === todayMidnight
    }
  } catch {
    return { isPast: false, isToday: false }
  }
}

interface BriefClientProps {
  slug: string
  token?: string
}

export default function BriefClient({ slug, token }: BriefClientProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewMedia, setPreviewMedia] = useState<any>(null)
  const [activeSection, setActiveSection] = useState('couple-family')

  const fetchBrief = async () => {
    try {
      setLoading(true)
      setError('')
      const queryParam = token ? `?token=${encodeURIComponent(token)}` : ''
      const res = await fetch(`/api/client-portal/${slug}/brief${queryParam}`, {
        cache: 'no-store',
        credentials: 'include'
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Link expired or invalid. Please ask the studio for a fresh link.')
        }
        if (res.status === 404) {
          throw new Error('Project not found.')
        }
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to load details')
      }

      const json = await res.json()
      setData(json.data)
    } catch (err: any) {
      setError(err.message || 'Error loading details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (slug) {
      fetchBrief()
    }
  }, [slug, token])

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = [
        'couple-family',
        'schedule',
        'traditions',
        'photography',
        'cinema-music',
        'story',
        'vendors',
        'special-care'
      ]
      const scrollPos = window.scrollY + 140

      for (const id of sectionIds) {
        const el = document.getElementById(id)
        if (el) {
          const top = el.offsetTop
          const height = el.offsetHeight
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Lightbox escape key dismiss & scroll lock
  useEffect(() => {
    if (!previewMedia) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewMedia(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [previewMedia])

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      const offset = 100
      const bodyRect = document.body.getBoundingClientRect().top
      const elementRect = el.getBoundingClientRect().top
      const elementPosition = elementRect - bodyRect
      const offsetPosition = elementPosition - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }, [])

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-semibold tracking-wider uppercase text-neutral-400">Loading Shoot Brief...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-6 text-center text-neutral-900">
        <div className="max-w-sm w-full bg-white border border-neutral-200/90 rounded-2xl p-7 space-y-4 shadow-sm">
          <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-lg font-bold border border-rose-100">
            !
          </div>
          <h1 className="text-base font-bold text-neutral-950">Cannot Open Link</h1>
          <p className="text-xs text-neutral-500 leading-relaxed">{error}</p>
          <button
            onClick={fetchBrief}
            className="w-full py-2.5 rounded-xl bg-neutral-950 text-white text-xs font-semibold hover:bg-neutral-800 transition active:scale-[0.99] cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const project = data?.project
  const questionnaire = data?.questionnaire
  const familyMembers = data?.familyMembers || []
  const schedules = data?.schedules || []
  const invitations = data?.invitations || []
  const musicReferences = data?.musicReferences || []
  const couple = data?.couple || null

  const eventsWithOptionB = schedules.filter((ev: any) => Boolean(ev.schedule_text && ev.schedule_text.trim()))
  const hasScheduleSection = Boolean(eventsWithOptionB.length > 0 || invitations.length > 0)

  const story = questionnaire?.story || {}
  const traditions = questionnaire?.traditions || {}
  const photoPrefs = questionnaire?.photo_preferences || {}
  const videoPrefs = questionnaire?.video_preferences || {}
  const specialCare = questionnaire?.special_considerations || {}
  const finalTouches = questionnaire?.final_touches || {}

  const brideFamily = familyMembers.filter((m: any) => m.side === 'bride')
  const groomFamily = familyMembers.filter((m: any) => m.side === 'groom')
  const familyGroups = data?.familyGroups || []

  const coupleNames = (project?.bride_name && project?.groom_name)
    ? `${project.bride_name} & ${project.groom_name}`
    : (couple?.bride?.name && couple?.groom?.name)
    ? `${couple.bride.name} & ${couple.groom.name}`
    : project?.name || 'Wedding Shoot'

  const displayCity = project?.city || (schedules.find((s: any) => s.venue_city)?.venue_city) || (schedules.find((s: any) => s.venue_name)?.venue_name) || null

  /* ────────── 1. PHOTOGRAPHY ANSWERS MAPPING ────────── */
  const cameraComfort = photoPrefs.q9_camera_comfort
  const romanticComfort = photoPrefs.q15_romantic_comfort
  const posesToAvoid = photoPrefs.q15_poses_to_avoid
  const photoStyles = uniqueArray([
    ...(photoPrefs.q8_styles || []),
    ...(photoPrefs.q10_matters_most || []),
    photoPrefs.preferred_styles,
    photoPrefs.q8_other,
    photoPrefs.q10_other
  ])
  const colorPalette = uniqueArray([
    ...(photoPrefs.q12_mood_palette || []),
    ...(photoPrefs.q13_editing_styles || []),
    photoPrefs.editing_palette,
    photoPrefs.q12_other,
    photoPrefs.q13_other
  ])
  const dislikedStyles = photoPrefs.q14_disliked_styles || photoPrefs.disliked_styles
  const photoInspirations = photoPrefs.q11_inspirations || photoPrefs.references || []
  const photoNotes = photoPrefs.q11_notes
  const hasPhoto = Boolean(
    cameraComfort ||
    romanticComfort ||
    posesToAvoid ||
    photoStyles.length > 0 ||
    colorPalette.length > 0 ||
    dislikedStyles ||
    photoInspirations.length > 0 ||
    photoNotes
  )

  /* ────────── 2. VIDEOGRAPHY ANSWERS MAPPING ────────── */
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
  const videoDislikes = videoPrefs.q20_disliked_styles || videoPrefs.disliked_styles
  const videoReferences = videoPrefs.q19_references || []
  const musicGenres = uniqueArray([
    ...(videoPrefs.q21_music_genres || []),
    videoPrefs.q21_other
  ])
  const musicSelector = videoPrefs.q22_music_selector
    ? videoPrefs.q22_music_selector === 'couple_selected'
      ? 'Couple will select music'
      : 'Editor can select music'
    : null
  const coupleInterview = videoPrefs.q25_couple_interview || videoPrefs.interview_preferences
  const interviewSelections = videoPrefs.q26_interview_selections || []
  const interviewTopics = videoPrefs.q27_interview_topics
  const hasVideo = Boolean(
    filmStylesAndFeel.length > 0 ||
    focusMoments.length > 0 ||
    videoDislikes ||
    videoReferences.length > 0 ||
    musicGenres.length > 0 ||
    musicSelector ||
    coupleInterview ||
    interviewSelections.length > 0 ||
    interviewTopics ||
    musicReferences.length > 0
  )

  /* ────────── 3. TRADITIONS MAPPING ────────── */
  const primaryTradition = traditions.primary_tradition || traditions.main_traditions?.[0]
  const traditionsList = uniqueArray([
    ...(traditions.indian_regions || []),
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
    traditions.main_other_custom,
    traditions.sikh_community,
    traditions.hindu_community,
    traditions.christian_community,
    traditions.muslim_community
  ])
  const multiculturalDetails = traditions.multicultural_details
  const traditionsNotes = traditions.q7_important_details || traditions.importance_notes || traditions.must_capture_rituals || traditions.cultural_dos_donts
  const hasTraditions = Boolean(primaryTradition || traditionsList.length > 0 || multiculturalDetails || traditionsNotes)

  /* ────────── 4. STORY MAPPING ────────── */
  const howWeMet = story.q1_how_we_met || story.how_we_met
  const relationship = story.q2_relationship_description || story.q4_three_defining_things || story.relationship_dynamics
  const specialMemory = story.q3_special_memory || story.proposal_story
  const additionalStory = story.q5_additional_story
  const hasStory = Boolean(howWeMet || relationship || specialMemory || additionalStory)

  /* ────────── 5. FINAL TOUCHES MAPPING ────────── */
  const perfectWedding = finalTouches.q31_perfect_wedding
  const additionalNotes = finalTouches.q32_additional_notes
  const vendors = finalTouches.key_vendors || []
  const surprises = finalTouches.surprise_elements
  const otherRequests = finalTouches.other_requests
  const hasFinal = Boolean(perfectWedding || additionalNotes || vendors.length > 0 || surprises || otherRequests)

  /* ────────── 6. SPECIAL CONSIDERATIONS MAPPING ────────── */
  const restrictedRituals = specialCare.q28_restricted_rituals
    ? (specialCare.q28_details || 'Restricted rituals to note during ceremonies')
    : null
  const discreetMoments = specialCare.q29_discreet_moments
  const avoidPeople = specialCare.q30_people || specialCare.people_to_avoid || []
  const avoidFilmingNote = specialCare.q30_avoid_filming ? 'Couple requested discretion regarding certain guests' : null
  const sensitiveDynamics = specialCare.sensitive_family_dynamics
  const elderlyNeeds = specialCare.elderly_or_mobility_assistance
  const hasSpecial = Boolean(
    restrictedRituals ||
    discreetMoments ||
    (Array.isArray(avoidPeople) && avoidPeople.length > 0) ||
    (typeof avoidPeople === 'string' && avoidPeople.trim()) ||
    avoidFilmingNote ||
    sensitiveDynamics ||
    elderlyNeeds
  )

  const SECTIONS_NAV = [
    { id: 'couple-family', label: 'VIP Family', Icon: Users, count: familyMembers.length },
    ...(hasScheduleSection ? [{ id: 'schedule', label: 'Detailed Notes', Icon: Calendar, count: eventsWithOptionB.length || invitations.length }] : []),
    ...(hasTraditions ? [{ id: 'traditions', label: 'Rituals', Icon: Landmark }] : []),
    ...(hasPhoto ? [{ id: 'photography', label: 'Photos Needed', Icon: Camera }] : []),
    ...(hasVideo ? [{ id: 'cinema-music', label: 'Songs & Video', Icon: Film, count: musicReferences.length }] : []),
    ...(hasStory ? [{ id: 'story', label: 'Story', Icon: BookHeart }] : []),
    ...(hasFinal ? [{ id: 'vendors', label: 'Final Touches', Icon: Sparkles }] : []),
    ...(hasSpecial ? [{ id: 'special-care', label: 'Do Not Shoot / Notes', Icon: HeartHandshake }] : [])
  ]

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 antialiased pb-24 font-sans selection:bg-neutral-900 selection:text-white">
      {/* ══════ TOP BRAND BAR (MINIMAL FROSTED) ══════ */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-40 border-b border-neutral-200/80 print:static print:bg-white print:border-b-2">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 rounded-md bg-neutral-950 text-white font-extrabold text-[10px] tracking-wider flex items-center justify-center shrink-0">
              MV
            </span>
            <span className="text-xs sm:text-sm font-bold text-neutral-950 tracking-tight truncate">
              MistyVisuals Shoot Brief
            </span>
          </div>

          <div className="flex items-center gap-1.5 print:hidden shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800 transition flex items-center gap-1.5 cursor-pointer"
              title="Print brief"
            >
              <Printer className="w-3.5 h-3.5 text-neutral-600" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </header>

      {/* ══════ SECTION NAV PILLS ══════ */}
      {SECTIONS_NAV.length > 1 && (
        <nav className="bg-white/95 backdrop-blur-md border-b border-neutral-200/70 sticky top-[49px] z-30 print:hidden overflow-x-auto no-scrollbar py-2">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-1.5">
            {SECTIONS_NAV.map((s) => {
              const isActive = activeSection === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={`h-7 px-3 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-neutral-950 text-white shadow-2xs'
                      : 'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-600'
                  }`}
                >
                  <s.Icon className="w-3 h-3 shrink-0" />
                  <span>{s.label}</span>
                  {s.count !== undefined && s.count > 0 && (
                    <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-700'
                    }`}>
                      {s.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* ══════ MAIN CONTAINER ══════ */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 space-y-6">
        {/* ─── Hero Summary Card with Events & Clickable Venues ─── */}
        <div className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1">
              Shoot Brief
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-950 tracking-tight leading-tight">
              {coupleNames}
            </h1>
          </div>

          {/* Events with Prominent Dates, Timings & Clickable Venues */}
          {schedules.length > 0 ? (
            <div className="pt-4 border-t border-neutral-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Event Schedule & Shoot Dates
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {schedules.length} {schedules.length === 1 ? 'Event' : 'Events'}
                </span>
              </div>

              <div className="space-y-3">
                {schedules.map((ev: any) => {
                  const venueQuery = [ev.venue, ev.venue_address, displayCity].filter(Boolean).join(', ')
                  const mapsUrl = venueQuery
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueQuery)}`
                    : null
                  const timingStr = (ev.start_time || ev.end_time)
                    ? `${ev.start_time || '—'}${ev.end_time ? ` to ${ev.end_time}` : ''}`
                    : null
                  const dateParts = parseDateParts(ev.event_date)
                  const { isPast, isToday } = getEventDateStatus(ev.event_date)

                  return (
                    <div
                      key={ev.id}
                      className={`rounded-xl border transition ${
                        isPast
                          ? "bg-neutral-50/70 border-neutral-200/80 text-neutral-600"
                          : "bg-white border-neutral-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-neutral-300"
                      }`}
                    >
                      <div className="p-3 sm:p-3.5 flex items-center gap-3 sm:gap-3.5">
                        {/* Compact Date Box */}
                        <div
                          className={`shrink-0 flex flex-col items-center justify-center w-14 sm:w-16 py-1.5 sm:py-2 rounded-lg text-center ${
                            isPast
                              ? "bg-neutral-100 text-neutral-600 border border-neutral-200"
                              : "bg-neutral-950 text-white shadow-2xs"
                          }`}
                        >
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider leading-tight ${
                              isPast ? "text-neutral-500" : "text-neutral-400"
                            }`}
                          >
                            {dateParts ? dateParts.month : "DATE"}
                          </span>
                          <span className="text-base sm:text-lg font-bold tracking-tight leading-none my-0.5">
                            {dateParts ? dateParts.day : "—"}
                          </span>
                          <span
                            className={`text-[9px] font-medium uppercase leading-tight ${
                              isPast ? "text-neutral-500" : "text-neutral-400"
                            }`}
                          >
                            {dateParts ? dateParts.weekday : "TBA"}
                          </span>
                        </div>

                        {/* Event Details */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Title & Status */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs sm:text-sm font-bold text-neutral-950 truncate">
                                {ev.event_type}
                              </span>
                              {ev.slot && (
                                <span className="text-[10px] font-medium text-neutral-500 bg-neutral-100 border border-neutral-200/80 px-1.5 py-0.2 rounded">
                                  {ev.slot}
                                </span>
                              )}
                            </div>

                            {/* Status Tag */}
                            {isPast ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                                <CheckCircle2 className="w-3 h-3 text-neutral-500" />
                                <span>Already Shot</span>
                              </span>
                            ) : isToday ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                <span>Today</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Timings & Venue */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pt-0.5 text-xs text-neutral-700">
                            {/* Timing */}
                            <div className="flex items-center gap-1.5 font-medium">
                              <Clock
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isPast ? "text-neutral-400" : "text-neutral-500"
                                }`}
                              />
                              <span className="truncate">{timingStr || "Timings TBA"}</span>
                            </div>

                            {/* Venue */}
                            <div className="flex items-center gap-1.5 min-w-0 font-medium">
                              <MapPin
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isPast ? "text-neutral-400" : "text-rose-500"
                                }`}
                              />
                              {mapsUrl ? (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-neutral-800 hover:text-neutral-950 underline decoration-neutral-300 hover:decoration-neutral-900 transition truncate flex items-center gap-1 group"
                                  title="Open location in Google Maps"
                                >
                                  <span className="truncate">{ev.venue || venueQuery}</span>
                                  <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-neutral-900 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-neutral-400">Venue TBA</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="pt-3 border-t border-neutral-100 text-xs text-neutral-400 italic">
              No events scheduled yet.
            </div>
          )}
        </div>

        {/* ─── 1. The Couple & VIP Family ─── */}
        <section id="couple-family" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-700" />
              <span>The Couple & VIP Family</span>
            </h2>
            <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-0.5 rounded-full">
              {familyMembers.length} Members
            </span>
          </div>

          {/* Bride & Groom Row */}
          {(couple?.bride?.name || couple?.groom?.name) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Bride */}
              <div className="bg-neutral-50/80 border border-neutral-200/80 rounded-xl p-3.5 flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-rose-50 border border-rose-200/80 flex items-center justify-center relative shrink-0">
                  <User className="w-6 h-6 text-rose-300 absolute" />
                  {couple?.bride?.photo_url && (
                    <img
                      src={normalizeMediaUrl(couple.bride.photo_url)}
                      alt={couple.bride.name || 'Bride'}
                      className="w-full h-full object-cover object-top cursor-pointer relative z-10"
                      onClick={() => setPreviewMedia({ file_type: 'image', file_url: couple.bride.photo_url, filename: couple.bride.name || 'Bride' })}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded">Bride</span>
                  <div className="text-sm font-bold text-neutral-950 truncate mt-1">
                    {couple?.bride?.name || project?.bride_name || 'Bride'}
                  </div>
                </div>
              </div>

              {/* Groom */}
              <div className="bg-neutral-50/80 border border-neutral-200/80 rounded-xl p-3.5 flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-blue-50 border border-blue-200/80 flex items-center justify-center relative shrink-0">
                  <User className="w-6 h-6 text-blue-300 absolute" />
                  {couple?.groom?.photo_url && (
                    <img
                      src={normalizeMediaUrl(couple.groom.photo_url)}
                      alt={couple.groom.name || 'Groom'}
                      className="w-full h-full object-cover object-top cursor-pointer relative z-10"
                      onClick={() => setPreviewMedia({ file_type: 'image', file_url: couple.groom.photo_url, filename: couple.groom.name || 'Groom' })}
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">Groom</span>
                  <div className="text-sm font-bold text-neutral-950 truncate mt-1">
                    {couple?.groom?.name || project?.groom_name || 'Groom'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Family Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Bride Side */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-neutral-900 pb-1.5 border-b border-neutral-100 flex items-center justify-between">
                <span>Bride&apos;s Family</span>
                <span className="text-neutral-400 font-normal">({brideFamily.length})</span>
              </div>

              {brideFamily.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-1">None listed.</p>
              ) : (
                <div className="space-y-2">
                  {brideFamily.map((m: any) => (
                    <div key={m.id} className="bg-white border border-neutral-200/80 rounded-xl p-3 flex items-start gap-3 hover:border-neutral-300 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200/80 shrink-0 relative flex items-center justify-center">
                        <User className="w-5 h-5 text-neutral-400 absolute" />
                        {(m.photo_url || m.storage_key) && (
                          <img
                            src={normalizeMediaUrl(m.photo_url, m.storage_key)}
                            alt={m.name}
                            className="w-full h-full object-cover cursor-pointer relative z-10"
                            onClick={() => setPreviewMedia({ file_type: 'image', file_url: m.photo_url, storage_key: m.storage_key, filename: m.name })}
                            onError={(e) => {
                              const target = e.currentTarget
                              if (m.storage_key && !target.src.includes(m.storage_key)) {
                                target.src = `https://gallery.mistyvisuals.com/${m.storage_key.replace(/^\/+/, '')}`
                              } else {
                                target.style.display = 'none'
                              }
                            }}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-neutral-900 truncate">{m.name}</span>
                          {m.priority === 'high' && (
                            <span className="text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200/60 px-1.5 py-0.5 rounded">
                              ⭐ MUST CAPTURE
                            </span>
                          )}
                          {m.is_remembering && (
                            <span className="text-[9px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.5 rounded">
                              In Memory
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-neutral-500 font-medium">
                          {m.custom_relationship || m.relationship || 'Family'}
                        </div>

                        {m.notes && (
                          <p className="text-[11px] text-neutral-700 mt-1 bg-neutral-50 p-1.5 rounded border border-neutral-150 leading-relaxed">
                            {m.notes}
                          </p>
                        )}

                        {m.phone && (
                          <div className="mt-2">
                            <a
                              href={`tel:${m.phone}`}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded-md transition"
                            >
                              <Phone className="w-3 h-3 text-neutral-600" />
                              <span>{m.phone}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Groom Side */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-neutral-900 pb-1.5 border-b border-neutral-100 flex items-center justify-between">
                <span>Groom&apos;s Family</span>
                <span className="text-neutral-400 font-normal">({groomFamily.length})</span>
              </div>

              {groomFamily.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-1">None listed.</p>
              ) : (
                <div className="space-y-2">
                  {groomFamily.map((m: any) => (
                    <div key={m.id} className="bg-white border border-neutral-200/80 rounded-xl p-3 flex items-start gap-3 hover:border-neutral-300 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200/80 shrink-0 relative flex items-center justify-center">
                        <User className="w-5 h-5 text-neutral-400 absolute" />
                        {(m.photo_url || m.storage_key) && (
                          <img
                            src={normalizeMediaUrl(m.photo_url, m.storage_key)}
                            alt={m.name}
                            className="w-full h-full object-cover cursor-pointer relative z-10"
                            onClick={() => setPreviewMedia({ file_type: 'image', file_url: m.photo_url, storage_key: m.storage_key, filename: m.name })}
                            onError={(e) => {
                              const target = e.currentTarget
                              if (m.storage_key && !target.src.includes(m.storage_key)) {
                                target.src = `https://gallery.mistyvisuals.com/${m.storage_key.replace(/^\/+/, '')}`
                              } else {
                                target.style.display = 'none'
                              }
                            }}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-neutral-900 truncate">{m.name}</span>
                          {m.priority === 'high' && (
                            <span className="text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200/60 px-1.5 py-0.5 rounded">
                              ⭐ MUST CAPTURE
                            </span>
                          )}
                          {m.is_remembering && (
                            <span className="text-[9px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.5 rounded">
                              In Memory
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-neutral-500 font-medium">
                          {m.custom_relationship || m.relationship || 'Family'}
                        </div>

                        {m.notes && (
                          <p className="text-[11px] text-neutral-700 mt-1 bg-neutral-50 p-1.5 rounded border border-neutral-150 leading-relaxed">
                            {m.notes}
                          </p>
                        )}

                        {m.phone && (
                          <div className="mt-2">
                            <a
                              href={`tel:${m.phone}`}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded-md transition"
                            >
                              <Phone className="w-3 h-3 text-neutral-600" />
                              <span>{m.phone}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Group Combinations */}
          {familyGroups.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-neutral-100">
              <div className="text-xs font-bold text-neutral-900">
                Group Photos Needed ({familyGroups.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {familyGroups.map((g: any) => (
                  <div key={g.id} className="bg-neutral-50 border border-neutral-200/70 rounded-xl p-3">
                    <div className="text-xs font-bold text-neutral-900">{g.name}</div>
                    {g.description && <p className="text-[11px] text-neutral-600 mt-0.5">{g.description}</p>}
                    {Array.isArray(g.member_names) && g.member_names.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {g.member_names.map((n: string, idx: number) => (
                          <span key={idx} className="text-[10px] font-medium bg-white border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-700">
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── 2. Event Detailed Flow & Schedules (only shown if Option B breakdown or cards exist) ─── */}
        {hasScheduleSection && (
          <section id="schedule" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-neutral-700" />
                <span>Event Flow & Detailed Notes</span>
              </h2>
              {eventsWithOptionB.length > 0 && (
                <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-0.5 rounded-full">
                  {eventsWithOptionB.length} {eventsWithOptionB.length === 1 ? 'Event with Notes' : 'Events with Notes'}
                </span>
              )}
            </div>

            {eventsWithOptionB.length > 0 && (
              <div className="space-y-3">
                {eventsWithOptionB.map((ev: any) => {
                  const { isPast } = getEventDateStatus(ev.event_date)
                  return (
                    <div
                      key={ev.id}
                      className={`border rounded-xl p-4 space-y-2.5 ${
                        isPast
                          ? 'bg-neutral-50/70 border-neutral-200/80 text-neutral-600'
                          : 'bg-neutral-50/70 border-neutral-200/80'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-neutral-950">
                            {ev.event_type} {ev.slot ? `(${ev.slot})` : ''}
                          </span>
                          {isPast && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">
                              <CheckCircle2 className="w-3 h-3 text-neutral-500" />
                              <span>Already Shot</span>
                            </span>
                          )}
                        </div>

                      <div className="text-xs text-neutral-600 font-medium flex flex-wrap items-center gap-3">
                        {ev.event_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{fmtDate(ev.event_date)}</span>
                          </span>
                        )}
                        {(ev.start_time || ev.end_time) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{ev.start_time || '—'} to {ev.end_time || '—'}</span>
                          </span>
                        )}
                        {ev.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{ev.venue}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-white border border-neutral-200/80 rounded-lg p-3 text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed">
                      <span className="font-bold text-neutral-400 block text-[10px] uppercase tracking-wider mb-1">Schedule Notes:</span>
                      {ev.schedule_text}
                    </div>
                  </div>
                )
              })}
              </div>
            )}

            {/* Uploaded Invitations (if any) */}
            {invitations.length > 0 && (
              <div className={`space-y-2.5 ${eventsWithOptionB.length > 0 ? 'pt-3 border-t border-neutral-100' : ''}`}>
                <div className="text-xs font-bold text-neutral-900">
                  Wedding Cards / Invitations ({invitations.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {invitations.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="bg-neutral-50 border border-neutral-200/80 rounded-xl overflow-hidden cursor-pointer group hover:border-neutral-300 transition"
                      onClick={() => setPreviewMedia(inv)}
                    >
                      <div className="aspect-[4/3] bg-neutral-100 flex items-center justify-center overflow-hidden">
                        {inv.file_type === 'image' ? (
                          <img
                            src={normalizeMediaUrl(inv.file_url, inv.storage_key)}
                            alt={inv.filename}
                            className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-neutral-500 p-2">
                            <FileText className="w-7 h-7 text-amber-600 mb-1" />
                            <span className="text-[10px] font-bold uppercase">View PDF</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2 border-t border-neutral-200/80 text-[11px] font-medium text-neutral-800 truncate text-center bg-white">
                        {inv.filename}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── 3. Rituals & Traditions (only if filled) ─── */}
        {hasTraditions && (
          <section id="traditions" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Landmark className="w-4 h-4 text-neutral-700" />
              <span>Rituals & Traditions</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {primaryTradition && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Primary Tradition:</span>
                  <span className="inline-block px-3 py-1 rounded-lg bg-neutral-100 text-neutral-950 font-bold border border-neutral-200">
                    {primaryTradition}
                  </span>
                </div>
              )}

              {traditionsList.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Traditions & Communities:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {traditionsList.map((c: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {multiculturalDetails && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Multicultural Details:</span>
                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {multiculturalDetails}
                  </div>
                </div>
              )}

              {traditionsNotes && (
                <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-amber-900 block uppercase text-[10px] tracking-wider">Traditions & Rituals to Note:</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{traditionsNotes}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── 4. Photography Requests (only if filled) ─── */}
        {hasPhoto && (
          <section id="photography" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Camera className="w-4 h-4 text-neutral-700" />
              <span>Photography Requests</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {/* Q2: Camera Comfort */}
              {cameraComfort && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Camera Comfort (In front of camera):
                  </span>
                  <span className="font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-lg inline-block">
                    {cameraComfort}
                  </span>
                </div>
              )}

              {/* Q6: Romantic Comfort */}
              {romanticComfort && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Romantic & Intimate Portraits:
                  </span>
                  <span className="font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-lg inline-block">
                    {romanticComfort}
                  </span>
                </div>
              )}

              {/* Poses to Avoid */}
              {posesToAvoid && (
                <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-rose-900 block uppercase text-[10px] tracking-wider">
                    Poses or Types to Avoid:
                  </span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{posesToAvoid}</p>
                </div>
              )}

              {/* Q1: Styles and Moments */}
              {photoStyles.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Styles & Moments That Matter:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {photoStyles.map((s: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q4: Color & Mood Palette */}
              {colorPalette.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Mood & Colour Palette:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {colorPalette.map((p: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q5: Disliked Styles */}
              {dislikedStyles && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-neutral-500 block uppercase text-[10px] tracking-wider">
                    Styles or Treatments Disliked:
                  </span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{dislikedStyles}</p>
                </div>
              )}

              {/* Q3: Visual Inspirations & References */}
              {photoInspirations.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider">
                    Visual References & Inspirations:
                  </span>
                  <div className="space-y-2">
                    {photoInspirations.map((ref: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 flex items-center justify-between gap-2">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-neutral-900 hover:text-blue-600 underline flex items-center gap-1.5 truncate"
                        >
                          <span className="truncate">{ref.description || ref.platform || ref.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <span className="text-[10px] font-semibold text-neutral-400 uppercase">
                          {ref.platform || ref.type || 'Link'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {photoNotes && (
                    <p className="text-[11px] text-neutral-600 italic pt-1">{photoNotes}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── 5. Songs & Video (only if filled) ─── */}
        {hasVideo && (
          <section id="cinema-music" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <Film className="w-4 h-4 text-neutral-700" />
                <span>Songs & Video Preferences</span>
              </h2>
              {musicReferences.length > 0 && (
                <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-0.5 rounded-full">
                  {musicReferences.length} Songs
                </span>
              )}
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Q1: Film Styles & Overall Feel */}
              {filmStylesAndFeel.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Film Styles & Overall Feel:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {filmStylesAndFeel.map((f: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q2: Focus Moments */}
              {focusMoments.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Moments to Focus On:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {focusMoments.map((m: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q5: Music Genres */}
              {musicGenres.length > 0 && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Music Genres Enjoyed:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {musicGenres.map((g: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Q6: Music Selector */}
              {musicSelector && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Music Selection:
                  </span>
                  <span className="font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-lg inline-block">
                    {musicSelector}
                  </span>
                </div>
              )}

              {/* Q8: Couple Interview */}
              {coupleInterview && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">
                    Couple Interview Comfort:
                  </span>
                  <span className="font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-3 py-1 rounded-lg inline-block">
                    {coupleInterview}
                  </span>
                </div>
              )}

              {/* Q9: Interview Selections */}
              {interviewSelections.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider">
                    Family & Friends to Interview:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {interviewSelections.map((item: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                        <div className="font-bold text-neutral-900">{item.name || item.relationship}</div>
                        {item.relationship && item.name && (
                          <div className="text-[11px] text-neutral-500">{item.relationship}</div>
                        )}
                        {item.notes && <div className="text-[11px] text-neutral-600 mt-1">{item.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Q10: Interview Topics */}
              {interviewTopics && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-neutral-500 block uppercase text-[10px] tracking-wider">
                    Interview Topics / Questions:
                  </span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{interviewTopics}</p>
                </div>
              )}

              {/* Q4: Video Dislikes */}
              {videoDislikes && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-neutral-500 block uppercase text-[10px] tracking-wider">
                    Video Styles Disliked:
                  </span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{videoDislikes}</p>
                </div>
              )}

              {/* Q3: Video References */}
              {videoReferences.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider">
                    Film References:
                  </span>
                  <div className="space-y-1.5">
                    {videoReferences.map((r: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                        <a href={r.url} target="_blank" rel="noreferrer" className="font-bold text-neutral-900 hover:underline truncate">
                          {r.url}
                        </a>
                        {r.note && <span className="text-neutral-500 ml-2 text-[11px]">({r.note})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Music List */}
              {musicReferences.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider">
                    Songs for Video:
                  </span>
                  <div className="space-y-2">
                    {musicReferences.map((m: any) => (
                      <div key={m.id} className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="space-y-1 min-w-0 flex-1">
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1.5 truncate"
                          >
                            <Music className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{m.notes || m.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          {m.notes && m.notes !== m.url && (
                            <p className="text-[11px] text-neutral-600">{m.notes}</p>
                          )}
                        </div>
                        {Array.isArray(m.deliverable_names) && m.deliverable_names.length > 0 && (
                          <div className="flex flex-wrap gap-1 shrink-0">
                            {m.deliverable_names.map((d: string, idx: number) => (
                              <span key={idx} className="bg-white border border-neutral-200 text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded">
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── 6. Couple Story (only if filled) ─── */}
        {hasStory && (
          <section id="story" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <BookHeart className="w-4 h-4 text-neutral-700" />
              <span>Couple Story</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {howWeMet && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">How They Met:</span>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {howWeMet}
                  </div>
                </div>
              )}
              {relationship && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Their Relationship:</span>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {relationship}
                  </div>
                </div>
              )}
              {specialMemory && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Special Story / Memory:</span>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {specialMemory}
                  </div>
                </div>
              )}
              {additionalStory && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Additional Story Notes:</span>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {additionalStory}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── 7. Final Touches & Other Notes (only if filled) ─── */}
        {hasFinal && (
          <section id="vendors" className="bg-white rounded-2xl border border-neutral-200/90 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Sparkles className="w-4 h-4 text-neutral-700" />
              <span>Final Touches & Notes</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {perfectWedding && (
                <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-neutral-600 block uppercase text-[10px] tracking-wider">
                    What Makes Their Wedding Capture Perfect:
                  </span>
                  <p className="text-neutral-900 leading-relaxed whitespace-pre-wrap font-medium">{perfectWedding}</p>
                </div>
              )}

              {additionalNotes && (
                <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 space-y-1">
                  <span className="font-bold text-neutral-600 block uppercase text-[10px] tracking-wider">
                    Notes for the Team:
                  </span>
                  <p className="text-neutral-900 leading-relaxed whitespace-pre-wrap font-medium">{additionalNotes}</p>
                </div>
              )}

              {surprises && (
                <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-amber-900 block uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Secret Surprises (Do NOT tell guests):</span>
                  </span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{surprises}</p>
                </div>
              )}

              {vendors.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider">Other Vendors:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {vendors.map((v: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200/80 rounded-lg p-2.5">
                        <span className="text-[10px] font-bold uppercase text-neutral-400 block">{v.role || 'Vendor'}</span>
                        <div className="font-bold text-neutral-900">{v.name || '—'}</div>
                        {v.contact && <div className="text-[11px] text-neutral-600">{v.contact}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {otherRequests && (
                <div>
                  <span className="font-bold text-neutral-400 block uppercase text-[10px] tracking-wider mb-1">Other Requests:</span>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {otherRequests}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─── 8. Special Notes & Do NOT Shoot (only if filled) ─── */}
        {hasSpecial && (
          <section id="special-care" className="bg-white rounded-2xl border border-rose-200 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-950 flex items-center gap-2 border-b border-rose-100 pb-3">
              <HeartHandshake className="w-4 h-4 text-rose-700" />
              <span>Special Notes & Do NOT Shoot</span>
            </h2>

            <div className="space-y-3.5 text-xs">
              {restrictedRituals && (
                <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-amber-900 block uppercase text-[10px] tracking-wider">Restricted Rituals / Filming Restrictions:</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{restrictedRituals}</p>
                </div>
              )}

              {elderlyNeeds && (
                <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-amber-900 block uppercase text-[10px] tracking-wider">Elderly Family / Walking Issues:</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{elderlyNeeds}</p>
                </div>
              )}

              {discreetMoments && (
                <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-neutral-500 block uppercase text-[10px] tracking-wider">Private Moments (Do Not Film):</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{discreetMoments}</p>
                </div>
              )}

              {(Array.isArray(avoidPeople) && avoidPeople.length > 0) && (
                <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-rose-900 block uppercase text-[10px] tracking-wider">People Who Prefer NOT to Be in Photos / Videos:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {avoidPeople.map((p: any, idx: number) => (
                      <span key={idx} className="bg-white border border-rose-200 text-rose-950 font-bold px-2 py-0.5 rounded">
                        {p.name || p} {p.note ? `(${p.note})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {avoidFilmingNote && (
                <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-rose-900 block uppercase text-[10px] tracking-wider">Filming Note:</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{avoidFilmingNote}</p>
                </div>
              )}

              {sensitiveDynamics && (
                <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-3.5 space-y-1">
                  <span className="font-bold text-rose-900 block uppercase text-[10px] tracking-wider">Family Note:</span>
                  <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">{sensitiveDynamics}</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ══════ LIGHTBOX MODAL ══════ */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-preview-title"
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 sm:p-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 id="lightbox-preview-title" className="text-xs sm:text-sm font-bold text-neutral-950 truncate pr-3">
                {previewMedia.filename || 'Preview'}
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  aria-label="Close"
                  className="p-1 text-neutral-400 hover:text-neutral-800 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-neutral-100 p-4 flex items-center justify-center min-h-[300px]">
              {previewMedia.file_type === 'video' ? (
                <video
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-lg shadow-sm"
                />
              ) : previewMedia.file_type === 'image' ? (
                <img
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  alt={previewMedia.filename || 'Preview'}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : (
                <iframe
                  src={normalizeMediaUrl(previewMedia.file_url, previewMedia.storage_key)}
                  className="w-full h-[65vh] rounded-lg border border-neutral-200 bg-white"
                  title={previewMedia.filename || 'PDF Preview'}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
