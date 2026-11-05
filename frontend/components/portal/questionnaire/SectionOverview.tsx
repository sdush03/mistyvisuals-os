'use client'

import React from 'react'
import {
  Landmark,
  Calendar,
  Users,
  Camera,
  Film,
  Sparkles,
  BookHeart,
  HeartHandshake,
  CheckCircle2,
  ChevronRight
} from 'lucide-react'

export interface OverviewSectionItem {
  id: number
  num: string
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  isCompleted?: boolean
}

interface SectionOverviewProps {
  onSelectSection: (step: number) => void
  onStartOrContinue: () => void
  onSaveDraft?: () => void
  showAdditionalSections?: boolean
  onUnlockAdditional?: () => void
  stats?: {
    traditionsCompleted?: boolean
    scheduleCompleted?: boolean
    familyTreeCompleted?: boolean
    photographyCompleted?: boolean
    videographyCompleted?: boolean
    finalTouchesCompleted?: boolean
    storyCompleted?: boolean
    specialCareCompleted?: boolean
  } | null
}

export default function SectionOverview({
  onSelectSection,
  onStartOrContinue,
  onSaveDraft,
  showAdditionalSections = false,
  onUnlockAdditional,
  stats
}: SectionOverviewProps) {
  const coreSections: OverviewSectionItem[] = [
    {
      id: 1,
      num: '01',
      title: 'Traditions & Culture',
      subtitle: 'Cultural background and wedding details',
      icon: Landmark,
      isCompleted: Boolean(stats?.traditionsCompleted)
    },
    {
      id: 2,
      num: '02',
      title: 'Your Wedding Schedule',
      subtitle: 'Timeline, invitations and uploads',
      icon: Calendar,
      isCompleted: Boolean(stats?.scheduleCompleted)
    },
    {
      id: 3,
      num: '03',
      title: 'Family Tree & Important People',
      subtitle: 'Family photographs and priorities',
      icon: Users,
      isCompleted: Boolean(stats?.familyTreeCompleted)
    },
    {
      id: 4,
      num: '04',
      title: 'Photography Preferences',
      subtitle: 'Your photographic vision',
      icon: Camera,
      isCompleted: Boolean(stats?.photographyCompleted)
    },
    {
      id: 5,
      num: '05',
      title: 'Films, Music & Videography',
      subtitle: 'Your films, songs and interviews',
      icon: Film,
      isCompleted: Boolean(stats?.videographyCompleted)
    },
    {
      id: 6,
      num: '06',
      title: 'The Final Touches',
      subtitle: "Anything else you'd like to share",
      icon: Sparkles,
      isCompleted: Boolean(stats?.finalTouchesCompleted)
    }
  ]

  const additionalSections: OverviewSectionItem[] = [
    {
      id: 7,
      num: '07',
      title: 'Your Story',
      subtitle: 'Get to know the couple',
      icon: BookHeart,
      isCompleted: Boolean(stats?.storyCompleted)
    },
    {
      id: 8,
      num: '08',
      title: 'Special Considerations',
      subtitle: 'Important preferences for our team',
      icon: HeartHandshake,
      isCompleted: Boolean(stats?.specialCareCompleted)
    }
  ]

  const displaySections = showAdditionalSections
    ? [...coreSections, ...additionalSections]
    : coreSections

  return (
    <div className="max-w-3xl mx-auto py-2 space-y-6 text-left">
      {/* Overview Card Container */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-xs overflow-hidden">
        {/* Sections List */}
        <div className="divide-y divide-neutral-100">
          {displaySections.map((sec) => {
            const Icon = sec.icon
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectSection(sec.id)}
                className="w-full py-4.5 px-5 sm:px-8 flex items-center justify-between gap-4 text-left hover:bg-neutral-50/80 transition cursor-pointer group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 group-hover:bg-amber-500/15 group-hover:scale-105 transition">
                    <Icon className="w-5 h-5 stroke-[1.8]" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900 group-hover:text-amber-800 transition tracking-tight">
                      {sec.title}
                    </h3>
                    <p className="text-xs text-neutral-500 truncate">
                      {sec.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {sec.isCompleted ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Completed</span>
                    </span>
                  ) : (
                    <span className="text-xs font-mono font-medium text-neutral-400 group-hover:text-neutral-700 transition">
                      {sec.num}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-600 group-hover:translate-x-0.5 transition" />
                </div>
              </button>
            )
          })}
        </div>

        {/* If additional sections are hidden, show subtle invitation card to unlock */}
        {!showAdditionalSections && onUnlockAdditional && (
          <div className="p-4 sm:p-5 bg-neutral-50/60 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5 text-left">
              <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <BookHeart className="w-4 h-4 text-amber-600" />
                <span>Want to share your couple story &amp; special care?</span>
              </span>
              <p className="text-[11px] text-neutral-500">
                You can add your backstory and sensitive coverage preferences now or after the essentials.
              </p>
            </div>
            <button
              type="button"
              onClick={onUnlockAdditional}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 bg-white hover:bg-neutral-100 border border-neutral-200 px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0 shadow-2xs"
            >
              Add Your Story →
            </button>
          </div>
        )}

        {/* Bottom Card Footer */}
        <div className="p-4 sm:px-8 bg-neutral-50/40 border-t border-neutral-100 flex items-center justify-between gap-4">
          <span className="text-xs text-neutral-400 font-normal">
            Your progress is saved as you go.
          </span>
          <div className="flex items-center gap-2">
            {onSaveDraft && (
              <button
                type="button"
                onClick={onSaveDraft}
                className="bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 text-xs font-semibold px-4 py-2 rounded-xl shadow-2xs transition cursor-pointer"
              >
                Save Draft
              </button>
            )}
            <button
              type="button"
              onClick={onStartOrContinue}
              className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Continue Questionnaire</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
