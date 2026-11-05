'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'
import { buildGalleryUrl } from '@/lib/shareURL'
import { Camera, Sparkles, Bookmark, Play, Link2 } from 'lucide-react'

export interface GalleryInfo {
  exists?: boolean
  id?: number | string
  slug?: string
  title?: string
  coverPhotoUrl?: string | null
  passcode?: string | null
  partialPasscode?: string | null
}

export interface VisualReferenceItem {
  id: string
  url: string
  type: 'upload' | 'link'
  platform?: 'pinterest' | 'instagram' | 'youtube' | 'web' | 'upload'
  description?: string
  storage_key?: string
}

export interface PhotographyAnswers {
  q8_styles?: string[]
  q8_other?: string
  q9_camera_comfort?: string
  q10_matters_most?: string[]
  q10_other?: string
  q11_inspirations?: VisualReferenceItem[]
  q11_notes?: string
  q12_mood_palette?: string[]
  q12_other?: string
  q13_editing_styles?: string[]
  q13_other?: string
  q14_disliked_styles?: string
  q14_disliked_references?: VisualReferenceItem[]
  q15_romantic_comfort?: string
  q15_poses_to_avoid?: string
}

interface SectionPhotographyProps {
  slug: string
  answers: PhotographyAnswers
  onChange: (answers: PhotographyAnswers) => void
  gallery?: GalleryInfo | null
}

