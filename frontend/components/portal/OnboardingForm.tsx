'use client'

import React, { useState, useRef, useEffect } from 'react'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import PhoneField from '@/components/PhoneField'
import PortalCameraModal from './PortalCameraModal'
import { smartCropImageFile } from '@/lib/faceCrop'
import type { OnboardingPerson } from './OnboardingSelection'

// Helper: Comprehensive phone number validation
function validatePhoneNumber(phone: string | null | undefined, fieldName = 'Phone number'): { valid: boolean; error?: string; formatted?: string } {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { valid: false, error: `${fieldName} is required.` }
  }
  const clean = phone.trim()
  if (!clean.startsWith('+')) {
    return { valid: false, error: `${fieldName} must include country code (e.g. +91).` }
  }
  const parsed = parsePhoneNumberFromString(clean)
  if (!parsed || !parsed.isValid()) {
    return { valid: false, error: `Please enter a valid ${fieldName.toLowerCase()} with country code.` }
  }
  const national = parsed.nationalNumber
  if (/^(\d)\1{7,}$/.test(national)) {
    return { valid: false, error: `Please enter a genuine ${fieldName.toLowerCase()} (dummy repeating digits detected).` }
  }
  if (parsed.country === 'IN') {
    if (!/^[6-9]\d{9}$/.test(national)) {
      return { valid: false, error: 'Indian mobile number must be 10 digits starting with 6, 7, 8, or 9.' }
    }
  }
  return { valid: true, formatted: parsed.format('E.164') }
}

// Helper: Comprehensive email validation
function validateEmail(email: string | null | undefined): { valid: boolean; error?: string; clean?: string } {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { valid: false, error: 'Email address is required.' }
  }
  const clean = email.trim().toLowerCase()
  if (clean.length < 5 || clean.length > 254) {
    return { valid: false, error: 'Email address must be between 5 and 254 characters.' }
  }
  if (clean.includes('..') || clean.startsWith('.') || clean.includes('@.') || clean.includes('.@')) {
    return { valid: false, error: 'Email contains invalid dot placement.' }
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
  if (!emailRegex.test(clean)) {
    return { valid: false, error: 'Please enter a valid email address.' }
  }
  const parts = clean.split('@')
  if (parts.length !== 2) return { valid: false, error: 'Please enter a valid email address.' }
  const domain = parts[1]
  const domainParts = domain.split('.')
  const tld = domainParts[domainParts.length - 1]
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { valid: false, error: 'Email domain extension is invalid (e.g. .com, .in).' }
  }
  const dummyEmails = [
    'test@test.com',
    'admin@admin.com',
    'example@example.com',
    'none@none.com',
    'abc@xyz.com',
    'fake@fake.com',
    'user@domain.com',
    'test@gmail.com'
  ]
  if (dummyEmails.includes(clean)) {
    return { valid: false, error: 'Please enter your actual personal email address.' }
  }
  const domainTypos: Record<string, string> = {
    'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gmaik.com': 'gmail.com',
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'outlok.com': 'outlook.com',
    'iclou.com': 'icloud.com'
  }
  if (domainTypos[domain]) {
    return { valid: false, error: `Did you mean @${domainTypos[domain]}? Please check your email spelling.` }
  }
  return { valid: true, clean }
}

interface OnboardingFormProps {
  slug: string
  role: 'bride' | 'groom'
  initialData: OnboardingPerson
  projectName?: string
  logoUrl?: string
  onBack: () => void
  onSuccess: (updatedPerson: OnboardingPerson, isFullyCompleted: boolean) => void
}

/**
 * Compresses and scales down an image file client-side using HTML Canvas.
 * Ensures quick transmission and optimal size (< 250KB).
 */
async function compressImage(file: File, maxDimension = 1200, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(file)

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file)
            const compressed = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressed)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

