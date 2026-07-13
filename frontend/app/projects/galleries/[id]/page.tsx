'use client'

import { useEffect, useState, useTransition, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAuth } from '@/lib/authClient'

type GuestItem = {
  id: number
  name: string | null
  email: string
  phoneNumber: string | null
  hasFullAccess: boolean
  isBlocked: boolean
  createdAt: string
  likesCount?: number
  likedPhotos?: any[]
}

type GalleryDetails = {
  id: number
  leadId: number | null
  slug: string
  title: string
  date: string
  qrToken: string
  coverPhotoUrl: string | null
  coverPhotoMobileUrl: string | null
  coverPhotoSquareUrl: string | null
  active: boolean
  projectId: string | null
  tabs: string[]
  allowDownloads: boolean
  allowBulkDownloads: boolean
  bulkDownloadPin: string | null
  crmName?: string | null
  crmSlug?: string | null
}

export default function GalleryManagementPage() {
  const router = useRouter()
  const { id } = useParams()
  const galleryId = id as string

  const [loading, setLoading] = useState(true)
  const [gallery, setGallery] = useState<GalleryDetails | null>(null)
  const [guests, setGuests] = useState<GuestItem[]>([])
  const [userRole, setUserRole] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'general' | 'uploads' | 'participants' | 'settings'>('general')

  // General tab states
  const [editTitle, setEditTitle] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [updatingGeneral, setUpdatingGeneral] = useState(false)
  const [uploadingHorizontal, setUploadingHorizontal] = useState(false)
  const [uploadingVertical, setUploadingVertical] = useState(false)

  // Folder management states
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderIndex, setRenamingFolderIndex] = useState<number | null>(null)
  const [renamingFolderName, setRenamingFolderName] = useState('')

  // Settings tab states
  const [editAllowDownloads, setEditAllowDownloads] = useState(true)
  const [editAllowBulkDownloads, setEditAllowBulkDownloads] = useState(true)
  const [editBulkPin, setEditBulkPin] = useState('')
  const [updatingSettings, setUpdatingSettings] = useState(false)

  // Admin deletion states
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)  // Alert toast
  const [toastMessage, setToastMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)

  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const filteredGuests = useMemo(() => {
    return guests.filter(guest => {
      const query = searchQuery.toLowerCase().trim()
      if (!query) return true
      return (
        (guest.name || '').toLowerCase().includes(query) ||
        (guest.email || '').toLowerCase().includes(query) ||
        (guest.phoneNumber || '').toLowerCase().includes(query)
      )
    })
  }, [guests, searchQuery])
  useEffect(() => {
    getAuth().then(data => {
      if (!data?.authenticated) {
        window.location.href = '/login'
        return
      }
      setUserRole(data.user?.role || '')
      loadDetails()
    })
  }, [galleryId])

  const loadDetails = async () => {
    setLoading(true)
    setError('')
    try {
      const detailsRes = await fetch(`/api/gallery/events/${galleryId}`).then(r => r.json())
      if (detailsRes.error) {
        throw new Error(detailsRes.error)
      }
      setGallery(detailsRes)
      
      // Initialize form fields
      setEditTitle(detailsRes.title)
      setEditSlug(detailsRes.slug)
      setEditActive(detailsRes.active)
      setEditAllowDownloads(detailsRes.allowDownloads)
      setEditAllowBulkDownloads(detailsRes.allowBulkDownloads)
      setEditBulkPin(detailsRes.bulkDownloadPin || '')
      
      if (detailsRes.date) {
        setEditDate(new Date(detailsRes.date).toISOString().substring(0, 10))
      }

      // Load guests likes summary
      const guestsRes = await fetch(`/api/gallery/events/${galleryId}/likes-summary`).then(r => r.json())
      setGuests(guestsRes?.guests || detailsRes.guests || [])

      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve gallery details.')
      setLoading(false)
    }
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // --- GENERAL TAB HANDLERS ---
  const handleUpdateGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdatingGeneral(true)
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          date: editDate,
          slug: editSlug,
          active: editActive
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update details')
      setGallery(data.event)
      triggerToast('Gallery details updated successfully ✓')
    } catch (err: any) {
      alert(err.message || 'Error updating details')
    } finally {
      setUpdatingGeneral(false)
    }
  }

  const uploadCoverBase64 = async (type: string, filename: string, base64: string) => {
    const res = await fetch(`/api/gallery/events/${galleryId}/covers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, filename, fileContent: base64 })
    })
    if (!res.ok) {
      const errData = await res.json()
      throw new Error(errData.error || `Failed to upload ${type} cover`)
    }
  }

  const handleHorizontalCoverUpload = async (file: File) => {
    setUploadingHorizontal(true)
    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = (event) => {
          const img = new Image()
          img.src = event.target?.result as string
          img.onload = () => {
            let width = img.naturalWidth
            let height = img.naturalHeight
            const maxDim = 2560
            if (width > maxDim || height > maxDim) {
              const ratio = Math.min(maxDim / width, maxDim / height)
              width = width * ratio
              height = height * ratio
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('Canvas context failed')); return }
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
          }
          img.onerror = () => reject(new Error('Failed to load image'))
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
      })

      await uploadCoverBase64('horizontal', file.name, base64Content)
      await loadDetails()
      triggerToast('Horizontal cover updated — autoscale generated ✓')
    } catch (err: any) {
      alert(err.message || 'Horizontal cover upload failed')
    } finally {
      setUploadingHorizontal(false)
    }
  }

  const handleVerticalCoverUpload = async (file: File) => {
    setUploadingVertical(true)
    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = (event) => {
          const img = new Image()
          img.src = event.target?.result as string
          img.onload = () => {
            let width = img.naturalWidth
            let height = img.naturalHeight
            if (width > 1080 || height > 1920) {
              const ratio = Math.min(1080 / width, 1920 / height)
              width = width * ratio
              height = height * ratio
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('Canvas context failed')); return }
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1])
          }
          img.onerror = () => reject(new Error('Failed to load image'))
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
      })

      await uploadCoverBase64('vertical', file.name, base64Content)
      await loadDetails()
      triggerToast('Portrait cover updated successfully ✓')
    } catch (err: any) {
      alert(err.message || 'Portrait cover upload failed')
    } finally {
      setUploadingVertical(false)
    }
  }

  const handleDeleteGallery = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete gallery')
      router.push('/projects/galleries')
    } catch (err: any) {
      alert(err.message || 'Deletion failed')
    } finally {
      setDeleting(false)
    }
  }

  // --- UPLOADS & FOLDERS HANDLERS ---
  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return

    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabName: newFolderName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add folder')
      
      if (gallery) {
        setGallery({ ...gallery, tabs: data.tabs || [...gallery.tabs, newFolderName.trim()] })
      }
      setNewFolderName('')
      triggerToast(`Folder "${newFolderName}" added!`)
    } catch (err: any) {
      alert(err.message || 'Failed to add folder')
    }
  }

  const handleRenameFolder = async (oldTabName: string, index: number) => {
    if (!renamingFolderName.trim() || renamingFolderName.trim() === oldTabName) {
      setRenamingFolderIndex(null)
      return
    }

    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/tabs/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldTabName, newTabName: renamingFolderName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rename folder')
      
      if (gallery) {
        const updatedTabs = [...gallery.tabs]
        updatedTabs[index] = renamingFolderName.trim()
        setGallery({ ...gallery, tabs: updatedTabs })
      }
      setRenamingFolderIndex(null)
      setRenamingFolderName('')
      triggerToast('Folder renamed successfully!')
    } catch (err: any) {
      alert(err.message || 'Failed to rename folder')
    }
  }

  const handleDeleteFolder = async (tabName: string) => {
    if (tabName === 'Highlights') {
      alert('The "Highlights" tab is mandatory and cannot be deleted.')
      return
    }
    if (!confirm(`Are you sure you want to delete the folder "${tabName}"? Photos inside will lose their category, but will NOT be deleted.`)) return

    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/tabs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabName })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete folder')
      
      if (gallery) {
        setGallery({ ...gallery, tabs: data.tabs || gallery.tabs.filter(t => t !== tabName) })
      }
      triggerToast('Folder deleted.')
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder')
    }
  }

  // --- PARTICIPANTS TAB HANDLERS ---
  const handleToggleAccess = async (guestId: number, currentAccess: boolean) => {
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/guests/${guestId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasFullAccess: !currentAccess })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to toggle access')
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, hasFullAccess: !currentAccess } : g))
      triggerToast('Guest access level updated.')
    } catch (err: any) {
      alert(err.message || 'Failed to toggle access')
    }
  }

  const handleToggleBlock = async (guestId: number, currentBlock: boolean) => {
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/guests/${guestId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBlocked: !currentBlock })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to block/unblock guest')
      
      setGuests(guests.map(g => g.id === guestId ? { ...g, isBlocked: !currentBlock } : g))
      triggerToast(currentBlock ? 'Guest unblocked!' : 'Guest blocked!')
    } catch (err: any) {
      alert(err.message || 'Failed to update guest status')
    }
  }

  const handleDeleteGuest = async (guestId: number) => {
    if (!confirm('Are you sure you want to remove this guest from this gallery event? This cannot be undone.')) return

    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/guests/${guestId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete guest')
      
      setGuests(guests.filter(g => g.id !== guestId))
      triggerToast('Guest access removed.')
    } catch (err: any) {
      alert(err.message || 'Failed to delete guest')
    }
  }

  const handleExportCSV = (guestName: string, guestEmail: string, likedPhotos: any[]) => {
    if (!likedPhotos || likedPhotos.length === 0) {
      alert('No liked photos found for this guest.')
      return
    }
    const headers = 'Photo ID,Filename,Folder/Tab,R2 URL\n'
    const rows = likedPhotos.map(p => {
      const folder = p.tabName || 'Highlights'
      return `"${p.id}","${p.filename}","${folder}","${p.r2Url}"`
    }).join('\n')
    
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(headers + rows)
    const link = document.createElement('a')
    link.setAttribute('href', csvContent)
    const cleanName = (guestName || guestEmail.split('@')[0]).replace(/[^a-zA-Z0-9]/g, '_')
    link.setAttribute('download', `favorites_${cleanName}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportTXT = (guestName: string, guestEmail: string, likedPhotos: any[]) => {
    if (!likedPhotos || likedPhotos.length === 0) {
      alert('No liked photos found for this guest.')
      return
    }
    const content = likedPhotos.map(p => p.filename).join(', ')
    
    const txtContent = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content)
    const link = document.createElement('a')
    link.setAttribute('href', txtContent)
    const cleanName = (guestName || guestEmail.split('@')[0]).replace(/[^a-zA-Z0-9]/g, '_')
    link.setAttribute('download', `filenames_${cleanName}.txt`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleLivePreview = async () => {
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/preview-url`)
      if (!res.ok) throw new Error('Failed to generate preview link')
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank')
      } else {
        alert('Failed to generate preview link')
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate preview link')
    }
  }

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdatingSettings(true)
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowDownloads: editAllowDownloads,
          allowBulkDownloads: editAllowBulkDownloads,
          bulkDownloadPin: editBulkPin.trim() || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update settings')
      setGallery(data.event)
      triggerToast('Download permissions and settings updated ✓')
    } catch (err: any) {
      alert(err.message || 'Error updating settings')
    } finally {
      setUpdatingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="h-5 bg-neutral-200 animate-pulse rounded w-1/4" />
        <div className="h-40 bg-neutral-200 animate-pulse rounded-2xl" />
      </div>
    )
  }

  if (error || !gallery) {
    return (
      <div className="max-w-4xl p-6 mx-auto text-center space-y-4">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-400">
          {error || 'Gallery not found.'}
        </div>
        <Link href="/projects/galleries" className="inline-block text-xs font-semibold text-neutral-600 hover:text-black">
          ← Back to Galleries
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] p-6 space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-neutral-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-neutral-800 animate-fadeIn">
          {toastMessage}
        </div>
      )}

      {/* Breadcrumbs */}
      <div>
        <Link
          href="/projects/galleries"
          className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition flex items-center gap-1"
        >
          <span>←</span> Back to Galleries
        </Link>
      </div>

      {/* Header Profile Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--foreground)]">{gallery.title}</h1>
          <div className="text-xs text-neutral-500 mt-1 flex items-center gap-2">
            <span>📅 {gallery.date ? new Date(gallery.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set'}</span>
            <span>•</span>
            <span>Link: <code className="bg-neutral-50 text-[10px] text-neutral-800 px-1 py-0.5 rounded">/{gallery.slug}</code></span>
            {gallery.crmName && (
              <>
                <span>•</span>
                <span>CRM Project: <span className="font-semibold text-neutral-700">{gallery.crmName}</span></span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleLivePreview}
          className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm text-center shrink-0 cursor-pointer"
        >
          View Live Guest Preview ↗
        </button>
      </div>

      {/* Horizontal Tabs */}
      <div className="flex border-b border-neutral-200 gap-6">
        {[
          { id: 'general', label: 'General Settings' },
          { id: 'uploads', label: 'Uploads & Folders' },
          { id: 'participants', label: 'Participants' },
          { id: 'settings', label: 'View & Download' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 text-xs font-semibold tracking-wide transition-all border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? 'border-neutral-900 text-neutral-900 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="bg-[var(--surface)] p-5 md:p-6 rounded-2xl border border-[var(--border)] space-y-6">
        {/* --- GENERAL SETTINGS TAB --- */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <form onSubmit={handleUpdateGeneral} className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Metadata</h3>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Gallery Group Name</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Url Access Slug</label>
                  <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden pl-3.5 pr-2">
                    <span className="text-xs text-neutral-400 select-none">/</span>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      className="w-full px-1 py-2.5 bg-transparent border-none text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Event Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div>
                    <span className="block text-xs font-bold text-neutral-800">Publish Gallery</span>
                    <span className="text-[10px] text-neutral-500">Toggle whether this gallery is online and accessible.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={e => setEditActive(e.target.checked)}
                    className="h-5 w-5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updatingGeneral}
                  className="bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-sm"
                >
                  {updatingGeneral ? 'Saving Changes...' : 'Save Metadata Details'}
                </button>
              </div>

              {/* Cover photo uploads */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-neutral-100 pt-6 md:pt-0 md:pl-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Covers & Branding</h3>

                {/* Horizontal Cover */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Horizontal Cover (3:2)</label>
                  <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 h-32 relative flex items-center justify-center">
                    {gallery.coverPhotoUrl ? (
                      <img src={gallery.coverPhotoUrl} alt="Horizontal cover" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-neutral-400">No horizontal cover uploaded</span>
                    )}
                    <label className="absolute bottom-2 right-2 bg-black/75 hover:bg-black text-white text-[10px] font-semibold px-2 py-1 rounded-lg cursor-pointer transition">
                      {uploadingHorizontal ? 'Uploading...' : 'Choose Image'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingHorizontal}
                        onChange={e => e.target.files?.[0] && handleHorizontalCoverUpload(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Portrait Cover */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase">Portrait Cover (9:16)</label>
                  <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 h-32 relative flex items-center justify-center">
                    {gallery.coverPhotoMobileUrl ? (
                      <img src={gallery.coverPhotoMobileUrl} alt="Portrait cover" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-neutral-400">No portrait cover uploaded</span>
                    )}
                    <label className="absolute bottom-2 right-2 bg-black/75 hover:bg-black text-white text-[10px] font-semibold px-2 py-1 rounded-lg cursor-pointer transition">
                      {uploadingVertical ? 'Uploading...' : 'Choose Image'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingVertical}
                        onChange={e => e.target.files?.[0] && handleVerticalCoverUpload(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </form>

            {/* Admin Delete Action */}
            {userRole === 'admin' && (
              <div className="border-t border-rose-100 pt-6 mt-6">
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-xs font-bold text-rose-800">Danger Zone: Delete Gallery</span>
                    <span className="block text-[10px] text-rose-600 mt-0.5">
                      This action will delete all photos from the database/R2 storage, and delete all guest permissions.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    Delete Gallery
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- UPLOADS & FOLDERS TAB --- */}
        {activeTab === 'uploads' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Electron App Launcher */}
              <div className="bg-neutral-50 p-5 rounded-2xl border border-neutral-200 md:col-span-1 space-y-4">
                <div className="text-2xl">💻</div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">Upload Photos</h3>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Browser uploads are disabled to support large uploads. Please launch the **Misty Visuals Gallery Uploader** desktop application.
                </p>
                <a
                  href={`mistyuploader://event/${gallery.slug}`}
                  className="inline-block w-full text-center bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer shadow-sm"
                >
                  Open Uploader App 🚀
                </a>
                <span className="block text-[9px] text-neutral-400 text-center">
                  Will open the local application linked to this gallery event automatically.
                </span>
              </div>

              {/* Folder tab manager */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Folders (Tab Categories)</h3>

                {/* Add new tab */}
                <form onSubmit={handleAddFolder} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="New folder name (e.g. Haldi)"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                  />
                  <button
                    type="submit"
                    className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
                  >
                    Add Folder
                  </button>
                </form>

                {/* List of tabs */}
                <div className="border border-neutral-100 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-neutral-500 font-semibold">
                        <th className="p-3">Folder Name</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {gallery.tabs.map((tab, idx) => (
                        <tr key={tab} className="hover:bg-neutral-50/50">
                          <td className="p-3 font-medium">
                            {renamingFolderIndex === idx ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={renamingFolderName}
                                  onChange={e => setRenamingFolderName(e.target.value)}
                                  className="px-2 py-1 border border-neutral-300 rounded text-xs bg-white focus:outline-none"
                                />
                                <button
                                  onClick={() => handleRenameFolder(tab, idx)}
                                  className="text-[11px] bg-emerald-500 text-white px-2 py-0.5 rounded font-semibold"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setRenamingFolderIndex(null)}
                                  className="text-[11px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span>{tab}</span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-2">
                            {renamingFolderIndex !== idx && (
                              <>
                                <button
                                  onClick={() => {
                                    setRenamingFolderIndex(idx)
                                    setRenamingFolderName(tab)
                                  }}
                                  className="text-blue-500 hover:underline cursor-pointer"
                                >
                                  Rename
                                </button>
                                {tab !== 'Highlights' && (
                                  <button
                                    onClick={() => handleDeleteFolder(tab)}
                                    className="text-rose-500 hover:underline cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PARTICIPANTS TAB --- */}
        {activeTab === 'participants' && (
          <div className="space-y-6">
            {/* Header section with counts and actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">
                  Participants ({filteredGuests.length})
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Manage viewer access, blocking, and download liked/favorite photo assets.
                </p>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex items-center gap-4 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)]">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                />
                <span className="absolute left-3 top-2.5 text-neutral-400 text-xs">🔍</span>
              </div>
            </div>

            {/* List Guests */}
            <div className="border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--surface)] shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-center">Likes</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-white">
                  {filteredGuests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-neutral-400 italic">
                        No guests matched your criteria. Guests will appear when they login to the client gallery page.
                      </td>
                    </tr>
                  ) : (
                    filteredGuests.map(guest => {
                      const nameText = guest.name || 'Anonymous Guest'
                      const initials = nameText.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                      
                      // Hash initials to determine background color for avatar
                      const colors = [
                        'bg-blue-500/10 text-blue-600',
                        'bg-emerald-500/10 text-emerald-600',
                        'bg-violet-500/10 text-violet-600',
                        'bg-amber-500/10 text-amber-600',
                        'bg-rose-500/10 text-rose-600',
                        'bg-sky-500/10 text-sky-600'
                      ]
                      const colorIndex = (guest.id + (initials.charCodeAt(0) || 0)) % colors.length
                      const avatarClass = colors[colorIndex]

                      return (
                        <tr key={guest.id} className="hover:bg-[var(--surface-muted)]/50 transition duration-150">
                          {/* Name with avatar */}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarClass}`}>
                                {initials || 'G'}
                              </div>
                              <div>
                                <div className="font-semibold text-neutral-800">{nameText}</div>
                                {guest.isBlocked && (
                                  <span className="inline-block mt-0.5 text-[8px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 px-1 rounded">
                                    Blocked
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="p-4 text-neutral-600 font-medium">
                            {guest.email || '—'}
                          </td>

                          {/* Phone */}
                          <td className="p-4 text-neutral-500 font-mono">
                            {guest.phoneNumber || '—'}
                          </td>

                          {/* Role Pill */}
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                              guest.isBlocked
                                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                : guest.hasFullAccess
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-blue-50 text-blue-700 border border-blue-100'
                            } border`}>
                              {guest.isBlocked ? 'Blocked' : guest.hasFullAccess ? 'Viewer - Full' : 'Viewer - Partial'}
                            </span>
                          </td>

                          {/* Likes Count */}
                          <td className="p-4 text-center font-semibold text-neutral-700">
                            ❤️ {guest.likesCount ?? 0}
                          </td>

                          {/* Actions Dropdown */}
                          <td className="p-4 text-right relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveDropdown(activeDropdown === guest.id ? null : guest.id)
                              }}
                              className="p-1.5 hover:bg-neutral-100 rounded-lg transition text-neutral-500 hover:text-neutral-800 cursor-pointer inline-flex items-center"
                              title="Participant settings"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                              </svg>
                            </button>

                            {activeDropdown === guest.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-4 mt-1 w-52 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-scaleUp text-left"
                              >
                                <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Access Roles</div>
                                <button
                                  onClick={() => {
                                    handleToggleAccess(guest.id, guest.hasFullAccess)
                                    setActiveDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-1.5 text-xs flex items-center gap-2 hover:bg-neutral-50 transition cursor-pointer text-left ${
                                    guest.hasFullAccess ? 'text-neutral-700 font-semibold' : 'text-neutral-500'
                                  }`}
                                >
                                  Viewer - Full {guest.hasFullAccess && '✓'}
                                </button>
                                <button
                                  onClick={() => {
                                    handleToggleAccess(guest.id, guest.hasFullAccess)
                                    setActiveDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-1.5 text-xs flex items-center gap-2 hover:bg-neutral-50 transition cursor-pointer text-left ${
                                    !guest.hasFullAccess ? 'text-neutral-700 font-semibold' : 'text-neutral-500'
                                  }`}
                                >
                                  Viewer - Partial {!guest.hasFullAccess && '✓'}
                                </button>

                                <div className="border-t border-neutral-100 my-1"></div>
                                <div className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Download Likes</div>
                                <a
                                  href={`/api/gallery/events/${galleryId}/guests/${guest.id}/download-likes`}
                                  onClick={() => setActiveDropdown(null)}
                                  className="w-full px-3.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer font-sans font-semibold"
                                >
                                  📥 IMAGES
                                </a>
                                <button
                                  onClick={() => {
                                    handleExportCSV(nameText, guest.email, guest.likedPhotos || [])
                                    setActiveDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer text-left font-semibold"
                                >
                                  📋 CSV
                                </button>
                                <button
                                  onClick={() => {
                                    handleExportTXT(nameText, guest.email, guest.likedPhotos || [])
                                    setActiveDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer text-left font-semibold"
                                >
                                  📋 TXT
                                </button>

                                <div className="border-t border-neutral-100 my-1"></div>
                                <button
                                  onClick={() => {
                                    handleToggleBlock(guest.id, guest.isBlocked)
                                    setActiveDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-1.5 text-xs transition cursor-pointer text-left ${
                                    guest.isBlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'
                                  }`}
                                >
                                  🚫 {guest.isBlocked ? 'Unblock Participant' : 'Block Participant'}
                                </button>
                                <button
                                  onClick={() => {
                                    handleDeleteGuest(guest.id)
                                    setActiveDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left"
                                >
                                  🗑️ Remove Participant
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- VIEW & DOWNLOAD SETTINGS TAB --- */}
        {activeTab === 'settings' && (
          <form onSubmit={handleUpdateSettings} className="space-y-6 max-w-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Permissions & Security Settings</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-800">Allow Photo Downloads</span>
                  <span className="text-[10px] text-neutral-500">Enable/disable downloads and copy options for guests.</span>
                </div>
                <input
                  type="checkbox"
                  checked={editAllowDownloads}
                  onChange={e => setEditAllowDownloads(e.target.checked)}
                  className="h-5 w-5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div>
                  <span className="block text-xs font-bold text-neutral-800">Allow Download All</span>
                  <span className="text-[10px] text-neutral-500">Enable/disable zip downloads for the entire gallery.</span>
                </div>
                <input
                  type="checkbox"
                  checked={editAllowBulkDownloads}
                  onChange={e => setEditAllowBulkDownloads(e.target.checked)}
                  className="h-5 w-5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase">Download All security PIN</label>
                <div className="flex items-center gap-2 max-w-xs">
                  <input
                    type="text"
                    placeholder="e.g. 9394"
                    value={editBulkPin}
                    onChange={e => setEditBulkPin(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition font-mono tracking-widest text-center"
                  />
                  <button
                    type="button"
                    title="Generate random PIN"
                    onClick={() => {
                      const pin = String(Math.floor(100000 + Math.random() * 900000))
                      setEditBulkPin(pin)
                    }}
                    className="flex items-center gap-1 px-3 py-2.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-700 transition cursor-pointer whitespace-nowrap"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    </svg>
                    Generate
                  </button>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">Leave blank to allow download without a PIN.</p>
              </div>

              <button
                type="submit"
                disabled={updatingSettings}
                className="bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-sm"
              >
                {updatingSettings ? 'Saving Settings...' : 'Save Permissions Settings'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Admin Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <h2 className="text-base font-semibold text-rose-600">Delete Gallery</h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmText('')
                }}
                className="text-neutral-400 hover:text-neutral-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-neutral-600 leading-relaxed">
                ⚠️ <span className="font-bold">Warning:</span> Deleting this gallery is permanent. This will delete:
              </p>
              <ul className="list-disc pl-5 text-xs text-neutral-500 space-y-1">
                <li>All uploaded photo assets from the database and Cloudflare R2 bucket.</li>
                <li>All guest selfie files and scanned face cluster indices.</li>
                <li>All guest login credentials and liked photo records for this specific event.</li>
              </ul>
              <p className="text-xs text-rose-500 font-medium">
                To confirm deletion, please type the word <span className="font-bold select-none">"DELETE"</span> in the box below:
              </p>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-rose-200 focus:border-rose-400 rounded-xl text-xs focus:outline-none transition uppercase tracking-widest text-center"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmText('')
                }}
                className="flex-1 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                onClick={handleDeleteGallery}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
