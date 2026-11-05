'use client'

import React, { useState } from 'react'
import { FamilyMemberItem } from './SectionFamilyTree'
import { Music } from 'lucide-react'

export interface MusicReferenceItem {
  id: string
  url: string
  reference_type: 'exact_song' | 'inspiration'
  deliverable_ids: string[]
  deliverable_names: string[]
  notes?: string
}

export interface VideoDeliverableItem {
  id: string
  title: string
  type?: string
  status?: string
}

export interface InterviewSelectionItem {
  type: 'predefined' | 'family_member' | 'group' | 'custom'
  name: string
  relationship?: string
  family_member_id?: string
  notes?: string
}

export interface VideographyAnswers {
  q16_film_styles?: string[]
  q16_other?: string
  q17_overall_feel?: string[]
  q17_other?: string
  q18_focus_moments?: string[]
  q18_other?: string
  q19_references?: Array<{ id: string; url: string; note?: string }>
  q20_disliked_styles?: string
  q21_music_genres?: string[]
  q21_other?: string
  q22_music_selector?: 'editor_selected' | 'couple_selected'
  q24_couple_chemistry?: string
  q25_couple_interview?: string
  q26_interview_selections?: InterviewSelectionItem[]
  q27_interview_topics?: string
}

interface SectionVideographyProps {
  answers: VideographyAnswers
  deliverables: VideoDeliverableItem[]
  musicReferences: MusicReferenceItem[]
  familyMembers: FamilyMemberItem[]
  onChange: (answers: VideographyAnswers) => void
  onAddMusicReference: (ref: Omit<MusicReferenceItem, 'id'>) => Promise<void>
  onDeleteMusicReference: (id: string) => Promise<void>
}

