'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { uploadMediaToR2 } from '@/lib/r2Upload'
import { detectFaceAndSmartCrop } from '@/lib/faceCrop'
import { Camera, Image as ImageIcon, Check, ZoomIn, ZoomOut, RotateCcw, Sparkles } from 'lucide-react'

export interface CropMetadata {
  x: number // percentage 0 - 100
  y: number // percentage 0 - 100
  width: number // percentage 0 - 100
  height: number // percentage 0 - 100
  aspect: '1:1'
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
  targetPerson?: {
    id?: string
    name?: string
    relationship?: string
    category?: 'parents' | 'siblings' | 'grandparents' | 'extended' | 'friends' | 'other'
    priority?: 'high' | 'medium' | 'low'
    is_remembering?: boolean
    crop_data?: CropMetadata
  }
  onSavePerson: (person: SavedCroppedPerson) => Promise<void>
  onClose: () => void
}

export default function ImageCropperModal({
  slug,
  side,
  initialImageUrl,
  initialStorageKey,
  targetPerson,
  onSavePerson,
  onClose
}: ImageCropperModalProps) {
  // Original uploaded photo state
  const [originalUrl, setOriginalUrl] = useState<string | null>(initialImageUrl || null)
  const [originalStorageKey, setOriginalStorageKey] = useState<string | null>(initialStorageKey || null)
  const [uploadingOriginal, setUploadingOriginal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')

  // Crop coordinates (percentages 0-100 of displayed image) - Strictly 1:1 Square
  const [crop, setCrop] = useState<CropMetadata>({
    x: 25,
    y: 10,
    width: 50,
    height: 50,
    aspect: '1:1'
  })

  const [savingCrop, setSavingCrop] = useState(false)
  const [cropError, setCropError] = useState('')
  const [faceDetected, setFaceDetected] = useState(false)
  const [detectingFace, setDetectingFace] = useState(false)

  // Interaction refs
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef<string | null>(null)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startCrop: CropMetadata }>({
    mouseX: 0,
    mouseY: 0,
    startCrop: { ...crop }
  })

  // Prevent multiple re-initializations for the same photo URL
  const initializedUrlRef = useRef<string | null>(null)

  // Normalize originalUrl to ensure proper https:// protocol
  const normalizedOriginalUrl = React.useMemo(() => {
    if (!originalUrl) return ''
    const trimmed = originalUrl.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return trimmed
    }
    return `https://${trimmed}`
  }, [originalUrl])

  useEffect(() => {
    if (initialImageUrl) {
      setOriginalUrl(initialImageUrl)
    }
    if (initialStorageKey) {
      setOriginalStorageKey(initialStorageKey)
    }
  }, [initialImageUrl, initialStorageKey])

  // Live Card Preview update (1:1 square canvas)
  const updatePreview = useCallback(() => {
    if (!normalizedOriginalUrl || !previewCanvasRef.current || !imgRef.current) return
    const img = imgRef.current
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return

    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const natW = img.naturalWidth
    const natH = img.naturalHeight

    let pixelX = Math.round((crop.x / 100) * natW)
    let pixelY = Math.round((crop.y / 100) * natH)
    let pixelW = Math.round((crop.width / 100) * natW)
    let pixelH = Math.round((crop.height / 100) * natH)

    pixelX = Math.max(0, Math.min(natW - 1, pixelX))
    pixelY = Math.max(0, Math.min(natH - 1, pixelY))
    pixelW = Math.max(1, Math.min(natW - pixelX, pixelW))
    pixelH = Math.max(1, Math.min(natH - pixelY, pixelH))

    const squareDim = Math.min(pixelW, pixelH)

    // High resolution preview canvas (180x180)
    canvas.width = 180
    canvas.height = 180
    ctx.clearRect(0, 0, 180, 180)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, pixelX, pixelY, squareDim, squareDim, 0, 0, 180, 180)
  }, [crop, normalizedOriginalUrl])

  useEffect(() => {
    updatePreview()
  }, [updatePreview])

  // Initialize 1:1 square crop box with AI smart face detection
  const initCropBox = useCallback(async (img: HTMLImageElement) => {
    setDetectingFace(true)
    try {
      const smartBox = await detectFaceAndSmartCrop(img)
      setCrop({
        x: smartBox.x,
        y: smartBox.y,
        width: smartBox.width,
        height: smartBox.height,
        aspect: '1:1'
      })
      setFaceDetected(smartBox.faceDetected)
    } catch (err) {
      console.warn('Smart face detection failed, using portrait prior:', err)
      const natW = img.naturalWidth || 640
      const natH = img.naturalHeight || 640
      const natRatio = natW / natH
      let cropW = 60
      let cropH = cropW * natRatio
      if (natH > natW) {
        cropW = 68
        cropH = cropW * natRatio
      }
      setCrop({
        x: Math.max(0, (100 - cropW) / 2),
        y: natH > natW ? 12 : 20,
        width: cropW,
        height: cropH,
        aspect: '1:1'
      })
      setFaceDetected(false)
    } finally {
      setDetectingFace(false)
    }
  }, [])

  // Initialize crop only ONCE when image changes (using previous crop if available, or default centered box)
  useEffect(() => {
    if (!normalizedOriginalUrl) return
    if (initializedUrlRef.current === normalizedOriginalUrl) return
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      initializedUrlRef.current = normalizedOriginalUrl
      if (targetPerson?.crop_data?.width && targetPerson?.crop_data?.height) {
        setCrop({ ...targetPerson.crop_data, aspect: '1:1' })
      } else {
        initCropBox(imgRef.current)
      }
    }
  }, [normalizedOriginalUrl, initCropBox, targetPerson?.crop_data])

  // Quick zoom scale (in or out) strictly maintaining 1:1 square
  const handleScaleCrop = (factor: number) => {
    if (!imgRef.current) return
    const natW = imgRef.current.naturalWidth
    const natH = imgRef.current.naturalHeight
    if (!natW || !natH) return

    const natRatio = natW / natH
    const currentCenterX = crop.x + crop.width / 2
    const currentCenterY = crop.y + crop.height / 2

    let newW = crop.width * factor
    let newH = newW * natRatio

    if (newW > 95 || newH > 95) {
      if (natRatio >= 1.0) {
        newH = 95
        newW = newH / natRatio
      } else {
        newW = 95
        newH = newW * natRatio
      }
    }
    if (newW < 12) {
      newW = 12
      newH = 12 * natRatio
    }

    let newX = currentCenterX - newW / 2
    let newY = currentCenterY - newH / 2

    newX = Math.max(0, Math.min(100 - newW, newX))
    newY = Math.max(0, Math.min(100 - newH, newY))

    setCrop(prev => ({
      ...prev,
      x: Math.round(newX * 10) / 10,
      y: Math.round(newY * 10) / 10,
      width: Math.round(newW * 10) / 10,
      height: Math.round(newH * 10) / 10
    }))
  }

  // Click on photo container jumps the 1:1 square directly to center on the clicked face
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.interactive-crop-box')) return
    if (!imageContainerRef.current) return
    const rect = imageContainerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100

    let newX = clickXPercent - crop.width / 2
    let newY = clickYPercent - crop.height / 2

    newX = Math.max(0, Math.min(100 - crop.width, newX))
    newY = Math.max(0, Math.min(100 - crop.height, newY))

    setCrop(prev => ({
      ...prev,
      x: Math.round(newX * 10) / 10,
      y: Math.round(newY * 10) / 10
    }))
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

      initializedUrlRef.current = null // Allow fresh initialization on new image
      setOriginalUrl(res.fileUrl)
      setOriginalStorageKey(res.storageKey)
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingOriginal(false)
    }
  }

  // Handle Drag Move & Resize strictly locking 1:1 aspect ratio
  const handlePointerDown = (e: React.PointerEvent, handleType: string | null = null) => {
    e.preventDefault()
    e.stopPropagation()
    if (!imageContainerRef.current) return

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
      if (!imageContainerRef.current || !imgRef.current) return
      const rect = imageContainerRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const deltaXPercent = ((moveEvent.clientX - dragStartRef.current.mouseX) / rect.width) * 100
      const deltaYPercent = ((moveEvent.clientY - dragStartRef.current.mouseY) / rect.height) * 100
      const start = dragStartRef.current.startCrop

      if (isDraggingRef.current) {
        // Dragging crop box within image boundaries
        const maxX = 100 - start.width
        const maxY = 100 - start.height
        const newX = Math.max(0, Math.min(maxX, start.x + deltaXPercent))
        const newY = Math.max(0, Math.min(maxY, start.y + deltaYPercent))
        setCrop(prev => ({
          ...prev,
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10
        }))
      } else if (isResizingRef.current) {
        const handle = isResizingRef.current
        const natRatio = imgRef.current.naturalWidth / imgRef.current.naturalHeight

        // Strictly 1:1 square resizing across all 4 corner handles
        if (handle === 'bottom-right') {
          let newW = Math.max(12, Math.min(100 - start.x, start.width + deltaXPercent))
          let newH = newW * natRatio
          if (start.y + newH > 100) {
            newH = 100 - start.y
            newW = newH / natRatio
          }
          if (newW < 12) {
            newW = 12
            newH = 12 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        } else if (handle === 'bottom-left') {
          const rightEdge = start.x + start.width
          let newW = Math.max(12, Math.min(rightEdge, start.width - deltaXPercent))
          let newH = newW * natRatio
          if (start.y + newH > 100) {
            newH = 100 - start.y
            newW = newH / natRatio
          }
          if (newW < 12) {
            newW = 12
            newH = 12 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            x: Math.round((rightEdge - newW) * 10) / 10,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        } else if (handle === 'top-right') {
          const bottomEdge = start.y + start.height
          let newW = Math.max(12, Math.min(100 - start.x, start.width + deltaXPercent))
          let newH = newW * natRatio
          if (bottomEdge - newH < 0) {
            newH = bottomEdge
            newW = newH / natRatio
          }
          if (newW < 12) {
            newW = 12
            newH = 12 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            y: Math.round((bottomEdge - newH) * 10) / 10,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        } else if (handle === 'top-left') {
          const rightEdge = start.x + start.width
          const bottomEdge = start.y + start.height
          let newW = Math.max(12, Math.min(rightEdge, start.width - deltaXPercent))
          let newH = newW * natRatio
          if (bottomEdge - newH < 0) {
            newH = bottomEdge
            newW = newH / natRatio
          }
          if (rightEdge - newW < 0) {
            newW = rightEdge
            newH = newW * natRatio
          }
          if (newW < 12) {
            newW = 12
            newH = 12 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            x: Math.round((rightEdge - newW) * 10) / 10,
            y: Math.round((bottomEdge - newH) * 10) / 10,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        }
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

  // Create crop blob using canvas directly from decoded image
  const generateCroppedBlob = async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = imgRef.current
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Image not loaded in viewer'))
        return
      }

      const natWidth = img.naturalWidth
      const natHeight = img.naturalHeight

      let pixelX = Math.round((crop.x / 100) * natWidth)
      let pixelY = Math.round((crop.y / 100) * natHeight)
      let pixelW = Math.round((crop.width / 100) * natWidth)
      let pixelH = Math.round((crop.height / 100) * natHeight)

      // Safety bounds
      pixelX = Math.max(0, Math.min(natWidth - 1, pixelX))
      pixelY = Math.max(0, Math.min(natHeight - 1, pixelY))
      pixelW = Math.max(1, Math.min(natWidth - pixelX, pixelW))
      pixelH = Math.max(1, Math.min(natHeight - pixelY, pixelH))

      // Strict 1:1 square canvas dimensions
      const squareDim = Math.min(pixelW, pixelH)

      // Output size: 640px square for sharp, crisp card portraits
      const outputSize = Math.min(640, squareDim)

      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to create canvas context'))
        return
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.drawImage(img, pixelX, pixelY, squareDim, squareDim, 0, 0, outputSize, outputSize)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas to blob failed'))
        },
        'image/jpeg',
        0.92
      )
    })
  }

  // Handle Apply Crop (ONLY FOR CROP: crops and passes back to Person Dialog)
  const handleApplyCrop = async () => {
    if (!originalUrl) {
      setCropError('Please upload a photograph first.')
      return
    }

    try {
      setSavingCrop(true)
      setCropError('')

      // 1. Generate 1:1 square crop blob directly from current frame
      const cropBlob = await generateCroppedBlob()

      // 2. Upload crop thumbnail directly to R2
      const cropUpload = await uploadMediaToR2({
        slug,
        file: cropBlob,
        section: 'family'
      })

      // 3. Deliver back to Person Dialog (ss1)
      await onSavePerson({
        name: targetPerson?.name || 'Family Member',
        relationship: targetPerson?.relationship || 'Family',
        category: targetPerson?.category || 'extended',
        priority: targetPerson?.priority || 'medium',
        is_remembering: targetPerson?.is_remembering || false,
        photo_url: cropUpload.fileUrl,
        storage_key: cropUpload.storageKey,
        original_photo_url: originalUrl,
        original_storage_key: originalStorageKey || '',
        crop_data: { ...crop }
      })

      onClose()
    } catch (err: any) {
      setCropError(err.message || 'Failed to save crop')
    } finally {
      setSavingCrop(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200 shadow-2xl max-w-2xl w-full p-4 sm:p-6 space-y-3 sm:space-y-4 text-left my-auto max-h-[96dvh] sm:max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-600" />
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">
                {targetPerson?.name ? `Crop Photo for ${targetPerson.name}` : 'Crop Face Portrait'}
              </h2>
              {faceDetected && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Face detected ✓
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Click or drag the square to frame the face.
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
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {uploadError}
            </div>
          )}
          {cropError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs">
              {cropError}
            </div>
          )}

          {/* If no image uploaded yet, show upload dropzone */}
          {!originalUrl && (
            <div className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-3xl p-8 sm:p-10 text-center space-y-4 bg-neutral-50/50 transition">
              <div className="w-16 h-16 rounded-full bg-neutral-200/70 flex items-center justify-center mx-auto text-neutral-500">
                <ImageIcon className="w-8 h-8 stroke-[1.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-800">
                  Select a Photograph
                </h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Upload complete photo to crop into a clean 1:1 portrait.
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
                Supports JPG, PNG, WebP, HEIC · Full image uploaded client-side
              </div>
            </div>
          )}

          {/* Crop View Only */}
          {originalUrl && (
            <div className="space-y-3">
              {/* Cropping Canvas Frame - Centered letterbox-free container showing FULL photo */}
              <div
                className="relative select-none overflow-hidden rounded-2xl bg-neutral-950 border border-neutral-300 max-h-[46dvh] sm:max-h-[460px] min-h-[220px] sm:min-h-[300px] flex items-center justify-center p-2 touch-none cursor-crosshair"
                style={{ userSelect: 'none' }}
                onClick={handleContainerClick}
                title="Click anywhere to center the crop box on that face"
              >
                {/* Tightly hugs the <img> so container width/height === rendered image width/height */}
                <div
                  ref={imageContainerRef}
                  className="relative inline-block select-none touch-none"
                  style={{ lineHeight: 0 }}
                >
                  <img
                    ref={imgRef}
                    crossOrigin="anonymous"
                    src={normalizedOriginalUrl}
                    alt="Full Photo"
                    onLoad={(e) => {
                      if (initializedUrlRef.current !== normalizedOriginalUrl) {
                        initializedUrlRef.current = normalizedOriginalUrl
                        if (targetPerson?.crop_data?.width && targetPerson?.crop_data?.height) {
                          setCrop({ ...targetPerson.crop_data, aspect: '1:1' })
                        } else {
                          initCropBox(e.currentTarget)
                        }
                      }
                    }}
                    className="max-h-[44dvh] sm:max-h-[440px] max-w-full w-auto h-auto object-contain block pointer-events-none select-none"
                    style={{ display: 'block' }}
                  />

                  {/* Shaded backdrop overlay outside crop */}
                  <div
                    className="absolute inset-0 bg-black/55 pointer-events-none"
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

                  {/* Interactive 1:1 Square Crop Box */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, null)}
                    className="interactive-crop-box absolute border-2 border-white rounded-xl shadow-2xl cursor-move transition-shadow"
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 8px 30px rgba(0,0,0,0.6)'
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
                      <div className="border-r border-b border-white/40"></div>
                      <div className="border-r border-b border-white/40"></div>
                      <div></div>
                    </div>

                    {/* Corner Resize Handles (Always locks to 1:1 square) */}
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((h) => (
                      <div
                        key={h}
                        onPointerDown={(e) => handlePointerDown(e, h)}
                        className={`absolute w-4 h-4 bg-white border-2 border-neutral-900 rounded-full z-10 cursor-${
                          h === 'top-left' || h === 'bottom-right' ? 'nwse' : 'nesw'
                        }-resize shadow-md hover:scale-125 transition-transform ${
                          h.includes('top') ? '-top-2' : '-bottom-2'
                        } ${
                          h.includes('left') ? '-left-2' : '-right-2'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Toolbar: Preview, Zoom Tools & Actions (Unified, Responsive) */}
              <div className="bg-neutral-50 border border-neutral-200/90 rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
                {/* Top / Left Sub-row: Preview & Zoom tools */}
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 min-w-0">
                  {/* 1. Card Avatar Preview */}
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-white border border-neutral-200/90 shrink-0 shadow-2xs">
                      <canvas
                        ref={previewCanvasRef}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold text-neutral-700 truncate">
                      Card Preview
                    </span>
                  </div>

                  {/* 2. Zoom & Re-center Tools */}
                  <div className="flex items-center gap-0.5 sm:gap-1 bg-white border border-neutral-200/90 rounded-xl p-1 shadow-2xs shrink-0">
                    <button
                      type="button"
                      disabled={detectingFace}
                      onClick={() => {
                        if (imgRef.current) initCropBox(imgRef.current)
                      }}
                      className="px-2 sm:px-2.5 py-1 hover:bg-neutral-100 rounded-lg text-[11px] sm:text-xs font-semibold text-neutral-700 flex items-center gap-1 sm:gap-1.5 transition cursor-pointer"
                      title="Automatically detect face and position 1:1 headshot crop"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>{detectingFace ? 'Detecting...' : 'Auto Face'}</span>
                    </button>
                    <div className="w-px h-4 bg-neutral-200" />
                    <button
                      type="button"
                      onClick={() => handleScaleCrop(0.82)}
                      className="px-2 sm:px-2.5 py-1 hover:bg-neutral-100 rounded-lg text-[11px] sm:text-xs font-semibold text-neutral-700 flex items-center gap-1 transition cursor-pointer"
                      title="Zoom in tighter on face"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Zoom</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScaleCrop(1.22)}
                      className="px-2 sm:px-2.5 py-1 hover:bg-neutral-100 rounded-lg text-[11px] sm:text-xs font-semibold text-neutral-700 flex items-center gap-1 transition cursor-pointer"
                      title="Zoom out wider"
                    >
                      <ZoomOut className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Wider</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (imgRef.current) initCropBox(imgRef.current)
                      }}
                      className="p-1 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                      title="Reset to face area"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom / Right Sub-row: Action Buttons */}
                <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t border-neutral-200/60 sm:border-t-0 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 sm:flex-initial py-2 px-3.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-200/60 rounded-xl transition cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingCrop}
                    onClick={handleApplyCrop}
                    className="flex-1 sm:flex-initial py-2.5 px-5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm min-h-[40px] sm:min-h-0"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingCrop ? 'Applying...' : 'Apply Crop'}</span>
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
