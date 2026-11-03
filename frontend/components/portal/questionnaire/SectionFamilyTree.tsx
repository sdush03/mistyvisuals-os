'use client'

import React, { useState } from 'react'
import ImageCropperModal, { SavedCroppedPerson } from './ImageCropperModal'

export interface FamilyMemberItem {
  id: string
  side: 'bride' | 'groom'
  name: string
  relationship: string
  custom_relationship?: string | null
  category: 'parents' | 'siblings' | 'grandparents' | 'extended' | 'friends' | 'other'
  priority: 'high' | 'medium' | 'low'
  is_remembering: boolean
  notes?: string | null
  parent_member_id?: string | null
  photo_url?: string | null
  storage_key?: string | null
  original_photo_url?: string | null
  original_storage_key?: string | null
  crop_data?: any
}

interface FamilySideStats {
  total: number
  with_photo: number
  high_priority: number
  medium_priority: number
  low_priority: number
  remembering_count: number
  missing_requirements: string[]
}

interface SectionFamilyTreeProps {
  slug: string
  familyMembers: FamilyMemberItem[]
  stats?: {
    bride: FamilySideStats
    groom: FamilySideStats
    allRequirementsMet: boolean
  }
  onAddMember: (member: Omit<FamilyMemberItem, 'id'>) => Promise<void>
  onUpdateMember: (id: string, updates: Partial<FamilyMemberItem>) => Promise<void>
  onDeleteMember: (id: string) => Promise<void>
}

