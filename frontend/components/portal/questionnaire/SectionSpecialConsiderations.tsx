'use client'

import React, { useState } from 'react'
import { FamilyMemberItem } from './SectionFamilyTree'

export interface AvoidPersonItem {
  name: string
  family_member_id?: string
  note?: string
}

export interface SpecialConsiderationsAnswers {
  q28_restricted_rituals?: boolean
  q28_details?: string
  q29_discreet_moments?: string
  q30_avoid_filming?: boolean
  q30_people?: AvoidPersonItem[]
}

interface SectionSpecialConsiderationsProps {
  answers: SpecialConsiderationsAnswers
  familyMembers: FamilyMemberItem[]
  onChange: (answers: SpecialConsiderationsAnswers) => void
}

export default function SectionSpecialConsiderations({
  answers,
  familyMembers,
  onChange
}: SectionSpecialConsiderationsProps) {
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonNote, setNewPersonNote] = useState('')

  const updateField = (field: keyof SpecialConsiderationsAnswers, val: any) => {
    onChange({ ...answers, [field]: val })
  }

  const avoidPeople = answers.q30_people || []

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return
    updateField('q30_people', [
      ...avoidPeople,
      {
        name: newPersonName.trim(),
        note: newPersonNote.trim() || undefined
      }
    ])
    setNewPersonName('')
    setNewPersonNote('')
  }

  const handleToggleFamilyMember = (member: FamilyMemberItem) => {
    const exists = avoidPeople.find(p => p.family_member_id === member.id)
    if (exists) {
      updateField('q30_people', avoidPeople.filter(p => p.family_member_id !== member.id))
    } else {
      updateField('q30_people', [
        ...avoidPeople,
        {
          name: `${member.name} (${member.relationship})`,
          family_member_id: member.id
        }
      ])
    }
  }

  const removeAvoidPerson = (index: number) => {
    const list = avoidPeople.slice()
    list.splice(index, 1)
    updateField('q30_people', list)
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Special Considerations
        </h2>
        <p className="text-sm text-neutral-500">
          Help us understand anything that requires care, sensitivity or special attention from our team.
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q1 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q1. Are there any rituals where photography or videography is restricted?
          </label>
          <div className="flex items-center gap-3">
            {[
              { val: false, label: 'No restrictions' },
              { val: true, label: 'Yes, there are restrictions' }
            ].map(opt => {
              const selected = answers.q28_restricted_rituals === opt.val
              return (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => updateField('q28_restricted_rituals', opt.val)}
                  className={`px-4 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 ${
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

          {answers.q28_restricted_rituals && (
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-2 animate-fade-in">
              <label className="block text-xs font-bold text-amber-900">
                Please explain the restrictions & expectations:
              </label>
              <textarea
                rows={3}
                value={answers.q28_details || ''}
                onChange={e => updateField('q28_details', e.target.value)}
                placeholder="e.g. No cameras inside inner sanctum during pooja, maintain distance during specific sacred oaths, no flash..."
                className="w-full p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Q2 */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q2. Are there any moments where we should be especially discreet or avoid interfering?
          </label>
          <textarea
            rows={3}
            value={answers.q29_discreet_moments || ''}
            onChange={e => updateField('q29_discreet_moments', e.target.value)}
            placeholder="e.g. During emotional farewell / Vidaai, solemn religious verses, private family prayers before entry..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q3 */}
        <div className="space-y-4 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q3. Are there any guests or individuals who should not be photographed or filmed?
          </label>
          <div className="flex items-center gap-3">
            {[
              { val: false, label: 'No, all guests can be captured' },
              { val: true, label: 'Yes, some individuals prefer not to be filmed' }
            ].map(opt => {
              const selected = answers.q30_avoid_filming === opt.val
              return (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => updateField('q30_avoid_filming', opt.val)}
                  className={`px-4 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 ${
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

          {answers.q30_avoid_filming && (
            <div className="p-5 bg-neutral-50 rounded-3xl border border-neutral-200 space-y-4 animate-fade-in">
              {familyMembers.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                    Select from Family Tree:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {familyMembers.map(m => {
                      const isSelected = avoidPeople.some(p => p.family_member_id === m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleToggleFamilyMember(m)}
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

              {/* Add Custom Person */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider block">
                  Or specify other individual:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newPersonName}
                    onChange={e => setNewPersonName(e.target.value)}
                    placeholder="Guest name or role"
                    className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    value={newPersonNote}
                    onChange={e => setNewPersonNote(e.target.value)}
                    placeholder="Notes (e.g. camera shy, avoid closeups)"
                    className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPerson}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  + Add to List
                </button>
              </div>

              {/* Avoid List */}
              {avoidPeople.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">
                    Individuals to avoid filming ({avoidPeople.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {avoidPeople.map((p, idx) => (
                      <span
                        key={idx}
                        className="bg-white text-neutral-800 text-xs px-3 py-1.5 rounded-xl border border-neutral-200 flex items-center gap-2"
                      >
                        <span className="font-semibold">{p.name}</span>
                        {p.note && <span className="text-neutral-500">({p.note})</span>}
                        <button
                          type="button"
                          onClick={() => removeAvoidPerson(idx)}
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
          )}
        </div>
      </div>
    </div>
  )
}