export default function OnboardingForm({
  slug,
  role,
  initialData,
  projectName,
  logoUrl,
  onBack,
  onSuccess
}: OnboardingFormProps) {
  const isBride = role === 'bride'
  const roleLabel = isBride ? 'Bride' : 'Groom'
  const displayName = initialData.name?.trim() || roleLabel

  // Form Fields State (pre-filled from existing data)
  const [name, setName] = useState(initialData.name || '')
  const [phonePrimary, setPhonePrimary] = useState(initialData.phone_primary || '')
  const [phoneSecondary, setPhoneSecondary] = useState(initialData.phone_secondary || '')
  const [email, setEmail] = useState(initialData.email || '')
  const [instagram, setInstagram] = useState(initialData.instagram || '')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(initialData.selfie_url || null)
  const [storageKey, setStorageKey] = useState<string | null>(null)

  // Local selfie preview & upload state
  const [selfiePreview, setSelfiePreview] = useState<string | null>(initialData.selfie_url || null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadingSelfie, setUploadingSelfie] = useState(false)
  const [validationStatus, setValidationStatus] = useState<'idle' | 'verifying' | 'accepted' | 'rejected'>(
    initialData.selfie_url ? 'accepted' : 'idle'
  )
  const [selfieStatusMsg, setSelfieStatusMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)

  // Errors & Validation
  const [errors, setErrors] = useState<{
    name?: string
    phonePrimary?: string
    phoneSecondary?: string
    email?: string
    instagram?: string
    selfie?: string
    form?: string
  }>({})

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Clean instagram value helper
  const handleInstagramChange = (val: string) => {
    let clean = val.trim()
    if (clean.startsWith('@')) clean = clean.substring(1)
    setInstagram(clean)
    if (errors.instagram) setErrors(prev => ({ ...prev, instagram: undefined }))
  }

  // Upload selfie file to backend and get URL
  const uploadSelfieFile = async (file: File): Promise<{ selfie_url: string; storage_key: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`/api/client-portal/${slug}/onboarding/upload-selfie?role=${role}`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Failed to verify selfie.')
    }

    const json = await res.json()
    if (!json.selfie_url) throw new Error('Server did not return a selfie URL')
    if (json.storage_key) setStorageKey(json.storage_key)
    return { selfie_url: json.selfie_url, storage_key: json.storage_key }
  }

  // Open camera or trigger camera fallback
  const handleOpenCamera = () => {
    if (typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)) {
      setIsCameraModalOpen(true)
    } else {
      cameraInputRef.current?.click()
    }
  }

  // Process selected or captured selfie file
  // isSelfie: true when clicked live via camera (no cropping needed)
  // isSelfie: false when uploaded from file picker (smart-cropped 1:1 on face to avoid tummy)
  const processSelfieFile = async (file: File, isSelfie = false) => {
    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image file.'
      setSelfieStatusMsg(msg)
      setValidationStatus('rejected')
      setErrors(prev => ({ ...prev, selfie: msg }))
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      const msg = 'Selfie must be under 25MB.'
      setSelfieStatusMsg(msg)
      setValidationStatus('rejected')
      setErrors(prev => ({ ...prev, selfie: msg }))
      return
    }

    const localPreviewUrl = URL.createObjectURL(file)
    setSelfiePreview(localPreviewUrl)
    setValidationStatus('verifying')
    setSelfieStatusMsg('Detecting face & verifying...')
    setUploadingSelfie(true)
    if (errors.selfie) setErrors(prev => ({ ...prev, selfie: undefined }))

    try {
      let fileToUpload = file

      // Only uploaded photos need smart 1:1 face cropping; camera selfies are already face-framed
      if (!isSelfie) {
        const croppedFile = await smartCropImageFile(file, 900, 0.88)
        fileToUpload = croppedFile
        setSelectedFile(croppedFile)
        setSelfiePreview(URL.createObjectURL(croppedFile))
      } else {
        setSelectedFile(file)
      }

      // Upload and verify with MyCircle AI face detection
      const uploadRes = await uploadSelfieFile(fileToUpload)
      setSelfieUrl(uploadRes.selfie_url)
      setStorageKey(uploadRes.storage_key)
      setValidationStatus('accepted')
      setSelfieStatusMsg('Face verified successfully')
      if (errors.selfie) setErrors(prev => ({ ...prev, selfie: undefined }))
    } catch (err: any) {
      setValidationStatus('rejected')
      const msg = err.message || 'Face verification failed. Please take another photo.'
      setSelfieStatusMsg(msg)
      setErrors(prev => ({ ...prev, selfie: msg }))
    } finally {
      setUploadingSelfie(false)
    }
  }

  // Handle uploaded photo from file picker
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processSelfieFile(file, false)
  }

  // Handle camera capture from camera fallback input
  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processSelfieFile(file, true)
  }

  // Clear selfie
  const handleRemoveSelfie = () => {
    setSelectedFile(null)
    setSelfiePreview(null)
    setSelfieUrl(null)
    setStorageKey(null)
    setValidationStatus('idle')
    setSelfieStatusMsg(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (errors.selfie) setErrors(prev => ({ ...prev, selfie: undefined }))
  }

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const newErrors: typeof errors = {}

    // Validation
    if (!name || !name.trim()) {
      newErrors.name = 'Full name is required.'
    }

    // 1. Primary Phone Validation
    const phoneCheck = validatePhoneNumber(phonePrimary, 'Primary phone number')
    if (!phoneCheck.valid) {
      newErrors.phonePrimary = phoneCheck.error
    }

    // 2. Secondary Phone Validation (optional, but if provided must be valid)
    let formattedSecPhone: string | null = null
    if (phoneSecondary && phoneSecondary.trim()) {
      const phoneSecCheck = validatePhoneNumber(phoneSecondary, 'Alternate phone number')
      if (!phoneSecCheck.valid) {
        newErrors.phoneSecondary = phoneSecCheck.error
      } else if (phoneCheck.valid && phoneCheck.formatted === phoneSecCheck.formatted) {
        newErrors.phoneSecondary = 'Alternate phone number must be different from primary phone number.'
      } else {
        formattedSecPhone = phoneSecCheck.formatted || null
      }
    }

    // 3. Email Address Validation
    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      newErrors.email = emailCheck.error
    }

    // 4. Instagram Handle Validation
    const cleanInsta = instagram.trim().replace(/^@+/, '')
    if (!cleanInsta) {
      newErrors.instagram = 'Instagram handle is required.'
    } else if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInsta)) {
      newErrors.instagram = 'Please enter a valid Instagram handle.'
    }

    if (validationStatus === 'verifying') {
      newErrors.selfie = 'Please wait for AI face verification to finish.'
    } else if (validationStatus === 'rejected') {
      newErrors.selfie = selfieStatusMsg || 'Please provide a clear selfie with your face visible.'
    } else if (!selfieUrl && !selectedFile) {
      newErrors.selfie = 'Please take or upload a reference selfie.'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)

    try {
      let finalSelfieUrl = selfieUrl
      let finalStorageKey = storageKey

      // Upload selfie if not already uploaded
      if (!finalSelfieUrl && selectedFile) {
        setUploadingSelfie(true)
        const uploadResult = await uploadSelfieFile(selectedFile)
        finalSelfieUrl = uploadResult.selfie_url
        finalStorageKey = uploadResult.storage_key
        setSelfieUrl(finalSelfieUrl)
        setStorageKey(finalStorageKey)
        setUploadingSelfie(false)
      }

      if (!finalSelfieUrl) {
        throw new Error('Reference selfie is required.')
      }

      // 2. Submit onboarding profile
      const res = await fetch(`/api/client-portal/${slug}/onboarding/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          role,
          name: name.trim(),
          phone_primary: phoneCheck.formatted || phonePrimary.trim(),
          phone_secondary: formattedSecPhone,
          email: emailCheck.clean || email.trim().toLowerCase(),
          instagram: cleanInsta,
          selfie_url: finalSelfieUrl,
          storage_key: finalStorageKey || storageKey
        })
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to complete onboarding')
      }

      const resData = await res.json()
      const updatedProfile: OnboardingPerson = {
        role,
        name: name.trim() || displayName,
        phone_primary: phoneCheck.formatted || phonePrimary.trim(),
        phone_secondary: formattedSecPhone || '',
        email: emailCheck.clean || email.trim().toLowerCase(),
        instagram: cleanInsta,
        selfie_url: finalSelfieUrl,
        is_completed: true,
        completed_at: new Date().toISOString()
      }

      onSuccess(updatedProfile, Boolean(resData.isFullyCompleted))
    } catch (err: any) {
      setErrors(prev => ({
        ...prev,
        form: err.message || 'Something went wrong. Please check your connection and try again.'
      }))
    } finally {
      setSubmitting(false)
      setUploadingSelfie(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-neutral-50/90 text-neutral-900 py-8 px-4 sm:px-6 relative overflow-hidden transition-colors duration-300 force-light"
      style={{ colorScheme: 'light' }}
    >
      {/* Background ambient lighting */}
      <div
        className={`absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none ${
          isBride ? 'bg-rose-200/25' : 'bg-slate-200/25'
        }`}
      />
      <div className="absolute bottom-10 left-1/4 w-[500px] h-[500px] bg-amber-100/30 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-xl mx-auto relative z-10">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 bg-white border border-neutral-200/70 hover:border-neutral-300 px-3 py-1.5 rounded-xl transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to selection</span>
          </button>

          {logoUrl && (
            <img src={logoUrl} alt="Misty Visuals" className="h-7 w-auto object-contain opacity-85" />
          )}
        </div>

        {/* Card Container */}
        <div className="bg-white border border-neutral-200/80 rounded-3xl p-6 sm:p-8 shadow-xl transition-all">
          {/* Form Header */}
          <div className="text-center mb-8">
            <span
              className={`inline-block text-[11px] font-bold tracking-[0.2em] uppercase px-3 py-1 rounded-full mb-3 ${
                isBride
                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                  : 'bg-slate-100 text-slate-700 border border-slate-200/60'
              }`}
            >
              {roleLabel} Profile Setup
            </span>

            <h1 className="text-2xl sm:text-3xl font-serif text-neutral-900 tracking-tight">
              Welcome, {name.trim() || displayName}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1.5 max-w-sm mx-auto">
              Confirm your contact details and upload a reference selfie to complete your onboarding.
            </p>
          </div>

          {/* Form Global Error */}
          {errors.form && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl p-3.5 text-center font-medium">
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Full Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-700">
                {isBride ? 'Bride’s Name' : 'Groom’s Name'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value)
                  if (errors.name) setErrors(prev => ({ ...prev, name: undefined }))
                }}
                placeholder={isBride ? "Enter bride's name" : "Enter groom's name"}
                className={`w-full bg-neutral-50/60 border rounded-2xl py-3 px-4 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white transition-all shadow-sm ${
                  errors.name
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-neutral-200 focus:border-neutral-400'
                }`}
              />
              {errors.name && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.name}</p>
              )}
            </div>

            {/* 2. Primary Phone Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-700">
                Primary Phone Number <span className="text-rose-500">*</span>
              </label>
              <PhoneField
                value={phonePrimary}
                onChange={val => {
                  setPhonePrimary(val || '')
                  if (errors.phonePrimary) setErrors(prev => ({ ...prev, phonePrimary: undefined }))
                }}
                className={errors.phonePrimary ? 'border-red-400' : ''}
                placeholder="Enter mobile number"
              />
              {errors.phonePrimary && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.phonePrimary}</p>
              )}
            </div>

            {/* 3. Alternate Phone Number (Optional) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-700 flex items-center justify-between">
                <span>Alternate Phone Number</span>
                <span className="text-[11px] font-normal text-neutral-400">Optional</span>
              </label>
              <PhoneField
                value={phoneSecondary}
                onChange={val => {
                  setPhoneSecondary(val || '')
                  if (errors.phoneSecondary) setErrors(prev => ({ ...prev, phoneSecondary: undefined }))
                }}
                className={errors.phoneSecondary ? 'border-red-400' : ''}
                placeholder="Secondary or family phone"
              />
              {errors.phoneSecondary && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.phoneSecondary}</p>
              )}
            </div>

            {/* 4. Email Address */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-700">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }))
                }}
                placeholder="e.g. name@example.com"
                className={`w-full bg-neutral-50/60 border rounded-2xl py-3 px-4 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white transition-all shadow-sm ${
                  errors.email
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-neutral-200 focus:border-neutral-400'
                }`}
              />
              {errors.email && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.email}</p>
              )}
            </div>

            {/* 5. Instagram Handle */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-700">
                Instagram Profile <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-sm font-semibold text-neutral-400 select-none">@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={e => handleInstagramChange(e.target.value)}
                  placeholder="username"
                  className={`w-full bg-neutral-50/60 border rounded-2xl py-3 pl-8 pr-4 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white transition-all shadow-sm ${
                    errors.instagram
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-neutral-200 focus:border-neutral-400'
                  }`}
                />
              </div>
              {errors.instagram && (
                <p className="text-[11px] text-red-600 font-medium mt-1">{errors.instagram}</p>
              )}
            </div>

            {/* 6. Selfie Upload / Capture */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-neutral-700">
                  {roleLabel}'s Reference Selfie <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-neutral-400">Clear frontal photo</span>
              </div>

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleCameraInputChange}
              />

              {/* Preview or Upload Zone */}
              {selfiePreview ? (
                <div
                  className={`relative bg-neutral-50 border rounded-3xl p-4 flex items-center gap-4 transition-all ${
                    validationStatus === 'rejected'
                      ? 'border-red-300 bg-red-50/20'
                      : validationStatus === 'accepted'
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : 'border-neutral-200'
                  }`}
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white shadow-md shrink-0 bg-neutral-200 relative">
                    <img
                      src={selfiePreview}
                      alt="Selfie Preview"
                      className="w-full h-full object-cover object-top"
                    />
                    {validationStatus === 'verifying' && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-xs">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-neutral-800">
                      Reference Selfie
                    </p>

                    {/* Status badges */}
                    {validationStatus === 'verifying' && (
                      <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1.5 mt-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>Verifying face with AI...</span>
                      </p>
                    )}

                    {validationStatus === 'accepted' && (
                      <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Face verified ✓</span>
                      </p>
                    )}

                    {validationStatus === 'rejected' && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <svg className="w-3.5 h-3.5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Verification failed</span>
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={handleOpenCamera}
                        disabled={validationStatus === 'verifying'}
                        className="text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-200 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={validationStatus === 'verifying'}
                        className="text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        Choose File
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveSelfie}
                        disabled={validationStatus === 'verifying'}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-white border border-rose-100 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all bg-neutral-50/50 hover:bg-neutral-50 ${
                    errors.selfie ? 'border-red-300 bg-red-50/20' : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="w-12 h-12 mx-auto rounded-full bg-neutral-200/60 flex items-center justify-center text-neutral-600 mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>

                  <p className="text-xs font-semibold text-neutral-800">
                    Take a selfie or choose a photo
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1 max-w-xs mx-auto">
                    Please use good natural lighting and face the camera directly.
                  </p>

                  <div className="flex items-center justify-center gap-2.5 mt-4">
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-900 text-white px-3.5 py-2 rounded-xl transition hover:bg-neutral-800 shadow-sm cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span>Take Selfie</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-neutral-700 border border-neutral-300 px-3.5 py-2 rounded-xl transition hover:bg-neutral-50 shadow-2xs cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Choose File</span>
                    </button>
                  </div>
                </div>
              )}

              {errors.selfie && (
                <div className="mt-2 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errors.selfie}</span>
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting || validationStatus === 'verifying'}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-3.5 px-6 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {submitting || validationStatus === 'verifying' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>
                      {validationStatus === 'verifying'
                        ? 'Verifying Face with AI...'
                        : uploadingSelfie
                        ? 'Uploading Selfie...'
                        : 'Saving Profile...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Continue to Workspace</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-neutral-400 mt-6">
          Your information is securely encrypted and used only for your Misty Visuals workspace.
        </p>
      </div>

      {/* Live WebRTC Camera Modal with strict hardware shutoff */}
      <PortalCameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={file => processSelfieFile(file, true)}
        onUploadFallback={() => fileInputRef.current?.click()}
        roleTitle={roleLabel}
      />
    </div>
  )
}
