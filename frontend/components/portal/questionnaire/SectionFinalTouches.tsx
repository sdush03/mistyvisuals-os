'use client'

import React from 'react'

export interface FinalTouchesAnswers {
  q31_perfect_wedding?: string
  q32_additional_notes?: string
}

interface SectionFinalTouchesProps {
  answers: FinalTouchesAnswers
  onChange: (answers: FinalTouchesAnswers) => void
}

export default function SectionFinalTouches({ answers, onChange }: SectionFinalTouchesProps) {
  const updateField = (field: keyof FinalTouchesAnswers, val: string) => {
    onChange({ ...answers, [field]: val })
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 08 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          The Final Touches
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;Help us put the finishing touches on your wedding photography and cinema plan.&rdquo;
        </p>
      </div>

      <div className="space-y-6 text-left">
        {/* Q31 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-900">
            Q31. What would make you feel that Misty Visuals has captured your wedding perfectly?
          </label>
          <textarea
            rows={4}
            value={answers.q31_perfect_wedding || ''}
            onChange={e => updateField('q31_perfect_wedding', e.target.value)}
            placeholder="When you look back at your photos and film 10 years from now, what feeling or story do you hope shines through most?"
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q32 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q32. Is there anything else you&apos;d like to tell our team before the celebrations begin?
          </label>
          <textarea
            rows={4}
            value={answers.q32_additional_notes || ''}
            onChange={e => updateField('q32_additional_notes', e.target.value)}
            placeholder="Any special surprises, key family logistics, travel updates, or thoughts you'd like our team to know..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>
      </div>
    </div>
  )
}
