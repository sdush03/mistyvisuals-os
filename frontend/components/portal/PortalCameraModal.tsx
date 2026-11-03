'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

interface PortalCameraModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (file: File) => void
  onUploadFallback?: () => void
  roleTitle?: string
}

export default function PortalCameraModal({
  isOpen,
  onClose,
  onCapture,
  onUploadFallback,
  roleTitle = 'Selfie'
}: PortalCameraModalProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isOpenRef = useRef(isOpen)

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Stop camera tracks and free hardware
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks()
        tracks.forEach(track => {
          track.stop()
        })
      } catch (err) {
        console.warn('[PortalCameraModal] Error stopping tracks:', err)
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
  }, [])

  // Start camera
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    stopCamera()
    setCameraError(null)

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !Boolean(navigator.mediaDevices.getUserMedia)) {
      setCameraError('Camera access is not supported on this browser. Please use the upload option.')
      return
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      // If modal was closed while user was accepting permission prompt
      if (!isOpenRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          // Play was interrupted or auto-play prevented
        }
      }

      setIsStreaming(true)

      // Check if multiple camera devices exist
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      } catch {
        // Ignore enumeration errors
      }
    } catch (err: any) {
      console.error('[PortalCameraModal] Camera access failed:', err)
      setIsStreaming(false)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings or upload a photo instead.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on your device. You can upload a photo instead.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Your camera is currently in use by another application. Please close other camera apps and try again.')
      } else {
        setCameraError('Unable to access camera: ' + (err.message || 'Please check permissions.'))
      }
    }
  }, [stopCamera])

  // Lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode)
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen, facingMode, startCamera, stopCamera])

  // Safety: Shut down camera if tab becomes hidden or user switches windows
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera()
        onClose()
      }
    }

    const handleBeforeUnload = () => {
      stopCamera()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        stopCamera()
        onClose()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, stopCamera])

  // Flip camera between front and back
  const handleFlipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextMode)
    startCamera(nextMode)
  }

  // Snap photo from video feed
  const captureFrame = () => {
    if (!videoRef.current) return
    const video = videoRef.current

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 960

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      stopCamera()
      onClose()
      return
    }

    // Flash animation
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 200)

    // Mirror user-facing camera capture so what they see is what they get
    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, width, height)

    // Convert to JPEG file
    canvas.toBlob(
      blob => {
        // ALWAYS STOP CAMERA IMMEDIATELY upon capturing
        stopCamera()

        if (blob) {
          const file = new File([blob], `selfie_${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now()
          })
          onCapture(file)
        }
        onClose()
      },
      'image/jpeg',
      0.92
    )
  }

  // Countdown timer trigger (optional 3-second delay or instant capture)
  const handleStartCapture = (withTimer = false) => {
    if (!withTimer) {
      captureFrame()
      return
    }

    setCountdown(3)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          captureFrame()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleModalClose = () => {
    stopCamera()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) {
          handleModalClose()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-neutral-200/90 max-w-sm sm:max-w-md w-full overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#DFBA73]">
              {roleTitle} Onboarding
            </span>
            <h3 className="text-base sm:text-lg font-serif text-neutral-900 font-medium">
              Take Reference Selfie
            </h3>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
            aria-label="Close camera"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Viewfinder Body */}
        <div className="p-4 sm:p-5 flex flex-col items-center">
          <div className="relative w-full aspect-[4/5] sm:aspect-square max-h-[380px] bg-neutral-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
            {/* Live Video */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isStreaming ? 'opacity-100' : 'opacity-0'
              } ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />

            {/* Flash Effect on shutter snap */}
            {isFlashing && (
              <div className="absolute inset-0 bg-white pointer-events-none z-30 animate-pulse" />
            )}

            {/* Oval Face Guide Overlay (Ensures face is centered and not at tummy) */}
            {isStreaming && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                {/* Dashed Gold Oval Frame */}
                <div className="w-[62%] h-[68%] rounded-[50%] border-2 border-dashed border-[#DFBA73]/80 shadow-[0_0_15px_rgba(223,186,115,0.3)] flex items-center justify-center animate-pulse">
                  <div className="w-full h-full rounded-[50%] border border-white/40" />
                </div>
                <span className="mt-2.5 text-[11px] font-medium text-white/90 drop-shadow-md bg-neutral-950/60 px-2.5 py-0.5 rounded-full">
                  Position your face inside the oval
                </span>
              </div>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-[2px] flex items-center justify-center z-20">
                <span className="text-6xl sm:text-7xl font-bold text-white drop-shadow-lg animate-ping">
                  {countdown}
                </span>
              </div>
            )}

            {/* Loading Camera State */}
            {!isStreaming && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-neutral-400">
                <div className="w-8 h-8 border-2 border-[#DFBA73] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs font-medium text-neutral-300">Opening camera...</p>
                <p className="text-[11px] text-neutral-500 mt-1">Please allow camera permissions if prompted</p>
              </div>
            )}

            {/* Camera Error State */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-900 text-white z-20">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-neutral-200 max-w-xs mb-1">
                  Camera Access Required
                </p>
                <p className="text-[11px] text-neutral-400 max-w-xs mb-4">
                  {cameraError}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
                  {onUploadFallback && (
                    <button
                      type="button"
                      onClick={() => {
                        handleModalClose()
                        onUploadFallback()
                      }}
                      className="w-full py-2 px-3 text-xs font-semibold bg-white text-neutral-900 rounded-xl transition hover:bg-neutral-100 shadow-sm"
                    >
                      Upload Photo Instead
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="w-full py-2 px-3 text-xs font-semibold bg-neutral-800 text-neutral-300 rounded-xl transition hover:bg-neutral-700"
                  >
                    Retry Camera
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-neutral-500 text-center mt-2.5 max-w-xs">
            Face the light directly and keep a neutral expression or a natural smile.
          </p>
        </div>

        {/* Footer Action Controls */}
        <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          {/* Flip Camera Button */}
          {hasMultipleCameras && isStreaming ? (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="p-2.5 rounded-full text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80 transition cursor-pointer"
              title="Flip Camera"
              aria-label="Flip camera"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleModalClose}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition px-2 py-1"
            >
              Cancel
            </button>
          )}

          {/* Shutter Button */}
          {isStreaming ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleStartCapture(false)}
                disabled={countdown !== null}
                className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-neutral-900 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                aria-label="Take photo"
              >
                {/* Outer Ring */}
                <span className="absolute inset-[-4px] rounded-full border-2 border-neutral-300 group-hover:border-[#DFBA73] transition-colors" />
                {/* Camera Icon */}
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="w-14" />
          )}

          {/* Upload Fallback Shortcut */}
          {onUploadFallback && isStreaming ? (
            <button
              type="button"
              onClick={() => {
                handleModalClose()
                onUploadFallback()
              }}
              className="text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 transition flex items-center gap-1"
            >
              <span>Upload file</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-16" />
          )}
        </div>
      </div>
    </div>
  )
}
