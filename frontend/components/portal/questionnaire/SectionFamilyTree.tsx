'use client'

import React, { useState, useRef, useEffect } from 'react'
import ImageCropperModal, { SavedCroppedPerson } from './ImageCropperModal'
import { uploadMediaToR2 } from '@/lib/r2Upload'
import {
  User,
  Users,
  Camera,
  Heart,
  Trash2,
  Plus,
  X,
  AlertCircle,
  Check,
  Pencil,
  Crop,
  ChevronDown
} from 'lucide-react'

function normalizeMediaUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }
  return `https://${trimmed}`
}

export interface FamilyGroupItem {
  id: string
  project_id?: string
  side: 'bride' | 'groom'
  name: string
  relationship: string
  custom_relationship?: string | null
  priority?: 'high' | 'medium' | 'low'
  notes?: string | null
  order_index?: number
  created_at?: string
  updated_at?: string
}

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
  family_group_id?: string | null
  role_in_family?: 'head' | 'spouse' | 'child' | null
  photo_url?: string | null
  storage_key?: string | null
  original_photo_url?: string | null
  original_storage_key?: string | null
  crop_data?: any
}

export interface CoupleInfo {
  bride?: { name: string; photo_url: string | null }
  groom?: { name: string; photo_url: string | null }
}

interface FamilySideStats {
  total: number
  with_photo: number
  high_priority: number
  medium_priority: number
  low_priority: number
  remembering_count: number
  has_father?: boolean
  has_mother?: boolean
  father_has_photo?: boolean
  mother_has_photo?: boolean
  missing_requirements: string[]
}

interface SectionFamilyTreeProps {
  slug: string
  familyMembers: FamilyMemberItem[]
  familyGroups?: FamilyGroupItem[]
  couple?: CoupleInfo | null
  stats?: {
    bride: FamilySideStats
    groom: FamilySideStats
    allRequirementsMet: boolean
  }
  onAddMember: (member: Omit<FamilyMemberItem, 'id'>) => Promise<void>
  onUpdateMember: (id: string, updates: Partial<FamilyMemberItem>) => Promise<void>
  onDeleteMember: (id: string) => Promise<void>
  onAddFamilyGroup?: (group: Omit<FamilyGroupItem, 'id'>) => Promise<any>
  onUpdateFamilyGroup?: (id: string, updates: Partial<FamilyGroupItem>) => Promise<void>
  onDeleteFamilyGroup?: (id: string) => Promise<void>
  onUpdateCouplePhoto?: (role: 'bride' | 'groom', name: string, photo_url: string, storage_key?: string) => Promise<void>
}

interface PersonDialogState {
  mode: 'add' | 'edit'
  memberId?: string
  side: 'bride' | 'groom'
  category: FamilyMemberItem['category']
  relationship: string
  suggestedRoles: string[]
  title: string
  name: string
  priority?: 'high' | 'medium' | 'low'
  notes?: string
  photo_url?: string | null
  storage_key?: string | null
  original_photo_url?: string | null
  original_storage_key?: string | null
  crop_data?: any
  is_remembering: boolean
  family_group_id?: string | null
  role_in_family?: 'head' | 'spouse' | 'child' | null
}

interface FamilyGroupDialogState {
  isOpen: boolean
  mode: 'add' | 'edit'
  groupId?: string
  side: 'bride' | 'groom'
  relationship: string
  custom_relationship?: string
}

const FAMILY_RELATIONSHIP_PRESETS = [
  { label: 'Dada & Dadi', desc: 'Paternal Grandparents' },
  { label: 'Nana & Nani', desc: 'Maternal Grandparents' },
  { label: 'Chacha & Chachi', desc: 'Paternal Uncle & Aunt' },
  { label: 'Mama & Mami', desc: 'Maternal Uncle & Aunt' },
  { label: 'Bua & Fufa', desc: 'Paternal Aunt & Uncle' },
  { label: 'Mausi & Mausa', desc: 'Maternal Aunt & Uncle' },
  { label: 'Tauji & Taiji', desc: 'Elder Paternal Uncle & Aunt' },
  { label: 'Custom...', desc: 'Custom relationship couple' }
]

function getFamilyParentRoles(relationship: string): [string, string] {
  const rel = (relationship || '').toLowerCase().trim()
  if (rel.includes('dada') || rel.includes('dadi')) return ['Dada', 'Dadi']
  if (rel.includes('nana') || rel.includes('nani')) return ['Nana', 'Nani']
  if (rel.includes('chacha') || rel.includes('chachi')) return ['Chacha', 'Chachi']
  if (rel.includes('mama') || rel.includes('mami')) return ['Mama', 'Mami']
  if (rel.includes('bua') || rel.includes('fufa')) return ['Bua', 'Fufa']
  if (rel.includes('mausi') || rel.includes('mausa')) return ['Mausi', 'Mausa']
  if (rel.includes('tauji') || rel.includes('taiji')) return ['Tauji', 'Taiji']
  if (rel.includes('&')) {
    const parts = relationship.split('&').map(s => s.trim())
    if (parts.length === 2 && parts[0] && parts[1]) return [parts[0], parts[1]]
  }
  return ['Parent 1', 'Parent 2']
}

const SMART_RELATIONSHIP_POOL = [
  'Dada',
  'Dadi',
  'Nana',
  'Nani',
  'Chacha',
  'Chachi',
  'Mama',
  'Mami',
  'Bua',
  'Fufa',
  'Mausi',
  'Mausa',
  'Tauji',
  'Taiji',
  'Cousin',
  'Brother',
  'Sister',
  'Bhabhi',
  'Jiju',
  'Uncle',
  'Aunt',
  'Bhatija (Nephew)',
  'Bhatiji (Niece)',
  'Bhanja (Nephew)',
  'Bhanji (Niece)',
  'Cousin Brother',
  'Cousin Sister',
  'Bridesmaid',
  'Groomsman',
  'Best Friend',
  'Childhood Friend',
  'College Friend',
  'School Friend',
  'Family Friend',
  'Colleague'
]

