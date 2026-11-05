'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import PhoneField from '@/components/PhoneField'
import ShareGalleryModal from '@/components/ShareGalleryModal'
import { ShareGalleryData } from '@/lib/shareURL'
import OnboardingSelection, { OnboardingState, OnboardingPerson } from '@/components/portal/OnboardingSelection'
import OnboardingForm from '@/components/portal/OnboardingForm'
import PortalCameraModal from '@/components/portal/PortalCameraModal'
import { smartCropImageFile } from '@/lib/faceCrop'
import QuestionnaireModal from '@/components/portal/questionnaire/QuestionnaireModal'

const LOGO_BLACK_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://os.mistyvisuals.com/logo_black.png'
    : '/logo_black.png'

interface PortalClientProps {
  slug: string
}

interface ProjectEvent {
  id: string
  event_type: string
  event_date: string | null
  pax: number | null
  venue: string | null
  start_time: string | null
  end_time: string | null
  slot: string | null
  is_verified: boolean
}

interface ProjectDeliverable {
  id: string
  title: string
  type: string
  quantity: number
  status: 'pending' | 'in_progress' | 'client_preview' | 'revision' | 'delivered'
  due_date: string | null
  notes: string | null
  phase?: string | null
  category?: string | null
}

interface ProjectChecklist {
  id: string
  title: string
  phase: string
  is_completed: boolean
}

interface InvoiceItem {
  id: number
  name: string
  description: string
  quantity: number
  rate: number
  amount: number
}

interface PaymentStep {
  id: number
  step_order: number
  label: string
  percentage: number
  amount: number
  due_date: string | null
  status: 'pending' | 'paid'
}

interface SignedPricing {
  total_cost_of_production?: number
  display_price?: number
  discount_amount: number
  discounted_price: number
  tier_name?: string
  discount_label?: string | null
}

interface ProjectInvoice {
  id: number
  invoice_number: string
  status: string
  issue_date: string | null
  due_date: string | null
  total_amount: number
  advance_amount: number
  advance_paid: boolean
  balance_due: number
  line_items: InvoiceItem[] | null
  payment_schedule: PaymentStep[] | null
  is_verified: boolean
  signed_pricing?: SignedPricing | null
}

export interface GalleryData {
  exists: boolean
  id?: number
  slug?: string
  title?: string
  totalCount: number
  photoCount: number
  videoCount: number
  highlightsCount: number
  coverPhotoUrl?: string | null
  passcode?: string | null
  partialPasscode?: string | null
}

interface ProjectData {
  project: {
    id: string
    name: string
    status: string
    start_date: string | null
    end_date: string | null
    city: string | null
    is_destination: boolean
    bride_name?: string | null
    bride_phone_primary?: string | null
    bride_email?: string | null
    bride_instagram?: string | null
    groom_name?: string | null
    groom_phone_primary?: string | null
    groom_email?: string | null
    groom_instagram?: string | null
    passcode?: string | null
    partial_passcode?: string | null
  }
  events: ProjectEvent[]
  deliverables: ProjectDeliverable[]
  checklist: ProjectChecklist[]
  invoice: ProjectInvoice | null
  signed_pricing?: SignedPricing | null
  gallery?: GalleryData | null
  onboarding?: OnboardingState | null
}

const groupDeliverables = (items: ProjectDeliverable[]) => {
  const videoKeywords = ['film', 'video', 'reel', 'teaser', 'trailer', 'cinematic', 'cinemato']
  const photoKeywords = ['photo', 'album', 'print', 'frame', 'picture', 'portrait']
  const preWedKeywords = ['pre-wedding', 'pre wedding', 'prewed', 'intimate']
  const engKeywords = ['engagement', 'ring ceremony', 'roka', 'sagan', 'token']

  const getPhase = (d: ProjectDeliverable) => {
    if (d.phase) return d.phase.toUpperCase()
    const label = String(d.title || '').toLowerCase()
    if (preWedKeywords.some(k => label.includes(k))) return 'PRE_WEDDING'
    if (engKeywords.some(k => label.includes(k))) return 'ENGAGEMENT'
    return 'WEDDING'
  }

  const getCat = (d: ProjectDeliverable) => {
    if (d.category) return d.category.toUpperCase()
    const label = String(d.title || '').toLowerCase()
    const type = String(d.type || '').toLowerCase()
    if (videoKeywords.some(k => label.includes(k) || type.includes(k))) return 'VIDEO'
    if (photoKeywords.some(k => label.includes(k) || type.includes(k))) return 'PHOTO'
    return 'OTHER'
  }

  const preWedding = items.filter(d => getPhase(d) === 'PRE_WEDDING')
  const engagement = items.filter(d => getPhase(d) === 'ENGAGEMENT')
  const wedding = items.filter(d => getPhase(d) === 'WEDDING')

  const weddingPhoto = wedding.filter(d => getCat(d) === 'PHOTO')
  const weddingVideo = wedding.filter(d => getCat(d) === 'VIDEO')
  const weddingOther = wedding.filter(d => getCat(d) === 'OTHER')

  return {
    preWedding,
    engagement,
    wedding: {
      photo: weddingPhoto,
      video: weddingVideo,
      other: weddingOther,
    },
    total: items.length
  }
}

