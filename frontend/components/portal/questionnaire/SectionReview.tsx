'use client'

import React from 'react'
import {
  Landmark,
  Calendar,
  Users,
  User,
  Camera,
  Film,
  Sparkles,
  BookHeart,
  HeartHandshake,
  AlertCircle,
  Pencil,
  ExternalLink,
  FileText,
  Heart,
  Check,
  Music
} from 'lucide-react'
import { TraditionsAnswers } from './SectionTraditions'
import { ProjectEventItem, InvitationItem } from './SectionSchedule'
import { FamilyMemberItem, FamilyGroupItem } from './SectionFamilyTree'
import { PhotographyAnswers } from './SectionPhotography'
import { VideographyAnswers, VideoDeliverableItem, MusicReferenceItem } from './SectionVideography'
import { FinalTouchesAnswers } from './SectionFinalTouches'
import { StoryAnswers } from './SectionStory'
import { SpecialConsiderationsAnswers } from './SectionSpecialConsiderations'

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

function FamilyMemberReviewCard({ member }: { member: FamilyMemberItem }) {
  const priority = member.priority || 'medium'
  const borderClass =
    priority === 'high'
      ? 'border-2 border-rose-200'
      : priority === 'medium'
      ? 'border-2 border-amber-200'
      : 'border border-neutral-200/90'

  return (
    <div className={`bg-white rounded-2xl p-3 sm:p-3.5 flex flex-col items-center text-center shadow-2xs ${borderClass}`}>
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
        {member.photo_url ? (
          <img
            src={member.photo_url}
            alt={member.name}
            className="w-full h-full object-cover object-center"
          />
        ) : member.is_remembering ? (
          <Heart className="w-7 h-7 text-neutral-400 stroke-[1.5]" />
        ) : (
          <User className="w-7 h-7 text-neutral-300 stroke-[1.5]" />
        )}

        {member.is_remembering && (
          <span className="absolute bottom-0 inset-x-0 bg-neutral-900/80 text-white text-[8px] font-bold text-center py-0.5 uppercase tracking-wider">
            In Memory
          </span>
        )}
      </div>

      <div className="w-full space-y-0.5 min-w-0">
        <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate" title={member.name}>
          {member.name}
        </h4>
        <p className="text-[11px] font-semibold text-neutral-500 truncate">
          {member.custom_relationship || member.relationship}
        </p>
        {member.notes && (
          <p className="text-[10px] text-neutral-400 truncate pt-0.5" title={member.notes}>
            {member.notes}
          </p>
        )}
      </div>
    </div>
  )
}

interface SectionReviewProps {
  slug: string
  couple?: any
  traditionsAnswers: TraditionsAnswers
  scheduleEvents: ProjectEventItem[]
  invitations: InvitationItem[]
  familyMembers: FamilyMemberItem[]
  familyGroups: FamilyGroupItem[]
  photoAnswers: PhotographyAnswers
  videoAnswers: VideographyAnswers
  deliverables: VideoDeliverableItem[]
  musicReferences: MusicReferenceItem[]
  finalAnswers: FinalTouchesAnswers
  storyAnswers: StoryAnswers
  specialAnswers: SpecialConsiderationsAnswers
  showAdditionalSections: boolean
  onEditSection: (step: number) => void
  onSubmit: () => Promise<void>
  submitting: boolean
  submitError?: string
  missingRequirements?: string[]
}

