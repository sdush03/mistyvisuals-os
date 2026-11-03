'use client'

import React from 'react'

export interface StoryAnswers {
  q1_how_we_met?: string
  q2_relationship_description?: string
  q3_special_memory?: string
  q4_three_defining_things?: string
  q5_additional_story?: string
}

interface SectionStoryProps {
  answers: StoryAnswers
  onChange: (answers: StoryAnswers) => void
}

export default function SectionStory({ answers, onChange }: SectionStoryProps) {
  const updateField = (field: keyof StoryAnswers, value: string) => {
    onChange({
      ...answers,
      [field]: value
    })
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 01 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Your Story
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;Let&apos;s get to know the two of you beyond the wedding celebrations.&rdquo;
        </p>
      </div>

      <div className="space-y-6 text-left">
        {/* Q1 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-800">
            Q1. How did you both meet?
          </label>
          <textarea
            rows={4}
            value={answers.q1_how_we_met || ''}
            onChange={(e) => updateField('q1_how_we_met', e.target.value)}
            placeholder="Tell us the story of how your paths first crossed..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q2 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-800">
            Q2. How would you describe your relationship in a few words?
          </label>
          <textarea
            rows={3}
            value={answers.q2_relationship_description || ''}
            onChange={(e) => updateField('q2_relationship_description', e.target.value)}
            placeholder="e.g. Best friends, grounded yet adventurous, full of laughter and deep conversations..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q3 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-800">
            Q3. Is there a special story, memory, or moment you&apos;d love us to capture?
          </label>
          <textarea
            rows={4}
            value={answers.q3_special_memory || ''}
            onChange={(e) => updateField('q3_special_memory', e.target.value)}
            placeholder="A proposal memory, a shared ritual, a surprise planned, or a personal detail..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q4 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-800">
            Q4. What are three things that define you as a couple?
          </label>
          <input
            type="text"
            value={answers.q4_three_defining_things || ''}
            onChange={(e) => updateField('q4_three_defining_things', e.target.value)}
            placeholder="e.g. Chai dates, travel lovers, goofy humor"
            className="w-full p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q5 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-neutral-800">
            Q5. Is there anything about your story that you would like us to know?
          </label>
          <textarea
            rows={3}
            value={answers.q5_additional_story || ''}
            onChange={(e) => updateField('q5_additional_story', e.target.value)}
            placeholder="Any other details, nicknames, inside jokes, or backstory you'd like to share..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>
      </div>
    </div>
  )
}