export default function SectionFamilyTree({
  slug,
  familyMembers,
  stats,
  onAddMember,
  onUpdateMember,
  onDeleteMember
}: SectionFamilyTreeProps) {
  const [activeSide, setActiveSide] = useState<'bride' | 'groom'>('bride')
  const [showCropperModal, setShowCropperModal] = useState(false)
  const [cropperOriginalUrl, setCropperOriginalUrl] = useState<string | undefined>()
  const [cropperOriginalKey, setCropperOriginalKey] = useState<string | undefined>()

  // Quick manual add modal state
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualParentId, setManualParentId] = useState<string | null>(null)
  const [manualName, setManualName] = useState('')
  const [manualRelationship, setManualRelationship] = useState('')
  const [manualCategory, setManualCategory] = useState<FamilyMemberItem['category']>('parents')
  const [manualPriority, setManualPriority] = useState<FamilyMemberItem['priority']>('high')
  const [manualIsRemembering, setManualIsRemembering] = useState(false)
  const [manualNotes, setManualNotes] = useState('')
  const [savingManual, setSavingManual] = useState(false)
  const [manualError, setManualError] = useState('')

  // Edit member modal state
  const [editingMember, setEditingMember] = useState<FamilyMemberItem | null>(null)

  const sideMembers = familyMembers.filter(m => m.side === activeSide)
  const currentStats = activeSide === 'bride' ? stats?.bride : stats?.groom

  // Categorize members for tree rendering
  const parents = sideMembers.filter(m => m.category === 'parents')
  const siblings = sideMembers.filter(m => m.category === 'siblings')
  const grandparents = sideMembers.filter(m => m.category === 'grandparents')
  const extended = sideMembers.filter(m => m.category === 'extended')
  const friends = sideMembers.filter(m => m.category === 'friends')
  const others = sideMembers.filter(m => m.category === 'other')

  // Handle saving crop from cropper modal
  const handleSaveCroppedPerson = async (person: SavedCroppedPerson) => {
    await onAddMember({
      side: activeSide,
      name: person.name,
      relationship: person.relationship,
      custom_relationship: person.custom_relationship || null,
      category: person.category,
      priority: person.priority,
      is_remembering: person.is_remembering,
      notes: person.notes || null,
      parent_member_id: manualParentId || null,
      photo_url: person.photo_url,
      storage_key: person.storage_key,
      original_photo_url: person.original_photo_url,
      original_storage_key: person.original_storage_key,
      crop_data: person.crop_data
    })
  }

  // Open cropper with an existing group photo or clean upload
  const openCropperWithImage = (originalUrl?: string, originalKey?: string, parentId: string | null = null) => {
    setCropperOriginalUrl(originalUrl)
    setCropperOriginalKey(originalKey)
    setManualParentId(parentId)
    setShowCropperModal(true)
  }

  // Handle manual member creation
  const handleSaveManualMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim() || !manualRelationship.trim()) {
      setManualError('Please provide name and relationship')
      return
    }

    try {
      setSavingManual(true)
      setManualError('')
      await onAddMember({
        side: activeSide,
        name: manualName.trim(),
        relationship: manualRelationship.trim(),
        category: manualCategory,
        priority: manualPriority,
        is_remembering: manualIsRemembering,
        notes: manualNotes.trim() || null,
        parent_member_id: manualParentId || null
      })

      setShowManualModal(false)
      setManualName('')
      setManualRelationship('')
      setManualNotes('')
      setManualIsRemembering(false)
      setManualParentId(null)
    } catch (err: any) {
      setManualError(err.message || 'Failed to add member')
    } finally {
      setSavingManual(false)
    }
  }

  // Render individual member card
  const renderMemberCard = (member: FamilyMemberItem) => {
    const children = sideMembers.filter(m => m.parent_member_id === member.id)
    const isParent = member.category === 'parents'
    const missingPhoto = !member.photo_url && !member.is_remembering && isParent

    return (
      <div
        key={member.id}
        className={`p-4 rounded-2xl bg-white border transition shadow-xs relative space-y-3 ${
          missingPhoto
            ? 'border-amber-300 ring-2 ring-amber-200/50'
            : member.is_remembering
            ? 'border-neutral-200 bg-neutral-50/70'
            : 'border-neutral-200 hover:border-neutral-300'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar thumbnail with face-aware top positioning */}
          <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center">
            {member.photo_url ? (
              <img
                src={member.photo_url}
                alt={member.name}
                className="w-full h-full object-cover object-top"
              />
            ) : member.is_remembering ? (
              <span className="text-xl">🕊️</span>
            ) : (
              <span className="text-xl text-neutral-400">👤</span>
            )}

            {/* Remembering ribbon or photo needed badge */}
            {member.is_remembering && (
              <span className="absolute bottom-0 inset-x-0 bg-neutral-900/80 text-white text-[8px] font-bold text-center py-0.5 uppercase tracking-wider">
                Remembering
              </span>
            )}
            {missingPhoto && (
              <span className="absolute bottom-0 inset-x-0 bg-amber-600 text-white text-[7px] font-bold text-center py-0.5 uppercase tracking-wider">
                Photo Needed
              </span>
            )}
          </div>

          {/* Member Details */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-neutral-900 truncate">
                {member.name}
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                member.priority === 'high'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : member.priority === 'medium'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-neutral-100 text-neutral-600'
              }`}>
                {member.priority}
              </span>
            </div>

            <div className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5 flex-wrap">
              <span>{member.relationship}</span>
              {member.custom_relationship && (
                <span className="text-neutral-400">({member.custom_relationship})</span>
              )}
            </div>

            {member.notes && (
              <p className="text-[11px] text-neutral-500 italic line-clamp-2 pt-0.5">
                &ldquo;{member.notes}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            {!member.photo_url && !member.is_remembering && (
              <button
                type="button"
                onClick={() => openCropperWithImage(undefined, undefined, member.id)}
                className="text-[10px] font-bold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                📸 Add Photo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setManualParentId(member.id)
                setManualCategory('extended')
                setManualRelationship('Cousin')
                setShowManualModal(true)
              }}
              className="text-[10px] font-medium text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
              title="Add family member under this relative (e.g. spouse or child)"
            >
              + Add Relative Under
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDeleteMember(member.id)}
            className="text-[11px] text-neutral-400 hover:text-rose-600 p-1 transition cursor-pointer"
            title="Remove person"
          >
            🗑️
          </button>
        </div>

        {/* Nested Relative Hierarchy (e.g. spouse, child) */}
        {children.length > 0 && (
          <div className="pl-4 border-l-2 border-neutral-200 space-y-2 mt-2 pt-2">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
              Family under {member.name}:
            </span>
            {children.map(c => renderMemberCard(c))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 04 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Family Tree & Important People
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;Let&apos;s introduce the people who make your wedding special.&rdquo;
        </p>
      </div>

      {/* Bride / Groom Side Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-100/70 p-2 rounded-3xl border border-neutral-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSide('bride')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeSide === 'bride'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>👰 Bride&apos;s Side</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-full font-mono">
              {familyMembers.filter(m => m.side === 'bride').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSide('groom')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeSide === 'groom'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>🤵 Groom&apos;s Side</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-full font-mono">
              {familyMembers.filter(m => m.side === 'groom').length}
            </span>
          </button>
        </div>

        {/* Upload Group Photo & Multi-Crop Trigger */}
        <div className="flex items-center gap-2 pr-1">
          <button
            type="button"
            onClick={() => openCropperWithImage()}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <span>📸</span> Upload Group Photo & Crop
          </button>
          <button
            type="button"
            onClick={() => {
              setManualParentId(null)
              setShowManualModal(true)
            }}
            className="bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200 font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            + Add Person
          </button>
        </div>
      </div>

      {/* Side Completion & Overview Summary Banner */}
      {currentStats && (
        <div className="p-5 rounded-3xl bg-neutral-50/80 border border-neutral-200 text-left space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                {activeSide === 'bride' ? "Bride's Side" : "Groom's Side"} Overview
              </h3>
              <div className="text-xs text-neutral-500 mt-0.5">
                {currentStats.total} people added · {currentStats.with_photo} with photo
                {currentStats.remembering_count > 0 && ` · ${currentStats.remembering_count} remembered`}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-bold">
              <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                High: {currentStats.high_priority}
              </span>
              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                Medium: {currentStats.medium_priority}
              </span>
              <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 px-2 py-0.5 rounded-full">
                Low: {currentStats.low_priority}
              </span>
            </div>
          </div>

          {/* Mandatory Parent Requirements Warning */}
          {currentStats.missing_requirements.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-900 space-y-1">
              <span className="font-bold block">⚠️ Mandatory Parent Requirements for Completion:</span>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {currentStats.missing_requirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-700 italic pt-1">
                Note: You can save drafts anytime. Both parents&apos; profiles and photos (or remembering someone status) are required before final questionnaire completion.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Family Tree Categories List */}
      <div className="space-y-6 text-left">
        {/* 1. PARENTS (Mandatory Section) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>👑</span> Parents <span className="text-[10px] text-rose-600 uppercase tracking-wider font-extrabold">(Mandatory)</span>
            </h3>
            <span className="text-xs text-neutral-400 font-medium">Mother & Father</span>
          </div>

          {parents.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-2xl border border-neutral-200 space-y-2">
              <p className="text-xs text-neutral-500">No parent profiles added yet.</p>
              <button
                type="button"
                onClick={() => {
                  setManualCategory('parents')
                  setManualRelationship('Father')
                  setShowManualModal(true)
                }}
                className="text-xs font-bold text-neutral-900 underline hover:text-black cursor-pointer"
              >
                + Add Parents for {activeSide === 'bride' ? "Bride" : "Groom"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {parents.map(p => renderMemberCard(p))}
            </div>
          )}
        </div>

        {/* 2. SIBLINGS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>🌟</span> Siblings
            </h3>
            <span className="text-xs text-neutral-400 font-medium">Brothers, Sisters, Bhabhi, Jiju</span>
          </div>

          {siblings.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No siblings added yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {siblings.map(s => renderMemberCard(s))}
            </div>
          )}
        </div>

        {/* 3. GRANDPARENTS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>👵</span> Grandparents
            </h3>
            <span className="text-xs text-neutral-400 font-medium">Dada, Dadi, Nana, Nani</span>
          </div>

          {grandparents.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No grandparents added yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grandparents.map(g => renderMemberCard(g))}
            </div>
          )}
        </div>

        {/* 4. EXTENDED FAMILY */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>🌿</span> Extended Family
            </h3>
            <span className="text-xs text-neutral-400 font-medium">Chacha, Mama, Bua, Mausi, Cousins</span>
          </div>

          {extended.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No extended family added yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {extended.filter(m => !m.parent_member_id).map(e => renderMemberCard(e))}
            </div>
          )}
        </div>

        {/* 5. FRIENDS & IMPORTANT PEOPLE */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>🎉</span> Friends & Important People
            </h3>
            <span className="text-xs text-neutral-400 font-medium">Close friends, bridal party, best friends</span>
          </div>

          {friends.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No friends added yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {friends.map(f => renderMemberCard(f))}
            </div>
          )}
        </div>

        {/* 6. OTHER */}
        {others.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <span>✨</span> Other Relatives & Guests
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {others.map(o => renderMemberCard(o))}
            </div>
          </div>
        )}
      </div>

      {/* Group Image Cropper Modal */}
      {showCropperModal && (
        <ImageCropperModal
          slug={slug}
          side={activeSide}
          initialImageUrl={cropperOriginalUrl}
          initialStorageKey={cropperOriginalKey}
          onSavePerson={handleSaveCroppedPerson}
          onClose={() => setShowCropperModal(false)}
        />
      )}

      {/* Manual Add Person Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-neutral-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-left my-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-neutral-900">
                Add Person to {activeSide === 'bride' ? "Bride's" : "Groom's"} Side
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManualMember} className="space-y-4">
              {manualError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
                  {manualError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-700">Full Name *</label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Sunita Devi"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-700">Category</label>
                  <select
                    value={manualCategory}
                    onChange={e => {
                      const cat = e.target.value as any
                      setManualCategory(cat)
                      if (cat === 'parents' || cat === 'siblings' || cat === 'grandparents') {
                        setManualPriority('high')
                      } else if (cat === 'friends') {
                        setManualPriority('low')
                      } else {
                        setManualPriority('medium')
                      }
                    }}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium"
                  >
                    <option value="parents">Parents</option>
                    <option value="siblings">Siblings</option>
                    <option value="grandparents">Grandparents</option>
                    <option value="extended">Extended Family</option>
                    <option value="friends">Friends</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-neutral-700">Relationship *</label>
                  <input
                    type="text"
                    required
                    value={manualRelationship}
                    onChange={e => setManualRelationship(e.target.value)}
                    placeholder="e.g. Mother, Brother, Mausa"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-700">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setManualPriority(p)}
                      className={`py-1.5 rounded-xl border text-xs font-bold uppercase transition ${
                        manualPriority === p
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span>🕊️</span> Remembering someone
                  </span>
                  <input
                    type="checkbox"
                    checked={manualIsRemembering}
                    onChange={e => setManualIsRemembering(e.target.checked)}
                    className="w-4 h-4 rounded text-neutral-900 accent-neutral-900"
                  />
                </label>
                <p className="text-[10px] text-neutral-500">
                  Check if this person is no longer with us.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-700">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={e => setManualNotes(e.target.value)}
                  placeholder="e.g. VIP guest, traveling from abroad"
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="flex-1 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl text-xs transition"
                >
                  {savingManual ? 'Saving...' : 'Add Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