export default function SectionPhotography({ slug, answers, onChange, gallery }: SectionPhotographyProps) {
  const [liveGallery, setLiveGallery] = useState<GalleryInfo | null>(gallery || null)
  const [checkingGallery, setCheckingGallery] = useState(false)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkDesc, setNewLinkDesc] = useState('')
  const [linkError, setLinkError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Keep liveGallery updated when gallery prop changes
  useEffect(() => {
    if (gallery) {
      setLiveGallery(gallery)
    }
  }, [gallery])

  // Smart real-time gallery detection: fetch on mount and on window focus
  const refreshGalleryStatus = useCallback(async () => {
    try {
      setCheckingGallery(true)
      const res = await fetch(`/api/client-portal/${slug}/questionnaire`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json?.gallery) {
          setLiveGallery(json.gallery)
        }
      }
    } catch {
      // ignore network errors in background poll
    } finally {
      setCheckingGallery(false)
    }
  }, [slug])

  useEffect(() => {
    refreshGalleryStatus()
    const handleFocus = () => {
      refreshGalleryStatus()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshGalleryStatus])

  const isGalleryActive = Boolean(liveGallery?.exists && (liveGallery.slug || slug))
  const gallerySlug = (liveGallery?.slug || slug || '').trim()
  const galleryPasscode = liveGallery?.passcode || null
  const fullAccessUrl = isGalleryActive ? buildGalleryUrl(gallerySlug, galleryPasscode) : null

  // Smart fallback link: First preference is the project gallery; fallback to the app only
  const smartUrl = isGalleryActive && fullAccessUrl
    ? fullAccessUrl
    : `/api/client-portal/${slug}/gallery-redirect`

  const smartButtonLabel = isGalleryActive
    ? 'Open Gallery & Moodboard'
    : 'Open in MyCircle App'

  const handleSmartLinkClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If gallery is already known and active, standard navigation opens full access gallery
    if (isGalleryActive && fullAccessUrl) {
      return
    }

    // Dynamic smart check: if gallery was created recently, verify before fallback
    e.preventDefault()
    try {
      const res = await fetch(`/api/client-portal/${slug}/questionnaire`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json?.gallery?.exists) {
          setLiveGallery(json.gallery)
          const targetUrl = buildGalleryUrl(json.gallery.slug || slug, json.gallery.passcode)
          window.open(targetUrl, '_blank', 'noopener,noreferrer')
          return
        }
      }
    } catch {}

    // Fallback: If gallery is not present, open the app fallback
    window.open(`/api/client-portal/${slug}/gallery-redirect`, '_blank', 'noopener,noreferrer')
  }

  const toggleArrayItem = (field: keyof PhotographyAnswers, item: string) => {
    const list = ((answers[field] as string[]) || []).slice()
    const index = list.indexOf(item)
    if (index >= 0) {
      list.splice(index, 1)
    } else {
      list.push(item)
    }
    onChange({ ...answers, [field]: list })
  }

  const updateField = (field: keyof PhotographyAnswers, val: any) => {
    onChange({ ...answers, [field]: val })
  }

  // Handle adding external link (Pinterest, Instagram, YouTube, etc.)
  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLinkUrl.trim()) return

    const url = newLinkUrl.trim()
    let platform: VisualReferenceItem['platform'] = 'web'
    if (url.includes('pinterest.')) platform = 'pinterest'
    else if (url.includes('instagram.')) platform = 'instagram'
    else if (url.includes('youtube.') || url.includes('youtu.be')) platform = 'youtube'

    const newItem: VisualReferenceItem = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url,
      type: 'link',
      platform,
      description: newLinkDesc.trim() || undefined
    }

    const currentList = answers.q11_inspirations || []
    updateField('q11_inspirations', [...currentList, newItem])
    setNewLinkUrl('')
    setNewLinkDesc('')
    setLinkError('')
  }

  // Handle image reference upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setLinkError('Video file uploads are not permitted here. Please paste a video link or upload an image.')
      return
    }

    try {
      setUploadingImage(true)
      setLinkError('')
      const res = await uploadMediaToR2({
        slug,
        file,
        section: 'photography',
        onProgress: (pct) => setUploadProgress(pct)
      })

      const newItem: VisualReferenceItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: res.fileUrl,
        type: 'upload',
        platform: 'upload',
        storage_key: res.storageKey,
        description: file.name
      }

      const currentList = answers.q11_inspirations || []
      updateField('q11_inspirations', [...currentList, newItem])
    } catch (err: any) {
      setLinkError(err.message || 'Failed to upload reference photo')
    } finally {
      setUploadingImage(false)
      if (e.target) e.target.value = ''
    }
  }

  const removeReference = (id: string) => {
    const list = (answers.q11_inspirations || []).filter(item => item.id !== id)
    updateField('q11_inspirations', list)
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto py-2">
      {/* Section Header */}
      <div className="space-y-2 border-b border-neutral-100 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Photography Preferences
        </h2>
        <p className="text-sm text-neutral-500">
          Let&apos;s understand the kind of photographs you love and how you want your wedding to be remembered.
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q1: Styles and Moments */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q1. What photography styles and moments matter most to you?
          </label>
          <p className="text-xs text-neutral-500">
            Select the styles and priority moments that you would love our photography team to focus on.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              'Candid and documentary moments',
              'Emotional family & parent moments',
              'Editorial and fashion-inspired',
              'Couple portraits & romance',
              'Fun, spontaneous guest celebrations',
              'Rituals and cultural ceremonies',
              'Fine-art photography & lighting',
              'Decor, outfits and venue aesthetics',
              'Traditional and family portraits',
              'A balanced mix of all styles',
              'Other'
            ].map(style => {
              const selected = (answers.q8_styles || []).includes(style) || (answers.q10_matters_most || []).includes(style)
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => {
                    toggleArrayItem('q8_styles', style)
                    toggleArrayItem('q10_matters_most', style)
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
          {((answers.q8_styles || []).includes('Other') || (answers.q10_matters_most || []).includes('Other')) && (
            <input
              type="text"
              value={answers.q8_other || answers.q10_other || ''}
              onChange={e => {
                updateField('q8_other', e.target.value)
                updateField('q10_other', e.target.value)
              }}
              placeholder="Specify custom style or moments that matter most..."
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
            />
          )}
        </div>

        {/* Q2: Camera Comfort */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q2. How comfortable are you in front of the camera?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              'Very comfortable',
              'Fairly comfortable',
              'A little camera shy',
              'Prefer natural, unposed moments'
            ].map(opt => {
              const selected = answers.q9_camera_comfort === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField('q9_camera_comfort', opt)}
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

        {/* Q3: Visual Inspiration */}
        <div className="space-y-5 border-t border-neutral-100 pt-6">
          <div className="space-y-1">
            <label className="block text-sm font-bold text-neutral-900">
              Q3. Are there any photographs or visual styles that inspire you?
            </label>
            <p className="text-xs text-neutral-500">
              Share references that capture the lighting, mood, color palette, or moments you love.
            </p>
          </div>

          {/* 1. PRIMARY PREFERENCE: Upload Reference Photos & Paste Links Directly Here */}
          <div className="p-5 sm:p-6 bg-neutral-50/80 rounded-3xl border border-neutral-200/80 space-y-4">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                Add Visual Inspiration & References
              </h4>
              <p className="text-xs text-neutral-500">
                Upload photos or add links with a note so our team has your visual references organized with your questionnaire.
              </p>
            </div>

            {linkError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-medium">
                {linkError}
              </div>
            )}

            <form onSubmit={handleAddLink} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="Paste Pinterest, Instagram, YouTube, or web link..."
                  className="sm:col-span-8 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 shadow-2xs"
                />
                <input
                  type="text"
                  value={newLinkDesc}
                  onChange={e => setNewLinkDesc(e.target.value)}
                  placeholder="Note (e.g. Haldi lighting, couple portraits)"
                  className="sm:col-span-4 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 shadow-2xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
                >
                  + Add Link Reference
                </button>

                <span className="text-xs text-neutral-400 font-medium">or</span>

                <label className="bg-white hover:bg-neutral-100 text-neutral-800 font-semibold text-xs px-4 py-2.5 rounded-xl border border-neutral-200 cursor-pointer transition shadow-2xs flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-neutral-600" />
                  <span>{uploadingImage ? `Uploading image (${uploadProgress}%)...` : 'Upload Reference Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </form>

            {/* Reference Items Display */}
            {(answers.q11_inspirations || []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(answers.q11_inspirations || []).map(ref => (
                  <div
                    key={ref.id}
                    className="p-3 bg-white rounded-2xl border border-neutral-200 flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {ref.type === 'upload' ? (
                        <img
                          src={ref.url}
                          alt="Reference"
                          className="w-11 h-11 rounded-xl object-cover shrink-0 border border-neutral-200"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                          {ref.platform === 'pinterest' ? (
                            <Bookmark className="w-5 h-5 text-neutral-600" />
                          ) : ref.platform === 'instagram' ? (
                            <Camera className="w-5 h-5 text-neutral-600" />
                          ) : ref.platform === 'youtube' ? (
                            <Play className="w-5 h-5 text-neutral-600" />
                          ) : (
                            <Link2 className="w-5 h-5 text-neutral-600" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-neutral-800 hover:underline truncate block"
                        >
                          {ref.description || ref.url}
                        </a>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                          {ref.platform || ref.type}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeReference(ref.id)}
                      className="p-1.5 text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                      title="Remove reference"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Build Wedding Moodboard on MyCircle */}
          <div className="p-5 bg-neutral-50/70 rounded-3xl border border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <h4 className="text-sm font-bold text-neutral-900">
                  You Can Also Build Your Wedding Moodboard on MyCircle
                </h4>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                You can explore curated photographs and save the ones you love.
              </p>
            </div>

            <div className="shrink-0">
              <a
                href={smartUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSmartLinkClick}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs font-semibold shadow-2xs transition cursor-pointer whitespace-nowrap"
              >
                <span>{smartButtonLabel}</span>
                <span className="text-xs">↗</span>
              </a>
            </div>
          </div>
        </div>

        {/* Q4: Mood, Palette & Editing Style */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q4. What mood, colour palette, and editing style do you prefer for your wedding photographs?
          </label>
          <p className="text-xs text-neutral-500">
            Select the tones, colours, and aesthetic treatments you would love for your wedding imagery.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              'Warm, earthy & rich tones',
              'Natural & true-to-life colours',
              'Bright, vibrant & colourful',
              'Soft, airy & pastel tones',
              'Classic, clean & timeless',
              'Film-inspired & analogue look',
              'Muted & desaturated tones',
              'Dark & moody artistic edits',
              'Open to the photographer\'s creative direction',
              'Other'
            ].map(opt => {
              const q12List = answers.q12_mood_palette || []
              const q13List = answers.q13_editing_styles || []
              const isSelected =
                q12List.includes(opt) ||
                q13List.includes(opt) ||
                (opt === 'Warm, earthy & rich tones' && (q12List.includes('Warm and earthy') || q13List.includes('Rich and warm tones'))) ||
                (opt === 'Natural & true-to-life colours' && (q12List.includes('Neutral and elegant') || q13List.includes('Natural and true-to-life colours'))) ||
                (opt === 'Bright, vibrant & colourful' && (q12List.includes('Bright and colourful') || q13List.includes('Vibrant and colourful'))) ||
                (opt === 'Soft, airy & pastel tones' && (q12List.includes('Soft and pastel') || q13List.includes('Soft pastel tones'))) ||
                (opt === 'Classic, clean & timeless' && (q12List.includes('Classic and timeless') || q13List.includes('Classic and timeless'))) ||
                (opt === 'Film-inspired & analogue look' && q13List.includes('Film-inspired / analogue look')) ||
                (opt === 'Muted & desaturated tones' && q13List.includes('Muted and desaturated colours')) ||
                (opt === 'Dark & moody artistic edits' && (q12List.includes('Dark and moody') || q13List.includes('Dark and moody edits'))) ||
                (opt === "Open to the photographer's creative direction" && (q12List.includes("Open to the photographer's creative direction") || q13List.includes('Open to your creative direction'))) ||
                (opt === 'Other' && (q12List.includes('Other') || q13List.includes('Other')))

              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const toggleItem = (list: string[], item: string, active: boolean) => {
                      const copy = list.slice()
                      const idx = copy.indexOf(item)
                      if (active && idx >= 0) copy.splice(idx, 1)
                      else if (!active && idx < 0) copy.push(item)
                      return copy
                    }
                    const nextQ12 = toggleItem(q12List, opt, isSelected)
                    const nextQ13 = toggleItem(q13List, opt, isSelected)
                    onChange({
                      ...answers,
                      q12_mood_palette: nextQ12,
                      q13_editing_styles: nextQ13
                    })
                  }}
                  className={`px-3.5 py-2.5 rounded-xl text-xs transition text-left cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-white border-2 border-neutral-900 shadow-sm ring-1 ring-neutral-900/10 text-neutral-900 font-semibold'
                      : 'bg-white hover:bg-neutral-50/80 border border-neutral-200/80 text-neutral-700 font-normal'
                  }`}
                >
                  <span className="truncate text-xs">{opt}</span>
                  {isSelected ? (
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-neutral-300 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
          {((answers.q12_mood_palette || []).includes('Other') || (answers.q13_editing_styles || []).includes('Other')) && (
            <input
              type="text"
              value={answers.q12_other || answers.q13_other || ''}
              onChange={e => {
                onChange({
                  ...answers,
                  q12_other: e.target.value,
                  q13_other: e.target.value
                })
              }}
              placeholder="Specify custom palette or editing style..."
              className="w-full p-3 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:outline-none"
            />
          )}
        </div>

        {/* Q5: Disliked Styles */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q5. Are there any photography styles or editing treatments you dislike?
          </label>
          <textarea
            rows={3}
            value={answers.q14_disliked_styles || ''}
            onChange={e => updateField('q14_disliked_styles', e.target.value)}
            placeholder="e.g. Over-whitened skin, harsh artificial flash, excessive sepia, awkward stiff poses..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q6: Romantic and Intimate Portraits Comfort */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q6. How comfortable are you with romantic and intimate couple portraits?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              'Very comfortable, including intimate poses.',
              'Comfortable with romantic and natural poses.',
              'Prefer subtle and candid couple photographs.',
              'Prefer minimal physical posing.',
              'We would like guidance from the photographer.'
            ].map(opt => {
              const selected = answers.q15_romantic_comfort === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField('q15_romantic_comfort', opt)}
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

          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-semibold text-neutral-700">
              Are there any poses or types of photographs you would prefer us to avoid? (Optional)
            </label>
            <input
              type="text"
              value={answers.q15_poses_to_avoid || ''}
              onChange={e => updateField('q15_poses_to_avoid', e.target.value)}
              placeholder="e.g. Cheesy dip poses, close-up forehead kisses, overly dramatic stares..."
              className="w-full p-3 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
