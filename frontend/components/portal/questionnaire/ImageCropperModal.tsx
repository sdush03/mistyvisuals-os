'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'

export interface CropMetadata {
  x: number // percentage 0 - 100
  y: number // percentage 0 - 100
  width: number // percentage 0 - 100
  height: number // percentage 0 - 100
  aspect: string // 'freeform' | '1:1' | '3:4' | '4:3'
}

export interface SavedCroppedPerson {
  name: string
  relationship: string
  custom_relationship?: string
  category: 'parents' | 'siblings' | 'grandparents' | 'extended' | 'friends' | 'other'
  priority: 'high' | 'medium' | 'low'
  is_remembering: boolean
  notes?: string
  photo_url: string
  storage_key: string
  original_photo_url: string
  original_storage_key: string
  crop_data: CropMetadata
}

interface ImageCropperModalProps {
  slug: string
  side: 'bride' | 'groom'
  initialImageUrl?: string
  initialStorageKey?: string
  onSavePerson: (person: SavedCroppedPerson) => Promise<void>
  onClose: () => void
}

export default function ImageCropperModal({
  slug,
  side,
  initialImageUrl,
  initialStorageKey,
  onSavePerson,
  onClose
}: ImageCropperModalProps) {
  // Original uploaded photo state
  const [originalUrl, setOriginalUrl] = useState<string | null>(initialImageUrl || null)
  const [originalStorageKey, setOriginalStorageKey] = useState<string | null>(initialStorageKey || null)
  const [uploadingOriginal, setUploadingOriginal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')

  // Crop coordinates (stored as percentages 0-100 of displayed image)
  const [crop, setCrop] = useState<CropMetadata>({
    x: 20,
    y: 15,
    width: 60,
    height: 70,
    aspect: '3:4'
  })
  const [aspectRatioPreset, setAspectRatioPreset] = useState<'freeform' | '1:1' | '3:4' | '4:3'>('3:4')

  // Person form fields
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [customRelationship, setCustomRelationship] = useState('')
  const [category, setCategory] = useState<'parents' | 'siblings' | 'grandparents' | 'extended' | 'friends' | 'other'>('extended')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [isRemembering, setIsRemembering] = useState(false)
  const [notes, setNotes] = useState('')

  const [savingCrop, setSavingCrop] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [successMsg, setSuccessMsg] = useState('')
  const [formError, setFormError] = useState('')

  // Dragging and resizing interaction refs
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef<string | null>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startCrop: CropMetadata }>({
    mouseX: 0,
    mouseY: 0,
    startCrop: { ...crop }
  })

  // Handle auto priority adjustment when relationship/category changes
  const handleCategoryChange = (cat: typeof category) => {
    setCategory(cat)
    if (cat === 'parents' || cat === 'siblings' || cat === 'grandparents') {
      setPriority('high')
    } else if (cat === 'friends') {
      setPriority('low')
    } else {
      setPriority('medium')
    }
  }

  // Handle original photo selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (JPG, PNG, WebP, or HEIC).')
      return
    }

    try {
      setUploadingOriginal(true)
      setUploadError('')
      setUploadProgress(10)

      const res = await uploadMediaToR2({
        slug,
        file,
        section: 'family',
        onProgress: (pct) => setUploadProgress(pct)
      })

      setOriginalUrl(res.fileUrl)
      setOriginalStorageKey(res.storageKey)
      // Reset crop to center
      setCrop({
        x: 20,
        y: 15,
        width: 60,
        height: 70,
        aspect: aspectRatioPreset
      })
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingOriginal(false)
    }
  }

  // Handle Drag Move
  const handlePointerDown = (e: React.PointerEvent, handleType: string | null = null) => {
    e.preventDefault()
    e.stopPropagation()
    if (!imageContainerRef.current) return

    const rect = imageContainerRef.current.getBoundingClientRect()
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startCrop: { ...crop }
    }

    if (handleType) {
      isResizingRef.current = handleType
    } else {
      isDraggingRef.current = true
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!imageContainerRef.current) return
      const rect = imageContainerRef.current.getBoundingClientRect()
      const deltaXPercent = ((moveEvent.clientX - dragStartRef.current.mouseX) / rect.width) * 100
      const deltaYPercent = ((moveEvent.clientY - dragStartRef.current.mouseY) / rect.height) * 100

      if (isDraggingRef.current) {
        // Moving crop box
        const newX = Math.max(0, Math.min(100 - crop.width, dragStartRef.current.startCrop.x + deltaXPercent))
        const newY = Math.max(0, Math.min(100 - crop.height, dragStartRef.current.startCrop.y + deltaYPercent))
        setCrop(prev => ({ ...prev, x: newX, y: newY }))
      } else if (isResizingRef.current) {
        // Resizing crop box
        let newWidth = dragStartRef.current.startCrop.width
        let newHeight = dragStartRef.current.startCrop.height
        let newX = dragStartRef.current.startCrop.x
        let newY = dragStartRef.current.startCrop.y

        const handle = isResizingRef.current
        if (handle.includes('right')) {
          newWidth = Math.max(15, Math.min(100 - newX, dragStartRef.current.startCrop.width + deltaXPercent))
        }
        if (handle.includes('bottom')) {
          newHeight = Math.max(15, Math.min(100 - newY, dragStartRef.current.startCrop.height + deltaYPercent))
        }
        if (handle.includes('left')) {
          const maxLeftShift = dragStartRef.current.startCrop.x + dragStartRef.current.startCrop.width - 15
          newX = Math.max(0, Math.min(maxLeftShift, dragStartRef.current.startCrop.x + deltaXPercent))
          newWidth = dragStartRef.current.startCrop.width + (dragStartRef.current.startCrop.x - newX)
        }
        if (handle.includes('top')) {
          const maxTopShift = dragStartRef.current.startCrop.y + dragStartRef.current.startCrop.height - 15
          newY = Math.max(0, Math.min(maxTopShift, dragStartRef.current.startCrop.y + deltaYPercent))
          newHeight = dragStartRef.current.startCrop.height + (dragStartRef.current.startCrop.y - newY)
        }

        // Apply aspect ratio constraints if not freeform
        if (aspectRatioPreset === '1:1') {
          const minDim = Math.min(newWidth, newHeight)
          newWidth = minDim
          newHeight = minDim
        } else if (aspectRatioPreset === '3:4') {
          // 3 width : 4 height
          newHeight = (newWidth * 4) / 3
        } else if (aspectRatioPreset === '4:3') {
          newHeight = (newWidth * 3) / 4
        }

        // Bound to boundaries
        if (newX + newWidth > 100) newWidth = 100 - newX
        if (newY + newHeight > 100) newHeight = 100 - newY

        setCrop(prev => ({
          ...prev,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        }))
      }
    }

    const onPointerUp = () => {
      isDraggingRef.current = false
      isResizingRef.current = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Create crop blob using canvas
  const generateCroppedBlob = async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!originalUrl) {
        reject(new Error('No image loaded'))
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const natWidth = img.naturalWidth
        const natHeight = img.naturalHeight

        const pixelX = Math.round((crop.x / 100) * natWidth)
        const pixelY = Math.round((crop.y / 100) * natHeight)
        const pixelW = Math.round((crop.width / 100) * natWidth)
        const pixelH = Math.round((crop.height / 100) * natHeight)

        // Output size bounded to 600px max for avatar/profile thumbnails
        const targetW = Math.min(pixelW, 600)
        const targetH = Math.round((targetW * pixelH) / pixelW)

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to create canvas context'))
          return
        }

        ctx.drawImage(img, pixelX, pixelY, pixelW, pixelH, 0, 0, targetW, targetH)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas to blob failed'))
          },
          'image/jpeg',
          0.88
        )
      }
      img.onerror = () => reject(new Error('Failed to load image for cropping'))
      img.src = originalUrl
    })
  }

  // Handle Save Current Crop & Person
  const handleSaveCurrentPerson = async (shouldAddAnother = false) => {
    if (!name.trim()) {
      setFormError('Please enter person name.')
      return
    }
    if (!relationship.trim()) {
      setFormError('Please enter relationship (e.g. Mother, Brother, Cousin).')
      return
    }
    if (!originalUrl || !originalStorageKey) {
      setFormError('Please upload a photograph first.')
      return
    }

    try {
      setSavingCrop(true)
      setFormError('')

      // 1. Generate crop image blob
      const cropBlob = await generateCroppedBlob()

      // 2. Upload crop thumbnail directly to R2
      const cropUpload = await uploadMediaToR2({
        slug,
        file: cropBlob,
        section: 'family'
      })

      // 3. Save person record via callback
      await onSavePerson({
        name: name.trim(),
        relationship: relationship.trim(),
        custom_relationship: customRelationship.trim() || undefined,
        category,
        priority,
        is_remembering: isRemembering,
        notes: notes.trim() || undefined,
        photo_url: cropUpload.fileUrl,
        storage_key: cropUpload.storageKey,
        original_photo_url: originalUrl,
        original_storage_key: originalStorageKey,
        crop_data: { ...crop }
      })

      setSavedCount(prev => prev + 1)
      setSuccessMsg(`✓ Saved ${name.trim()} to ${side === 'bride' ? "Bride's" : "Groom's"} Side!`)

      if (shouldAddAnother) {
        // Reset form for next person from the SAME group photo!
        setName('')
        setRelationship('')
        setCustomRelationship('')
        setNotes('')
        setIsRemembering(false)
        // Keep category as extended/other or current
        setTimeout(() => setSuccessMsg(''), 4000)
      } else {
        setTimeout(() => {
          onClose()
        }, 800)
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save person')
    } finally {
      setSavingCrop(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-2xl max-w-4xl w-full p-6 md:p-8 space-y-6 text-left my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📸</span>
              <h2 className="text-lg md:text-xl font-bold text-neutral-900">
                {originalUrl ? 'Group Photo & Multi-Person Crop Tool' : 'Upload Family or Group Photograph'}
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {side === 'bride' ? "Bride's Side" : "Groom's Side"} · Upload one group photo and create individual crops for multiple relatives.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-2 rounded-xl hover:bg-neutral-100 transition cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {uploadError}
            </div>
          )}

          {/* STEP 1: If no image uploaded yet, show upload dropzone */}
          {!originalUrl && (
            <div className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-3xl p-10 text-center space-y-4 bg-neutral-50/50 transition">
              <div className="w-16 h-16 rounded-full bg-neutral-200/70 flex items-center justify-center mx-auto text-2xl text-neutral-600">
                🖼️
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-800">
                  Select a Family or Group Photograph
                </h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Have a group photo with parents, siblings, or cousins? Upload it once, and you can crop and tag each person individually!
                </p>
              </div>

              <label className="inline-block bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-6 py-3 rounded-2xl cursor-pointer transition shadow-sm">
                {uploadingOriginal ? `Compressing & Uploading (${uploadProgress}%)...` : 'Choose Photo from Device'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={uploadingOriginal}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <div className="text-[11px] text-neutral-400">
                Supports JPG, PNG, WebP, HEIC · Automatically optimized client-side
              </div>
            </div>
          )}

          {/* STEP 2: Crop view and Person Details Form */}
          {originalUrl && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Image with Interactive Crop Box (7 cols) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neutral-700">1. Adjust Crop on Photo</span>
                  <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
                    {(['3:4', '1:1', '4:3', 'freeform'] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAspectRatioPreset(preset)
                          setCrop(prev => ({ ...prev, aspect: preset }))
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer ${
                          aspectRatioPreset === preset
                            ? 'bg-white text-neutral-900 shadow-xs'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        {preset === '3:4' ? 'Portrait (3:4)' : preset === '1:1' ? 'Square' : preset === '4:3' ? 'Landscape' : 'Freeform'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cropping Canvas Frame */}
                <div
                  ref={imageContainerRef}
                  className="relative select-none overflow-hidden rounded-2xl bg-neutral-950 border border-neutral-300 max-h-[440px] flex items-center justify-center touch-none"
                  style={{ userSelect: 'none' }}
                >
                  <img
                    ref={imgRef}
                    src={originalUrl}
                    alt="Original Upload"
                    className="max-h-[440px] w-auto object-contain block pointer-events-none"
                  />

                  {/* Shaded backdrop overlay outside crop */}
                  <div
                    className="absolute inset-0 bg-black/45 pointer-events-none"
                    style={{
                      clipPath: `polygon(
                        0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                        ${crop.x}% ${crop.y}%,
                        ${crop.x}% ${crop.y + crop.height}%,
                        ${crop.x + crop.width}% ${crop.y + crop.height}%,
                        ${crop.x + crop.width}% ${crop.y}%,
                        ${crop.x}% ${crop.y}%
                      )`
                    }}
                  />

                  {/* Interactive Crop Box */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, null)}
                    className="absolute border-2 border-white/95 rounded-lg shadow-lg cursor-move transition-shadow"
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 8px 30px rgba(0,0,0,0.5)'
                    }}
                  >
                    {/* Grid rule of thirds */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                      <div className="border-r border-b border-white/40"></div>
                      <div className="border-r border-b border-white/40"></div>
                      <div className="border-b border-white/40"></div>
                      <div className="border-r border-b border-white/40"></div>
                      <div className="border-r border-b border-white/40"></div>
                      <div className="border-b border-white/40"></div>
                      <div className="border-r border-white/40"></div>
                      <div className="border-r border-white/40"></div>
                      <div></div>
                    </div>

                    {/* Resize Handles */}
                    {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((h) => (
                      <div
                        key={h}
                        onPointerDown={(e) => handlePointerDown(e, h)}
                        className={`absolute w-3.5 h-3.5 bg-white border border-neutral-900 rounded-full z-10 cursor-${
                          h === 'top-left' || h === 'bottom-right' ? 'nwse' : 'nesw'
                        }-resize ${
                          h.includes('top') ? '-top-1.5' : '-bottom-1.5'
                        } ${
                          h.includes('left') ? '-left-1.5' : '-right-1.5'
                        }`}
                      />
                    ))}

                    <div className="absolute -top-6 left-1 text-[9px] font-bold text-white bg-black/70 px-2 py-0.5 rounded-md pointer-events-none uppercase tracking-wider">
                      Drag to position & resize
                    </div>
                  </div>
                </div>

                {/* Change photo button */}
                <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                  <span>✨ Tip: You can crop face or upper body.</span>
                  <label className="text-[11px] font-semibold text-neutral-800 hover:text-black underline cursor-pointer">
                    Replace original photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Right Column: Person Profile Form (5 cols) */}
              <div className="lg:col-span-5 space-y-4 bg-neutral-50/70 p-5 rounded-2xl border border-neutral-200">
                <div className="border-b border-neutral-200 pb-2">
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                    2. Person Details
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Assign this crop to a relative on {side === 'bride' ? "Bride's" : "Groom's"} Side.
                  </p>
                </div>

                {formError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-medium">
                    {formError}
                  </div>
                )}

                {successMsg && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold animate-fade-in">
                    {successMsg}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Ramesh Sharma"
                    className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-medium focus:outline-none focus:border-neutral-400 transition"
                  />
                </div>

                {/* Category & Relationship */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Branch / Category *
                    </label>
                    <select
                      value={category}
                      onChange={e => handleCategoryChange(e.target.value as any)}
                      className="w-full px-2.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-medium focus:outline-none focus:border-neutral-400 transition cursor-pointer"
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
                    <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Relationship *
                    </label>
                    <select
                      value={relationship}
                      onChange={e => setRelationship(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-medium focus:outline-none focus:border-neutral-400 transition cursor-pointer"
                    >
                      <option value="">Select...</option>
                      {category === 'parents' && (
                        <>
                          <option value="Father">Father</option>
                          <option value="Mother">Mother</option>
                        </>
                      )}
                      {category === 'siblings' && (
                        <>
                          <option value="Brother">Brother</option>
                          <option value="Sister">Sister</option>
                          <option value="Bhabhi">Bhabhi</option>
                          <option value="Jiju / Brother-in-law">Jiju / Brother-in-law</option>
                        </>
                      )}
                      {category === 'grandparents' && (
                        <>
                          <option value="Dada / Grandfather">Dada / Grandfather</option>
                          <option value="Dadi / Grandmother">Dadi / Grandmother</option>
                          <option value="Nana / Grandfather">Nana / Grandfather</option>
                          <option value="Nani / Grandmother">Nani / Grandmother</option>
                        </>
                      )}
                      {category === 'extended' && (
                        <>
                          <option value="Chacha / Uncle">Chacha / Uncle</option>
                          <option value="Chachi / Aunt">Chachi / Aunt</option>
                          <option value="Mama / Uncle">Mama / Uncle</option>
                          <option value="Mami / Aunt">Mami / Aunt</option>
                          <option value="Bua / Aunt">Bua / Aunt</option>
                          <option value="Fufa / Uncle">Fufa / Uncle</option>
                          <option value="Mausa / Uncle">Mausa / Uncle</option>
                          <option value="Mausi / Aunt">Mausi / Aunt</option>
                          <option value="Cousin">Cousin</option>
                          <option value="Cousin Spouse">Cousin Spouse</option>
                          <option value="Cousin Child">Cousin Child</option>
                          <option value="Relative">Other Relative</option>
                        </>
                      )}
                      {category === 'friends' && (
                        <>
                          <option value="Bride's Friend">Bride's Friend</option>
                          <option value="Groom's Friend">Groom's Friend</option>
                          <option value="Common Friend">Common Friend</option>
                          <option value="Best Man / Bridesmaid">Best Man / Bridesmaid</option>
                        </>
                      )}
                      <option value="Other">Other / Custom</option>
                    </select>
                  </div>
                </div>

                {/* Custom Relationship if Other selected */}
                {(relationship === 'Other' || category === 'other') && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Specify Relationship
                    </label>
                    <input
                      type="text"
                      value={customRelationship}
                      onChange={e => setCustomRelationship(e.target.value)}
                      placeholder="e.g. Godparent, Mentor, Family Doctor"
                      className="w-full px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 font-medium focus:outline-none focus:border-neutral-400 transition"
                    />
                  </div>
                )}

                {/* Priority Selection */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Photography Priority
                    </label>
                    <span className="text-[10px] text-neutral-400">Guides coverage focus</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { val: 'high', label: 'High Priority', desc: 'VIP / Close focus' },
                      { val: 'medium', label: 'Medium', desc: 'Standard focus' },
                      { val: 'low', label: 'Low', desc: 'Candid / Casual' }
                    ].map(p => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setPriority(p.val as any)}
                        className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                          priority === p.val
                            ? p.val === 'high'
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : p.val === 'medium'
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'bg-neutral-100 border-neutral-300 text-neutral-800'
                            : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                        }`}
                      >
                        <div className="text-[11px] font-bold">{p.label}</div>
                        <div className="text-[9px] opacity-75">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sensitive Status: Remembering Someone */}
                <div className="p-3 bg-neutral-100/70 border border-neutral-200/80 rounded-xl space-y-1.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                      <span>🕊️</span> Remembering someone
                    </span>
                    <input
                      type="checkbox"
                      checked={isRemembering}
                      onChange={e => setIsRemembering(e.target.checked)}
                      className="w-4 h-4 rounded text-neutral-900 border-neutral-300 accent-neutral-900"
                    />
                  </label>
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    Let us know if this person is no longer with us, so our team can be mindful and approach family moments with sensitivity.
                  </p>
                </div>

                {/* Optional Notes */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                    Notes for Photography Team (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Arriving late on Sangeet day, loves candid smiles, dancing in sangeet"
                    className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-400 transition"
                  />
                </div>

                {/* Multi-crop Action Buttons */}
                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    disabled={savingCrop}
                    onClick={() => handleSaveCurrentPerson(true)}
                    className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {savingCrop ? 'Saving Crop...' : '✓ Save & Crop Next Person from This Photo'}
                  </button>

                  <button
                    type="button"
                    disabled={savingCrop}
                    onClick={() => handleSaveCurrentPerson(false)}
                    className="w-full bg-white hover:bg-neutral-100 text-neutral-800 font-semibold py-2 px-4 rounded-xl text-xs border border-neutral-200 transition cursor-pointer"
                  >
                    Save & Finish
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
