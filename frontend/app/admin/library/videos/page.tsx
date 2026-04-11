'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import GalleryLayout, { type GalleryDensity, type GalleryLayoutMode } from '@/components/GalleryLayout'
import { compressVideoFile } from '@/lib/videoCompression'

type Video = {
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
  blob: Blob
  previewUrl: string  // object URL for <video> preview, cheap to create
  tags: string[]
  contentHash?: string
}

const TAG_CATEGORIES = {
  Event: ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding'],
  Subject: ['bride', 'groom', 'couple', 'family', 'dance', 'details'],
  Lighting: ['day', 'night', 'sunset', 'indoor', 'outdoor'],
  Location: ['destination', 'local', 'palace', 'resort', 'home'],
  Style: ['colourful', 'candid', 'emotional', 'dramatic', 'editorial', 'hero'],
  Usage: ['deliverables']
}

const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITY = 0.82
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const cardClass = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm'
const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
const buildApiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path)

const apiFetch = (input: RequestInfo, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? buildApiUrl(input) : input
  return fetch(url, { credentials: 'include', ...init })
}

const readJson = async (res: Response) => {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(text)
  }
}

async function calculateHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function VideoLibraryPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [uploadTags, setUploadTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('') // This isn't actually customTag anymore, what is it used for? Ah wait it was used for TagPicker. I can remove it later. Let's just remove it!
  const [uploading, setUploading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [renderLimit, setRenderLimit] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)
  const [editTags, setEditTags] = useState<string[]>([])
  const [editCustomTag, setEditCustomTag] = useState('') // Removed
  const [layout, setLayout] = useState<GalleryLayoutMode>('masonry')
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
        } else if (editingVideo) {
          setEditingVideo(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [uploadModalOpen, showCancelConfirm, pendingUploads, editingVideo])

  useEffect(() => {
    apiFetch('/api/videos')
      .then(async (res) => {
        const data = await readJson(res)
        if (!res.ok) {
          throw new Error(data?.error || 'Unable to load video library.')
        }
        setVideos(Array.isArray(data) ? data : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load video library.'))
      .finally(() => setInitialLoading(false))
  }, [])

  const filteredVideos = useMemo(() => {
    if (!selectedTags.length) return videos
    return videos.filter((video) =>
      selectedTags.every((tag) => video.tags.includes(tag))
    )
  }, [videos, selectedTags])

  const displayedVideos = useMemo(() => {
    return filteredVideos.slice(0, renderLimit)
  }, [filteredVideos, renderLimit])

  const uploadVideoPayload = async (
    payload: { blob: Blob; filename: string; tags: string[]; contentHash?: string },
    onProgress?: (pct: number) => void
  ) => {
    return new Promise<Video>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const form = new FormData()
      
      // Order matters: metadata first
      form.append('tags', JSON.stringify(payload.tags))
      if (payload.contentHash) form.append('contentHash', payload.contentHash)
      form.append('file', payload.blob, payload.filename)

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.round((e.loaded / e.total) * 100)
          onProgress(pct)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Invalid server response'))
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            const detail = err?.details ? ` (${err.details})` : ''
            reject(new Error(`${err?.error || 'Upload failed'}${detail}`))
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error or connection closed.')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted.')))

      xhr.open('POST', buildApiUrl('/api/videos'))
      xhr.withCredentials = true
      xhr.send(form)
    })
  }

  const processFiles = async (files: File[]) => {
    if (!files.length) return
    setProcessingUploads(true)
    setUploadError(null)
    const nextUploads: PendingUpload[] = []
    const nextProgress: Record<string, 'pending' | 'duplicate'> = {}

    for (const file of files) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error('Video must be under 500MB before compression.')
        }
        
        let compressedBlob: Blob = file
        try {
          console.log('🎬 Starting magic browser compression pipeline for', file.name)
          const start = performance.now()
          const { blob } = await compressVideoFile(file)
          const took = Math.round((performance.now() - start) / 1000)
          console.log(`✅ Compression finished in ${took}s. ${(file.size/1024/1024).toFixed(1)}MB → ${(blob.size/1024/1024).toFixed(1)}MB`)
          compressedBlob = blob
        } catch (e: any) {
          console.warn('⚠️ Compression bypassed, using raw file.', e.message)
          compressedBlob = file
        }

        const filename = file.name.replace(/\.[^/.]+$/, '') + '.webm'
        // Feature: Skip heavy hashing for files over 40MB to prevent browser OOM/hangups
        let hash = ''
        if (compressedBlob.size < 40 * 1024 * 1024) {
           console.log('🧐 Hashing video for deduplication...')
           hash = await calculateHash(compressedBlob)
        } else {
           console.log('⏭️ Large file: skipping hash calculation for UI performance.')
        }
        const previewUrl = URL.createObjectURL(compressedBlob)

        const newUpload: PendingUpload = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          filename,
          originalName: file.name,
          blob: compressedBlob,
          previewUrl,
          tags: [],
          contentHash: hash,
        }

        const isLibraryDup = videos.some(p => p.content_hash === hash)
        const isBatchDup = nextUploads.some(u => u.contentHash === hash)
        
        nextUploads.push(newUpload)
        nextProgress[newUpload.id] = (isLibraryDup || isBatchDup) ? 'duplicate' : 'pending'

      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Failed to process file.')
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
    // Clear individual percentages when processing new batch
    setUploadPercent({})
    setProcessingUploads(false)
  }

  const [uploadPercent, setUploadPercent] = useState<Record<string, number>>({})

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
        const video = await uploadVideoPayload(
          {
            blob: upload.blob,
            filename: upload.filename,
            tags: upload.tags,
            contentHash: upload.contentHash,
          },
          (pct) => setUploadPercent(prev => ({ ...prev, [upload.id]: pct }))
        )
        completed.push(upload.id)
        setUploadProgress((prev) => ({ ...prev, [upload.id]: 'done' }))
        setVideos((prev) => [video, ...prev])
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
            ? `${successCount} video${successCount === 1 ? '' : 's'} uploaded`
            : 'No new videos uploaded.'
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

  const handleDelete = async (videoId: number) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/videos/${videoId}`, { method: 'DELETE' })
      const data = await readJson(res)
      if (!res.ok) {
        throw new Error(data?.error || 'Delete failed')
      }
      setVideos((prev) => prev.filter((video) => video.id !== videoId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const openEditTags = (video: Video) => {
    setEditingVideo(video)
    setEditTags(video.tags)
    setEditCustomTag('')
  }

  const handleUpdateTags = async () => {
    if (!editingVideo) return
    setError(null)
    try {
      const res = await apiFetch(`/api/videos/${editingVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editTags }),
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(data?.error || 'Update failed')
      setVideos((prev) =>
        prev.map((video) => (video.id === editingVideo.id ? data : video))
      )
      setEditingVideo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const availableTags = useMemo(() => {
    const dynamicTags = new Set<string>()
    Object.values(TAG_CATEGORIES).flat().forEach((tag) => dynamicTags.add(tag))
    videos.forEach((video) => video.tags.forEach((tag) => dynamicTags.add(tag)))
    return Array.from(dynamicTags).sort()
  }, [videos])

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          Upload and tag proposal videography assets.
        </p>
        <button
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          onClick={openUploadModal}
        >
          Upload Videos
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
            Gallery ({filteredVideos.length})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'masonry', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v8H4V4zm0 10h4v6H4v-6zm6-10h4v4h-4V4zm0 6h4v10h-4V10zm6-6h4v7h-4V4zm0 9h4v7h-4v-7z" /></svg> },
              { key: 'feed', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3h16v4H4V3zm0 7h16v4H4v-4zm0 7h16v4H4v-4z" /></svg> },
              { key: 'justified', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v4H4V4zm0 6h10v4H4v-4zm12 0h4v4h-4v-4zm-12 6h6v4H4v-4zm8 0h8v4h-8v-4z" /></svg> },
              { key: 'grid', label: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4V4zm8 0h8v6h-8V4zM4 12h8v8H4v-8zm10 0h6v8h-6v-8z" /></svg> },
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
        <div className="mt-4">
          {initialLoading ? (
            <div className="flex w-full justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900" />
            </div>
          ) : filteredVideos.length ? (
            <>
              <GalleryLayout
                items={displayedVideos}
                layout={layout}
                density={density}
                getItemKey={(video) => video.id}
                getItemSrc={(video) => video.url}
                renderItem={(video) => (
                  <VideoCard
                    video={video}
                    fit={layout === 'grid' ? 'cover' : 'contain'}
                    onEdit={() => openEditTags(video)}
                    onDelete={() => handleDelete(video.id)}
                  />
                )}
                renderFeedDetails={(video) => (
                  <div className="flex items-start justify-between gap-4 mt-2 px-1">
                  <div className="flex-grow">
                    <TagPicker
                      tags={video.tags}
                      onChange={async (newTags) => {
                        // Optimistic local update
                        setVideos((prev) =>
                          prev.map((p) => (p.id === video.id ? { ...p, tags: newTags } : p))
                        )
                        try {
                          await apiFetch(`/api/videos/${video.id}`, {
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
                    onClick={() => handleDelete(video.id)}
                    title="Delete Video"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            />
            {renderLimit < filteredVideos.length && (
              <div className="mt-8 flex justify-center">
                 <button onClick={() => setRenderLimit(v => v + 30)} className="rounded-full border border-neutral-200 bg-white px-6 py-2.5 text-sm font-semibold text-neutral-600 shadow-sm transition hover:border-neutral-300 hover:text-neutral-900">
                   Load More Videos
                 </button>
              </div>
            )}
            </>
          ) : (
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
              No videos found for selected tags.
            </div>
          )}
        </div>
      </section>

      {editingVideo && (
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
                onClick={() => setEditingVideo(null)}
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
                <div className="text-lg font-bold text-neutral-900 tracking-tight">Upload Videos</div>
                <div className="text-xs text-neutral-500 mt-1">
                  Drag videos here or browse. Resize happens automatically.
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
                  accept="video/mp4,video/webm,video/quicktime"
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
                        <span className="text-base font-medium text-neutral-600">Drop videos here or click to browse.</span>
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
                      <video loop muted autoPlay playsInline
                        src={selectedUpload.previewUrl}
                        title={selectedUpload.originalName}
                        className="h-80 w-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="flex h-80 w-full items-center justify-center text-sm font-medium text-neutral-500 pointer-events-none">
                        Select a video to preview.
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
                        <video loop muted autoPlay playsInline
                          src={upload.previewUrl}
                          title={upload.originalName}
                          className={`h-full w-full object-cover ${uploadProgress[upload.id] === 'duplicate' ? 'opacity-50 grayscale' : ''}`}
                        />
                        
                        {uploadProgress[upload.id] === 'uploading' && (
                          <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/40 backdrop-blur-md">
                            <div 
                              className="h-full bg-emerald-400 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                              style={{ width: `${uploadPercent[upload.id] || 0}%` }}
                            />
                          </div>
                        )}

                        {uploadProgress[upload.id] === 'uploading' && (
                          <div className="absolute top-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white backdrop-blur-md">
                            {uploadPercent[upload.id] || 0}%
                          </div>
                        )}

                        <span className={`absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] text-white ${
                          uploadProgress[upload.id] === 'duplicate'
                            ? 'bg-rose-500 font-semibold'
                            : uploadProgress[upload.id] === 'uploading'
                              ? 'hidden'
                              : 'bg-black/70'
                        }`}>
                          {uploadProgress[upload.id] === 'done'
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
                        Selecting tags here applies them to all queued videos.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 space-y-2">
                      {selectedUpload ? (
                        <>
                          <TagPicker
                            label="Tags for selected video"
                            tags={selectedUpload.tags}
                            onChange={updateSelectedTags}
                            presetTags={availableTags}
                          />
                          <div className="text-[11px] text-neutral-500">
                            These tags only apply to the currently selected video.
                          </div>
                        </>
                      ) : (
                        <div className="py-4 text-center text-sm text-neutral-500">
                          Select a video to set its tags.
                        </div>
                      )}
                    </div>
                  )}
                  {uploadSuccessCount > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                      {uploadSuccessCount} videos uploaded successfully.
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
              This will discard the videos queued for upload.
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

const VideoCard = ({
  video,
  fit,
  onEdit,
  onDelete,
}: {
  video: Video
  fit: 'contain' | 'cover'
  onEdit: () => void
  onDelete: () => void
}) => {
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  return (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:shadow-md group/card">
      <div className="relative flex flex-none items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
        <video 
          ref={videoRef}
          loop 
          muted={isMuted} 
          autoPlay 
          playsInline
          src={video.url}
          title="Video"
          className={`w-full ${fit === 'cover' ? 'h-56 object-cover' : 'h-auto object-contain'}`}
        />
        <button 
          onClick={(e) => {
            e.stopPropagation()
            const next = !isMuted
            setIsMuted(next)
            if (videoRef.current) {
               videoRef.current.muted = next
               videoRef.current.volume = 1.0
            }
          }}
          className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all active:scale-90 hover:bg-black"
        >
          {isMuted ? (
            <svg className="w-4 h-4 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          ) : (
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          )}
        </button>
      </div>
    <div className="mt-3 flex flex-grow flex-wrap content-start gap-2">
      {video.tags.map((tag) => (
        <span
          key={`${video.id}-${tag}`}
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
}

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