export default function SectionVideography({
  answers,
  deliverables,
  musicReferences,
  familyMembers,
  onChange,
  onAddMusicReference,
  onDeleteMusicReference
}: SectionVideographyProps) {
  // New Music reference form state
  const [newMusicUrl, setNewMusicUrl] = useState('')
  const [newMusicType, setNewMusicType] = useState<'exact_song' | 'inspiration'>('exact_song')
  const [newMusicDeliverable, setNewMusicDeliverable] = useState('')
  const [newMusicNotes, setNewMusicNotes] = useState('')
  const [savingMusic, setSavingMusic] = useState(false)
  const [musicError, setMusicError] = useState('')

  // New Video reference link form state
  const [newVideoUrl, setNewVideoUrl] = useState('')
  const [newVideoNote, setNewVideoNote] = useState('')

  // Custom interview person state
  const [customIntervieweeName, setCustomIntervieweeName] = useState('')
  const [customIntervieweeRel, setCustomIntervieweeRel] = useState('')
  const [customIntervieweeNote, setCustomIntervieweeNote] = useState('')

  const toggleArrayItem = (field: keyof VideographyAnswers, item: string) => {
    const list = ((answers[field] as string[]) || []).slice()
    const index = list.indexOf(item)
    if (index >= 0) list.splice(index, 1)
    else list.push(item)
    onChange({ ...answers, [field]: list })
  }

  const updateField = (field: keyof VideographyAnswers, val: any) => {
    onChange({ ...answers, [field]: val })
  }

  // Pre-wedding shoot special deliverable item
  const allDeliverableOptions = [
    ...deliverables.map(d => ({ id: d.id, title: d.title })),
    { id: 'pre_wedding', title: 'Pre-Wedding Couple Shoot' }
  ]

  const handleAddMusicRef = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMusicUrl.trim()) return

    const deliverableText = newMusicDeliverable.trim()
    const matchingDeliverable = allDeliverableOptions.find(
      d => d.title.toLowerCase() === deliverableText.toLowerCase()
    )

    try {
      setSavingMusic(true)
      setMusicError('')
      await onAddMusicReference({
        url: newMusicUrl.trim(),
        reference_type: newMusicType,
        deliverable_ids: matchingDeliverable ? [matchingDeliverable.id] : [],
        deliverable_names: deliverableText ? [deliverableText] : [],
        notes: newMusicNotes.trim() || undefined
      })

      setNewMusicUrl('')
      setNewMusicDeliverable('')
      setNewMusicNotes('')
    } catch (err: any) {
      setMusicError(err.message || 'Failed to save music reference')
    } finally {
      setSavingMusic(false)
    }
  }

  const handleAddVideoRef = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVideoUrl.trim()) return

    const current = answers.q19_references || []
    const updated = [
      ...current,
      {
        id: `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: newVideoUrl.trim(),
        note: newVideoNote.trim() || undefined
      }
    ]
    updateField('q19_references', updated)
    setNewVideoUrl('')
    setNewVideoNote('')
  }

  const removeVideoRef = (id: string) => {
    const list = (answers.q19_references || []).filter(r => r.id !== id)
    updateField('q19_references', list)
  }

  // Interview toggles
  const interviewSelections = answers.q26_interview_selections || []

  const togglePredefinedInterviewee = (name: string) => {
    const exists = interviewSelections.find(i => i.name === name)
    if (exists) {
      updateField('q26_interview_selections', interviewSelections.filter(i => i.name !== name))
    } else {
      updateField('q26_interview_selections', [
        ...interviewSelections,
        { type: 'predefined', name }
      ])
    }
  }

  const toggleFamilyMemberInterview = (member: FamilyMemberItem) => {
    const exists = interviewSelections.find(i => i.family_member_id === member.id)
    if (exists) {
      updateField('q26_interview_selections', interviewSelections.filter(i => i.family_member_id !== member.id))
    } else {
      updateField('q26_interview_selections', [
        ...interviewSelections,
        {
          type: 'family_member',
          name: member.name,
          relationship: member.relationship,
          family_member_id: member.id
        }
      ])
    }
  }

  const handleAddCustomInterviewee = () => {
    if (!customIntervieweeName.trim()) return
    updateField('q26_interview_selections', [
      ...interviewSelections,
      {
        type: 'custom',
        name: customIntervieweeName.trim(),
        relationship: customIntervieweeRel.trim() || undefined,
        notes: customIntervieweeNote.trim() || undefined
      }
    ])
    setCustomIntervieweeName('')
    setCustomIntervieweeRel('')
    setCustomIntervieweeNote('')
  }

  const removeInterviewee = (index: number) => {
    const updated = interviewSelections.slice()
    updated.splice(index, 1)
    updateField('q26_interview_selections', updated)
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Films, Music & Videography
        </h2>
        <p className="text-sm text-neutral-500">
          Your wedding film should feel like your story. Tell us what kind of film you&apos;d love to watch years from now.
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q1: Film Styles & Overall Feel */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q1. What kind of wedding films and overall feel do you connect with the most?
          </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                'Emotional, heartwarming & cinematic',
                'Fun, energetic & high-spirited',
                'Documentary, candid & natural',
                'Romantic, intimate & dreamy',
                'Grand, royal & dramatic',
                'Storytelling & speech-driven',
                'A balanced combination of moods',
                'Other'
              ].map(style => {
                const selected = (answers.q16_film_styles || []).includes(style) || (answers.q17_overall_feel || []).includes(style)
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      toggleArrayItem('q16_film_styles', style)
                      toggleArrayItem('q17_overall_feel', style)
                    }}
                    className={`px-3.5 py-2.5 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                      selected
                        ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                        : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                    }`}
                  >
                    <span className="text-xs">{style}</span>
                    {selected ? (
                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
            {((answers.q16_film_styles || []).includes('Other') || (answers.q17_overall_feel || []).includes('Other')) && (
              <input
                type="text"
                value={answers.q16_other || answers.q17_other || ''}
                onChange={e => {
                  updateField('q16_other', e.target.value)
                  updateField('q17_other', e.target.value)
                }}
                placeholder="Specify your wedding film style and feel..."
                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
              />
            )}
          </div>

        {/* Q2: Focus Moments */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q2. What moments would you most like your wedding film to focus on?
          </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                'The couple\'s story and chemistry',
                'Family emotions and relationships',
                'Wedding rituals and traditions',
                'Friends, dance and celebrations',
                'Behind-the-scenes moments',
                'Decor, outfits and details',
                'Speeches and conversations',
                'The overall atmosphere of the celebrations',
                'Other'
              ].map(moment => {
                const selected = (answers.q18_focus_moments || []).includes(moment)
                return (
                  <button
                    key={moment}
                    type="button"
                    onClick={() => toggleArrayItem('q18_focus_moments', moment)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                      selected
                        ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                        : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                    }`}
                  >
                    <span className="text-xs">{moment}</span>
                    {selected ? (
                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
            {(answers.q18_focus_moments || []).includes('Other') && (
              <input
                type="text"
                value={answers.q18_other || ''}
                onChange={e => updateField('q18_other', e.target.value)}
                placeholder="Specify other moments to focus on..."
                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
              />
            )}
          </div>

        {/* Q3: Video References */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q3. Are there any film styles, wedding films or video references that inspire you?
          </label>

            <form onSubmit={handleAddVideoRef} className="flex gap-2">
              <input
                type="url"
                value={newVideoUrl}
                onChange={e => setNewVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or Instagram reel"
                className="flex-1 p-3 bg-white border border-neutral-200 rounded-xl text-xs"
              />
              <input
                type="text"
                value={newVideoNote}
                onChange={e => setNewVideoNote(e.target.value)}
                placeholder="Note (e.g. fast paced edit)"
                className="w-1/3 p-3 bg-white border border-neutral-200 rounded-xl text-xs"
              />
              <button
                type="submit"
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 rounded-xl transition cursor-pointer"
              >
                + Add
              </button>
            </form>

            {(answers.q19_references || []).length > 0 && (
              <div className="space-y-2 pt-1">
                {(answers.q19_references || []).map(r => (
                  <div key={r.id} className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="truncate">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">
                        {r.url}
                      </a>
                      {r.note && <span className="text-neutral-500 ml-2">({r.note})</span>}
                    </div>
                    <button type="button" onClick={() => removeVideoRef(r.id)} className="text-neutral-400 hover:text-rose-600 p-1">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Q4 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q4. Are there any videography styles or editing treatments you dislike?
          </label>
          <textarea
            rows={3}
            value={answers.q20_disliked_styles || ''}
            onChange={e => updateField('q20_disliked_styles', e.target.value)}
            placeholder="e.g. Overly slow motion, cheesy transitions, shaky handheld camera, heavy artificial sound effects..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q5 */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q5. What kind of music do you generally enjoy?
          </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                'Bollywood romantic',
                'Bollywood upbeat / dance',
                'Punjabi music',
                'Sufi',
                'Classical Indian',
                'Instrumental',
                'Indie / acoustic',
                'English romantic',
                'Western pop',
                'Electronic / contemporary',
                'Regional or folk music',
                'Other'
              ].map(genre => {
                const selected = (answers.q21_music_genres || []).includes(genre)
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleArrayItem('q21_music_genres', genre)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                      selected
                        ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                        : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                    }`}
                  >
                    <span className="truncate text-xs">{genre}</span>
                    {selected ? (
                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
            {(answers.q21_music_genres || []).includes('Other') && (
              <input
                type="text"
                value={answers.q21_other || ''}
                onChange={e => updateField('q21_other', e.target.value)}
                placeholder="Specify your favorite music genres..."
                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
              />
            )}
          </div>

        {/* Q6 */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q6. Who would you prefer to select the music for your wedding films?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { val: 'editor_selected', label: 'Editor-selected music' },
              { val: 'couple_selected', label: 'Our selected music' }
            ].map(opt => {
              const selected = answers.q22_music_selector === opt.val
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateField('q22_music_selector', opt.val as any)}
                  className={`px-4 py-3 rounded-xl transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                      : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                  }`}
                >
                  <span className="text-xs">{opt.label}</span>
                  {selected ? (
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Q7 */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q7. Share your music references
          </label>
          <p className="text-xs text-neutral-500">
            Paste YouTube or Spotify music links with notes and deliverable details.
          </p>

          {musicError && (
            <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {musicError}
            </div>
          )}

          <form onSubmit={handleAddMusicRef} className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="url"
                required
                value={newMusicUrl}
                onChange={e => setNewMusicUrl(e.target.value)}
                placeholder="Paste YouTube, Spotify, or music link..."
                className="sm:col-span-7 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
              />
              <input
                type="text"
                list="deliverable-suggestions"
                value={newMusicDeliverable}
                onChange={e => setNewMusicDeliverable(e.target.value)}
                placeholder="Deliverable (e.g. Teaser, Reel, Full Film)"
                className="sm:col-span-5 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
              />
              <datalist id="deliverable-suggestions">
                {allDeliverableOptions.map(d => (
                  <option key={d.id} value={d.title} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={newMusicType}
                onChange={e => setNewMusicType(e.target.value as any)}
                className="sm:col-span-4 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400 cursor-pointer"
              >
                <option value="exact_song">Exact song selection</option>
                <option value="inspiration">Music inspiration</option>
              </select>

              <input
                type="text"
                value={newMusicNotes}
                onChange={e => setNewMusicNotes(e.target.value)}
                placeholder="Note (e.g. bride entry, haldi dance)"
                className="sm:col-span-6 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
              />

              <button
                type="submit"
                disabled={savingMusic}
                className="sm:col-span-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                {savingMusic ? 'Adding...' : '+ Add'}
              </button>
            </div>
          </form>

          {/* List of Saved Music References */}
          {musicReferences.length > 0 && (
            <div className="space-y-2 pt-1">
              {musicReferences.map(m => (
                <div
                  key={m.id}
                  className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between text-xs gap-3 shadow-2xs"
                >
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-neutral-900 hover:underline truncate max-w-xs sm:max-w-sm flex items-center gap-1.5"
                    >
                      <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">{m.url}</span>
                    </a>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-700 shrink-0">
                      {m.reference_type === 'exact_song' ? 'Exact Song' : 'Inspiration'}
                    </span>
                    {m.deliverable_names && m.deliverable_names.length > 0 && (
                      <span className="text-[11px] text-neutral-500">
                        for <span className="font-medium text-neutral-700">{m.deliverable_names.join(', ')}</span>
                      </span>
                    )}
                    {m.notes && <span className="text-[11px] text-neutral-400 italic">({m.notes})</span>}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteMusicReference(m.id)}
                    className="text-neutral-400 hover:text-rose-600 p-1 transition cursor-pointer shrink-0"
                    title="Delete reference"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Q8 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
              Q8. Would you be comfortable participating in a couple interview or sharing short personal bites for your wedding film?
            </label>
            <p className="text-xs text-neutral-500">
              We may ask about how you met, your first impressions, funny stories, and what marriage means to you.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {[
                'Yes, we\'d love to.',
                'Yes, but only with a few simple questions.',
                'Maybe, depending on the questions.',
                'We\'d prefer not to.'
              ].map(opt => {
                const selected = answers.q25_couple_interview === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField('q25_couple_interview', opt)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                      selected
                        ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                        : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                    }`}
                  >
                    <span className="text-xs">{opt}</span>
                    {selected ? (
                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

        {/* Q9 */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
              Q9. Would you like us to interview or capture short bites from particular family members or friends?
            </label>
            <p className="text-xs text-neutral-500">
              Select key family roles, pick from your Family Tree, or add custom names below.
            </p>

            {/* Quick General Role Toggles */}
            <div className="flex flex-wrap gap-2">
              {[
                "Bride's mother",
                "Bride's father",
                "Groom's mother",
                "Groom's father",
                "Bride's siblings",
                "Groom's siblings",
                "Grandparents",
                "Other relatives",
                "Bride's friends (as a group)",
                "Groom's friends (as a group)",
                "Close friends from both sides"
              ].map(role => {
                const isSelected = interviewSelections.some(i => i.name === role)
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => togglePredefinedInterviewee(role)}
                    className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                        : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                    }`}
                  >
                    <span>{role}</span>
                    {isSelected && <span className="font-bold">✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Family Tree Quick Picker */}
            {familyMembers.length > 0 && (
              <div className="p-4 bg-neutral-50/80 rounded-2xl border border-neutral-200 space-y-2">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                  Select Specific People from Your Family Tree:
                </span>
                <div className="flex flex-wrap gap-2">
                  {familyMembers.filter(m => !m.is_remembering).map(m => {
                    const isSelected = interviewSelections.some(i => i.family_member_id === m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleFamilyMemberInterview(m)}
                        className={`px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-bold shadow-2xs'
                            : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 font-medium'
                        }`}
                      >
                        <span>{m.name} ({m.relationship})</span>
                        {isSelected && <span className="font-bold">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Add Custom Person for Interview */}
            <div className="p-4 bg-white rounded-2xl border border-neutral-200 space-y-3">
              <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                + Add Custom Person / Group for Interview
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={customIntervieweeName}
                  onChange={e => setCustomIntervieweeName(e.target.value)}
                  placeholder="Name or group label"
                  className="p-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={customIntervieweeRel}
                  onChange={e => setCustomIntervieweeRel(e.target.value)}
                  placeholder="Relationship (e.g. Best Friend)"
                  className="p-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={customIntervieweeNote}
                  onChange={e => setCustomIntervieweeNote(e.target.value)}
                  placeholder="Notes (e.g. college stories)"
                  className="p-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomInterviewee}
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                + Add Interviewee
              </button>
            </div>

            {/* Selected Interviewees List */}
            {interviewSelections.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">
                  Confirmed Interview Selections ({interviewSelections.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {interviewSelections.map((sel, idx) => (
                    <span
                      key={idx}
                      className="bg-neutral-100 text-neutral-800 text-xs px-3 py-1.5 rounded-xl border border-neutral-200 flex items-center gap-2"
                    >
                      <span className="font-semibold">{sel.name}</span>
                      {sel.relationship && <span className="text-neutral-500">({sel.relationship})</span>}
                      <button
                        type="button"
                        onClick={() => removeInterviewee(idx)}
                        className="text-neutral-400 hover:text-rose-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

        {/* Q10 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q10. Any specific questions, memories or topics you&apos;d like us to cover in these interviews?
          </label>
          <textarea
            rows={3}
            value={answers.q27_interview_topics || ''}
            onChange={e => updateField('q27_interview_topics', e.target.value)}
            placeholder="e.g. Ask childhood friends about our Goa trip, ask grandparents for marriage blessings and funny advice..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>
      </div>
    </div>
  )
}