export default function PortalClient({ slug }: PortalClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(true)
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [projectData, setProjectData] = useState<ProjectData | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [galleryData, setGalleryData] = useState<GalleryData | null>(null)
  const [sharingGallery, setSharingGallery] = useState<ShareGalleryData | null>(null)

  // Couple Onboarding State
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  const [selectedOnboardingRole, setSelectedOnboardingRole] = useState<'bride' | 'groom' | null>(null)

  // Edit details state
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [brideName, setBrideName] = useState('')
  const [bridePhone, setBridePhone] = useState('')
  const [bridePhoneSecondary, setBridePhoneSecondary] = useState('')
  const [brideEmail, setBrideEmail] = useState('')
  const [brideEmailError, setBrideEmailError] = useState(false)
  const [brideInsta, setBrideInsta] = useState('')
  const [brideSelfieUrl, setBrideSelfieUrl] = useState<string | null>(null)
  const [brideStorageKey, setBrideStorageKey] = useState<string | null>(null)
  const [uploadingBrideSelfie, setUploadingBrideSelfie] = useState(false)

  const [groomName, setGroomName] = useState('')
  const [groomPhone, setGroomPhone] = useState('')
  const [groomPhoneSecondary, setGroomPhoneSecondary] = useState('')
  const [groomEmail, setGroomEmail] = useState('')
  const [groomEmailError, setGroomEmailError] = useState(false)
  const [groomInsta, setGroomInsta] = useState('')
  const [groomSelfieUrl, setGroomSelfieUrl] = useState<string | null>(null)
  const [groomStorageKey, setGroomStorageKey] = useState<string | null>(null)
  const [uploadingGroomSelfie, setUploadingGroomSelfie] = useState(false)

  // AI Face verification states for Bride & Groom (matching onboarding flow)
  const [brideValidationStatus, setBrideValidationStatus] = useState<'idle' | 'verifying' | 'accepted' | 'rejected'>('idle')
  const [brideStatusMsg, setBrideStatusMsg] = useState<string | null>(null)
  const [bridePreviewUrl, setBridePreviewUrl] = useState<string | null>(null)

  const [groomValidationStatus, setGroomValidationStatus] = useState<'idle' | 'verifying' | 'accepted' | 'rejected'>('idle')
  const [groomStatusMsg, setGroomStatusMsg] = useState<string | null>(null)
  const [groomPreviewUrl, setGroomPreviewUrl] = useState<string | null>(null)

  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  // Camera & Photo action states for Bride / Groom DP
  const [activeCameraRole, setActiveCameraRole] = useState<'bride' | 'groom' | null>(null)
  const [activePhotoMenuRole, setActivePhotoMenuRole] = useState<'bride' | 'groom' | null>(null)

  const brideSelfieInputRef = useRef<HTMLInputElement>(null)
  const groomSelfieInputRef = useRef<HTMLInputElement>(null)


  // Wedding Vision Questionnaire state
  const [questionnaireData, setQuestionnaireData] = useState<{
    status: 'not_started' | 'in_progress' | 'completed'
    has_opened: boolean
    current_step: number
  } | null>(null)
  const [showQuestionnaireModal, setShowQuestionnaireModal] = useState(false)
  const [questionnaireInitialStep, setQuestionnaireInitialStep] = useState(1)

  const fetchQuestionnaireStatus = async () => {
    try {
      const qRes = await fetch(`/api/client-portal/${slug}/questionnaire`, { credentials: 'include' })
      if (qRes.ok) {
        const qData = await qRes.json()
        if (qData.questionnaire) {
          setQuestionnaireData({
            status: qData.questionnaire.status || 'not_started',
            has_opened: Boolean(qData.questionnaire.has_opened),
            current_step: qData.questionnaire.current_step || 1
          })
        }
      }
    } catch {}
  }

  // Fetch portal info
  const fetchPortalData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/client-portal/${slug}`, { credentials: 'include' })
      if (res.status === 404) {
        setError('Workspace not found.')
        setLoading(false)
        return
      }
      const data = await res.json()
      if (data.locked) {
        setLocked(true)
        if (data.projectName) {
          setProjectName(data.projectName)
        }
      } else {
        setLocked(false)
        setProjectData(data.data)
        if (data.data?.onboarding) {
          setOnboarding(data.data.onboarding)
        }
        if (data.data?.project?.name) {
          setProjectName(data.data.project.name)
        }
        const lead = data.data?.project || {}
        const onb = data.data?.onboarding || {}
        setBrideName(onb.bride?.name || lead.bride_name || '')
        setBridePhone(onb.bride?.phone_primary || lead.bride_phone_primary || '')
        setBridePhoneSecondary(onb.bride?.phone_secondary || lead.bride_phone_secondary || '')
        setBrideEmail(onb.bride?.email || lead.bride_email || '')
        setBrideInsta(onb.bride?.instagram || lead.bride_instagram || '')
        setBrideSelfieUrl(onb.bride?.selfie_url || null)

        setGroomName(onb.groom?.name || lead.groom_name || '')
        setGroomPhone(onb.groom?.phone_primary || lead.groom_phone_primary || '')
        setGroomPhoneSecondary(onb.groom?.phone_secondary || lead.groom_phone_secondary || '')
        setGroomEmail(onb.groom?.email || lead.groom_email || '')
        setGroomInsta(onb.groom?.instagram || lead.groom_instagram || '')
        setGroomSelfieUrl(onb.groom?.selfie_url || null)

        // Resolve gallery data: use backend projectData.gallery
        fetchQuestionnaireStatus()
        if (data.data?.gallery !== undefined) {
          setGalleryData(data.data.gallery)
        } else {
          try {
            const gallRes = await fetch(`/api/gallery/public/events/${slug}`)
            if (gallRes.ok) {
              const gEvent = await gallRes.json()
              const totalAll = gEvent.totalCount ?? gEvent.tabCounts?.ALL ?? 0
              const vidCount = gEvent.videoCount ?? 0
              const pCount = gEvent.photoCount ?? Math.max(0, totalAll - vidCount)
              const hCount = gEvent.highlightsCount ?? gEvent.tabCounts?.HIGHLIGHTS ?? 0
              setGalleryData({
                exists: true,
                id: gEvent.id,
                slug: gEvent.slug || slug,
                title: gEvent.title,
                totalCount: totalAll,
                photoCount: pCount,
                videoCount: vidCount,
                highlightsCount: hCount,
                coverPhotoUrl: gEvent.coverPhotoUrl || null,
                passcode: gEvent.passcode || gEvent.fullCode || data.data?.project?.passcode || null,
                partialPasscode: gEvent.partial_passcode || gEvent.partialCode || (data.data?.project as any)?.partial_passcode || null,
              })
            } else {
              setGalleryData(null)
            }
          } catch {
            setGalleryData(null)
          }
        }
      }
    } catch {
      setError('Failed to connect to workspace.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPortalData()
  }, [slug])

  // Handle Passcode verification
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passcode.trim()) return

    try {
      setVerifying(true)
      setError('')
      const res = await fetch(`/api/client-portal/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Invalid passcode.')
      }

      setLocked(false)
      fetchPortalData()
    } catch (err: any) {
      setError(err.message || 'Verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  const handleLogout = async () => {
    await fetch(`/api/client-portal/${slug}/logout`, { method: 'POST' })
    setLocked(true)
    setProjectData(null)
    setGalleryData(null)
    setPasscode('')
  }

  const handleUploadSelfie = async (file: File, role: 'bride' | 'groom', isSelfie = false) => {
    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image file.'
      if (role === 'bride') {
        setBrideValidationStatus('rejected')
        setBrideStatusMsg(msg)
      } else {
        setGroomValidationStatus('rejected')
        setGroomStatusMsg(msg)
      }
      setDetailsError(msg)
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      const msg = 'Image must be under 25MB.'
      if (role === 'bride') {
        setBrideValidationStatus('rejected')
        setBrideStatusMsg(msg)
      } else {
        setGroomValidationStatus('rejected')
        setGroomStatusMsg(msg)
      }
      setDetailsError(msg)
      return
    }

    if (role === 'bride') {
      setUploadingBrideSelfie(true)
      setBrideValidationStatus('verifying')
      setBrideStatusMsg('Detecting face & verifying...')
    } else {
      setUploadingGroomSelfie(true)
      setGroomValidationStatus('verifying')
      setGroomStatusMsg('Detecting face & verifying...')
    }
    setDetailsError('')

    try {
      let fileToUpload = file

      // Only uploaded photos need smart 1:1 face cropping; camera selfies are already face-framed
      if (!isSelfie) {
        const croppedFile = await smartCropImageFile(file, 900, 0.88)
        fileToUpload = croppedFile
      }

      const localPreview = URL.createObjectURL(fileToUpload)
      if (role === 'bride') {
        setBridePreviewUrl(localPreview)
      } else {
        setGroomPreviewUrl(localPreview)
      }

      // 2. Upload and verify with MyCircle AI face detection
      const formData = new FormData()
      formData.append('file', fileToUpload)
      const res = await fetch(`/api/client-portal/${slug}/onboarding/upload-selfie?role=${role}`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify face.')
      }

      if (role === 'bride') {
        setBrideSelfieUrl(data.selfie_url)
        if (data.storage_key) setBrideStorageKey(data.storage_key)
        setBrideValidationStatus('accepted')
        setBrideStatusMsg('Face verified with AI')
      } else {
        setGroomSelfieUrl(data.selfie_url)
        if (data.storage_key) setGroomStorageKey(data.storage_key)
        setGroomValidationStatus('accepted')
        setGroomStatusMsg('Face verified with AI')
      }
    } catch (err: any) {
      const msg = err.message || 'Face verification failed. Please try another photo.'
      if (role === 'bride') {
        setBrideValidationStatus('rejected')
        setBrideStatusMsg(msg)
      } else {
        setGroomValidationStatus('rejected')
        setGroomStatusMsg(msg)
      }
      setDetailsError(msg)
    } finally {
      if (role === 'bride') setUploadingBrideSelfie(false)
      else setUploadingGroomSelfie(false)
    }
  }

  const handleSaveDetails = async () => {
    // Normalization helper for instagram handle
    const normalizeInsta = (val: string) => {
      let trimmed = val.trim();
      if (!trimmed) return '';
      trimmed = trimmed.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '');
      trimmed = trimmed.replace(/^@/, '');
      return trimmed.split('?')[0].replace(/\/$/, '');
    };

    try {
      setSavingDetails(true)
      setDetailsError('')

      // Normalize instagram handles
      const normalizedBrideInsta = normalizeInsta(brideInsta);
      const normalizedGroomInsta = normalizeInsta(groomInsta);

      // Validate email formatting
      if (brideEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brideEmail.trim())) {
        setDetailsError("Please enter a valid email address for the Bride");
        setSavingDetails(false);
        return;
      }
      if (groomEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groomEmail.trim())) {
        setDetailsError("Please enter a valid email address for the Groom");
        setSavingDetails(false);
        return;
      }

      // Validate phone number country codes (+ prefix followed by digits)
      const cleanedBridePhone = bridePhone.trim().replace(/[\s\-()]/g, '');
      if (cleanedBridePhone && !/^\+\d{10,15}$/.test(cleanedBridePhone)) {
        setDetailsError("Bride's phone number must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const cleanedBridePhoneSec = bridePhoneSecondary.trim().replace(/[\s\-()]/g, '');
      if (cleanedBridePhoneSec && !/^\+\d{10,15}$/.test(cleanedBridePhoneSec)) {
        setDetailsError("Bride's alternate phone must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const cleanedGroomPhone = groomPhone.trim().replace(/[\s\-()]/g, '');
      if (cleanedGroomPhone && !/^\+\d{10,15}$/.test(cleanedGroomPhone)) {
        setDetailsError("Groom's phone number must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const cleanedGroomPhoneSec = groomPhoneSecondary.trim().replace(/[\s\-()]/g, '');
      if (cleanedGroomPhoneSec && !/^\+\d{10,15}$/.test(cleanedGroomPhoneSec)) {
        setDetailsError("Groom's alternate phone must include a country code starting with '+' (e.g. +919999999999)");
        setSavingDetails(false);
        return;
      }

      const res = await fetch(`/api/client-portal/${slug}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bride_name: brideName.trim(),
          bride_email: brideEmail.trim(),
          bride_phone_primary: cleanedBridePhone,
          bride_phone_secondary: cleanedBridePhoneSec || null,
          bride_instagram: normalizedBrideInsta,
          bride_selfie_url: brideSelfieUrl,
          bride_storage_key: brideStorageKey || null,
          groom_name: groomName.trim(),
          groom_email: groomEmail.trim(),
          groom_phone_primary: cleanedGroomPhone,
          groom_phone_secondary: cleanedGroomPhoneSec || null,
          groom_instagram: normalizedGroomInsta,
          groom_selfie_url: groomSelfieUrl,
          groom_storage_key: groomStorageKey || null
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save details')
      }
      setIsEditingDetails(false)
      fetchPortalData()
    } catch (e: any) {
      setDetailsError(e.message)
    } finally {
      setSavingDetails(false)
    }
  }

  // Formatting helpers
  const formatFullDate = (dateStr: string | null) => {
    if (!dateStr || dateStr.startsWith('2099')) return 'TBA'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    } catch {
      return dateStr
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-neutral-400 font-medium tracking-wide">Securing connection...</p>
        </div>
      </div>
    )
  }

  // 1. LOCKED VIEW (PASSCODE ACCESS)
  if (locked) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 relative overflow-hidden transition-colors duration-300 force-light" style={{ colorScheme: 'light' }}>
        {/* Decorative backdrop shapes */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>
 
        <div className="w-full max-w-md bg-white border border-neutral-200/50 p-8 rounded-3xl relative z-10 shadow-xl transition-all duration-300">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img
                src={LOGO_BLACK_URL}
                alt="Misty Visuals Logo"
                className="h-10 w-auto object-contain opacity-95"
                onError={(e) => {
                  if (e.currentTarget.src !== 'https://os.mistyvisuals.com/logo_black.png') {
                    e.currentTarget.src = 'https://os.mistyvisuals.com/logo_black.png'
                  }
                }}
              />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">{projectName || 'Your Workspace'}</h2>
            <p className="text-xs text-neutral-500 mt-2 max-w-xs mx-auto">
              Please enter the 4-digit passcode sent to your registered phone number or email to access your workspace.
            </p>
          </div>
 
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-neutral-50/50 border border-neutral-200 rounded-2xl py-4 text-center text-xl font-semibold text-neutral-900 placeholder-neutral-300 focus:outline-none focus:border-emerald-500/50 transition-all tracking-[0.2em] shadow-sm"
                required
              />
            </div>
 
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs text-center font-medium">
                {error}
              </div>
            )}
 
            <button
              type="submit"
              disabled={verifying}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {verifying ? 'Unlocking...' : 'Access Workspace'}
              {!verifying && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 10v2m-6-4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 2. ONBOARDING FLOW (Mandatory: both bride and groom must complete onboarding)
  const showOnboarding = Boolean(onboarding && !onboarding.isFullyCompleted)

  if (showOnboarding && onboarding) {
    if (!selectedOnboardingRole) {
      return (
        <OnboardingSelection
          onboarding={onboarding}
          projectName={projectName}
          logoUrl={LOGO_BLACK_URL}
          onSelectRole={(role) => {
            setSelectedOnboardingRole(role)
          }}
        />
      )
    }

    const currentPerson = selectedOnboardingRole === 'bride' ? onboarding.bride : onboarding.groom

    return (
      <OnboardingForm
        slug={slug}
        role={selectedOnboardingRole}
        initialData={currentPerson}
        projectName={projectName}
        logoUrl={LOGO_BLACK_URL}
        onBack={() => setSelectedOnboardingRole(null)}
        onSuccess={(updatedPerson, isFullyCompleted) => {
          // Update local onboarding state
          setOnboarding((prev) => {
            if (!prev) return null
            return {
              ...prev,
              [selectedOnboardingRole]: updatedPerson,
              isFullyCompleted
            }
          })

          setSelectedOnboardingRole(null)

          // Refresh portal data to sync leads and all project details
          fetchPortalData()
        }}
      />
    )
  }

  // 3. UNLOCKED VIEW (CLIENT PORTAL DASHBOARD)
  const project = projectData?.project
  const events = projectData?.events || []
  const deliverables = projectData?.deliverables || []
  const checklist = projectData?.checklist || []
  const invoice = projectData?.invoice || null

  const upcomingEvents = events.filter(e => {
    if (!e.event_date || e.event_date.startsWith('2099')) return true
    return new Date(e.event_date) >= new Date(new Date().setHours(0,0,0,0))
  })

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 pb-16 relative overflow-hidden transition-colors duration-300 force-light" style={{ colorScheme: 'light' }}>
      {/* Decorative Blur Backdrops */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Branded Header */}
      <header className="border-b border-neutral-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* Logo and Workspace Label in same line */}
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <img
                src={LOGO_BLACK_URL}
                alt="Misty Visuals Logo"
                className="h-8 w-auto object-contain opacity-95"
                onError={(e) => {
                  if (e.currentTarget.src !== 'https://os.mistyvisuals.com/logo_black.png') {
                    e.currentTarget.src = 'https://os.mistyvisuals.com/logo_black.png'
                  }
                }}
              />
            </div>
            <div className="h-4 w-px bg-neutral-300"></div>
            <span className="text-[10px] tracking-[0.25em] font-bold text-neutral-500 uppercase mt-0.5">Workspace</span>
          </div>

          {/* Action buttons on the right */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditingDetails(true)}
              className="text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-xl transition-all duration-300 shadow-sm"
              style={{ color: '#ffffff' }}
            >
              👤 Edit Profile
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 px-4 py-2 rounded-xl text-neutral-600 transition-all duration-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 mt-8 grid gap-8">
        
        {/* Welcome Section */}
        <section className="bg-white border border-neutral-200/50 rounded-3xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm transition-all duration-300">
          <div className="relative z-10 space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
              Welcome, {project?.name || 'Client'}!
            </h1>
            <p className="text-sm text-neutral-500 max-w-xl">
              Track your wedding deliverables, confirm your shoot timeline details, and review invoices in real-time.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-center">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Status</div>
              <div className="text-xs font-bold text-neutral-900 uppercase mt-0.5">{project?.status || 'Active'}</div>
            </div>
            {project?.city && (
              <div className="bg-neutral-100 border border-neutral-200 px-4 py-2 rounded-xl text-center">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Location</div>
                <div className="text-xs font-bold text-neutral-900 mt-0.5">{project.city}</div>
              </div>
            )}
          </div>
        </section>

        {/* Dynamic Photo & Video Gallery Status Card */}
        {(() => {
          const gallerySlug = galleryData?.slug || slug
          const myCircleUrl = typeof window !== 'undefined' && (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1'))
            ? `${window.location.origin}/${gallerySlug}/gallery`
            : `https://mycircle.mistyvisuals.com/${gallerySlug}/gallery`

          const exists = Boolean(galleryData && galleryData.exists)
          const totalCount = galleryData?.totalCount || 0
          const photoCount = galleryData?.photoCount || 0
          const videoCount = galleryData?.videoCount || 0
          const highlightsCount = galleryData?.highlightsCount || 0

          const openShareModal = () => {
            setSharingGallery({
              slug: gallerySlug,
              title: galleryData?.title || project?.name || 'Wedding Gallery',
              crmName: project?.name || galleryData?.title,
              passcode: galleryData?.passcode || project?.passcode,
              partialPasscode: galleryData?.partialPasscode || (project as any)?.partial_passcode,
              eventDate: project?.start_date,
              coverPhotoUrl: galleryData?.coverPhotoUrl
            })
          }

          const renderActions = (primaryLabel: string, primaryColorClass: string) => (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={openShareModal}
                className="bg-white hover:bg-neutral-50 text-neutral-800 font-semibold py-2.5 px-4 sm:py-3 sm:px-5 rounded-2xl transition border border-neutral-200 text-xs shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
                title="Share gallery link & QR code with guests"
              >
                <span>📤</span> Share Gallery
              </button>
              <a
                href={myCircleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${primaryColorClass} font-semibold py-2.5 px-5 sm:py-3 sm:px-6 rounded-2xl transition shadow-sm text-center text-xs cursor-pointer flex items-center gap-1.5 active:scale-95`}
                style={{ color: '#ffffff' }}
              >
                {primaryLabel} <span className="opacity-80">↗</span>
              </a>
            </div>
          )

          // State 1: Gallery is created, but NO media uploaded yet
          if (exists && totalCount === 0) {
            return (
              <section className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-amber-700 uppercase tracking-widest bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/25 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Gallery Set Up · Awaiting Uploads
                  </span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">📸 Gallery Created — Photos & Films Coming Soon</h3>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    Your dedicated wedding gallery has been created! Our post-production team will start uploading your raw captures, edited stills, and cinema files once the shoot and curation process starts.
                  </p>
                  <p className="text-[11px] text-amber-700/80 font-medium">
                    0 photos uploaded so far · AI selfie search and sharing links will activate automatically as soon as photos are uploaded.
                  </p>
                </div>
                {renderActions('Preview Gallery', 'bg-gradient-to-r from-amber-600 via-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-sm border border-amber-600/30')}
              </section>
            )
          }

          // State 2: Both Videos/Cinema AND Highlights are uploaded
          if (exists && videoCount > 0 && highlightsCount > 0) {
            return (
              <section className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-emerald-500/10 border border-purple-500/25 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-purple-700 uppercase tracking-widest bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/25 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                    Films & Highlights Live
                  </span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">🎬 Wedding Cinema & Photo Highlights are Live!</h3>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    Your wedding cinema ({videoCount} film{videoCount === 1 ? '' : 's'}) and curated photo highlights ({highlightsCount} highlights across {photoCount} total photos) are ready! Stream your films in full quality and take a quick selfie to find every picture of you or your guests.
                  </p>
                </div>
                {renderActions('Watch Films & Highlights', 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700')}
              </section>
            )
          }

          // State 3: Videos uploaded, no highlights flagged yet
          if (exists && videoCount > 0) {
            return (
              <section className="bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-purple-500/10 border border-purple-500/25 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-purple-700 uppercase tracking-widest bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/25 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    Wedding Cinema Live
                  </span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">🎬 Wedding Cinema & Films are Live!</h3>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    Your wedding cinema ({videoCount} film{videoCount === 1 ? '' : 's'}{photoCount > 0 ? ` and ${photoCount} photos` : ''}) has been uploaded and is ready to stream in full resolution.
                  </p>
                </div>
                {renderActions('Watch Wedding Films', 'bg-purple-600 hover:bg-purple-700')}
              </section>
            )
          }

          // State 4: Highlights uploaded, no videos yet
          if (exists && highlightsCount > 0) {
            return (
              <section className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/25 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/25 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Highlights Live
                  </span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">✨ Wedding Photo Highlights are Live!</h3>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    Your curated wedding highlights ({highlightsCount} highlight photo{highlightsCount === 1 ? '' : 's'} across {photoCount} total photos) are ready! Take a quick selfie on your phone to find every picture of you or your guests.
                  </p>
                </div>
                {renderActions('Explore Photo Highlights', 'bg-emerald-600 hover:bg-emerald-700')}
              </section>
            )
          }

          // State 5: Photos uploaded (no highlights or videos flagged yet)
          if (exists && totalCount > 0) {
            const count = photoCount > 0 ? photoCount : totalCount
            return (
              <section className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border border-emerald-500/25 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/25 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Gallery Live · {count} Photos Uploaded
                  </span>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">📸 Your Gallery is Live!</h3>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    {count} wedding photo{count === 1 ? '' : 's'} have been uploaded and are ready to explore. Take a quick selfie on your phone to find every picture of you or your guests instantly with AI facial search.
                  </p>
                </div>
                {renderActions('Explore Photo Gallery', 'bg-emerald-600 hover:bg-emerald-700')}
              </section>
            )
          }

          // State 6: Gallery not yet created
          return (
            <section className="bg-neutral-100/70 border border-neutral-200/80 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-200/70 px-2.5 py-0.5 rounded-full border border-neutral-300/60 inline-flex items-center gap-1.5">
                  Upcoming Feature
                </span>
                <h3 className="text-lg font-bold text-neutral-800 mt-1">📸 AI Photo Gallery</h3>
                <p className="text-xs text-neutral-500 max-w-xl">
                  Your private, AI-powered wedding gallery will be activated here once your event celebrations begin. You and your guests will be able to find photos instantly with facial search.
                </p>
              </div>
            </section>
          )
        })()}

        {/* Your Wedding Vision Dashboard Card */}
        <section className="bg-white border border-neutral-200/60 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">✨</span>
                <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-neutral-900">
                  Your Wedding Vision
                </h2>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  questionnaireData?.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : questionnaireData?.status === 'in_progress'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                }`}>
                  {questionnaireData?.status === 'completed'
                    ? 'Completed'
                    : questionnaireData?.status === 'in_progress'
                    ? 'In Progress'
                    : 'Not Started'}
                </span>
              </div>
              <p className="text-xs md:text-sm text-neutral-600 leading-relaxed">
                Help us understand your wedding, preferences, special moments, and expectations so we can make your experience with Misty Visuals more personal.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  router.push(`/${slug}/vision?step=0`)
                }}
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs md:text-sm px-6 py-3 rounded-2xl transition shadow-sm cursor-pointer flex items-center gap-2"
              >
                <span>
                  {questionnaireData?.status === 'completed'
                    ? 'Review Questionnaire'
                    : 'Open Questionnaire'}
                </span>
                <span>→</span>
              </button>
            </div>
          </div>
        </section>

        {/* Dashboard Panels */}
        <div className="grid md:grid-cols-3 gap-8">

          {/* LEFT: TIMELINE (2 Columns wide) */}
          <div className="md:col-span-2 space-y-8">
            <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Event Timeline
                </h3>
                <span className="text-xs text-neutral-500 font-medium">
                  {events.length} Event{events.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="relative pl-6 border-l border-neutral-200 space-y-8">
                {events.map((ev) => {
                  const isTBA = !ev.event_date || ev.event_date.startsWith('2099')
                  const isVenueTBD = !ev.venue || /^(tbd|tba|to be decided|to be announced)$/i.test(ev.venue.trim())
                  const venueMapQuery = !isVenueTBD 
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue + (ev.venue_address ? `, ${ev.venue_address}` : ''))}`
                    : null

                  return (
                    <div key={ev.id} className="relative group">
                      {/* Timeline Node dot */}
                      <div className="absolute -left-[31px] top-1.5 w-4 h-4 bg-neutral-50 border-2 border-emerald-500 rounded-full group-hover:scale-110 transition-transform"></div>

                      <div className="space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <h4 className="font-bold text-neutral-900 text-base">
                            {ev.event_type}
                          </h4>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            isTBA ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {isTBA ? 'Dates TBA' : formatFullDate(ev.event_date)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500 pt-0.5">
                          {ev.venue && (
                            venueMapQuery ? (
                              <a
                                href={venueMapQuery}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-emerald-600 hover:underline transition-colors group/venue"
                                title="Open in Google Maps"
                              >
                                <svg className="w-3.5 h-3.5 text-neutral-400 group-hover/venue:text-emerald-500 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{ev.venue}{ev.venue_address ? ` (${ev.venue_address})` : ''}</span>
                                <svg className="w-3 h-3 text-neutral-400 group-hover/venue:text-emerald-500 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {ev.venue}
                              </span>
                            )
                          )}
                          {(ev.start_time || ev.slot) && (
                            <span className="flex items-center gap-1.5 text-neutral-500">
                              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {ev.start_time ? `${ev.start_time} ${ev.end_time ? `- ${ev.end_time}` : ''}` : ev.slot}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* RIGHT Panel: DELIVERABLES & BILLING */}
          <div className="space-y-8">
            
            {/* Deliverables List Grouped by Signed Series & Subsections */}
            <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Deliverables
                </h3>
                <span className="text-xs text-neutral-500 font-medium">
                  {deliverables.length} Item{deliverables.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-6">
                {deliverables.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">No deliverables assigned yet.</p>
                ) : (() => {
                  const grouped = groupDeliverables(deliverables)
                  const statusColors: Record<string, string> = {
                    pending: 'bg-neutral-100 text-neutral-600 border-neutral-200',
                    in_progress: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                    client_preview: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
                    revision: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                    delivered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                  }

                  const renderDeliverableCard = (del: ProjectDeliverable) => (
                    <div key={del.id} className="bg-neutral-50/70 border border-neutral-100 rounded-xl p-3.5 space-y-1.5 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <h5 className="text-xs font-bold text-neutral-900 leading-tight">
                          {del.title}
                        </h5>
                        {del.status && del.status !== 'pending' && (
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-md whitespace-nowrap ${
                            statusColors[del.status] || statusColors.pending
                          }`}>
                            {del.status.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>Qty: {del.quantity}</span>
                        {del.due_date && <span>Due: {formatFullDate(del.due_date)}</span>}
                      </div>
                    </div>
                  )

                  return (
                    <div className="space-y-6">
                      {/* Pre-Wedding Series */}
                      {grouped.preWedding.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">💍</span>
                            <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-700">Pre-Wedding</span>
                            <span className="text-[10px] text-neutral-400">({grouped.preWedding.length})</span>
                          </div>
                          <div className="space-y-2 pl-2 border-l-2 border-pink-200">
                            {grouped.preWedding.map(renderDeliverableCard)}
                          </div>
                        </div>
                      )}

                      {/* Engagement Series */}
                      {grouped.engagement.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">💎</span>
                            <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-700">Engagement</span>
                            <span className="text-[10px] text-neutral-400">({grouped.engagement.length})</span>
                          </div>
                          <div className="space-y-2 pl-2 border-l-2 border-purple-200">
                            {grouped.engagement.map(renderDeliverableCard)}
                          </div>
                        </div>
                      )}

                      {/* Wedding Celebrations Series */}
                      {(grouped.wedding.photo.length > 0 || grouped.wedding.video.length > 0 || grouped.wedding.other.length > 0) && (
                        <div className="space-y-4">
                          {(grouped.preWedding.length > 0 || grouped.engagement.length > 0) && (
                            <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
                              <span className="text-sm">💒</span>
                              <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-800">Wedding Celebrations</span>
                            </div>
                          )}

                          {/* Photography Subsection */}
                          {grouped.wedding.photo.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md w-fit">
                                <span>📸 Photography</span>
                                <span className="text-amber-500">({grouped.wedding.photo.length})</span>
                              </div>
                              <div className="space-y-2">
                                {grouped.wedding.photo.map(renderDeliverableCard)}
                              </div>
                            </div>
                          )}

                          {/* Cinematography Subsection */}
                          {grouped.wedding.video.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                                <span>🎥 Cinematography / Films</span>
                                <span className="text-blue-500">({grouped.wedding.video.length})</span>
                              </div>
                              <div className="space-y-2">
                                {grouped.wedding.video.map(renderDeliverableCard)}
                              </div>
                            </div>
                          )}

                          {/* Other Handover Items Subsection */}
                          {grouped.wedding.other.length > 0 && (
                            <div className="space-y-2.5">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-neutral-700 bg-neutral-100 px-2.5 py-1 rounded-md w-fit">
                                <span>📦 Other Handover Items</span>
                                <span className="text-neutral-400">({grouped.wedding.other.length})</span>
                              </div>
                              <div className="space-y-2">
                                {grouped.wedding.other.map(renderDeliverableCard)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Billing Summary */}
            {invoice && (
              <div className="bg-white border border-neutral-200/50 rounded-3xl p-6 space-y-6 shadow-sm transition-all duration-300">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Billing Summary
                  </h3>
                </div>

                <div className="space-y-4">
                  {/* Signed Contract Pricing Breakdown */}
                  {(() => {
                    const pricing = projectData?.signed_pricing || invoice.signed_pricing || null
                    const totalCostOfProduction = Number(
                      pricing?.total_cost_of_production ?? pricing?.display_price ?? invoice.subtotal ?? invoice.total_amount ?? 0
                    )
                    const discountedPrice = Number(
                      pricing?.discounted_price ?? invoice.total_amount ?? totalCostOfProduction
                    )
                    const discountAmount = pricing?.discount_amount !== undefined 
                      ? Number(pricing.discount_amount) 
                      : Math.max(0, totalCostOfProduction - discountedPrice)
                    const discountLabel = pricing?.discount_label || 'Package Discount'

                    return (
                      <div className="space-y-2.5 pb-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-neutral-600 font-medium">Total Cost of Production</span>
                          <span className="font-semibold text-neutral-900">{formatCurrency(totalCostOfProduction)}</span>
                        </div>

                        {discountAmount > 0 && (
                          <div className="flex justify-between items-center text-sm text-emerald-600 font-medium">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              {discountLabel}
                            </span>
                            <span className="font-semibold">- {formatCurrency(discountAmount)}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2.5 border-t border-neutral-100 text-sm">
                          <span className="font-bold text-neutral-900">Total Price</span>
                          <span className="font-extrabold text-neutral-900 text-base">{formatCurrency(discountedPrice)}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Payment Milestones */}
                  {invoice.payment_schedule && invoice.payment_schedule.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-neutral-100">
                      <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Payment Milestones</div>
                      <div className="space-y-2">
                        {invoice.payment_schedule.map((step: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl text-xs bg-neutral-50/70 text-neutral-700 border border-neutral-100">
                            <span className="font-medium text-neutral-800">{step.label} {step.percentage ? `(${step.percentage}%)` : ''}</span>
                            <span className="font-bold text-neutral-900">{formatCurrency(step.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Profile Settings Modal Dialog */}
      {isEditingDetails && (
        <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200/50 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">👤 Bride & Groom Profiles</h3>
                <p className="text-xs text-white/80 mt-1">Review and update contact details and social handles below.</p>
              </div>
              <button 
                onClick={() => {
                  setIsEditingDetails(false)
                  setBrideValidationStatus('idle')
                  setGroomValidationStatus('idle')
                  setBridePreviewUrl(null)
                  setGroomPreviewUrl(null)
                }}
                className="text-white/80 hover:text-white transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-xs max-h-[calc(88vh-80px)] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bride Edit Form */}
                <div className="space-y-3">
                  <div className="font-bold text-neutral-500 border-b border-neutral-100 pb-1 mb-1">Bride Profile</div>

                  {/* Bride Profile DP */}
                  <div className="flex flex-col items-center justify-center pt-1 pb-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActivePhotoMenuRole(activePhotoMenuRole === 'bride' ? null : 'bride')}
                        className="relative w-24 h-24 rounded-full p-1 bg-white border-2 border-neutral-200 shadow-md hover:border-emerald-500 hover:shadow-lg transition-all duration-200 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-emerald-500/30 active:scale-95 block"
                        title="Click to change photo"
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-neutral-100 flex items-center justify-center relative">
                          {(bridePreviewUrl || brideSelfieUrl) ? (
                            <img
                              src={bridePreviewUrl || brideSelfieUrl || ''}
                              alt="Bride Profile"
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full bg-rose-50 flex items-center justify-center text-rose-300">
                              <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                              </svg>
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-[9px] font-semibold">Change</span>
                          </div>

                          {/* Upload Spinner / AI Verifying overlay */}
                          {(uploadingBrideSelfie || brideValidationStatus === 'verifying') && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Floating Camera Button Badge */}
                        <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 group-hover:bg-emerald-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-transform group-hover:scale-110">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      </button>

                      {/* AI Face Verification Status Indicator */}
                      {brideValidationStatus === 'verifying' && (
                        <p className="text-[11px] text-amber-600 font-medium flex items-center justify-center gap-1.5 mt-2 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Verifying face with AI...</span>
                        </p>
                      )}
                      {brideValidationStatus === 'accepted' && (
                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1 mt-2 animate-in fade-in">
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Face verified with AI ✓</span>
                        </p>
                      )}
                      {brideValidationStatus === 'rejected' && (
                        <p className="text-[11px] text-rose-600 font-medium flex items-center justify-center gap-1 mt-2 animate-in fade-in">
                          <svg className="w-3.5 h-3.5 shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>{brideStatusMsg || 'Verification failed'}</span>
                        </p>
                      )}

                      {/* Dropdown Options on Tap */}
                      {activePhotoMenuRole === 'bride' && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setActivePhotoMenuRole(null)}
                          />
                          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-1.5 w-48 text-left animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={() => {
                                setActivePhotoMenuRole(null)
                                setActiveCameraRole('bride')
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                            >
                              <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <span>Click a selfie</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActivePhotoMenuRole(null)
                                brideSelfieInputRef.current?.click()
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                            >
                              <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <span>Upload photo</span>
                            </button>
                          </div>
                        </>
                      )}

                      <input
                        ref={brideSelfieInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleUploadSelfie(f, 'bride', false)
                          e.target.value = ''
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Bride's Name</label>
                    <input
                      type="text"
                      value={brideName}
                      onChange={e => setBrideName(e.target.value)}
                      placeholder="Bride's Name (e.g. Priya)"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Primary Phone</label>
                    <PhoneField
                      value={bridePhone}
                      onChange={val => setBridePhone(val || '')}
                      placeholder="Phone Number"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] text-neutral-400 font-semibold">Alternate Phone</label>
                      <span className="text-[10px] text-neutral-400">Optional</span>
                    </div>
                    <PhoneField
                      value={bridePhoneSecondary}
                      onChange={val => setBridePhoneSecondary(val || '')}
                      placeholder="Secondary or family phone"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Email</label>
                    <input
                      type="email"
                      value={brideEmail}
                      onChange={e => {
                        setBrideEmail(e.target.value)
                        if (brideEmailError) setBrideEmailError(false)
                      }}
                      onBlur={() => {
                        if (brideEmail.trim()) {
                          setBrideEmailError(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brideEmail.trim()))
                        } else {
                          setBrideEmailError(false)
                        }
                      }}
                      placeholder="priya@gmail.com"
                      className={`w-full bg-neutral-50 border rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none transition-colors ${
                        brideEmailError ? 'border-rose-500 bg-rose-50/10 focus:border-rose-500' : 'border-neutral-200 focus:border-neutral-300'
                      }`}
                    />
                    {brideEmailError && (
                      <span className="text-[10px] text-rose-500 font-medium mt-1 block">Please enter a valid email address</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Instagram Handle</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50/50 focus-within:border-neutral-300 transition-colors">
                      <span className="bg-neutral-100 px-3 py-2 text-neutral-400 select-none flex items-center text-xs border-r border-neutral-200 font-medium">instagram.com/</span>
                      <input
                        type="text"
                        value={brideInsta}
                        onChange={e => setBrideInsta(e.target.value)}
                        placeholder="username"
                        className="w-full bg-transparent p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Groom Edit Form */}
                <div className="space-y-3">
                  <div className="font-bold text-neutral-500 border-b border-neutral-100 pb-1 mb-1">Groom Profile</div>

                  {/* Groom Profile DP */}
                  <div className="flex flex-col items-center justify-center pt-1 pb-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActivePhotoMenuRole(activePhotoMenuRole === 'groom' ? null : 'groom')}
                        className="relative w-24 h-24 rounded-full p-1 bg-white border-2 border-neutral-200 shadow-md hover:border-emerald-500 hover:shadow-lg transition-all duration-200 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-emerald-500/30 active:scale-95 block"
                        title="Click to change photo"
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-neutral-100 flex items-center justify-center relative">
                          {(groomPreviewUrl || groomSelfieUrl) ? (
                            <img
                              src={groomPreviewUrl || groomSelfieUrl || ''}
                              alt="Groom Profile"
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                              </svg>
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-[9px] font-semibold">Change</span>
                          </div>

                          {/* Upload Spinner / AI Verifying overlay */}
                          {(uploadingGroomSelfie || groomValidationStatus === 'verifying') && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Floating Camera Button Badge */}
                        <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 group-hover:bg-emerald-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-transform group-hover:scale-110">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      </button>

                      {/* AI Face Verification Status Indicator */}
                      {groomValidationStatus === 'verifying' && (
                        <p className="text-[11px] text-amber-600 font-medium flex items-center justify-center gap-1.5 mt-2 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Verifying face with AI...</span>
                        </p>
                      )}
                      {groomValidationStatus === 'accepted' && (
                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1 mt-2 animate-in fade-in">
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Face verified with AI ✓</span>
                        </p>
                      )}
                      {groomValidationStatus === 'rejected' && (
                        <p className="text-[11px] text-rose-600 font-medium flex items-center justify-center gap-1 mt-2 animate-in fade-in">
                          <svg className="w-3.5 h-3.5 shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>{groomStatusMsg || 'Verification failed'}</span>
                        </p>
                      )}

                      {/* Dropdown Options on Tap */}
                      {activePhotoMenuRole === 'groom' && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setActivePhotoMenuRole(null)}
                          />
                          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-1.5 w-48 text-left animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={() => {
                                setActivePhotoMenuRole(null)
                                setActiveCameraRole('groom')
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                            >
                              <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <span>Click a selfie</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActivePhotoMenuRole(null)
                                groomSelfieInputRef.current?.click()
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                            >
                              <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <span>Upload photo</span>
                            </button>
                          </div>
                        </>
                      )}

                      <input
                        ref={groomSelfieInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleUploadSelfie(f, 'groom', false)
                          e.target.value = ''
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Groom's Name</label>
                    <input
                      type="text"
                      value={groomName}
                      onChange={e => setGroomName(e.target.value)}
                      placeholder="Groom's Name (e.g. Arjun)"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Primary Phone</label>
                    <PhoneField
                      value={groomPhone}
                      onChange={val => setGroomPhone(val || '')}
                      placeholder="Phone Number"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] text-neutral-400 font-semibold">Alternate Phone</label>
                      <span className="text-[10px] text-neutral-400">Optional</span>
                    </div>
                    <PhoneField
                      value={groomPhoneSecondary}
                      onChange={val => setGroomPhoneSecondary(val || '')}
                      placeholder="Secondary or family phone"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Email</label>
                    <input
                      type="email"
                      value={groomEmail}
                      onChange={e => {
                        setGroomEmail(e.target.value)
                        if (groomEmailError) setGroomEmailError(false)
                      }}
                      onBlur={() => {
                        if (groomEmail.trim()) {
                          setGroomEmailError(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groomEmail.trim()))
                        } else {
                          setGroomEmailError(false)
                        }
                      }}
                      placeholder="arjun@gmail.com"
                      className={`w-full bg-neutral-50 border rounded-lg p-2 text-xs text-neutral-800 font-medium focus:outline-none transition-colors ${
                        groomEmailError ? 'border-rose-500 bg-rose-50/10 focus:border-rose-500' : 'border-neutral-200 focus:border-neutral-300'
                      }`}
                    />
                    {groomEmailError && (
                      <span className="text-[10px] text-rose-500 font-medium mt-1 block">Please enter a valid email address</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-0.5 font-semibold">Instagram Handle</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50/50 focus-within:border-neutral-300 transition-colors">
                      <span className="bg-neutral-100 px-3 py-2 text-neutral-400 select-none flex items-center text-xs border-r border-neutral-200 font-medium">instagram.com/</span>
                      <input
                        type="text"
                        value={groomInsta}
                        onChange={e => setGroomInsta(e.target.value)}
                        placeholder="username"
                        className="w-full bg-transparent p-2 text-xs text-neutral-800 font-medium focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {detailsError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl p-3 text-xs text-center font-medium">
                  {detailsError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => {
                    setIsEditingDetails(false)
                    setBrideValidationStatus('idle')
                    setGroomValidationStatus('idle')
                    setBridePreviewUrl(null)
                    setGroomPreviewUrl(null)
                  }}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold px-5 py-2.5 rounded-xl transition text-xs shadow-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails || uploadingBrideSelfie || uploadingGroomSelfie || brideValidationStatus === 'verifying' || groomValidationStatus === 'verifying'}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold px-5 py-2.5 rounded-xl transition text-xs shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {savingDetails
                    ? 'Saving...'
                    : (uploadingBrideSelfie || uploadingGroomSelfie || brideValidationStatus === 'verifying' || groomValidationStatus === 'verifying')
                    ? 'Verifying Face with AI...'
                    : 'Save details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Gallery Modal */}
      {sharingGallery && (
        <ShareGalleryModal
          gallery={sharingGallery}
          onClose={() => setSharingGallery(null)}
        />
      )}

      {/* Live WebRTC Camera Modal for Selfie */}
      <PortalCameraModal
        isOpen={activeCameraRole !== null}
        onClose={() => setActiveCameraRole(null)}
        onCapture={file => {
          if (activeCameraRole) {
            handleUploadSelfie(file, activeCameraRole, true)
          }
          setActiveCameraRole(null)
        }}
        onUploadFallback={() => {
          const role = activeCameraRole
          setActiveCameraRole(null)
          if (role === 'bride') {
            brideSelfieInputRef.current?.click()
          } else if (role === 'groom') {
            groomSelfieInputRef.current?.click()
          }
        }}
        roleTitle={activeCameraRole === 'bride' ? 'Bride' : 'Groom'}
      />

      {/* Wedding Vision Questionnaire Slide Modal */}
      {showQuestionnaireModal && (
        <QuestionnaireModal
          slug={slug}
          initialStep={questionnaireInitialStep}
          onClose={() => {
            setShowQuestionnaireModal(false)
            fetchQuestionnaireStatus()
          }}
          onQuestionnaireUpdated={() => {
            fetchQuestionnaireStatus()
          }}
        />
      )}
    </div>
  )
}
