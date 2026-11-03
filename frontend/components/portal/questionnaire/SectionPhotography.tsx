'use client'

import React, { useState } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'

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
}

export default function SectionPhotography({ slug, answers, onChange }: SectionPhotographyProps) {
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkDesc, setNewLinkDesc] = useState('')
  const [linkError, setLinkError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

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
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2.5 py-1 rounded-full">
          Section 05 of 08
        </span>
        <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
          Photography Preferences
        </h2>
        <p className="text-sm text-neutral-500 italic">
          &ldquo;Let&apos;s understand the kind of photographs you love and how you want your wedding to be remembered.&rdquo;
        </p>
      </div>

      <div className="space-y-8 text-left">
        {/* Q8 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q8. What kind of photography do you connect with the most?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              'Candid and documentary',
              'Editorial and fashion-inspired',
              'Traditional and posed',
              'Fine-art photography',
              'Cinematic and dramatic',
              'Lifestyle and natural',
              'A balanced mix of different styles',
              'Other'
            ].map(style => {
              const selected = (answers.q8_styles || []).includes(style)
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => toggleArrayItem('q8_styles', style)}
                  className={`p-3 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span>{style}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {(answers.q8_styles || []).includes('Other') && (
            <input
              type="text"
              value={answers.q8_other || ''}
              onChange={e => updateField('q8_other', e.target.value)}
              placeholder="Specify custom photography style..."
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
            />
          )}
        </div>

        {/* Q9 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q9. How comfortable are you in front of the camera?
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
                  className={`p-3 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span>{opt}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Q10 */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q10. What matters most to you in your wedding photographs?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              'Emotional moments',
              'Family and relationships',
              'Fashion, outfits and jewellery',
              'Decor and venue',
              'Candid guest interactions',
              'Couple portraits',
              'Fun and spontaneous moments',
              'Rituals and cultural traditions',
              'All of the above',
              'Other'
            ].map(item => {
              const selected = (answers.q10_matters_most || []).includes(item)
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleArrayItem('q10_matters_most', item)}
                  className={`p-2.5 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span className="truncate">{item}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {(answers.q10_matters_most || []).includes('Other') && (
            <input
              type="text"
              value={answers.q10_other || ''}
              onChange={e => updateField('q10_other', e.target.value)}
              placeholder="Specify what else matters most..."
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
            />
          )}
        </div>

        {/* Q11 & MyCircle Moodboard Announcement */}
        <div className="space-y-4 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q11. Are there any photographers, films, photographs or visual styles that inspire you?
          </label>

          {/* Official MyCircle Moodboard Callout */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white space-y-4 shadow-md">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">✨</span>
              <h4 className="text-base font-bold">Build Your Wedding Moodboard on MyCircle</h4>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Save photographs and visual inspiration you love in your MyCircle app moodboard. You can also upload your references directly here.
              Whether you add inspiration here or through MyCircle, we&apos;d love to understand the visual direction you have in mind.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="https://apps.apple.com/app/id6796633077"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer"
              >
                <span></span> Download for iOS (App Store) ↗
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.mistyvisuals.mycircle"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer"
              >
                <span>▶</span> Download for Android (Google Play) ↗
              </a>
            </div>
          </div>

          {/* Add Reference Link or Upload Image */}
          <div className="p-5 bg-neutral-50 rounded-3xl border border-neutral-200 space-y-4">
            <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
              Add Visual Inspiration & References
            </h4>

            {linkError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-medium">
                {linkError}
              </div>
            )}

            <form onSubmit={handleAddLink} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="Paste Pinterest, Instagram, YouTube, or web link..."
                  className="sm:col-span-8 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                />
                <input
                  type="text"
                  value={newLinkDesc}
                  onChange={e => setNewLinkDesc(e.target.value)}
                  placeholder="Note (e.g. Haldi lighting)"
                  className="sm:col-span-4 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  + Add Link Reference
                </button>

                <span className="text-xs text-neutral-400 font-medium">or</span>

                <label className="bg-white hover:bg-neutral-100 text-neutral-800 font-semibold text-xs px-4 py-2 rounded-xl border border-neutral-200 cursor-pointer transition">
                  {uploadingImage ? `Uploading image (${uploadProgress}%)...` : '📸 Upload Reference Photo'}
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
                    className="p-3 bg-white rounded-2xl border border-neutral-200 flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {ref.type === 'upload' ? (
                        <img
                          src={ref.url}
                          alt="Reference"
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-neutral-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-lg shrink-0">
                          {ref.platform === 'pinterest' ? '📌' : ref.platform === 'instagram' ? '📸' : ref.platform === 'youtube' ? '▶️' : '🔗'}
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
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Q12: Mood / Color Palette */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q12. Is there a particular mood or colour palette you envision for your wedding photographs?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              'Warm and earthy',
              'Bright and colourful',
              'Soft and pastel',
              'Neutral and elegant',
              'Dark and moody',
              'Classic and timeless',
              'Open to the photographer\'s creative direction',
              'Other'
            ].map(pal => {
              const selected = (answers.q12_mood_palette || []).includes(pal)
              return (
                <button
                  key={pal}
                  type="button"
                  onClick={() => toggleArrayItem('q12_mood_palette', pal)}
                  className={`p-2.5 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span className="truncate">{pal}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {(answers.q12_mood_palette || []).includes('Other') && (
            <input
              type="text"
              value={answers.q12_other || ''}
              onChange={e => updateField('q12_other', e.target.value)}
              placeholder="Specify your preferred colour palette..."
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
            />
          )}
        </div>

        {/* Q13: Editing and Colour Treatment */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-neutral-900">
            Q13. Which editing and colour styles do you prefer?
          </label>
          <p className="text-xs text-neutral-500">
            Focus on the final photograph&apos;s colour grading and artistic treatment.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              'Vibrant and colourful',
              'Rich and warm tones',
              'Soft pastel tones',
              'Muted and desaturated colours',
              'Natural and true-to-life colours',
              'Film-inspired / analogue look',
              'Dark and moody edits',
              'Classic and timeless',
              'Open to your creative direction',
              'Other'
            ].map(style => {
              const selected = (answers.q13_editing_styles || []).includes(style)
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => toggleArrayItem('q13_editing_styles', style)}
                  className={`p-2.5 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span className="truncate">{style}</span>
                  {selected && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {(answers.q13_editing_styles || []).includes('Other') && (
            <input
              type="text"
              value={answers.q13_other || ''}
              onChange={e => updateField('q13_other', e.target.value)}
              placeholder="Specify custom editing style..."
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs"
            />
          )}
        </div>

        {/* Q14: Disliked Styles */}
        <div className="space-y-2 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q14. Are there any photography styles or editing treatments you dislike?
          </label>
          <textarea
            rows={3}
            value={answers.q14_disliked_styles || ''}
            onChange={e => updateField('q14_disliked_styles', e.target.value)}
            placeholder="e.g. Over-whitened skin, harsh artificial flash, excessive sepia, awkward stiff poses..."
            className="w-full p-4 rounded-2xl bg-neutral-50/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:outline-none text-sm text-neutral-900 placeholder:text-neutral-400 transition"
          />
        </div>

        {/* Q15: Romantic and Intimate Portraits Comfort */}
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <label className="block text-sm font-bold text-neutral-900">
            Q15. How comfortable are you with romantic and intimate couple portraits?
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
                  className={`p-3 rounded-2xl border text-xs font-semibold transition text-left cursor-pointer flex items-center justify-between ${
                    selected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-neutral-50/70 hover:bg-white text-neutral-700 border-neutral-200'
                  }`}
                >
                  <span>{opt}</span>
                  {selected && <span>✓</span>}
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
