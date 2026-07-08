'use client'

import { useEffect, useState, useRef } from 'react'
import { compressImageToDataUrl, estimateBase64Bytes } from '@/lib/imageCompression'
import { getAuth } from '@/lib/authClient'
import { SignaturePad } from '@/components/SignaturePad'

export default function MePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{
    id: number
    email: string
    role: string
    name?: string | null
    nickname?: string | null
    job_title?: string | null
    force_password_reset?: boolean
    has_signature?: boolean
  } | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [passwordShake, setPasswordShake] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [savingSignature, setSavingSignature] = useState(false)
  const [signatureMsg, setSignatureMsg] = useState<string | null>(null)
  const [pendingSignature, setPendingSignature] = useState<{ white?: string, dark?: string } | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [editingSignature, setEditingSignature] = useState(false)

  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const [showCameraCaptureModal, setShowCameraCaptureModal] = useState<boolean>(false)
  const [tempSelfiePreview, setTempSelfiePreview] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    setPhotoError(null)
    setTempSelfiePreview(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      streamRef.current = stream
      setCameraActive(true)
    } catch (err: any) {
      console.error('Camera access failed:', err)
      setCameraActive(false)
      setPhotoError('Camera not accessible. Please check your browser permissions.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const size = Math.min(video.videoWidth, video.videoHeight)
    canvas.width = size
    canvas.height = size
    
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.translate(size, 0)
      ctx.scale(-1, 1)
      const sx = (video.videoWidth - size) / 2
      const sy = (video.videoHeight - size) / 2
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      setTempSelfiePreview(dataUrl)
      stopCamera()
    }
  }

  const handleRetake = () => {
    setTempSelfiePreview(null)
    startCamera()
  }

  const handleUsePhoto = async () => {
    if (tempSelfiePreview) {
      setUploadingPhoto(true)
      try {
        const res = await fetch('/api/auth/profile-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image_data: tempSelfiePreview }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setPhotoError(err.error || 'Failed to upload photo')
          setUploadingPhoto(false)
          return
        }
        setPhotoDataUrl(tempSelfiePreview)
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : 'Failed to process image')
      } finally {
        setUploadingPhoto(false)
      }
    }
    setShowCameraCaptureModal(false)
    setTempSelfiePreview(null)
  }

  useEffect(() => {
    if (showCameraCaptureModal) {
      startCamera()
    } else {
      stopCamera()
    }
  }, [showCameraCaptureModal])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const MAX_PROFILE_DIMENSION = 800
  const MAX_PROFILE_BYTES = 2 * 1024 * 1024

  useEffect(() => {
    getAuth()
      .then(data => {
        if (!data?.authenticated) {
          setError('Not authenticated')
          setLoading(false)
          return
        }
        const nextUser = data.user
        if (!nextUser?.id || !nextUser.email || !nextUser.role) {
          setError('Unable to load profile')
          setLoading(false)
          return
        }
        setUser({
          id: nextUser.id,
          email: nextUser.email,
          role: nextUser.role,
          name: nextUser.name ?? null,
          nickname: nextUser.nickname ?? null,
          job_title: nextUser.job_title ?? null,
          force_password_reset: nextUser.force_password_reset === true,
          has_signature: nextUser.has_signature === true,
        })
        if (nextUser.force_password_reset) {
          setShowChangePassword(true)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load profile')
        setLoading(false)
      })
  }, [])


  useEffect(() => {
    fetch('/api/auth/profile-photo', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) return null
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      })
      .then(url => {
        if (url) setPhotoDataUrl(url)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/auth/signature', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.signature_image_dark || data?.signature_image) {
          setSavedSignature(data.signature_image_dark || data.signature_image)
        }
      })
      .catch(() => {})
  }, [])

  const initials = (user?.name || user?.email || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

  if (loading) {
    return (
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-neutral-500">Loading profile…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="text-sm text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Account</div>
        <h2 className="text-2xl font-semibold mt-2">My Profile</h2>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm space-y-4 text-sm">
        <div className="flex items-center gap-4 h-20">
          <div className="h-20 w-20">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="h-20 w-20 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] flex items-center justify-center text-xl font-semibold text-neutral-700">
                {initials}
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <div className="text-lg font-semibold">{user?.name || '—'}</div>
          </div>
        </div>
        <div>
          <button
            onClick={() => setShowCameraCaptureModal(true)}
            className="text-xs font-medium px-4 py-2 border border-neutral-300 rounded-full hover:bg-neutral-50 transition focus:outline-none"
          >
            {photoDataUrl ? 'Change Photo' : 'Upload Photo'}
          </button>
          {uploadingPhoto && <span className="text-xs text-neutral-500 ml-2">Uploading…</span>}
        </div>
        {photoError && (
          <div className="mt-2 text-xs text-red-600">{photoError}</div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Name</span>
          <span className="font-medium">{user?.name || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Nickname</span>
          <span className="font-medium">{user?.nickname || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Email</span>
          <span className="font-medium">{user?.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Job title</span>
          <span className="font-medium">{user?.job_title || 'Job title not assigned'}</span>
        </div>
        {user?.role === 'admin' && (
          <div className="text-xs text-neutral-500">
            Admin hint: Job title is set during user creation.
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Role</span>
          <span className="font-medium">{user?.role}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500">My Signature</div>
          {user?.has_signature && !pendingSignature && !editingSignature && (
            <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-200">
              Signature Saved
            </div>
          )}
        </div>
        
        <div className="text-xs text-neutral-500 max-w-sm mb-4">
          This signature will be applied to any Service Agreements that you automatically or manually approve. Draw clearly in the center.
        </div>

        {savedSignature && !editingSignature ? (
          <div>
            <div className="border border-[var(--border)] rounded-xl bg-white p-4 inline-block mb-4 h-[120px] w-full flex items-center justify-center">
              <img src={savedSignature} alt="Saved Signature" className="h-[80px] object-contain" />
            </div>
            <div className="flex justify-end">
              <button 
                onClick={() => setEditingSignature(true)}
                className="text-xs font-semibold px-4 py-2 rounded-lg border border-[var(--border)] bg-white hover:bg-neutral-50 transition"
              >
                Change Signature
              </button>
            </div>
          </div>
        ) : (
          <>
            <SignaturePad 
              hasSignature={false} 
              onDraw={(drawn, whiteUrl, darkUrl) => {
                if (drawn && whiteUrl && darkUrl) {
                  setPendingSignature({ white: whiteUrl, dark: darkUrl })
                } else {
                  setPendingSignature(null)
                }
              }} 
            />
            
            {signatureMsg && (
              <div className={`text-sm ${signatureMsg.startsWith('Success') ? 'text-green-700' : 'text-red-600'}`}>
                {signatureMsg}
              </div>
            )}

            <div className="flex justify-end pt-2 gap-2">
              {savedSignature && (
                <button
                  disabled={savingSignature}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900"
                  onClick={() => {
                    setEditingSignature(false)
                    setPendingSignature(null)
                    setSignatureMsg(null)
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                disabled={!pendingSignature || savingSignature}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                onClick={async () => {
                  if (!pendingSignature) return
                  setSavingSignature(true)
                  setSignatureMsg(null)
                  try {
                    const res = await fetch('/api/auth/signature', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        signature_image: pendingSignature.white,
                        signature_image_dark: pendingSignature.dark,
                      })
                    })
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}))
                      setSignatureMsg(err.error || 'Failed to save signature')
                      return
                    }
                    setSignatureMsg('Success: signature saved.')
                    setSavedSignature(pendingSignature.dark || pendingSignature.white || null)
                    setPendingSignature(null)
                    setEditingSignature(false)
                    setUser(prev => prev ? { ...prev, has_signature: true } : prev)
                  } catch (e) {
                    setSignatureMsg('An error occurred.')
                  } finally {
                    setSavingSignature(false)
                  }
                }}
              >
                {savingSignature ? 'Saving…' : 'Save Signature'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm text-sm">
        {user?.force_password_reset && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Please update your password to continue using the system.
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500">Password</div>
          <button
            className="text-sm text-neutral-700 hover:text-neutral-900"
            onClick={() =>
              setShowChangePassword(v => {
                if (v) {
                  setPasswordErrors({})
                  setPasswordShake(false)
                  setSaveMsg(null)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }
                return !v
              })
            }
          >
            {showChangePassword ? 'Close' : 'Change Password'}
          </button>
        </div>
        {showChangePassword && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3">
              <input
                type="password"
                placeholder="Current Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.current ? 'field-error' : ''} ${passwordErrors.current && passwordShake ? 'shake' : ''}`}
                value={currentPassword}
                onChange={e => {
                  setCurrentPassword(e.target.value)
                  if (passwordErrors.current && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, current: undefined }))
                  }
                }}
              />
              {passwordErrors.current && (
                <div className="text-xs text-red-600">{passwordErrors.current}</div>
              )}
              <input
                type="password"
                placeholder="New Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.next ? 'field-error' : ''} ${passwordErrors.next && passwordShake ? 'shake' : ''}`}
                value={newPassword}
                onChange={e => {
                  setNewPassword(e.target.value)
                  if (passwordErrors.next && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, next: undefined }))
                  }
                }}
              />
              {passwordErrors.next && (
                <div className="text-xs text-red-600">{passwordErrors.next}</div>
              )}
              <input
                type="password"
                placeholder="Confirm New Password*"
                autoComplete="off"
                className={`w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm ${passwordErrors.confirm ? 'field-error' : ''} ${passwordErrors.confirm && passwordShake ? 'shake' : ''}`}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value)
                  if (passwordErrors.confirm && e.target.value.trim()) {
                    setPasswordErrors(prev => ({ ...prev, confirm: undefined }))
                  }
                }}
              />
              {passwordErrors.confirm && (
                <div className="text-xs text-red-600">{passwordErrors.confirm}</div>
              )}
            </div>
            {saveMsg && (
              <div className={`text-sm ${saveMsg.startsWith('Success') ? 'text-green-700' : 'text-red-600'}`}>
                {saveMsg}
              </div>
            )}
            <div className="flex justify-end">
              <button
                disabled={saving}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                onClick={async () => {
                  setSaveMsg(null)
                  const nextErrors: { current?: string; next?: string; confirm?: string } = {}
                  if (!currentPassword.trim()) nextErrors.current = 'Current password is required'
                  if (!newPassword.trim()) nextErrors.next = 'New password is required'
                  if (!confirmPassword.trim()) nextErrors.confirm = 'Confirm password is required'
                  if (Object.keys(nextErrors).length) {
                    setPasswordErrors(nextErrors)
                    setPasswordShake(true)
                    setTimeout(() => setPasswordShake(false), 300)
                    return
                  }
                  setPasswordErrors({})
                  if (newPassword !== confirmPassword) {
                    setSaveMsg('New passwords do not match.')
                    return
                  }
                  setSaving(true)
                  const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      current_password: currentPassword,
                      new_password: newPassword,
                    }),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    setSaveMsg(data?.error || 'Failed to change password.')
                    setSaving(false)
                    return
                  }
                  setSaveMsg('Success: password updated.')
                  setUser(prev => (prev ? { ...prev, force_password_reset: false } : prev))
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setSaving(false)
                }}
              >
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Photo Camera Capture Modal (Cohesive design) */}
      {showCameraCaptureModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div 
            className="w-full max-w-[400px] bg-neutral-900/60 backdrop-blur-3xl p-10 border border-white/12 shadow-[0_40px_80px_rgba(0,0,0,0.45)] flex flex-col items-center"
          >
            <h3 className="font-semibold text-base tracking-[0.2em] uppercase text-center mb-6 text-white">
              Capture Photo
            </h3>

            {/* Camera / Preview Box */}
            <div className="relative w-[280px] h-[280px] overflow-hidden bg-black border border-white/15 mb-6">
              {!tempSelfiePreview ? (
                <>
                  <video 
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ 
                      display: cameraActive ? 'block' : 'none',
                      transform: 'scaleX(-1)'
                    }}
                  />
                  {!cameraActive && (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                      <p className="text-[11px] text-neutral-400 mb-4">
                        Webcam is loading or unavailable.
                      </p>
                    </div>
                  )}
                  {cameraActive && (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" viewBox="0 0 280 280">
                      <defs>
                        <mask id="stencil-mask">
                          <rect width="280" height="280" fill="#ffffff" />
                          <ellipse cx="140" cy="140" rx="80" ry="110" fill="#000000" />
                        </mask>
                      </defs>
                      <rect width="280" height="280" fill="rgba(0, 0, 0, 0.6)" mask="url(#stencil-mask)" />
                      <ellipse cx="140" cy="140" rx="80" ry="110" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="6 4" style={{ opacity: 0.6 }} />
                    </svg>
                  )}
                </>
              ) : (
                <img 
                  src={tempSelfiePreview} 
                  alt="Selfie Preview" 
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3 w-full">
              {!tempSelfiePreview && cameraActive && (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="w-full py-3.5 bg-white text-black border-none font-semibold text-xs tracking-[0.05em] uppercase cursor-pointer"
                >
                  📸 SNAP PHOTO
                </button>
              )}

              {tempSelfiePreview && (
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="flex-1 py-3.5 bg-white/10 text-white border border-white/25 font-semibold text-xs tracking-[0.05em] uppercase cursor-pointer"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={handleUsePhoto}
                    className="flex-[2] py-3.5 bg-white text-black border-none font-semibold text-xs tracking-[0.05em] uppercase cursor-pointer"
                  >
                    Use Photo ✓
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowCameraCaptureModal(false)
                  setTempSelfiePreview(null)
                }}
                className="mt-4 text-[10px] tracking-[0.15em] uppercase text-white/40 bg-transparent border-none cursor-pointer hover:text-white transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
