'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { compressImageToDataUrl, estimateBase64Bytes } from '@/lib/imageCompression'
import GalleryLayout, { type GalleryDensity, type GalleryLayoutMode } from '@/components/GalleryLayout'

type Photo = {
  id: number
  url: string
  tags: string[]
  content_hash?: string
  createdAt?: string
}

type PendingUpload = {
  id: string
  filename: string
  originalName: string
  dataUrl: string
  tags: string[]
  contentHash?: string
}

const TAG_CATEGORIES = {
  Event: ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding'],
  Subject: ['bride', 'groom', 'couple', 'family', 'dance', 'details'],
  Lighting: ['day', 'night', 'sunset', 'indoor', 'outdoor'],
  Location: ['destination', 'local', 'palace', 'resort', 'home'],
  Style: ['colourful', 'candid', 'emotional', 'dramatic', 'editorial', 'hero'],
  Usage: ['deliverables', 'cover']
}

const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITY = 0.82
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const cardClass = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm'
const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', ...init })

const readJson = async (res: Response) => {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(text)
  }
}

async function calculateHash(dataUrl: string) {
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/)
  if (!match) return ''
  const base64Data = match[2]
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PhotoLibraryPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [uploadTags, setUploadTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('') // This isn't actually customTag anymore, what is it used for? Ah wait it was used for TagPicker. I can remove it later. Let's just remove it!
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null)
  const [editTags, setEditTags] = useState<string[]>([])
  const [editCustomTag, setEditCustomTag] = useState('') // Removed
  const [viewerPhotoIndex, setViewerPhotoIndex] = useState<number | null>(null)
  const [layout, setLayout] = useState<GalleryLayoutMode>('grid')
  const [density, setDensity] = useState<GalleryDensity>('comfortable')
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [processingUploads, setProcessingUploads] = useState(false)
  const [uploadTagDraft, setUploadTagDraft] = useState('') // Removing this too.
  const [uploadSuccessCount, setUploadSuccessCount] = useState(0)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [applyAllTags, setApplyAllTags] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'done' | 'error' | 'duplicate'>>({})
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [activeUploadTab, setActiveUploadTab] = useState<'batch' | 'individual'>('batch')
  const uploadThumbnailsRef = useRef<HTMLDivElement>(null)

  const scrollUploads = (direction: 'left' | 'right') => {
    if (uploadThumbnailsRef.current) {
      const scrollAmount = 300
      uploadThumbnailsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCancelConfirm) {
          setShowCancelConfirm(false)
        } else if (uploadModalOpen) {
          if (!pendingUploads.length) {
            setUploadModalOpen(false)
          } else {
            setShowCancelConfirm(true)
          }
        } else if (editingPhoto) {
          setEditingPhoto(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [uploadModalOpen, showCancelConfirm, pendingUploads, editingPhoto])

  useEffect(() => {
    apiFetch('/api/photos')
      .then(async (res) => {
        const data = await readJson(res)
        if (!res.ok) {
          throw new Error(data?.error || 'Unable to load photo library.')
        }
        setPhotos(Array.isArray(data) ? data : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load photo library.'))
  }, [])

  const filteredPhotos = useMemo(() => {
    if (!selectedTags.length) return photos
    return photos.filter((photo) =>
      selectedTags.every((tag) => photo.tags.includes(tag))
    )
  }, [photos, selectedTags])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewerPhotoIndex === null) return
      if (e.key === 'Escape') setViewerPhotoIndex(null)
      if (e.key === 'ArrowLeft') {
        setViewerPhotoIndex(prev => prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1)
      }
      if (e.key === 'ArrowRight') {
        setViewerPhotoIndex(prev => prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewerPhotoIndex, filteredPhotos.length])

  const uploadPhotoPayload = async (payload: { dataUrl: string; filename: string; tags: string[]; contentHash?: string }) => {
    const res = await apiFetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(data?.error || 'Upload failed')
    return data as Photo
  }

  const processFiles = async (files: File[]) => {
    if (!files.length) return
    setProcessingUploads(true)
    setUploadError(null)
    const nextUploads: PendingUpload[] = []
    const nextProgress: Record<string, 'pending' | 'duplicate'> = {}

    for (const file of files) {
      try {
        const { dataUrl, filename } = await compressImageToDataUrl(file, {
          maxDimension: MAX_IMAGE_DIMENSION,
          quality: JPEG_QUALITY,
          outputType: 'image/jpeg',
        })
        if (estimateBase64Bytes(dataUrl) > MAX_UPLOAD_BYTES) {
          throw new Error('Image is still too large. Try a smaller file.')
        }

        const hash = await calculateHash(dataUrl)

        const newUpload: PendingUpload = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          filename,
          originalName: file.name,
          dataUrl,
          tags: [],
          contentHash: hash,
        }

        const isLibraryDup = photos.some(p => p.content_hash === hash)
        const isBatchDup = nextUploads.some(u => u.contentHash === hash)
        
        nextUploads.push(newUpload)
        nextProgress[newUpload.id] = (isLibraryDup || isBatchDup) ? 'duplicate' : 'pending'

      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Failed to process image')
      }
    }

    setPendingUploads((prev) => {
      nextUploads.forEach(u => {
        if (nextProgress[u.id] === 'pending' && prev.some(p => p.contentHash === u.contentHash)) {
          nextProgress[u.id] = 'duplicate'
        }
      })
      
      const newArray = [...prev, ...nextUploads]
      if (!selectedUploadId && newArray.length > 0) {
        setSelectedUploadId(newArray[0].id)
      }
      return newArray
    })

    setUploadProgress(prev => ({
      ...prev,
      ...nextProgress
    }))
    setProcessingUploads(false)
  }

  const openUploadModal = () => {
    setUploadModalOpen(true)
    setUploadStatus(null)
    setUploadError(null)
    setUploadSuccessCount(0)
    setPendingUploads([])
    setSelectedUploadId(null)
    setUploadTagDraft('')
    setApplyAllTags([])
    setUploadProgress({})
    setActiveUploadTab('batch')
  }

  const selectedUpload = pendingUploads.find((upload) => upload.id === selectedUploadId) || null
  const validUploadCount = useMemo(() => pendingUploads.filter(u => uploadProgress[u.id] !== 'duplicate').length, [pendingUploads, uploadProgress])

  const updateSelectedTags = (nextTags: string[]) => {
    if (!selectedUploadId) return
    setPendingUploads((prev) =>
      prev.map((upload) =>
        upload.id === selectedUploadId ? { ...upload, tags: nextTags } : upload
      )
    )
  }

  const removePendingUpload = (id: string) => {
    setPendingUploads((prev) => {
      const next = prev.filter((upload) => upload.id !== id)
      if (!next.length) {
        setSelectedUploadId(null)
      } else if (id === selectedUploadId) {
        setSelectedUploadId(next[0].id)
      }
      return next
    })
  }

  const handleUploadAll = async () => {
    if (!pendingUploads.length) return
    setUploading(true)
    setUploadError(null)
    const completed: string[] = []
    let successCount = 0
    try {
      for (const upload of pendingUploads) {
        if (uploadProgress[upload.id] === 'duplicate') {
          completed.push(upload.id)
          continue
        }
        setUploadProgress((prev) => ({ ...prev, [upload.id]: 'uploading' }))
        const photo = await uploadPhotoPayload({
          dataUrl: upload.dataUrl,
          filename: upload.filename,
          tags: upload.tags,
          contentHash: upload.contentHash,
        })
        completed.push(upload.id)
        setUploadProgress((prev) => ({ ...prev, [upload.id]: 'done' }))
        setPhotos((prev) => [photo, ...prev])
        successCount += 1
      }
    } catch (err) {
      setUploadProgress((prev) => {
        const next = { ...prev }
        const failed = pendingUploads.find((u) => !completed.includes(u.id))
        if (failed) next[failed.id] = 'error'
        return next
      })
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadSuccessCount(successCount)
      setPendingUploads((prev) => prev.filter((upload) => !completed.includes(upload.id)))
      if (!pendingUploads.filter((upload) => !completed.includes(upload.id)).length) {
        setSelectedUploadId(null)
        const message =
          successCount > 0
            ? `${successCount} photo${successCount === 1 ? '' : 's'} uploaded`
            : 'No new photos uploaded.'
        setUploadStatus(message)
        setTimeout(() => setUploadModalOpen(false), 2000)
      }
      setUploading(false)
    }
  }

  const handleApplyAllTagsChange = (nextTags: string[]) => {
    const added = nextTags.filter(t => !applyAllTags.includes(t))
    const removed = applyAllTags.filter(t => !nextTags.includes(t))

    setPendingUploads((prev) =>
      prev.map((upload) => {
        let currentTags = [...upload.tags]
        
        // Add new tags
        added.forEach(t => {
          if (!currentTags.includes(t)) currentTags.push(t)
        })

        // Remove tags deselected from "All"
        if (removed.length > 0) {
          currentTags = currentTags.filter(t => !removed.includes(t))
        }

        return { ...upload, tags: currentTags }
      })
    )
    setApplyAllTags(nextTags)
  }

  const handleDelete = async (photoId: number) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/photos/${photoId}`, { method: 'DELETE' })
      const data = await readJson(res)
      if (!res.ok) {
        throw new Error(data?.error || 'Delete failed')
      }
      setPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const openEditTags = (photo: Photo) => {
    setEditingPhoto(photo)
    setEditTags(photo.tags)
    setEditCustomTag('')
  }

  const handleUpdateTags = async () => {
    if (!editingPhoto) return
    setError(null)
    try {
      const res = await apiFetch(`/api/photos/${editingPhoto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editTags }),
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data?.error || 'Update failed')
      setPhotos((prev) =>
        prev.map((photo) => (photo.id === editingPhoto.id ? data : photo))
      )
      setEditingPhoto(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const availableTags = useMemo(() => {
    const dynamicTags = new Set<string>()
    Object.values(TAG_CATEGORIES).flat().forEach((tag) => dynamicTags.add(tag))
    photos.forEach((photo) => photo.tags.forEach((tag) => dynamicTags.add(tag)))
    return Array.from(dynamicTags).sort()
  }, [photos])

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          Upload and tag proposal photography assets.
        </p>
        <button
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          onClick={openUploadModal}
        >
          Upload Photos
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Filter by Tag
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <button
                key={tag}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedTags.includes(tag)
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600'
                }`}
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag)
                      ? prev.filter((t) => t !== tag)
                      : [...prev, tag]
                  )
                }
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <button
              className="mt-3 text-xs text-neutral-500 underline"
              onClick={() => setSelectedTags([])}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-semibold text-neutral-800">
            Gallery ({filteredPhotos.length})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'grid', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4V4zm8 0h8v6h-8V4zM4 12h8v8H4v-8zm10 0h6v8h-6v-8z" /></svg> },
              { key: 'feed', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3h16v4H4V3zm0 7h16v4H4v-4zm0 7h16v4H4v-4z" /></svg> },
            ] as const).map((option) => (
              <button
                key={option.key}
                title={option.key}
                className={`rounded-lg border p-1.5 transition ${
                  layout === option.key
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
                onClick={() => setLayout(option.key)}
              >
                {option.label}
              </button>
            ))}
            <div className="w-px h-6 bg-neutral-200 mx-1"></div>
            {(['compact', 'comfortable', 'spacious'] as const).map((level) => (
              <button
                key={level}
                className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                  density === level
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
                onClick={() => setDensity(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          {filteredPhotos.length ? (
            <GalleryLayout
              items={filteredPhotos}
              layout={layout}
              density={density}
              getItemKey={(photo) => photo.id}
              getItemSrc={(photo) => photo.url}
              renderItem={(photo) => (
                <PhotoCard
                  photo={photo}
                  fit={layout === 'grid' ? 'cover' : 'contain'}
                  onView={() => setViewerPhotoIndex(filteredPhotos.findIndex(p => p.id === photo.id))}
                  onEdit={() => openEditTags(photo)}
                  onDelete={() => handleDelete(photo.id)}
                />
              )}
              renderFeedDetails={(photo) => (
                <div className="flex items-start justify-between gap-4 mt-2 px-1">
                  <div className="flex-grow">
                    <TagPicker
                      tags={photo.tags}
                      onChange={async (newTags) => {
                        // Optimistic local update
                        setPhotos((prev) =>
                          prev.map((p) => (p.id === photo.id ? { ...p, tags: newTags } : p))
                        )
                        try {
                          await apiFetch(`/api/photos/${photo.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tags: newTags }),
                          })
                        } catch (err) {
                          console.error('Failed to update tags inline', err)
                        }
                      }}
                      presetTags={availableTags}
                    />
                  </div>

                  <button 
                    className="flex-none rounded-full p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => handleDelete(photo.id)}
                    title="Delete Photo"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            />
          ) : (
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
              No photos found for selected tags.
            </div>
          )}
        </div>
      </section>

      {editingPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="text-sm font-semibold text-neutral-800">Edit Tags</div>
            <TagPicker
              label="Tags"
              tags={editTags}
              onChange={setEditTags}
              presetTags={availableTags}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm"
                onClick={() => setEditingPhoto(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={handleUpdateTags}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerPhotoIndex !== null && filteredPhotos[viewerPhotoIndex] && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col overflow-hidden backdrop-blur-xl animate-in fade-in duration-200">
          <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between px-6 z-10">
            <div className="text-white text-sm font-semibold opacity-60">
               {viewerPhotoIndex + 1} / {filteredPhotos.length}
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => openEditTags(filteredPhotos[viewerPhotoIndex])} className="text-white hover:opacity-100 opacity-60 transition text-xs font-semibold uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-full hover:bg-white/20">Edit Tags</button>
              <button onClick={() => setViewerPhotoIndex(null)} className="text-white hover:opacity-100 opacity-60 transition p-2 bg-white/10 rounded-full hover:bg-white/20">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <button onClick={() => setViewerPhotoIndex(prev => prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 p-4 text-white opacity-50 hover:opacity-100 transition z-10 hover:scale-110 active:scale-95">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => setViewerPhotoIndex(prev => prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0)} className="absolute right-4 top-1/2 -translate-y-1/2 p-4 text-white opacity-50 hover:opacity-100 transition z-10 hover:scale-110 active:scale-95">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          
          <div className="flex-1 flex items-center justify-center p-16">
            <div className="relative max-w-full max-h-full">
               <img src={filteredPhotos[viewerPhotoIndex].url} className="max-w-full max-h-[85vh] object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.1)] rounded-sm" />
            </div>
          </div>

          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-8 pb-10 z-10 flex flex-col items-center pointer-events-none">
             <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl pointer-events-auto">
                {filteredPhotos[viewerPhotoIndex].tags.map(tag => (
                   <span key={tag} className="px-3 py-1.5 bg-white/10 backdrop-blur-md text-white/90 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full shadow-sm select-none border border-white/5">{tag}</span>
                ))}
                {filteredPhotos[viewerPhotoIndex].tags.length === 0 && (
                  <span className="text-white/40 text-xs italic">No tags selected</span>
                )}
             </div>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl max-h-[95vh] flex flex-col rounded-3xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
            {uploadStatus ? (
              <div className="flex flex-col items-center justify-center py-32 shrink-0">
                <div className="mb-4 rounded-full bg-neutral-100 p-4">
                  {uploadStatus.includes('cancelled') ? (
                    <svg className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="text-xl font-semibold text-neutral-900">{uploadStatus}</div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-6 border-b border-neutral-100 shrink-0">
              <div>
                <div className="text-lg font-bold text-neutral-900 tracking-tight">Upload Photos</div>
                <div className="text-xs text-neutral-500 mt-1">
                  Drag photos here or browse. Resize happens automatically.
                </div>
              </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-neutral-50 hover:border-neutral-300 transition"
                onClick={() => {
                  if (!pendingUploads.length) {
                    setUploadModalOpen(false)
                  } else {
                    setShowCancelConfirm(true)
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleUploadAll}
                  disabled={uploading || validUploadCount === 0}
                >
                  {uploading ? 'Uploading…' : `Upload (${validUploadCount})`}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            {uploadError && (
              <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {uploadError}
              </div>
            )}

            <div className={`${pendingUploads.length > 0 ? 'grid gap-8 lg:grid-cols-[2fr_1fr]' : 'flex flex-col items-center justify-center'} min-w-0`}>
              <div className="w-full min-w-0">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length) processFiles(files)
                  }}
                  disabled={uploading}
                />
                {!pendingUploads.length && (
                  <div
                    className={`cursor-pointer flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-20 text-center transition hover:bg-neutral-50 ${
                      dragActive
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-300 bg-white'
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragActive(true)
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragActive(false)
                      const files = Array.from(event.dataTransfer.files || [])
                      if (files.length) processFiles(files)
                    }}
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    {processingUploads ? (
                      <div className="text-sm font-medium text-neutral-600">Processing images…</div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-10 h-10 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="text-base font-medium text-neutral-600">Drop photos here or click to browse.</span>
                      </div>
                    )}
                  </div>
                )}

                {pendingUploads.length > 0 && (
                  <div 
                    className={`mt-4 rounded-xl border-2 border-dashed bg-neutral-50 p-4 transition relative ${
                      dragActive ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200'
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragActive(true)
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragActive(false)
                      const files = Array.from(event.dataTransfer.files || [])
                      if (files.length) processFiles(files)
                    }}
                  >
                    {processingUploads && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-xl">
                        <span className="text-sm font-medium text-neutral-600">Processing images…</span>
                      </div>
                    )}
                    {selectedUpload ? (
                      <img
                        src={selectedUpload.dataUrl}
                        alt={selectedUpload.originalName}
                        className="h-80 w-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="flex h-80 w-full items-center justify-center text-sm font-medium text-neutral-500 pointer-events-none">
                        Select a photo to preview.
                      </div>
                    )}
                  </div>
                )}

                {pendingUploads.length > 0 && (
                  <div className="relative group w-full mt-4 min-w-0">
                    <button
                      type="button"
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50 hover:text-neutral-900 shadow-md"
                      onClick={() => scrollUploads('left')}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    
                    <div 
                      ref={uploadThumbnailsRef}
                      className="flex gap-3 overflow-x-auto pb-4 pt-2 items-center px-2 scrollbar-hide w-full min-w-0"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {pendingUploads.map((upload) => (
                        <button
                          key={upload.id}
                          className={`relative flex h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg ${
                            uploadProgress[upload.id] === 'duplicate'
                              ? 'border-2 border-rose-500'
                              : upload.id === selectedUploadId
                                ? 'border border-neutral-900'
                                : 'border border-neutral-200'
                          }`}
                        onClick={() => setSelectedUploadId(upload.id)}
                      >
                        <img
                          src={upload.dataUrl}
                          alt={upload.originalName}
                          className={`h-full w-full object-cover ${uploadProgress[upload.id] === 'duplicate' ? 'opacity-50 grayscale' : ''}`}
                        />
                      <span className={`absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] text-white ${
                        uploadProgress[upload.id] === 'duplicate'
                          ? 'bg-rose-500 font-semibold'
                          : uploadProgress[upload.id] === 'uploading'
                            ? 'bg-neutral-900'
                            : 'bg-black/70'
                      }`}>
                        {uploadProgress[upload.id] === 'uploading' && (
                          <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
                        )}
                        {uploadProgress[upload.id] === 'uploading'
                          ? 'Uploading'
                          : uploadProgress[upload.id] === 'done'
                            ? 'Done'
                            : uploadProgress[upload.id] === 'error'
                              ? 'Error'
                              : uploadProgress[upload.id] === 'duplicate'
                                ? 'Duplicate'
                                : 'Ready'}
                      </span>
                        <span
                          className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-neutral-600"
                          onClick={(event) => {
                            event.stopPropagation()
                            removePendingUpload(upload.id)
                          }}
                        >
                          ×
                        </span>
                      </button>
                    ))}
                      <button
                        type="button"
                        className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-400 transition"
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50 hover:text-neutral-900 shadow-md"
                      onClick={() => scrollUploads('right')}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {pendingUploads.length > 0 && (
                <div className="space-y-4 min-w-0">
                  <div className="flex items-center justify-between border-b border-neutral-100">
                    <div className="flex gap-4">
                      <button
                        className={`pb-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                          activeUploadTab === 'batch'
                            ? 'border-b-2 border-neutral-900 text-neutral-900'
                            : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                        onClick={() => setActiveUploadTab('batch')}
                      >
                        Batch
                      </button>
                      <button
                        className={`pb-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
                          activeUploadTab === 'individual'
                            ? 'border-b-2 border-neutral-900 text-neutral-900'
                            : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                        onClick={() => setActiveUploadTab('individual')}
                      >
                        Individual
                      </button>
                    </div>
                  </div>

                  {activeUploadTab === 'batch' ? (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 space-y-2">
                      <TagPicker
                        label="Apply to all"
                        tags={applyAllTags}
                        onChange={handleApplyAllTagsChange}
                        presetTags={availableTags}
                      />
                      <div className="text-[11px] text-neutral-500">
                        Selecting tags here applies them to all queued photos.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 space-y-2">
                      {selectedUpload ? (
                        <>
                          <TagPicker
                            label="Tags for selected photo"
                            tags={selectedUpload.tags}
                            onChange={updateSelectedTags}
                            presetTags={availableTags}
                          />
                          <div className="text-[11px] text-neutral-500">
                            These tags only apply to the currently selected photo.
                          </div>
                        </>
                      ) : (
                        <div className="py-4 text-center text-sm text-neutral-500">
                          Select a photo to set its tags.
                        </div>
                      )}
                    </div>
                  )}
                  {uploadSuccessCount > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                      {uploadSuccessCount} photos uploaded successfully.
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="text-sm font-semibold text-neutral-800">Cancel upload?</div>
            <div className="mt-2 text-xs text-neutral-500">
              This will discard the photos queued for upload.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm"
                onClick={() => setShowCancelConfirm(false)}
              >
                Continue Editing
              </button>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setShowCancelConfirm(false)
                  setPendingUploads([])
                  setSelectedUploadId(null)
                  setUploadTagDraft('')
                  setApplyAllTags([])
                  setUploadSuccessCount(0)
                  setUploadStatus('Upload cancelled.')
                  setTimeout(() => setUploadModalOpen(false), 1500)
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const PhotoCard = ({
  photo,
  fit,
  onView,
  onEdit,
  onDelete,
}: {
  photo: Photo
  fit: 'contain' | 'cover'
  onView?: () => void
  onEdit: () => void
  onDelete: () => void
}) => (
  <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:shadow-md group">
    <div 
      className="flex flex-none items-center justify-center overflow-hidden rounded-xl bg-neutral-100 cursor-pointer relative"
      onClick={onView}
    >
      <img
        src={photo.url}
        alt="Photo"
        className={`w-full transition-transform duration-500 group-hover:scale-105 ${fit === 'cover' ? 'h-56 object-cover' : 'h-auto object-contain'}`}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
        <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </div>
    </div>
    <div className="mt-3 flex flex-grow flex-wrap content-start gap-2">
      {photo.tags.map((tag) => (
        <span
          key={`${photo.id}-${tag}`}
          className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500"
        >
          {tag}
        </span>
      ))}
    </div>
    <div className="mt-3 flex flex-none justify-between border-t border-neutral-100 pt-3">
      <button className="text-xs font-semibold text-neutral-600 transition hover:text-neutral-900" onClick={onEdit}>
        Edit Tags
      </button>
      <button className="text-xs font-semibold text-rose-500 transition hover:text-rose-700" onClick={onDelete}>
        Delete
      </button>
    </div>
  </div>
)

const TagPicker = ({
  label,
  tags,
  onChange,
  presetTags,
}: {
  label?: string
  tags: string[]
  onChange: (tags: string[]) => void
  presetTags: string[]
}) => {
  const [customInput, setCustomInput] = useState('')

  return (
    <div className="space-y-4">
      {label && <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</div>}
      
      {Object.entries(TAG_CATEGORIES).map(([category, options]) => (
         <div key={category} className="space-y-1.5 border-t border-neutral-100 pt-3 first:border-0 first:pt-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">{category}</div>
            <div className="flex flex-wrap gap-2 items-center">
               {options.map((tag) => {
                 const isSelected = tags.includes(tag)
                 return (
                   <button
                     key={tag}
                     type="button"
                     className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                       isSelected
                         ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                         : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                     }`}
                     onClick={() => onChange(isSelected ? tags.filter((t) => t !== tag) : [...tags, tag])}
                   >
                     {tag}
                   </button>
                 )
               })}
            </div>
         </div>
      ))}

      {/* Custom tags not in the preset categories */}
      {tags.filter(t => !Object.values(TAG_CATEGORIES).flat().includes(t)).length > 0 && (
         <div className="space-y-1.5 border-t border-neutral-100 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Custom</div>
            <div className="flex flex-wrap gap-2 items-center">
               {tags.filter(t => !Object.values(TAG_CATEGORIES).flat().includes(t)).map(tag => (
                 <button
                   key={tag}
                   type="button"
                   className="group relative flex items-center gap-1 rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-neutral-800"
                   onClick={() => onChange(tags.filter(t => t !== tag))}
                 >
                   <span>{tag}</span> <span className="opacity-60 group-hover:opacity-100">&times;</span>
                 </button>
               ))}
            </div>
         </div>
      )}

      <div className="space-y-1.5 border-t border-neutral-100 pt-3">
         <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Custom Tags</div>
         <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
               if (e.key === 'Enter') {
                  e.preventDefault()
                  const trimmed = customInput.trim().toLowerCase()
                  if (trimmed && !tags.includes(trimmed)) {
                     onChange([...tags, trimmed])
                  }
                  setCustomInput('')
               }
            }}
            placeholder="Type a custom tag and press Enter..."
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none"
         />
      </div>
    </div>
  )
}