export default function SectionReview({
  slug,
  couple,
  traditionsAnswers,
  scheduleEvents,
  invitations,
  familyMembers,
  familyGroups,
  photoAnswers,
  videoAnswers,
  deliverables,
  musicReferences,
  finalAnswers,
  storyAnswers,
  specialAnswers,
  showAdditionalSections,
  onEditSection,
  onSubmit,
  submitting,
  submitError,
  missingRequirements = []
}: SectionReviewProps) {
  // Check mandatory parent status
  const isBrideFatherReady = familyMembers.some(
    m => m.side === 'bride' && m.relationship?.toLowerCase().includes('father') && m.name?.trim() && (m.photo_url || m.is_remembering)
  )
  const isBrideMotherReady = familyMembers.some(
    m => m.side === 'bride' && m.relationship?.toLowerCase().includes('mother') && m.name?.trim() && (m.photo_url || m.is_remembering)
  )
  const isGroomFatherReady = familyMembers.some(
    m => m.side === 'groom' && m.relationship?.toLowerCase().includes('father') && m.name?.trim() && (m.photo_url || m.is_remembering)
  )
  const isGroomMotherReady = familyMembers.some(
    m => m.side === 'groom' && m.relationship?.toLowerCase().includes('mother') && m.name?.trim() && (m.photo_url || m.is_remembering)
  )

  const allParentsReady = isBrideFatherReady && isBrideMotherReady && isGroomFatherReady && isGroomMotherReady

  const brideParents = familyMembers.filter(
    m => m.side === 'bride' && (m.relationship?.toLowerCase().includes('father') || m.relationship?.toLowerCase().includes('mother') || m.category === 'parents')
  )
  const groomParents = familyMembers.filter(
    m => m.side === 'groom' && (m.relationship?.toLowerCase().includes('father') || m.relationship?.toLowerCase().includes('mother') || m.category === 'parents')
  )
  const brideSiblings = familyMembers.filter(m => m.side === 'bride' && m.category === 'siblings')
  const groomSiblings = familyMembers.filter(m => m.side === 'groom' && m.category === 'siblings')
  const brideGrandparents = familyMembers.filter(m => m.side === 'bride' && m.category === 'grandparents')
  const groomGrandparents = familyMembers.filter(m => m.side === 'groom' && m.category === 'grandparents')
  const brideGroups = familyGroups.filter(g => g.side === 'bride')
  const groomGroups = familyGroups.filter(g => g.side === 'groom')
  const brideUnassignedRelatives = familyMembers.filter(
    m => m.side === 'bride' && (m.category === 'extended' || m.category === 'other' || m.category === 'grandparents') && !m.family_group_id
  )
  const groomUnassignedRelatives = familyMembers.filter(
    m => m.side === 'groom' && (m.category === 'extended' || m.category === 'other' || m.category === 'grandparents') && !m.family_group_id
  )
  const brideFriends = familyMembers.filter(m => m.side === 'bride' && m.category === 'friends')
  const groomFriends = familyMembers.filter(m => m.side === 'groom' && m.category === 'friends')

  return (
    <div className="max-w-4xl mx-auto py-2 space-y-8 text-left">
      {/* Mandatory Parent Gate Status Banner (Only shown if requirements are incomplete) */}
      {!allParentsReady && (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Missing Mandatory Parent Profiles</span>
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            Both the Bride and Groom must have both Father and Mother profiles with a photograph (or marked &quot;In Loving Memory&quot;) before submitting.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {!isBrideFatherReady && <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-semibold">Bride&apos;s Father</span>}
            {!isBrideMotherReady && <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-semibold">Bride&apos;s Mother</span>}
            {!isGroomFatherReady && <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-semibold">Groom&apos;s Father</span>}
            {!isGroomMotherReady && <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-full font-semibold">Groom&apos;s Mother</span>}
          </div>
          <button
            type="button"
            onClick={() => onEditSection(3)}
            className="text-xs font-bold text-rose-900 bg-white hover:bg-rose-100/70 border border-rose-300 px-4 py-2 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs mt-1"
          >
            <span>Fix in Section 03: Family Tree</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Submission Error Banner if any */}
      {submitError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-1.5 text-xs text-rose-700">
          <div className="flex items-center gap-1.5 font-bold text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Submission Blocked</span>
          </div>
          <p>{submitError}</p>
          {missingRequirements.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5 pt-1">
              {missingRequirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Section Cards List */}
      <div className="space-y-6">
        {/* =========================================================================
            SECTION 01: TRADITIONS & CULTURE
            ========================================================================= */}
        {(() => {
          const primaryTradition = traditionsAnswers.primary_tradition || traditionsAnswers.main_traditions?.[0]
          const regions = traditionsAnswers.indian_regions || []
          const allCommunities = uniqueArray([
            ...(traditionsAnswers.north_indian_communities || []),
            ...(traditionsAnswers.south_indian_communities || []),
            ...(traditionsAnswers.west_indian_communities || []),
            ...(traditionsAnswers.east_indian_communities || []),
            ...(traditionsAnswers.northeast_indian_communities || []),
            ...(traditionsAnswers.international_styles || []),
            traditionsAnswers.north_indian_other_custom,
            traditionsAnswers.south_indian_other_custom,
            traditionsAnswers.west_indian_other_custom,
            traditionsAnswers.east_indian_other_custom,
            traditionsAnswers.northeast_indian_other_custom,
            traditionsAnswers.other_indian_community_custom,
            traditionsAnswers.international_other_custom,
            traditionsAnswers.main_other_custom
          ])

          const customDetails = uniqueArray([
            traditionsAnswers.hindu_community,
            traditionsAnswers.sikh_community,
            traditionsAnswers.christian_community,
            traditionsAnswers.muslim_community,
            traditionsAnswers.multicultural_details
          ])

          const legacyCelebrations = (traditionsAnswers as any).celebrations || (traditionsAnswers as any).q2_sacred_rituals || []
          const importantDetails = traditionsAnswers.q7_important_details ||
            (traditionsAnswers as any).importance_notes ||
            (traditionsAnswers as any).q1_religious_cultural_elements ||
            (traditionsAnswers as any).q3_cultural_significance

          const selectedTraditionsList = uniqueArray([
            primaryTradition,
            ...regions,
            ...allCommunities,
            ...legacyCelebrations
          ])

          return (
            <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Landmark className="w-4.5 h-4.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 01</span>
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900">Traditions &amp; Culture</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSection(1)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-5 text-xs">
                {selectedTraditionsList.length === 0 && customDetails.length === 0 && !importantDetails ? (
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
                    {importantDetails && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. Are there any traditions or cultural details that are particularly important for our photography and film teams to understand?
                        </label>
                        <TextResponse text={importantDetails} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {/* =========================================================================
            SECTION 02: SCHEDULE & INVITATIONS
            ========================================================================= */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Calendar className="w-4.5 h-4.5 stroke-[1.8]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 02</span>
                <h3 className="text-sm sm:text-base font-bold text-neutral-900">Schedule &amp; Invites</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditSection(2)}
              className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
          <div className="p-5 sm:p-6 space-y-4 text-xs">
            {scheduleEvents.length > 0 ? (
              <div className="space-y-2.5">
                <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                  Wedding Events ({scheduleEvents.length}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {scheduleEvents.map((ev) => (
                    <div key={ev.id} className="p-3.5 bg-neutral-50/80 rounded-2xl border border-neutral-200/70 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-900 text-xs">{ev.event_type}</span>
                        {ev.event_date && (
                          <span className="text-[10px] text-neutral-500 bg-white px-2 py-0.5 rounded-md border border-neutral-200/70">
                            {ev.event_date}
                          </span>
                        )}
                      </div>
                      {(ev.start_time || ev.end_time) && (
                        <p className="text-[11px] text-neutral-600">
                          {ev.start_time || 'TBD'} - {ev.end_time || 'TBD'}
                        </p>
                      )}
                      {ev.venue && (
                        <p className="text-[11px] text-neutral-500 truncate">📍 {ev.venue}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-neutral-400 italic">No events configured yet.</p>
            )}

            {invitations.length > 0 && (
              <div className="pt-3 border-t border-neutral-100 space-y-2">
                <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                  Attached Digital Invitations ({invitations.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {invitations.map((inv) => (
                    <a
                      key={inv.id}
                      href={inv.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-600" />
                      <span className="truncate max-w-[150px]">{inv.filename}</span>
                      <ExternalLink className="w-3 h-3 text-neutral-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            SECTION 03: FAMILY TREE & IMPORTANT PEOPLE
            ========================================================================= */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Users className="w-4.5 h-4.5 stroke-[1.8]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 03</span>
                <h3 className="text-sm sm:text-base font-bold text-neutral-900">Family Tree &amp; Important People</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditSection(3)}
              className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
          <div className="p-5 sm:p-6 space-y-6 text-xs">
            {/* TIER 0: THE COUPLE */}
            {(couple?.bride?.name || couple?.groom?.name) && (
              <div className="space-y-3">
                <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                  The Couple:
                </span>
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  {/* Bride Card */}
                  <div className="bg-white rounded-2xl p-3.5 sm:p-4 flex flex-col items-center text-center border border-neutral-200/90 shadow-2xs">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
                      {couple?.bride?.photo_url ? (
                        <img
                          src={couple.bride.photo_url}
                          alt={couple.bride.name || 'Bride'}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <User className="w-8 h-8 text-neutral-300 stroke-[1.5]" />
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
                  <div className="bg-white rounded-2xl p-3.5 sm:p-4 flex flex-col items-center text-center border border-neutral-200/90 shadow-2xs">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
                      {couple?.groom?.photo_url ? (
                        <img
                          src={couple.groom.photo_url}
                          alt={couple.groom.name || 'Groom'}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <User className="w-8 h-8 text-neutral-300 stroke-[1.5]" />
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

            {/* TIER 1: PARENTS (MANDATORY) */}
            <div className="space-y-3 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
              <div>
                <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                  Parents (Mandatory):
                </span>
                <p className="text-xs text-neutral-400">Father &amp; Mother for both sides</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Bride Side Parents */}
                <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                  <span className="text-xs font-bold text-neutral-700 block">Bride&apos;s Parents</span>
                  {brideParents.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {brideParents.map(m => (
                        <FamilyMemberReviewCard key={m.id} member={m} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-400 italic">Bride parents not added yet.</p>
                  )}
                </div>

                {/* Groom Side Parents */}
                <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                  <span className="text-xs font-bold text-neutral-700 block">Groom&apos;s Parents</span>
                  {groomParents.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {groomParents.map(m => (
                        <FamilyMemberReviewCard key={m.id} member={m} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-400 italic">Groom parents not added yet.</p>
                  )}
                </div>
              </div>
            </div>

            {/* TIER 2: SIBLINGS */}
            {(brideSiblings.length > 0 || groomSiblings.length > 0) && (
              <div className="space-y-3 pt-5 border-t border-neutral-100">
                <div>
                  <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                    Siblings:
                  </span>
                  <p className="text-xs text-neutral-400">Brothers, Sisters, Bhabhi, Jiju</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {brideSiblings.length > 0 && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Bride&apos;s Siblings ({brideSiblings.length})
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {brideSiblings.map(m => (
                          <FamilyMemberReviewCard key={m.id} member={m} />
                        ))}
                      </div>
                    </div>
                  )}

                  {groomSiblings.length > 0 && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Groom&apos;s Siblings ({groomSiblings.length})
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {groomSiblings.map(m => (
                          <FamilyMemberReviewCard key={m.id} member={m} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TIER 3: RELATIVES & EXTENDED FAMILIES */}
            {(familyGroups.length > 0 || brideUnassignedRelatives.length > 0 || groomUnassignedRelatives.length > 0) && (
              <div className="space-y-3 pt-5 border-t border-neutral-100">
                <div>
                  <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                    Relatives &amp; Extended Families:
                  </span>
                  <p className="text-xs text-neutral-400">
                    Chacha-Chachi, Mama-Mami, Bua-Fufa, family units and cousins
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Bride's Families */}
                  {(brideGroups.length > 0 || brideUnassignedRelatives.length > 0) && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-4">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Bride&apos;s Families
                      </span>

                      {brideGroups.map(group => {
                        const groupMembers = familyMembers.filter(m => m.family_group_id === group.id)
                        return (
                          <div
                            key={group.id}
                            className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs p-3.5 sm:p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">👨‍👩‍👧‍👦</span>
                                <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                                  {group.relationship || group.name || 'Family Unit'}
                                </h4>
                              </div>
                              {group.notes && (
                                <span className="text-[10px] text-neutral-400 truncate max-w-[150px]">
                                  {group.notes}
                                </span>
                              )}
                            </div>
                            {groupMembers.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2.5">
                                {groupMembers.map(m => (
                                  <FamilyMemberReviewCard key={m.id} member={m} />
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-neutral-400 italic">No members assigned.</p>
                            )}
                          </div>
                        )
                      })}

                      {brideUnassignedRelatives.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-neutral-200/60">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Other Relatives ({brideUnassignedRelatives.length})
                          </span>
                          <div className="grid grid-cols-2 gap-2.5">
                            {brideUnassignedRelatives.map(m => (
                              <FamilyMemberReviewCard key={m.id} member={m} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Groom's Families */}
                  {(groomGroups.length > 0 || groomUnassignedRelatives.length > 0) && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-4">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Groom&apos;s Families
                      </span>

                      {groomGroups.map(group => {
                        const groupMembers = familyMembers.filter(m => m.family_group_id === group.id)
                        return (
                          <div
                            key={group.id}
                            className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs p-3.5 sm:p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">👨‍👩‍👧‍👦</span>
                                <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                                  {group.relationship || group.name || 'Family Unit'}
                                </h4>
                              </div>
                              {group.notes && (
                                <span className="text-[10px] text-neutral-400 truncate max-w-[150px]">
                                  {group.notes}
                                </span>
                              )}
                            </div>
                            {groupMembers.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2.5">
                                {groupMembers.map(m => (
                                  <FamilyMemberReviewCard key={m.id} member={m} />
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-neutral-400 italic">No members assigned.</p>
                            )}
                          </div>
                        )
                      })}

                      {groomUnassignedRelatives.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-neutral-200/60">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Other Relatives ({groomUnassignedRelatives.length})
                          </span>
                          <div className="grid grid-cols-2 gap-2.5">
                            {groomUnassignedRelatives.map(m => (
                              <FamilyMemberReviewCard key={m.id} member={m} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TIER 4: FRIENDS */}
            {(brideFriends.length > 0 || groomFriends.length > 0) && (
              <div className="space-y-3 pt-5 border-t border-neutral-100">
                <div>
                  <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px] block">
                    Friends:
                  </span>
                  <p className="text-xs text-neutral-400">Best friends, bridesmaids, groomsmen</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {brideFriends.length > 0 && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Bride&apos;s Friends ({brideFriends.length})
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {brideFriends.map(m => (
                          <FamilyMemberReviewCard key={m.id} member={m} />
                        ))}
                      </div>
                    </div>
                  )}

                  {groomFriends.length > 0 && (
                    <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-3">
                      <span className="text-xs font-bold text-neutral-700 block">
                        Groom&apos;s Friends ({groomFriends.length})
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {groomFriends.map(m => (
                          <FamilyMemberReviewCard key={m.id} member={m} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            SECTION 04: PHOTOGRAPHY PREFERENCES
            ========================================================================= */}
        {(() => {
          const stylesAndMoments = uniqueArray([
            ...(photoAnswers.q8_styles || []),
            ...(photoAnswers.q10_matters_most || []),
            (photoAnswers as any).preferred_styles,
            (photoAnswers as any).q16_photo_aesthetic_preferences,
            photoAnswers.q8_other,
            photoAnswers.q10_other
          ])

          const colorPalette = uniqueArray([
            ...(photoAnswers.q12_mood_palette || []),
            ...(photoAnswers.q13_editing_styles || []),
            photoAnswers.q12_other,
            photoAnswers.q13_other,
            (photoAnswers as any).editing_palette,
            (photoAnswers as any).q17_editing_color_palette
          ])

          const visualReferences = photoAnswers.q11_inspirations || (photoAnswers as any).references || []
          const cameraComfort = photoAnswers.q9_camera_comfort
          const dislikedStyles = photoAnswers.q14_disliked_styles || (photoAnswers as any).disliked_styles
          const romanticComfort = photoAnswers.q15_romantic_comfort
          const posesToAvoid = photoAnswers.q15_poses_to_avoid

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
            <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Camera className="w-4.5 h-4.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 04</span>
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900">Photography Preferences</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSection(4)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-5 text-xs">
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
                              {ref.type === 'upload' && ref.url ? (
                                <img src={ref.url} alt="Inspiration" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-200" />
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
            </div>
          )
        })()}

        {/* =========================================================================
            SECTION 05: FILMS, MUSIC & VIDEOGRAPHY
            ========================================================================= */}
        {(() => {
          const filmStylesAndFeel = uniqueArray([
            ...(videoAnswers.q16_film_styles || []),
            ...(videoAnswers.q17_overall_feel || []),
            videoAnswers.q16_other,
            videoAnswers.q17_other
          ])

          const focusMoments = uniqueArray([
            ...(videoAnswers.q18_focus_moments || []),
            videoAnswers.q18_other
          ])

          const videoRefs = videoAnswers.q19_references || []
          const videoDislikes = videoAnswers.q20_disliked_styles || (videoAnswers as any).disliked_styles

          const musicGenres = uniqueArray([
            ...(videoAnswers.q21_music_genres || []),
            videoAnswers.q21_other
          ])

          const musicSelector = videoAnswers.q22_music_selector
            ? videoAnswers.q22_music_selector === 'couple_selected'
              ? 'Our selected music'
              : 'Editor-selected music'
            : undefined

          const coupleInterview = videoAnswers.q25_couple_interview || (videoAnswers as any).interview_preferences
          const interviewSelections = videoAnswers.q26_interview_selections || []
          const interviewTopics = videoAnswers.q27_interview_topics

          const hasAnyVideo = Boolean(
            deliverables.length > 0 ||
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
            <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Film className="w-4.5 h-4.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 05</span>
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900">Films, Music &amp; Videography</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSection(5)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-5 text-xs">
                {!hasAnyVideo ? (
                  <p className="text-neutral-400 italic">No videography preferences entered yet.</p>
                ) : (
                  <>
                    {deliverables.length > 0 && (
                      <div className="space-y-2 pb-2">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">Target Film Deliverables:</span>
                        <div className="flex flex-wrap gap-2">
                          {deliverables.map(d => (
                            <span key={d.id} className="px-3 py-1.5 bg-neutral-100 text-neutral-900 font-semibold rounded-xl text-xs border border-neutral-200/70">
                              🎬 {d.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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
                        <div className="space-y-2">
                          {musicReferences.map(m => (
                            <div key={m.id} className="p-3.5 bg-white border border-neutral-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                <a
                                  href={m.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-neutral-900 hover:underline truncate max-w-xs sm:max-w-md flex items-center gap-1.5"
                                >
                                  <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span className="truncate">{m.notes || m.url}</span>
                                </a>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-700 shrink-0">
                                  {m.reference_type === 'exact_song' ? 'Exact Track' : 'Inspiration'}
                                </span>
                                {m.deliverable_names && m.deliverable_names.length > 0 && (
                                  <span className="text-[11px] text-neutral-500">
                                    for <span className="font-medium text-neutral-700">{m.deliverable_names.join(', ')}</span>
                                  </span>
                                )}
                              </div>
                              <a
                                href={m.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 flex items-center gap-1 shrink-0"
                              >
                                <span>Listen</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
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
                          {interviewSelections.map((item, idx) => (
                            <SelectedCard
                              key={idx}
                              label={`${item.name}${item.relationship ? ` (${item.relationship})` : ''}${item.notes ? ` - ${item.notes}` : ''}`}
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

        {/* =========================================================================
            SECTION 06: THE FINAL TOUCHES
            ========================================================================= */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Sparkles className="w-4.5 h-4.5 stroke-[1.8]" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 06</span>
                <h3 className="text-sm sm:text-base font-bold text-neutral-900">The Final Touches</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditSection(6)}
              className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
          <div className="p-5 sm:p-6 space-y-5 text-xs">
            {!finalAnswers.q31_perfect_wedding && !finalAnswers.q32_additional_notes ? (
              <p className="text-neutral-400 italic">No final touches entered yet.</p>
            ) : (
              <>
                {/* Q1 */}
                {finalAnswers.q31_perfect_wedding && (
                  <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                    <label className="block text-sm font-bold text-neutral-900">
                      Q1. What would make you feel that Misty Visuals has captured your wedding perfectly?
                    </label>
                    <TextResponse text={finalAnswers.q31_perfect_wedding} />
                  </div>
                )}

                {/* Q2 */}
                {finalAnswers.q32_additional_notes && (
                  <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                    <label className="block text-sm font-bold text-neutral-900">
                      Q2. Is there anything else you&apos;d like to tell our team before the celebrations begin?
                    </label>
                    <TextResponse text={finalAnswers.q32_additional_notes} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* =========================================================================
            SECTION 07: YOUR STORY (If Unlocked or Filled)
            ========================================================================= */}
        {showAdditionalSections && (() => {
          const hasAnyStory = Boolean(
            storyAnswers.q1_how_we_met ||
            (storyAnswers as any).how_we_met ||
            storyAnswers.q2_relationship_description ||
            storyAnswers.q4_three_defining_things ||
            (storyAnswers as any).relationship_dynamics ||
            storyAnswers.q3_special_memory ||
            (storyAnswers as any).proposal ||
            storyAnswers.q5_additional_story
          )

          return (
            <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <BookHeart className="w-4.5 h-4.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 07</span>
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900">Your Story</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSection(7)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-5 text-xs">
                {!hasAnyStory ? (
                  <p className="text-neutral-400 italic">No story details shared yet.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {(storyAnswers.q1_how_we_met || (storyAnswers as any).how_we_met) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. How did you both meet?
                        </label>
                        <TextResponse text={storyAnswers.q1_how_we_met || (storyAnswers as any).how_we_met} />
                      </div>
                    )}

                    {/* Q2 */}
                    {(storyAnswers.q2_relationship_description || storyAnswers.q4_three_defining_things || (storyAnswers as any).relationship_dynamics) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. How would you describe your relationship, and what are three things that define you as a couple?
                        </label>
                        <TextResponse text={storyAnswers.q2_relationship_description || storyAnswers.q4_three_defining_things || (storyAnswers as any).relationship_dynamics} />
                      </div>
                    )}

                    {/* Q3 */}
                    {(storyAnswers.q3_special_memory || (storyAnswers as any).proposal) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q3. Is there a special story, memory, or moment you&apos;d love us to capture?
                        </label>
                        <TextResponse text={storyAnswers.q3_special_memory || (storyAnswers as any).proposal} />
                      </div>
                    )}

                    {/* Q4 */}
                    {storyAnswers.q5_additional_story && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q4. Is there anything else about your story that you would like us to know?
                        </label>
                        <TextResponse text={storyAnswers.q5_additional_story} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {/* =========================================================================
            SECTION 08: SPECIAL CONSIDERATIONS (If Unlocked or Filled)
            ========================================================================= */}
        {showAdditionalSections && (() => {
          const hasAnySpecial = Boolean(
            specialAnswers.q28_restricted_rituals !== undefined ||
            specialAnswers.q28_details ||
            specialAnswers.q29_discreet_moments ||
            specialAnswers.q30_avoid_filming !== undefined ||
            (specialAnswers.q30_people && specialAnswers.q30_people.length > 0)
          )

          return (
            <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-4 bg-neutral-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <HeartHandshake className="w-4.5 h-4.5 stroke-[1.8]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">Section 08</span>
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900">Special Considerations &amp; Care</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSection(8)}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-5 text-xs">
                {!hasAnySpecial ? (
                  <p className="text-neutral-400 italic">No sensitive considerations noted.</p>
                ) : (
                  <>
                    {/* Q1 */}
                    {(specialAnswers.q28_restricted_rituals !== undefined || specialAnswers.q28_details) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q1. Are there any rituals where photography or videography is restricted?
                        </label>
                        {specialAnswers.q28_restricted_rituals !== undefined && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={specialAnswers.q28_restricted_rituals ? 'Yes, there are restrictions' : 'No restrictions'} />
                          </div>
                        )}
                        {specialAnswers.q28_details && (
                          <div className="pt-2 space-y-1">
                            <span className="text-xs font-semibold text-neutral-700 block">Restriction details:</span>
                            <TextResponse text={specialAnswers.q28_details} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Q2 */}
                    {specialAnswers.q29_discreet_moments && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q2. Are there any moments where we should be especially discreet or avoid interfering?
                        </label>
                        <TextResponse text={specialAnswers.q29_discreet_moments} />
                      </div>
                    )}

                    {/* Q3 */}
                    {(specialAnswers.q30_avoid_filming !== undefined || (specialAnswers.q30_people && specialAnswers.q30_people.length > 0)) && (
                      <div className="space-y-2.5 pt-5 first:pt-0 border-t first:border-t-0 border-neutral-100">
                        <label className="block text-sm font-bold text-neutral-900">
                          Q3. Are there any guests or individuals who should not be photographed or filmed?
                        </label>
                        {specialAnswers.q30_avoid_filming !== undefined && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <SelectedCard label={specialAnswers.q30_avoid_filming ? 'Yes, some individuals prefer not to be filmed' : 'No, all guests can be captured'} />
                          </div>
                        )}
                        {specialAnswers.q30_people && specialAnswers.q30_people.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <span className="text-xs font-semibold text-neutral-700 block">Individuals to avoid:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {specialAnswers.q30_people.map((p, idx) => (
                                <div key={idx} className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs flex items-center justify-between">
                                  <span className="font-bold text-rose-950">{p.name}</span>
                                  {p.note && <span className="text-rose-800 text-[11px] font-medium">{p.note}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