export default function SectionFamilyTree({
  slug,
  familyMembers,
  familyGroups = [],
  couple,
  stats,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onAddFamilyGroup,
  onUpdateFamilyGroup,
  onDeleteFamilyGroup,
  onUpdateCouplePhoto
}: SectionFamilyTreeProps) {
  // Shared hidden file input ref for triggering device file picker
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cropper Modal state
  const [showCropperModal, setShowCropperModal] = useState(false)
  const [cropperInitialUrl, setCropperInitialUrl] = useState<string | undefined>()
  const [cropperInitialKey, setCropperInitialKey] = useState<string | undefined>()
  const [cropperTargetPerson, setCropperTargetPerson] = useState<any>(null)

  // Couple photo upload state (Bride or Groom)
  const [coupleUploadRole, setCoupleUploadRole] = useState<'bride' | 'groom' | null>(null)

  // Unified Person Dialog Modal State (for Parents, Siblings, Relatives, Friends)
  const [personDialog, setPersonDialog] = useState<PersonDialogState | null>(null)
  const [savingPerson, setSavingPerson] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [uploadingDialogPhoto, setUploadingDialogPhoto] = useState(false)

  // Family Group Dialog state (Extended Family Units)
  const [familyGroupDialog, setFamilyGroupDialog] = useState<FamilyGroupDialogState>({
    isOpen: false,
    mode: 'add',
    side: 'groom',
    relationship: 'Chacha & Chachi',
    custom_relationship: ''
  })
  const [savingFamilyGroup, setSavingFamilyGroup] = useState(false)
  const [familyGroupDialogError, setFamilyGroupDialogError] = useState('')

  // Editable relationship smart search dropdown state (Combobox)
  const [relationshipDropdownOpen, setRelationshipDropdownOpen] = useState(false)
  const [relationshipSearchQuery, setRelationshipSearchQuery] = useState('')
  const relationshipContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        relationshipContainerRef.current &&
        !relationshipContainerRef.current.contains(e.target as Node)
      ) {
        setRelationshipDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setRelationshipDropdownOpen(false)
    setRelationshipSearchQuery('')
  }, [personDialog])

  // Find fixed parent slots
  const findParent = (side: 'bride' | 'groom', role: 'father' | 'mother') => {
    return familyMembers.find(
      m =>
        m.side === side &&
        (m.category === 'parents' ||
          m.relationship?.toLowerCase() === role ||
          m.relationship?.toLowerCase().includes(role)) &&
        (m.relationship?.toLowerCase() === role ||
          (role === 'father' ? m.relationship?.toLowerCase() === 'dad' : m.relationship?.toLowerCase() === 'mom'))
    )
  }

  const brideFather = findParent('bride', 'father')
  const brideMother = findParent('bride', 'mother')
  const groomFather = findParent('groom', 'father')
  const groomMother = findParent('groom', 'mother')

  // Filter lists by tier
  const brideSiblings = familyMembers.filter(m => m.side === 'bride' && m.category === 'siblings')
  const groomSiblings = familyMembers.filter(m => m.side === 'groom' && m.category === 'siblings')

  // Family Groups
  const brideGroups = (familyGroups || []).filter(g => g.side === 'bride')
  const groomGroups = (familyGroups || []).filter(g => g.side === 'groom')

  // Relatives not assigned to any group (e.g. legacy/standalone)
  const brideUnassignedRelatives = familyMembers.filter(
    m =>
      m.side === 'bride' &&
      !m.family_group_id &&
      (m.category === 'extended' ||
        m.category === 'grandparents' ||
        (m.category === 'other' && m.relationship !== 'Friend'))
  )
  const groomUnassignedRelatives = familyMembers.filter(
    m =>
      m.side === 'groom' &&
      !m.family_group_id &&
      (m.category === 'extended' ||
        m.category === 'grandparents' ||
        (m.category === 'other' && m.relationship !== 'Friend'))
  )

  const brideRelatives = familyMembers.filter(
    m =>
      m.side === 'bride' &&
      (m.category === 'extended' ||
        m.category === 'grandparents' ||
        (m.category === 'other' && m.relationship !== 'Friend'))
  )
  const groomRelatives = familyMembers.filter(
    m =>
      m.side === 'groom' &&
      (m.category === 'extended' ||
        m.category === 'grandparents' ||
        (m.category === 'other' && m.relationship !== 'Friend'))
  )

  const brideFriends = familyMembers.filter(
    m =>
      m.side === 'bride' &&
      (m.category === 'friends' ||
        m.relationship?.toLowerCase().includes('friend') ||
        m.relationship?.toLowerCase().includes('bridesmaid'))
  )
  const groomFriends = familyMembers.filter(
    m =>
      m.side === 'groom' &&
      (m.category === 'friends' ||
        m.relationship?.toLowerCase().includes('friend') ||
        m.relationship?.toLowerCase().includes('groomsman'))
  )

  // Priority Helpers & Aggregated Counts
  const getMemberPriority = (m?: FamilyMemberItem): 'high' | 'medium' | 'low' => {
    if (!m) return 'medium'
    if (m.priority) return m.priority
    if (m.category === 'parents' || m.category === 'siblings') return 'high'
    if (m.category === 'friends') return 'low'
    return 'medium'
  }

  const highPriorityCount = familyMembers.filter(m => getMemberPriority(m) === 'high').length
  const mediumPriorityCount = familyMembers.filter(m => getMemberPriority(m) === 'medium').length
  const lowPriorityCount = familyMembers.filter(m => getMemberPriority(m) === 'low').length

  const getPriorityBorderClass = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'border-2 border-rose-200 hover:border-rose-300'
      case 'medium':
        return 'border-2 border-amber-200 hover:border-amber-300'
      case 'low':
      default:
        return 'border border-neutral-200/90 hover:border-neutral-300'
    }
  }

  // 1. Open Dialog for Parents (Father or Mother)
  const openParentDialog = (
    side: 'bride' | 'groom',
    relationship: 'Father' | 'Mother',
    existingMember?: FamilyMemberItem
  ) => {
    const sideLabel = side === 'bride' ? "Bride's" : "Groom's"
    setPersonDialog({
      mode: existingMember ? 'edit' : 'add',
      memberId: existingMember?.id,
      side,
      category: 'parents',
      relationship,
      suggestedRoles: [], // Fixed role: Father or Mother
      title: existingMember?.name?.trim() ? `Edit ${sideLabel} ${relationship}` : `Add ${sideLabel} ${relationship}`,
      name: existingMember?.name || '',
      priority: existingMember?.priority || 'high',
      notes: existingMember?.notes || '',
      photo_url: existingMember?.photo_url || null,
      storage_key: existingMember?.storage_key || null,
      original_photo_url: existingMember?.original_photo_url || null,
      original_storage_key: existingMember?.original_storage_key || null,
      crop_data: existingMember?.crop_data,
      is_remembering: existingMember?.is_remembering || false
    })
    setDialogError('')
  }

  // 2. Open Dialog for Siblings
  const openSiblingsDialog = (side: 'bride' | 'groom') => {
    const sideLabel = side === 'bride' ? "Bride's" : "Groom's"
    setPersonDialog({
      mode: 'add',
      side,
      category: 'siblings',
      relationship: 'Brother',
      suggestedRoles: ['Brother', 'Sister', 'Bhabhi', 'Jiju'],
      title: `Add to ${sideLabel} Siblings`,
      name: '',
      priority: 'high',
      notes: '',
      photo_url: null,
      storage_key: null,
      original_photo_url: null,
      original_storage_key: null,
      is_remembering: false
    })
    setDialogError('')
  }

  // 3. Open Dialog for Relatives & Cousins
  const openRelativesDialog = (side: 'bride' | 'groom') => {
    const sideLabel = side === 'bride' ? "Bride's" : "Groom's"
    setPersonDialog({
      mode: 'add',
      side,
      category: 'extended',
      relationship: 'Cousin',
      suggestedRoles: [
        'Dada',
        'Dadi',
        'Nana',
        'Nani',
        'Chacha',
        'Chachi',
        'Mama',
        'Mami',
        'Bua',
        'Fufa',
        'Mausi',
        'Mausa',
        'Tauji',
        'Taiji',
        'Cousin'
      ],
      title: `Add to ${sideLabel} Relatives & Cousins`,
      name: '',
      priority: 'medium',
      notes: '',
      photo_url: null,
      storage_key: null,
      original_photo_url: null,
      original_storage_key: null,
      is_remembering: false
    })
    setDialogError('')
  }

  // 4. Open Dialog for Friends
  const openFriendsDialog = (side: 'bride' | 'groom') => {
    const sideLabel = side === 'bride' ? "Bride's" : "Groom's"
    setPersonDialog({
      mode: 'add',
      side,
      category: 'friends',
      relationship: side === 'bride' ? 'Bridesmaid' : 'Groomsman',
      suggestedRoles: [
        side === 'bride' ? 'Bridesmaid' : 'Groomsman',
        'Best Friend',
        'Childhood Friend',
        'College Friend'
      ],
      title: `Add to ${sideLabel} Friends`,
      name: '',
      priority: 'low',
      notes: '',
      photo_url: null,
      storage_key: null,
      original_photo_url: null,
      original_storage_key: null,
      is_remembering: false
    })
    setDialogError('')
  }

  // 5. Open Dialog to Edit existing person
  const openEditPersonDialog = (member: FamilyMemberItem) => {
    const sideLabel = member.side === 'bride' ? "Bride's" : "Groom's"
    let suggestedRoles: string[] = []
    if (member.category === 'siblings') {
      suggestedRoles = ['Brother', 'Sister', 'Bhabhi', 'Jiju']
    } else if (member.category === 'extended' || member.category === 'grandparents') {
      suggestedRoles = [
        'Dada',
        'Dadi',
        'Nana',
        'Nani',
        'Chacha',
        'Chachi',
        'Mama',
        'Mami',
        'Bua',
        'Fufa',
        'Mausi',
        'Mausa',
        'Tauji',
        'Taiji',
        'Cousin'
      ]
    } else if (member.category === 'friends') {
      suggestedRoles = [
        member.side === 'bride' ? 'Bridesmaid' : 'Groomsman',
        'Best Friend',
        'Childhood Friend',
        'College Friend'
      ]
    }

    setPersonDialog({
      mode: 'edit',
      memberId: member.id,
      side: member.side,
      category: member.category,
      relationship: member.relationship,
      suggestedRoles,
      title: `Edit ${member.name}`,
      name: member.name,
      priority: member.priority || (member.category === 'parents' || member.category === 'siblings' ? 'high' : member.category === 'friends' ? 'low' : 'medium'),
      notes: member.notes || '',
      photo_url: member.photo_url || null,
      storage_key: member.storage_key || null,
      original_photo_url: member.original_photo_url || null,
      original_storage_key: member.original_storage_key || null,
      crop_data: member.crop_data,
      is_remembering: member.is_remembering || false,
      family_group_id: member.family_group_id || null,
      role_in_family: member.role_in_family || null
    })
    setDialogError('')
  }

  // Trigger file selection for Couple or from inside Dialog
  const handleTriggerCoupleUpload = (role: 'bride' | 'groom') => {
    setCoupleUploadRole(role)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleTriggerDialogPhoto = () => {
    setCoupleUploadRole(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // File chosen from file picker: Upload to R2 & launch interactive crop grid
  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (e.target) e.target.value = ''

    // Create immediate local object URL for instant, reliable local rendering in the cropper
    const localBlobUrl = URL.createObjectURL(file)
    setCropperInitialUrl(localBlobUrl)

    if (coupleUploadRole) {
      // Uploading Bride or Groom photo
      const roleName = coupleUploadRole === 'bride' ? couple?.bride?.name || 'Bride' : couple?.groom?.name || 'Groom'
      setCropperTargetPerson({
        name: roleName,
        relationship: coupleUploadRole === 'bride' ? 'Bride' : 'Groom',
        category: 'other',
        priority: 'high'
      })
    } else if (personDialog) {
      // Uploading photo inside Person Dialog
      setCropperTargetPerson({
        id: personDialog.memberId,
        name: personDialog.name || personDialog.relationship,
        relationship: personDialog.relationship,
        category: personDialog.category,
        priority: 'high',
        is_remembering: personDialog.is_remembering
      })
    }

    setShowCropperModal(true)

    try {
      setUploadingDialogPhoto(true)
      const res = await uploadMediaToR2({
        slug,
        file,
        section: 'family'
      })

      setCropperInitialKey(res.storageKey)
      setCropperInitialUrl(normalizeMediaUrl(res.fileUrl))
    } catch (err: any) {
      console.error('Upload failed:', err)
      alert(err.message || 'Failed to upload photo')
    } finally {
      setUploadingDialogPhoto(false)
    }
  }

  // When face crop is confirmed in ImageCropperModal
  const handleSaveCroppedPerson = async (cropPerson: SavedCroppedPerson) => {
    if (coupleUploadRole && onUpdateCouplePhoto) {
      // Saved couple photo
      const defaultName = coupleUploadRole === 'bride' ? couple?.bride?.name || 'Bride' : couple?.groom?.name || 'Groom'
      await onUpdateCouplePhoto(
        coupleUploadRole,
        cropPerson.name || defaultName,
        cropPerson.photo_url,
        cropPerson.storage_key
      )
      setCoupleUploadRole(null)
    } else if (personDialog) {
      // Attach cropped photo directly to the open Person Dialog
      setPersonDialog(prev => (prev ? {
        ...prev,
        photo_url: cropPerson.photo_url,
        storage_key: cropPerson.storage_key,
        original_photo_url: cropPerson.original_photo_url,
        original_storage_key: cropPerson.original_storage_key,
        crop_data: cropPerson.crop_data,
        name: prev.name.trim() ? prev.name : cropPerson.name
      } : null))
    }

    setShowCropperModal(false)
  }

  // Save Person Dialog (MANDATORY: Name, Relation, Photo unless remembering)
  const handleSavePersonDialog = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!personDialog) return

    if (!personDialog.name.trim()) {
      setDialogError('Please provide a full name.')
      return
    }

    if (!personDialog.relationship.trim()) {
      setDialogError('Please provide a relationship.')
      return
    }

    // STRICT NON-OPTIONAL PHOTOGRAPH VALIDATION:
    if (!personDialog.photo_url && !personDialog.is_remembering) {
      setDialogError('Photograph is mandatory. Please upload a photograph (or check "In Loving Memory").')
      return
    }

    try {
      setSavingPerson(true)
      setDialogError('')

      let priority: FamilyMemberItem['priority'] = personDialog.priority || 'medium'
      if (!personDialog.priority) {
        if (personDialog.category === 'parents' || personDialog.category === 'siblings') priority = 'high'
        if (personDialog.category === 'friends') priority = 'low'
      }

      if (personDialog.mode === 'edit' && personDialog.memberId) {
        await onUpdateMember(personDialog.memberId, {
          name: personDialog.name.trim(),
          relationship: personDialog.relationship.trim(),
          category: personDialog.category,
          priority,
          is_remembering: personDialog.is_remembering,
          notes: personDialog.notes?.trim() || null,
          photo_url: personDialog.photo_url || null,
          storage_key: personDialog.storage_key || null,
          original_photo_url: personDialog.original_photo_url || null,
          original_storage_key: personDialog.original_storage_key || null,
          crop_data: personDialog.crop_data,
          family_group_id: personDialog.family_group_id,
          role_in_family: personDialog.role_in_family
        })
      } else {
        await onAddMember({
          side: personDialog.side,
          name: personDialog.name.trim(),
          relationship: personDialog.relationship.trim(),
          category: personDialog.category,
          priority,
          is_remembering: personDialog.is_remembering,
          notes: personDialog.notes?.trim() || undefined,
          photo_url: personDialog.photo_url || undefined,
          storage_key: personDialog.storage_key || undefined,
          original_photo_url: personDialog.original_photo_url || undefined,
          original_storage_key: personDialog.original_storage_key || undefined,
          crop_data: personDialog.crop_data,
          family_group_id: personDialog.family_group_id || undefined,
          role_in_family: personDialog.role_in_family || undefined
        })
      }

      setPersonDialog(null)
    } catch (err: any) {
      setDialogError(err.message || 'Failed to save person')
    } finally {
      setSavingPerson(false)
    }
  }

  // Render Parent Slot Card (Clean Slot when empty, Profile card when completed)
  const renderParentSlotCard = (
    side: 'bride' | 'groom',
    relationship: 'Father' | 'Mother',
    member?: FamilyMemberItem
  ) => {
    const hasValidName = Boolean(member?.name && member.name.trim())
    const hasPhoto = Boolean(member?.photo_url)
    const isRemembering = Boolean(member?.is_remembering)
    const isCompleted = Boolean(member && hasValidName && (hasPhoto || isRemembering))

    // 1. EMPTY SLOT CARD: Clean, clickable slot opening the dialog with relation pre-selected
    if (!isCompleted) {
      return (
        <div
          onClick={() => openParentDialog(side, relationship, member)}
          className="w-full min-h-[140px] sm:min-h-[175px] rounded-2xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white/70 hover:bg-neutral-50/80 p-2.5 sm:p-4 flex flex-col justify-between cursor-pointer transition group shadow-2xs"
          title={`Click to add ${side === 'bride' ? "Bride's" : "Groom's"} ${relationship}`}
        >
          {/* Top row: Required badge on top right above father/mother */}
          <div className="w-full flex justify-end">
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
              Required
            </span>
          </div>

          {/* Center: Father/Mother in centre, followed by avatar and Add Photo */}
          <div className="flex flex-col items-center text-center my-auto py-1">
            <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2.5">
              {relationship}
            </span>

            <div className="w-10 h-10 rounded-full bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center mb-2 transition">
              <User className="w-5 h-5 stroke-[1.5]" />
            </div>

            <p className="text-xs font-bold text-neutral-900 group-hover:underline">
              Add Photo
            </p>
            <span className="text-[10px] text-neutral-400 mt-0.5">
              Click to upload
            </span>
          </div>

          {/* Bottom spacer for balanced alignment */}
          <div className="h-0.5" />
        </div>
      )
    }

    // 2. COMPLETED PARENT CARD: Shows portrait, name, relationship, and quick edit/delete
    const parentPriority = getMemberPriority(member)
    return (
      <div
        className={`bg-white rounded-2xl p-2.5 sm:p-4 flex flex-col items-center text-center transition relative group ${getPriorityBorderClass(parentPriority)}`}
        title={`Click to edit · ${parentPriority.toUpperCase()} Priority`}
      >
        {/* Large Portrait Avatar */}
        <div
          onClick={() => openParentDialog(side, relationship, member)}
          className="w-16 h-16 sm:w-24 md:w-28 sm:h-24 md:h-28 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2 sm:mb-2.5 cursor-pointer group/avatar shadow-2xs shrink-0"
          title="Click to edit details or photo"
        >
          {hasPhoto ? (
            <img
              src={normalizeMediaUrl(member!.photo_url!)}
              alt={member!.name}
              className="w-full h-full object-cover object-center group-hover/avatar:scale-105 transition duration-300"
            />
          ) : (
            <Heart className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400 stroke-[1.5]" />
          )}

          <div className="absolute inset-0 bg-neutral-900/40 opacity-0 group-hover/avatar:opacity-100 transition flex items-center justify-center">
            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>

          {isRemembering && (
            <span className="absolute bottom-0 inset-x-0 bg-neutral-900/80 text-white text-[8px] font-bold text-center py-0.5 uppercase tracking-wider">
              In Memory
            </span>
          )}
        </div>

        {/* Name & Role */}
        <div className="w-full space-y-0.5 min-w-0">
          <h4
            onClick={() => openParentDialog(side, relationship, member)}
            className="text-xs sm:text-sm font-bold text-neutral-900 truncate hover:underline cursor-pointer"
            title={member!.name}
          >
            {member!.name}
          </h4>
          <p className="text-[10px] sm:text-[11px] font-semibold text-neutral-500">
            {relationship}
          </p>
        </div>

        {/* Bottom Actions: Pencil edit on left, Dustbin delete on right */}
        <div className="w-full flex items-center justify-between pt-2 sm:pt-2.5 mt-1.5 sm:mt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={() => openParentDialog(side, relationship, member)}
            className="p-1 sm:p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg sm:rounded-xl border border-neutral-200/80 transition cursor-pointer"
            title="Edit Details / Photo"
          >
            <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDeleteMember(member!.id)}
            className="p-1 sm:p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg sm:rounded-xl border border-neutral-200/80 hover:border-rose-200 transition cursor-pointer"
            title="Delete and re-enter"
          >
            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // Render a Member Card (for Siblings, Relatives, Friends)
  const renderPersonCard = (member: FamilyMemberItem) => {
    const priority = getMemberPriority(member)
    return (
      <div
        key={member.id}
        className={`bg-white rounded-2xl p-2.5 sm:p-4 flex flex-col items-center text-center transition relative group ${getPriorityBorderClass(priority)}`}
        title={`Click to edit · ${priority.toUpperCase()} Priority`}
      >
        <div
          onClick={() => openEditPersonDialog(member)}
          className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2 sm:mb-2.5 cursor-pointer group/avatar shadow-2xs shrink-0"
          title="Click to edit person"
        >
          {member.photo_url ? (
            <img
              src={normalizeMediaUrl(member.photo_url)}
              alt={member.name}
              className="w-full h-full object-cover object-center group-hover/avatar:scale-105 transition"
            />
          ) : member.is_remembering ? (
            <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-neutral-400 stroke-[1.5]" />
          ) : (
            <User className="w-6 h-6 sm:w-7 sm:h-7 text-neutral-300 stroke-[1.5]" />
          )}

          <div className="absolute inset-0 bg-neutral-900/40 opacity-0 group-hover/avatar:opacity-100 transition flex items-center justify-center">
            <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>

          {member.is_remembering && (
            <span className="absolute bottom-0 inset-x-0 bg-neutral-900/80 text-white text-[8px] font-bold text-center py-0.5 uppercase tracking-wider">
              In Memory
            </span>
          )}
        </div>

        <div className="w-full space-y-0.5 min-w-0">
          <h4
            onClick={() => openEditPersonDialog(member)}
            className="text-xs sm:text-sm font-bold text-neutral-900 truncate hover:underline cursor-pointer"
            title={member.name}
          >
            {member.name}
          </h4>
          <p className="text-[10px] sm:text-[11px] font-semibold text-neutral-500 truncate">
            {member.relationship}
          </p>
        </div>

        {/* Bottom Actions: Pencil edit on left, Dustbin delete on right */}
        <div className="w-full flex items-center justify-between pt-2 sm:pt-2.5 mt-1.5 sm:mt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={() => openEditPersonDialog(member)}
            className="p-1 sm:p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg sm:rounded-xl border border-neutral-200/80 transition cursor-pointer"
            title="Edit Details / Photo"
          >
            <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDeleteMember(member.id)}
            className="p-1 sm:p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg sm:rounded-xl border border-neutral-200/80 hover:border-rose-200 transition cursor-pointer"
            title="Delete person"
          >
            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // Render "+ Add" placeholder card
  const renderAddCard = (
    label: string,
    onClick: () => void
  ) => {
    return (
      <button
        type="button"
        onClick={onClick}
        className="border-2 border-dashed border-neutral-300 hover:border-neutral-900 hover:bg-neutral-50/80 rounded-2xl p-2.5 sm:p-4 flex flex-col items-center justify-center text-center cursor-pointer min-h-[130px] sm:min-h-[160px] transition group shadow-2xs"
      >
        <div className="w-10 h-10 rounded-full bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center mb-2 transition">
          <Plus className="w-5 h-5 stroke-[2]" />
        </div>
        <span className="text-xs font-bold text-neutral-800 group-hover:text-neutral-900">
          {label}
        </span>
        <span className="text-[10px] text-neutral-400 mt-0.5">Click to add</span>
      </button>
    )
  }

  // Open dialog to create a new Family Group
  const openAddFamilyGroupDialog = (side: 'bride' | 'groom') => {
    setFamilyGroupDialog({
      isOpen: true,
      mode: 'add',
      side,
      relationship: 'Chacha & Chachi',
      custom_relationship: ''
    })
    setFamilyGroupDialogError('')
  }

  // Open dialog to edit existing Family Group
  const openEditFamilyGroupDialog = (group: FamilyGroupItem) => {
    const isPreset = FAMILY_RELATIONSHIP_PRESETS.some(p => p.label === group.relationship)
    setFamilyGroupDialog({
      isOpen: true,
      mode: 'edit',
      groupId: group.id,
      side: group.side,
      relationship: isPreset ? group.relationship : 'Custom...',
      custom_relationship: isPreset ? '' : (group.custom_relationship || group.relationship || '')
    })
    setFamilyGroupDialogError('')
  }

  // Handle saving family group
  const handleSaveFamilyGroupDialog = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSavingFamilyGroup(true)
      setFamilyGroupDialogError('')

      const effectiveRel =
        familyGroupDialog.relationship === 'Custom...'
          ? (familyGroupDialog.custom_relationship?.trim() || 'Custom Family')
          : familyGroupDialog.relationship

      if (!effectiveRel) {
        setFamilyGroupDialogError('Please select or specify a family relationship.')
        return
      }

      if (familyGroupDialog.mode === 'edit' && familyGroupDialog.groupId) {
        if (onUpdateFamilyGroup) {
          await onUpdateFamilyGroup(familyGroupDialog.groupId, {
            name: effectiveRel,
            relationship: effectiveRel,
            custom_relationship: familyGroupDialog.custom_relationship?.trim() || null
          })
        }
      } else {
        if (onAddFamilyGroup) {
          await onAddFamilyGroup({
            side: familyGroupDialog.side,
            name: effectiveRel,
            relationship: effectiveRel,
            custom_relationship: familyGroupDialog.custom_relationship?.trim() || null
          })
        }
      }

      setFamilyGroupDialog(prev => ({ ...prev, isOpen: false }))
    } catch (err: any) {
      setFamilyGroupDialogError(err.message || 'Failed to save family')
    } finally {
      setSavingFamilyGroup(false)
    }
  }

  // Delete family group with confirmation
  const handleDeleteFamilyGroupClick = async (group: FamilyGroupItem) => {
    if (!onDeleteFamilyGroup) return
    const confirmed = window.confirm(
      `Delete "${group.name}"?\nThis will remove the family unit and any members inside it.`
    )
    if (!confirmed) return
    try {
      await onDeleteFamilyGroup(group.id)
    } catch (err: any) {
      alert(err.message || 'Failed to delete family')
    }
  }

  // Open person dialog to add parent or child to a family group
  const openAddMemberToGroup = (
    group: FamilyGroupItem,
    role_in_family: 'head' | 'spouse' | 'child',
    defaultRelationship: string
  ) => {
    const baseRoles = [
      'Dada',
      'Dadi',
      'Nana',
      'Nani',
      'Chacha',
      'Chachi',
      'Mama',
      'Mami',
      'Bua',
      'Fufa',
      'Mausi',
      'Mausa',
      'Tauji',
      'Taiji',
      'Cousin'
    ]
    const suggestedRoles = Array.from(new Set([defaultRelationship, ...baseRoles]))

    setPersonDialog({
      mode: 'add',
      side: group.side,
      category: 'extended',
      relationship: defaultRelationship,
      suggestedRoles,
      title: `Add ${defaultRelationship} (${group.name})`,
      name: '',
      priority: group.priority || 'medium',
      notes: '',
      photo_url: null,
      storage_key: null,
      original_photo_url: null,
      original_storage_key: null,
      is_remembering: false,
      family_group_id: group.id,
      role_in_family
    })
    setDialogError('')
  }

  // Render a Family Group Parent slot (card or clean dashed placeholder)
  const renderFamilyParentSlot = (
    group: FamilyGroupItem,
    role_in_family: 'head' | 'spouse',
    roleLabel: string,
    member?: FamilyMemberItem
  ) => {
    if (member) {
      return renderPersonCard(member)
    }

    return (
      <div
        onClick={() => openAddMemberToGroup(group, role_in_family, roleLabel)}
        className="w-full min-h-[130px] sm:min-h-[160px] rounded-2xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white/70 hover:bg-neutral-50/80 p-2.5 sm:p-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition group shadow-2xs"
      >
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center mb-1.5 sm:mb-2 transition">
          <User className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.5]" />
        </div>
        <p className="text-xs font-bold text-neutral-800 group-hover:underline">
          Add {roleLabel}
        </p>
        <span className="text-[10px] text-neutral-400 mt-0.5">
          Click to add photo
        </span>
      </div>
    )
  }

  // Render a Child / Cousin add card
  const renderAddChildCard = (group: FamilyGroupItem) => {
    return (
      <div
        onClick={() => openAddMemberToGroup(group, 'child', 'Cousin')}
        className="w-full min-h-[130px] sm:min-h-[160px] rounded-2xl border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white/70 hover:bg-neutral-50/80 p-2.5 sm:p-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition group shadow-2xs"
      >
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center mb-1.5 sm:mb-2 transition">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
        </div>
        <p className="text-xs font-bold text-neutral-800 group-hover:underline">
          Add Child
        </p>
        <span className="text-[10px] text-neutral-400 mt-0.5">
          Cousin
        </span>
      </div>
    )
  }

  // Render complete Family Group Card
  const renderFamilyGroupCard = (group: FamilyGroupItem) => {
    const groupMembers = familyMembers.filter(m => m.family_group_id === group.id)
    const [parent1Role, parent2Role] = getFamilyParentRoles(group.relationship)

    // Match Parent 1 (e.g. Chacha)
    const parent1 = groupMembers.find(
      m => m.role_in_family === 'head' || m.relationship.toLowerCase() === parent1Role.toLowerCase()
    )

    // Match Parent 2 (e.g. Chachi)
    const parent2 = groupMembers.find(
      m =>
        (m.role_in_family === 'spouse' || m.relationship.toLowerCase() === parent2Role.toLowerCase()) &&
        m.id !== parent1?.id
    )

    // Children / Cousins
    const children = groupMembers.filter(
      m => m.id !== parent1?.id && m.id !== parent2?.id
    )

    return (
      <div
        key={group.id}
        className="bg-white rounded-3xl border border-neutral-200/90 shadow-2xs hover:shadow-xs p-4 sm:p-5 space-y-4 transition"
      >
        {/* Family Header */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">👨‍👩‍👧‍👦</span>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-neutral-900 truncate">
                {group.relationship || group.name || 'Family'}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openEditFamilyGroupDialog(group)}
              className="p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
              title="Edit family relationship"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteFamilyGroupClick(group)}
              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
              title="Delete entire family"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Parents Section */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
            Parents ({parent1Role} &amp; {parent2Role})
          </span>
          <div className="grid grid-cols-2 gap-3">
            {renderFamilyParentSlot(group, 'head', parent1Role, parent1)}
            {renderFamilyParentSlot(group, 'spouse', parent2Role, parent2)}
          </div>
        </div>

        {/* Children (Cousins) Section */}
        <div className="border-t border-neutral-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Children (Cousins)
            </span>
            <span className="text-[10px] font-semibold text-neutral-400">
              {children.length} {children.length === 1 ? 'child' : 'children'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3">
            {children.map(renderPersonCard)}
            {renderAddChildCard(group)}
          </div>
        </div>
      </div>
    )
  }

  // Render "+ Add Family" card
  const renderAddFamilyCard = (
    label: string,
    onClick: () => void
  ) => {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full border-2 border-dashed border-neutral-300 hover:border-neutral-900 bg-white/70 hover:bg-neutral-50/80 rounded-2xl p-4 sm:p-5 flex items-center justify-center gap-2.5 text-neutral-700 hover:text-neutral-900 transition cursor-pointer font-bold text-xs sm:text-sm group shadow-2xs"
      >
        <span className="w-7 h-7 rounded-full bg-neutral-100 group-hover:bg-neutral-900 text-neutral-600 group-hover:text-white flex items-center justify-center transition">
          <Plus className="w-4 h-4" />
        </span>
        <span>{label}</span>
      </button>
    )
  }

  const brideName = couple?.bride?.name || 'Bride'
  const groomName = couple?.groom?.name || 'Groom'
  const bridePhoto = couple?.bride?.photo_url || null
  const groomPhoto = couple?.groom?.photo_url || null

  return (
    <div className="space-y-10 max-w-5xl mx-auto py-2 text-left">
      {/* Hidden File Picker triggered by dialog photo upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFilePicked}
        className="hidden"
      />

      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Family Tree & Important People
        </h2>
        <p className="text-sm text-neutral-500">
          Let&apos;s introduce the people who make your wedding special.
        </p>
      </div>

      {/* Mandatory Requirements Alert */}
      {stats && (!stats.bride.has_father || !stats.bride.has_mother || !stats.groom.has_father || !stats.groom.has_mother || !stats.allRequirementsMet) && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Required Parents:</span>
            <p className="text-[11px] text-amber-800">
              Both Father and Mother profiles with photographs (or marked as remembered) are required for Bride &amp; Groom before questionnaire completion. You can save drafts anytime.
            </p>
          </div>
        </div>
      )}

      {/* =========================================================================
          TIER 0: THE COUPLE (BRIDE ON LEFT, GROOM ON RIGHT)
          ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            The Couple
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {/* Bride Card (Left) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center border border-neutral-200/90 shadow-2xs">
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
              {bridePhoto ? (
                <img
                  key={bridePhoto}
                  src={normalizeMediaUrl(bridePhoto)}
                  alt={brideName}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-300 stroke-[1.5]" />
              )}
            </div>

            <div className="w-full space-y-0.5 min-w-0">
              <h4 className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                {brideName}
              </h4>
              <p className="text-[11px] sm:text-xs font-semibold text-neutral-500">
                Bride
              </p>
            </div>
          </div>

          {/* Groom Card (Right) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center border border-neutral-200/90 shadow-2xs">
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden bg-neutral-100 border border-neutral-200/90 flex items-center justify-center relative mb-2.5 shadow-2xs shrink-0">
              {groomPhoto ? (
                <img
                  key={groomPhoto}
                  src={normalizeMediaUrl(groomPhoto)}
                  alt={groomName}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-300 stroke-[1.5]" />
              )}
            </div>

            <div className="w-full space-y-0.5 min-w-0">
              <h4 className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                {groomName}
              </h4>
              <p className="text-[11px] sm:text-xs font-semibold text-neutral-500">
                Groom
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TIER 1: PARENTS (FATHER & MOTHER FOR BOTH)
          ========================================================================= */}
      <div className="space-y-3 border-t border-neutral-100 pt-6">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span>Parents</span>
              <span className="text-[10px] text-rose-600 uppercase tracking-wider font-extrabold">(Mandatory)</span>
            </h3>
            <p className="text-xs text-neutral-400">Father &amp; Mother for both sides</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-6">
          {/* Left: Bride's Parents */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Bride&apos;s Parents
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {renderParentSlotCard('bride', 'Father', brideFather)}
              {renderParentSlotCard('bride', 'Mother', brideMother)}
            </div>
          </div>

          {/* Right: Groom's Parents */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Groom&apos;s Parents
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {renderParentSlotCard('groom', 'Father', groomFather)}
              {renderParentSlotCard('groom', 'Mother', groomMother)}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TIER 2: SIBLINGS
          ========================================================================= */}
      <div className="space-y-3 border-t border-neutral-100 pt-6">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span>Siblings</span>
            </h3>
            <p className="text-xs text-neutral-400">Brothers, Sisters, Bhabhi, Jiju</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-6">
          {/* Left: Bride's Siblings */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Bride&apos;s Siblings ({brideSiblings.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {brideSiblings.map(renderPersonCard)}
              {renderAddCard('Add Sibling', () => openSiblingsDialog('bride'))}
            </div>
          </div>

          {/* Right: Groom's Siblings */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Groom&apos;s Siblings ({groomSiblings.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {groomSiblings.map(renderPersonCard)}
              {renderAddCard('Add Sibling', () => openSiblingsDialog('groom'))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TIER 3: RELATIVES & EXTENDED FAMILIES
          ========================================================================= */}
      <div className="space-y-3 border-t border-neutral-100 pt-6">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span>Relatives &amp; Extended Families</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Chacha-Chachi, Mama-Mami, Bua-Fufa, and their children (cousins)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left: Bride's Families */}
          <div className="bg-neutral-50/60 p-4 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-4">
            <span className="text-xs font-bold text-neutral-700 block">
              Bride&apos;s Families ({brideGroups.length})
            </span>

            {/* Family Groups List */}
            {brideGroups.map(renderFamilyGroupCard)}

            {/* Standalone/Unassigned Relatives if any */}
            {brideUnassignedRelatives.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-neutral-200/70">
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                  Other Relatives ({brideUnassignedRelatives.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3">
                  {brideUnassignedRelatives.map(renderPersonCard)}
                </div>
              </div>
            )}

            {/* Add Family Button */}
            {renderAddFamilyCard('Add Family', () => openAddFamilyGroupDialog('bride'))}
          </div>

          {/* Right: Groom's Families */}
          <div className="bg-neutral-50/60 p-3.5 sm:p-5 rounded-3xl border border-neutral-200/80 space-y-4">
            <span className="text-xs font-bold text-neutral-700 block">
              Groom&apos;s Families ({groomGroups.length})
            </span>

            {/* Family Groups List */}
            {groomGroups.map(renderFamilyGroupCard)}

            {/* Standalone/Unassigned Relatives if any */}
            {groomUnassignedRelatives.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-neutral-200/70">
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                  Other Relatives ({groomUnassignedRelatives.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3">
                  {groomUnassignedRelatives.map(renderPersonCard)}
                </div>
              </div>
            )}

            {/* Add Family Button */}
            {renderAddFamilyCard('Add Family', () => openAddFamilyGroupDialog('groom'))}
          </div>
        </div>
      </div>

      {/* =========================================================================
          TIER 4: FRIENDS
          ========================================================================= */}
      <div className="space-y-3 border-t border-neutral-100 pt-6">
        <div className="flex items-center justify-between pb-1">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span>Friends</span>
            </h3>
            <p className="text-xs text-neutral-400">Best friends, bridesmaids, groomsmen</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-6">
          {/* Left: Bride's Friends */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Bride&apos;s Friends ({brideFriends.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {brideFriends.map(renderPersonCard)}
              {renderAddCard('Add Friend', () => openFriendsDialog('bride'))}
            </div>
          </div>

          {/* Right: Groom's Friends */}
          <div className="bg-neutral-50/60 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 space-y-2.5 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-bold text-neutral-700 block truncate">
              Groom&apos;s Friends ({groomFriends.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {groomFriends.map(renderPersonCard)}
              {renderAddCard('Add Friend', () => openFriendsDialog('groom'))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          UNIFIED PERSON DIALOG (FOR PARENTS, SIBLINGS, RELATIVES, FRIENDS)
          Mandatory: Full Name, Relationship, and Photograph (or Remembering)
          ========================================================================= */}
      {personDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={() => !showCropperModal && setPersonDialog(null)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 shadow-2xl max-w-md w-full p-4 sm:p-6 space-y-4 sm:space-y-5 text-left my-auto max-h-[92dvh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-neutral-900">
                {personDialog.title}
              </h3>
              <button
                type="button"
                onClick={() => setPersonDialog(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePersonDialog} className="space-y-4">
              {dialogError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{dialogError}</span>
                </div>
              )}

              {/* 1. Full Name (Mandatory) */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-800">
                  Full Name <span className="text-rose-600 font-extrabold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={personDialog.name}
                  onChange={(e) => setPersonDialog({ ...personDialog, name: e.target.value })}
                  placeholder="e.g. Ramesh Sharma"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-neutral-900 transition"
                />
              </div>

              {/* 2. Relationship (Smart Search Dropdown) */}
              {(() => {
                const categoryRoles = Array.from(new Set(personDialog.suggestedRoles || []))
                const baseRoles = Array.from(
                  new Set([
                    ...categoryRoles,
                    ...SMART_RELATIONSHIP_POOL
                  ])
                )
                const trimmedRelQuery = relationshipSearchQuery.trim().toLowerCase()
                const matchingRoles = Array.from(
                  new Set(
                    trimmedRelQuery
                      ? baseRoles.filter(r => r.toLowerCase().includes(trimmedRelQuery))
                      : categoryRoles.length > 0
                      ? categoryRoles
                      : baseRoles
                  )
                )

                return (
                  <div className="space-y-1.5" ref={relationshipContainerRef}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-neutral-800">
                        Relationship <span className="text-rose-600 font-extrabold">*</span>
                      </label>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={personDialog.relationship}
                        onChange={(e) => {
                          const val = e.target.value
                          setPersonDialog({ ...personDialog, relationship: val })
                          setRelationshipSearchQuery(val)
                          if (!relationshipDropdownOpen && personDialog.category !== 'parents') {
                            setRelationshipDropdownOpen(true)
                          }
                        }}
                        onFocus={() => {
                          if (personDialog.category !== 'parents') {
                            setRelationshipSearchQuery('')
                            setRelationshipDropdownOpen(true)
                          }
                        }}
                        placeholder={personDialog.category === 'parents' ? 'Parent relationship' : 'Search or type relationship...'}
                        disabled={personDialog.category === 'parents'} // Fixed Father/Mother role
                        className={`w-full pl-3.5 pr-9 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-neutral-900 transition ${
                          personDialog.category === 'parents' ? 'cursor-not-allowed text-neutral-600 font-bold bg-neutral-100' : ''
                        }`}
                      />

                      {personDialog.category !== 'parents' && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setRelationshipSearchQuery('')
                            setRelationshipDropdownOpen(prev => !prev)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-200/60 transition cursor-pointer"
                          title="Toggle relationship options"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${relationshipDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}

                      {/* Dropdown Menu with Live Smart Search */}
                      {relationshipDropdownOpen && personDialog.category !== 'parents' && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto p-1.5 space-y-0.5">
                          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 mb-1 flex items-center justify-between">
                            <span>{trimmedRelQuery ? `Matches (${matchingRoles.length})` : 'Suggested Relationships'}</span>
                            {trimmedRelQuery && <span className="text-[9px] font-normal lowercase">searching "{trimmedRelQuery}"</span>}
                          </div>

                          {matchingRoles.map((role, idx) => {
                            const isSelected = personDialog.relationship.trim().toLowerCase() === role.toLowerCase()
                            return (
                              <button
                                key={`${role}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setPersonDialog({ ...personDialog, relationship: role })
                                  setRelationshipSearchQuery('')
                                  setRelationshipDropdownOpen(false)
                                }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-neutral-900 text-white font-bold'
                                    : 'hover:bg-neutral-100 text-neutral-700'
                                }`}
                              >
                                <span>{role}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              </button>
                            )
                          })}

                          {/* Fallback option when typing custom relationship */}
                          {personDialog.relationship.trim() && !matchingRoles.some(r => r.toLowerCase() === personDialog.relationship.trim().toLowerCase()) && (
                            <div className="border-t border-neutral-100 pt-1 mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setRelationshipSearchQuery('')
                                  setRelationshipDropdownOpen(false)
                                }}
                                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition text-left cursor-pointer"
                              >
                                <span>Use custom: <strong className="text-black">"{personDialog.relationship.trim()}"</strong></span>
                                <Check className="w-3.5 h-3.5 text-neutral-400" />
                              </button>
                            </div>
                          )}

                          {matchingRoles.length === 0 && !personDialog.relationship.trim() && (
                            <div className="px-3 py-2 text-xs text-neutral-400 text-center">
                              Type to search or enter relationship...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* 3. Photograph (MANDATORY unless remembering is checked) */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-800">
                    Photograph <span className={personDialog.is_remembering ? 'text-neutral-400 font-semibold text-[11px]' : 'text-rose-600 font-extrabold'}>
                      {personDialog.is_remembering ? '(Optional)' : '* (Mandatory)'}
                    </span>
                  </label>
                </div>

                <div className={`p-2.5 sm:p-3 rounded-2xl border transition flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 ${
                  !personDialog.photo_url && !personDialog.is_remembering
                    ? 'bg-amber-50/50 border-amber-200/80 ring-1 ring-amber-300/40'
                    : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-white border border-neutral-200 flex items-center justify-center shrink-0 shadow-2xs">
                      {personDialog.photo_url ? (
                        <img
                          src={normalizeMediaUrl(personDialog.photo_url)}
                          alt="Preview"
                          className="w-full h-full object-cover object-center"
                        />
                      ) : (
                        <User className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-300 stroke-[1.5]" />
                      )}
                    </div>
                    {!personDialog.photo_url && (
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-bold text-neutral-800 truncate">
                          Photo Required
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          Upload portrait or crop face from group photo
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 justify-end pt-1 sm:pt-0 border-t border-neutral-200/50 sm:border-t-0">
                    {personDialog.photo_url && (
                      <button
                        type="button"
                        onClick={() => {
                          const existingUrl = personDialog.original_photo_url || personDialog.crop_data?.original_photo_url
                          const existingKey = personDialog.original_storage_key || ''

                          if (!existingUrl) {
                            handleTriggerDialogPhoto()
                            return
                          }

                          setCropperInitialUrl(normalizeMediaUrl(existingUrl))
                          setCropperInitialKey(existingKey)
                          setCropperTargetPerson({
                            id: personDialog.memberId,
                            name: personDialog.name || personDialog.relationship,
                            relationship: personDialog.relationship,
                            category: personDialog.category,
                            priority: personDialog.priority || 'high',
                            is_remembering: personDialog.is_remembering,
                            crop_data: personDialog.crop_data
                          })
                          setShowCropperModal(true)
                        }}
                        className="py-2 px-3 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-bold rounded-xl border border-neutral-200 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Re-frame or zoom on the face"
                      >
                        <Crop className="w-3.5 h-3.5" />
                        <span>Re-crop</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={uploadingDialogPhoto}
                      onClick={handleTriggerDialogPhoto}
                      className="flex-1 sm:flex-initial py-2 px-3.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{uploadingDialogPhoto ? 'Uploading...' : personDialog.photo_url ? 'Upload New' : 'Upload & Crop *'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Photography Priority */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-neutral-800">
                    Photography Priority
                  </label>
                  <span className="text-[11px] text-neutral-400">Guides coverage focus</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'high', label: 'High' },
                    { val: 'medium', label: 'Medium' },
                    { val: 'low', label: 'Low' }
                  ].map(p => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setPersonDialog({ ...personDialog, priority: p.val as any })}
                      className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer text-xs font-bold ${
                        (personDialog.priority || 'medium') === p.val
                          ? p.val === 'high'
                            ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-2xs'
                            : p.val === 'medium'
                            ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
                            : 'bg-neutral-100 border-neutral-300 text-neutral-800 shadow-2xs'
                          : 'bg-neutral-50/70 border-neutral-200 text-neutral-500 hover:bg-white hover:text-neutral-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. In Loving Memory (Late) - Deceased family member */}
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={personDialog.is_remembering}
                  onChange={(e) => setPersonDialog({ ...personDialog, is_remembering: e.target.checked })}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0 mt-0.5"
                />
                <div className="text-xs leading-normal">
                  <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-neutral-400 stroke-[1.8]" />
                    <span>In Loving Memory (Late)</span>
                  </span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5">
                    Check if this family member has passed away · Photo optional
                  </span>
                </div>
              </label>

              {/* 5. Notes (Optional) */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-700">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={personDialog.notes || ''}
                  onChange={(e) => setPersonDialog({ ...personDialog, notes: e.target.value })}
                  placeholder="e.g. Loves candid pictures, VIP on family stage"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-neutral-900 transition"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setPersonDialog(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPerson}
                  className="px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-xl transition cursor-pointer shadow-xs"
                >
                  {savingPerson ? 'Saving...' : personDialog.mode === 'edit' ? 'Save Changes' : 'Save Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          FAMILY GROUP DIALOG (Add / Edit Family Unit)
          ========================================================================= */}
      {familyGroupDialog.isOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-neutral-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <span>👨‍👩‍👧‍👦</span>
                  <span>
                    {familyGroupDialog.mode === 'add'
                      ? `Add ${familyGroupDialog.side === 'bride' ? "Bride's" : "Groom's"} Family`
                      : 'Edit Family'}
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Parents &amp; their children (cousins)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFamilyGroupDialog(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFamilyGroupDialog} className="p-5 space-y-4">
              {familyGroupDialogError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{familyGroupDialogError}</span>
                </div>
              )}

              {/* 1. Relationship Preset selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-neutral-800">
                  Family Relationship <span className="text-rose-600 font-extrabold">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FAMILY_RELATIONSHIP_PRESETS.map((p) => {
                    const isSelected = familyGroupDialog.relationship === p.label
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setFamilyGroupDialog(prev => ({
                            ...prev,
                            relationship: p.label
                          }))
                        }}
                        className={`text-left p-2.5 rounded-xl border text-xs transition cursor-pointer ${
                          isSelected
                            ? 'border-neutral-900 bg-neutral-900 text-white font-bold shadow-xs'
                            : 'border-neutral-200 bg-neutral-50/70 hover:bg-neutral-100 text-neutral-700 font-medium'
                        }`}
                      >
                        <div className="truncate">{p.label}</div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                          {p.desc}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {familyGroupDialog.relationship === 'Custom...' && (
                  <div className="pt-1.5">
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      Custom Relationship Name <span className="text-rose-600 font-extrabold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={familyGroupDialog.custom_relationship || ''}
                      onChange={(e) =>
                        setFamilyGroupDialog(prev => ({
                          ...prev,
                          custom_relationship: e.target.value
                        }))
                      }
                      placeholder="e.g. Dada & Dadi, or Great-Uncle & Aunt"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-neutral-900 transition"
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() =>
                    setFamilyGroupDialog(prev => ({ ...prev, isOpen: false }))
                  }
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFamilyGroup}
                  className="px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-xl transition cursor-pointer shadow-xs"
                >
                  {savingFamilyGroup
                    ? 'Saving...'
                    : familyGroupDialog.mode === 'edit'
                    ? 'Save Changes'
                    : 'Create Family'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          IMAGE CROPPER MODAL (Triggered automatically when selecting a photo)
          Rendered with z-[90] on top of dialog
          ========================================================================= */}
      {showCropperModal && (
        <ImageCropperModal
          slug={slug}
          side={personDialog?.side || coupleUploadRole || 'bride'}
          initialImageUrl={cropperInitialUrl}
          initialStorageKey={cropperInitialKey}
          targetPerson={cropperTargetPerson}
          onSavePerson={handleSaveCroppedPerson}
          onClose={() => {
            setShowCropperModal(false)
          }}
        />
      )}
    </div>
  )
}
