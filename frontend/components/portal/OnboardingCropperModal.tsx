'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react'

export interface OnboardingCropCoordinates {
  x: number // percentage 0 - 100
  y: number // percentage 0 - 100
  width: number // percentage 0 - 100
  height: number // percentage 0 - 100
  aspect: '1:1'
}

interface OnboardingCropperModalProps {
  isOpen: boolean
  file: File | null
  roleTitle?: string
  onClose: () => void
  onCropComplete: (croppedFile: File) => void
}

export default function OnboardingCropperModal({
  isOpen,
  file,
  roleTitle = 'Profile',
  onClose,
  onCropComplete
}: OnboardingCropperModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<OnboardingCropCoordinates>({
    x: 10,
    y: 10,
    width: 80,
    height: 80,
    aspect: '1:1'
  })
  const [initialCrop, setInitialCrop] = useState<OnboardingCropCoordinates | null>(null)
  const [processingCrop, setProcessingCrop] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Interaction refs
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef<string | null>(null)
  const dragStartRef = useRef<{
    mouseX: number
    mouseY: number
    startCrop: OnboardingCropCoordinates
  }>({
    mouseX: 0,
    mouseY: 0,
    startCrop: { ...crop }
  })

  // Prevent repeated initialization for same object URL
  const initializedUrlRef = useRef<string | null>(null)

  // Create & clean up Object URL when file changes
  useEffect(() => {
    if (!isOpen || !file) {
      setImageUrl(null)
      initializedUrlRef.current = null
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setImageUrl(objectUrl)
    setErrorMessage(null)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [isOpen, file])

  // ESC key listener to dismiss modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Initialize 1:1 crop box to cover maximum area of the whole image
  const initFullImageCropBox = useCallback((img: HTMLImageElement) => {
    setErrorMessage(null)
    const natW = img.naturalWidth || 640
    const natH = img.naturalHeight || 640
    const natRatio = natW / natH

    let cropW = 88
    let cropH = cropW * natRatio

    if (natRatio >= 1.0) {
      // Landscape or square
      cropH = 88
      cropW = cropH / natRatio
    } else {
      // Portrait
      cropW = 88
      cropH = cropW * natRatio
    }

    if (cropW > 96) {
      cropW = 96
      cropH = cropW * natRatio
    }
    if (cropH > 96) {
      cropH = 96
      cropW = cropH / natRatio
    }

    const cropX = Math.max(0, (100 - cropW) / 2)
    const cropY = Math.max(0, (100 - cropH) / 2)

    const fullCrop: OnboardingCropCoordinates = {
      x: Math.round(cropX * 10) / 10,
      y: Math.round(cropY * 10) / 10,
      width: Math.round(cropW * 10) / 10,
      height: Math.round(cropH * 10) / 10,
      aspect: '1:1'
    }

    setCrop(fullCrop)
    setInitialCrop(fullCrop)
  }, [])

  // Scaling zoom helper
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

    if (newW > 96 || newH > 96) {
      if (natRatio >= 1.0) {
        newH = 96
        newW = newH / natRatio
      } else {
        newW = 96
        newH = newW * natRatio
      }
    }
    if (newW < 14) {
      newW = 14
      newH = 14 * natRatio
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

  // Click on container recenters crop box
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

  // Pointer drag & resize handling
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

        if (handle === 'bottom-right') {
          let newW = Math.max(14, Math.min(100 - start.x, start.width + deltaXPercent))
          let newH = newW * natRatio
          if (start.y + newH > 100) {
            newH = 100 - start.y
            newW = newH / natRatio
          }
          if (newW < 14) {
            newW = 14
            newH = 14 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        } else if (handle === 'bottom-left') {
          const rightEdge = start.x + start.width
          let newW = Math.max(14, Math.min(rightEdge, start.width - deltaXPercent))
          let newH = newW * natRatio
          if (start.y + newH > 100) {
            newH = 100 - start.y
            newW = newH / natRatio
          }
          if (newW < 14) {
            newW = 14
            newH = 14 * natRatio
          }
          setCrop(prev => ({
            ...prev,
            x: Math.round((rightEdge - newW) * 10) / 10,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10
          }))
        } else if (handle === 'top-right') {
          const bottomEdge = start.y + start.height
          let newW = Math.max(14, Math.min(100 - start.x, start.width + deltaXPercent))
          let newH = newW * natRatio
          if (bottomEdge - newH < 0) {
            newH = bottomEdge
            newW = newH / natRatio
          }
          if (newW < 14) {
            newW = 14
            newH = 14 * natRatio
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
          let newW = Math.max(14, Math.min(rightEdge, start.width - deltaXPercent))
          let newH = newW * natRatio
          if (bottomEdge - newH < 0) {
            newH = bottomEdge
            newW = newH / natRatio
          }
          if (rightEdge - newW < 0) {
            newW = rightEdge
            newH = newW * natRatio
          }
          if (newW < 14) {
            newW = 14
            newH = 14 * natRatio
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

  // Export cropped 1:1 image blob & create File object
  const handleConfirmCrop = async () => {
    const img = imgRef.current
    if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      setErrorMessage('Image is still loading. Please wait a moment.')
      return
    }

    setProcessingCrop(true)
    setErrorMessage(null)

    try {
      const natWidth = img.naturalWidth
      const natHeight = img.naturalHeight

      let pixelX = Math.round((crop.x / 100) * natWidth)
      let pixelY = Math.round((crop.y / 100) * natHeight)
      let pixelW = Math.round((crop.width / 100) * natWidth)
      let pixelH = Math.round((crop.height / 100) * natHeight)

      // Clamp safety bounds
      pixelX = Math.max(0, Math.min(natWidth - 1, pixelX))
      pixelY = Math.max(0, Math.min(natHeight - 1, pixelY))
      pixelW = Math.max(1, Math.min(natWidth - pixelX, pixelW))
      pixelH = Math.max(1, Math.min(natHeight - pixelY, pixelH))

      const squareDim = Math.min(pixelW, pixelH)
      const outputSize = Math.max(200, Math.min(900, squareDim))

      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Failed to create canvas context')
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, pixelX, pixelY, squareDim, squareDim, 0, 0, outputSize, outputSize)

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.90))
      if (!blob) {
        throw new Error('Failed to create cropped image')
      }

      const cleanRole = roleTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
      const originalExtension = file?.name?.split('.')?.pop() || 'jpg'
      const safeName = `${cleanRole}_cropped_${Date.now()}.${originalExtension === 'png' ? 'png' : 'jpg'}`
      const croppedFile = new File([blob], safeName, {
        type: 'image/jpeg',
        lastModified: Date.now()
      })

      onCropComplete(croppedFile)
    } catch (err: any) {
      console.error('[OnboardingCropperModal] Crop error:', err)
      setErrorMessage(err.message || 'Failed to crop image')
    } finally {
      setProcessingCrop(false)
    }
  }

  if (!isOpen || !file) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-modal-title"
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-neutral-100 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-100 px-2.5 py-0.5 rounded-full">
              {roleTitle}
            </span>
            <h2 id="cropper-modal-title" className="text-sm font-semibold text-neutral-900">
              Crop Photo
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cropping Area */}
        <div className="p-4 sm:p-5 flex flex-col items-center">
          <div
            className="relative select-none overflow-hidden rounded-2xl bg-neutral-950 border border-neutral-200 w-full max-h-[420px] min-h-[280px] flex items-center justify-center p-2 touch-none cursor-crosshair shadow-inner"
            onClick={handleContainerClick}
          >
            {imageUrl ? (
              <div
                ref={imageContainerRef}
                className="relative inline-block select-none touch-none"
                style={{ lineHeight: 0 }}
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Uploaded photo"
                  onLoad={(e) => {
                    if (initializedUrlRef.current !== imageUrl) {
                      initializedUrlRef.current = imageUrl
                      initFullImageCropBox(e.currentTarget)
                    }
                  }}
                  className="max-h-[400px] max-w-full w-auto h-auto object-contain block pointer-events-none select-none"
                  style={{ display: 'block' }}
                />

                {/* Shaded backdrop overlay outside crop box */}
                <div
                  className="absolute inset-0 bg-black/60 pointer-events-none"
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

                {/* Interactive 1:1 Crop Box */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, null)}
                  className="interactive-crop-box absolute border-2 border-white rounded-2xl cursor-move transition-shadow"
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.6)'
                  }}
                >
                  {/* Circular Avatar Guide */}
                  <div className="absolute inset-0 rounded-full border border-dashed border-white/70 pointer-events-none" />

                  {/* Grid rule of thirds */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30">
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

                  {/* Corner Resize Handles */}
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((handle) => (
                    <div
                      key={handle}
                      onPointerDown={(e) => handlePointerDown(e, handle)}
                      className={`absolute w-4 h-4 bg-white border-2 border-neutral-900 rounded-full z-10 cursor-${
                        handle === 'top-left' || handle === 'bottom-right' ? 'nwse' : 'nesw'
                      }-resize shadow-md hover:scale-125 transition-transform ${
                        handle.includes('top') ? '-top-2' : '-bottom-2'
                      } ${
                        handle.includes('left') ? '-left-2' : '-right-2'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 border-2 border-[#DFBA73] border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Minimal Zoom & Reset Controls */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => handleScaleCrop(0.85)}
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleScaleCrop(1.18)}
              className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            {initialCrop && (
              <button
                type="button"
                onClick={() => setCrop({ ...initialCrop })}
                className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-700 transition cursor-pointer"
                title="Reset"
                aria-label="Reset crop"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="w-full mt-2.5 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={processingCrop}
            className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-xl transition hover:bg-neutral-50 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={processingCrop}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            {processingCrop ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Cropping...</span>
              </>
            ) : (
              <span>Done</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
