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
  hasSelfie?: boolean
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
  passcode?: string | null
  partialPasscode?: string | null
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
  const [activeTab, setActiveTab] = useState<'general' | 'uploads' | 'participants' | 'settings' | 'analytics'>('general')

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

  // Analytics tab states
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsSearch, setAnalyticsSearch] = useState('')

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true)
    try {
      const res = await fetch(`/api/gallery/events/${galleryId}/analytics`)
      const data = await res.json()
      if (res.ok) {
        setAnalyticsData(data)
      } else {
        console.error('Failed to load analytics:', data.error)
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics()
    }
  }, [activeTab])

  // Admin deletion states
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)
  const [activeRoleDropdown, setActiveRoleDropdown] = useState<number | null>(null)
  const [sharingGallery, setSharingGallery] = useState<GalleryDetails | null>(null)

  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDropdown(null)
      setActiveRoleDropdown(null)
    }
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
    const content = likedPhotos.map(p => p.filename).join('\n')
    
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSharingGallery(gallery)}
            className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm text-center cursor-pointer flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share / Invite
          </button>
          <button
            onClick={handleLivePreview}
            className="bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm text-center cursor-pointer"
          >
            View Live Guest Preview ↗
          </button>
        </div>
      </div>

      {/* Horizontal Tabs */}
      <div className="flex border-b border-neutral-200 gap-6">
        {[
          { id: 'general', label: 'General Settings' },
          { id: 'uploads', label: 'Uploads & Folders' },
          { id: 'participants', label: 'Participants' },
          { id: 'settings', label: 'View & Download' },
          { id: 'analytics', label: 'Analytics' }
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
                <button
                  onClick={() => {
                    triggerToast('Launching Desktop Uploader... 🚀')
                    window.location.href = `mistyuploader://event/${gallery.slug}`
                  }}
                  className="inline-block w-full text-center bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer shadow-sm"
                >
                  Open Uploader App 🚀
                </button>
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
                                {tab !== 'Highlights' ? (
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
                                    <button
                                      onClick={() => handleDeleteFolder(tab)}
                                      className="text-rose-500 hover:underline cursor-pointer"
                                    >
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-neutral-400 italic text-[10px] select-none">System folder</span>
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
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden font-bold text-xs ${avatarClass}`}>
                                {guest.hasSelfie ? (
                                  <img
                                    src={`/api/gallery/family/selfie/${guest.id}`}
                                    alt={nameText}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  initials || 'G'
                                )}
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

                          {/* Role Pill Dropdown */}
                          <td className="p-4 relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveRoleDropdown(activeRoleDropdown === guest.id ? null : guest.id)
                                setActiveDropdown(null)
                              }}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition border cursor-pointer select-none flex items-center gap-1 ${
                                guest.isBlocked
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100/50'
                                  : guest.hasFullAccess
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100/50'
                                  : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100/50'
                              }`}
                            >
                              <span>
                                {guest.isBlocked ? 'Blocked' : guest.hasFullAccess ? 'Viewer - Full' : 'Viewer - Partial'}
                              </span>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 mt-0.5">
                                <path d="m6 9 6 6 6-6"/>
                              </svg>
                            </button>

                            {activeRoleDropdown === guest.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-4 mt-1 w-48 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-scaleUp text-left"
                              >
                                <div className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Change Role</div>
                                <button
                                  onClick={() => {
                                    if (!guest.hasFullAccess) {
                                      handleToggleAccess(guest.id, guest.hasFullAccess)
                                    }
                                    setActiveRoleDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-2 text-xs flex items-center justify-between hover:bg-neutral-50 transition cursor-pointer text-left ${
                                    guest.hasFullAccess && !guest.isBlocked ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                                  }`}
                                >
                                  <span>Viewer - Full</span>
                                  {guest.hasFullAccess && !guest.isBlocked && <span className="text-emerald-500 text-[10px]">✓</span>}
                                </button>
                                <button
                                  onClick={() => {
                                    if (guest.hasFullAccess) {
                                      handleToggleAccess(guest.id, guest.hasFullAccess)
                                    }
                                    setActiveRoleDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-2 text-xs flex items-center justify-between hover:bg-neutral-50 transition cursor-pointer text-left ${
                                    !guest.hasFullAccess && !guest.isBlocked ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                                  }`}
                                >
                                  <span>Viewer - Partial</span>
                                  {!guest.hasFullAccess && !guest.isBlocked && <span className="text-blue-500 text-[10px]">✓</span>}
                                </button>

                                <div className="border-t border-neutral-100 my-1"></div>
                                <div className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Account Status</div>
                                <button
                                  onClick={() => {
                                    handleToggleBlock(guest.id, guest.isBlocked)
                                    setActiveRoleDropdown(null)
                                  }}
                                  className={`w-full px-3.5 py-2 text-xs transition cursor-pointer text-left flex items-center justify-between ${
                                    guest.isBlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'
                                  }`}
                                >
                                  <span>{guest.isBlocked ? 'Unblock' : 'Block Participant'}</span>
                                  {guest.isBlocked && <span className="text-rose-500 text-[10px]">🚫</span>}
                                </button>
                                <button
                                  onClick={() => {
                                    handleDeleteGuest(guest.id)
                                    setActiveRoleDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left"
                                >
                                  Remove Participant
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Likes Count */}
                          <td className="p-4 text-center font-semibold text-neutral-700">
                            ❤️ {guest.likesCount ?? 0}
                          </td>

                          {/* Downloads Actions Dropdown */}
                          <td className="p-4 text-right relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveDropdown(activeDropdown === guest.id ? null : guest.id)
                                setActiveRoleDropdown(null)
                              }}
                              className="p-1.5 hover:bg-neutral-100 rounded-lg transition text-neutral-500 hover:text-neutral-800 cursor-pointer inline-flex items-center"
                              title="Download options"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                              </svg>
                            </button>

                            {activeDropdown === guest.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-4 mt-1 w-48 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-scaleUp text-left"
                              >
                                <div className="px-3.5 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Download Likes</div>
                                <a
                                  href={`/api/gallery/events/${galleryId}/guests/${guest.id}/download-likes`}
                                  onClick={() => setActiveDropdown(null)}
                                  className="w-full px-3.5 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer font-sans font-semibold"
                                >
                                  📥 IMAGES
                                </a>
                                <button
                                  onClick={() => {
                                    handleExportCSV(nameText, guest.email, guest.likedPhotos || [])
                                    setActiveDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer text-left font-semibold"
                                >
                                  📋 CSV
                                </button>
                                <button
                                  onClick={() => {
                                    handleExportTXT(nameText, guest.email, guest.likedPhotos || [])
                                    setActiveDropdown(null)
                                  }}
                                  className="w-full px-3.5 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition flex items-center gap-2 cursor-pointer text-left font-semibold"
                                >
                                  📋 TXT
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

        {/* --- ANALYTICS TAB --- */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Header / Export */}
            <div className="flex justify-between items-center pb-4 border-b border-neutral-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Gallery Performance & Analytics</h3>
              <button
                onClick={() => {
                  if (!analyticsData || !analyticsData.guests) return;
                  const headers = ['Name', 'Email', 'Phone Number', 'Impressions', 'Results (Matches)', 'Photos Downloaded'];
                  const rows = analyticsData.guests.map((g: any) => [
                    g.name || 'Anonymous',
                    g.email,
                    g.phoneNumber || '',
                    g.impressions || 0,
                    g.matchCount || 0,
                    g.downloadCount || 0
                  ]);
                  const csvContent = [
                    headers.join(','),
                    ...rows.map((r: any[]) => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
                  ].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `${(gallery?.title || 'gallery').replace(/\s+/g, '_')}_analytics.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>

            {analyticsLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin mb-3"></div>
                <p className="text-xs text-neutral-500 font-medium">Loading analytics data...</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Impressions */}
                  <div className="bg-white border border-neutral-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-2xl font-bold text-neutral-900 mb-1">
                      {analyticsData?.summary?.totalImpressions || 0}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Total Impressions
                    </div>
                  </div>

                  {/* Discovered */}
                  <div className="bg-white border border-neutral-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-2xl font-bold text-neutral-900 mb-1">
                      {analyticsData?.summary?.photosDiscovered || '0/0'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                      Photos Discovered
                    </div>
                  </div>

                  {/* Downloads */}
                  <div className="bg-white border border-neutral-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-2xl font-bold text-neutral-900 mb-1">
                      {analyticsData?.summary?.photosDownloaded || 0}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Photos Downloaded
                    </div>
                  </div>

                  {/* Registered */}
                  <div className="bg-white border border-neutral-200 p-5 rounded-2xl shadow-xs">
                    <div className="text-2xl font-bold text-neutral-900 mb-1">
                      {analyticsData?.summary?.registeredUsers || 0}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Registered Users
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-neutral-200">
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type="text"
                      placeholder="Search participants by name, email, phone..."
                      value={analyticsSearch}
                      onChange={e => setAnalyticsSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                    />
                    <span className="absolute left-3 top-2.5 text-neutral-400 text-xs">🔍</span>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Participant</th>
                        <th className="p-4">Impressions</th>
                        <th className="p-4">Results</th>
                        <th className="p-4">Photos Downloaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {analyticsData?.guests && analyticsData.guests
                        .filter((g: any) => {
                          const query = analyticsSearch.toLowerCase().trim()
                          return !query ||
                            (g.name || '').toLowerCase().includes(query) ||
                            (g.email || '').toLowerCase().includes(query) ||
                            (g.phoneNumber || '').toLowerCase().includes(query)
                        })
                        .map((g: any) => (
                          <tr key={g.id} className="hover:bg-neutral-50/50 transition duration-150">
                            <td className="p-4">
                              <div className="font-semibold text-neutral-800 text-sm mb-0.5">{g.name || 'Anonymous Guest'}</div>
                              <div className="text-[10px] text-neutral-500 flex gap-2">
                                <span>{g.email}</span>
                                {g.phoneNumber && (
                                  <>
                                    <span>|</span>
                                    <span>{g.phoneNumber}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-neutral-600 font-medium text-sm">{g.impressions || 0}</td>
                            <td className="p-4 text-neutral-600 font-medium text-sm">{g.matchCount > 0 ? g.matchCount : '-'}</td>
                            <td className="p-4 text-neutral-600 font-medium text-sm">{g.downloadCount > 0 ? g.downloadCount : '-'}</td>
                          </tr>
                        ))
                      }
                      {(!analyticsData?.guests || analyticsData.guests.length === 0) && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-neutral-400 italic">
                            No participant data recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
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
                onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
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
                disabled={deleting || deleteConfirmText.trim() !== 'DELETE'}
                onClick={handleDeleteGallery}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Share Group Invite Modal */}
      {sharingGallery && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-neutral-100 shadow-2xl relative text-left">
            {/* Close button */}
            <button 
              onClick={() => setSharingGallery(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition cursor-pointer text-base"
            >
              ✕
            </button>

            <h3 className="font-sans text-lg font-bold text-center mb-6 text-[#111111] tracking-tight">Share Group Invite</h3>

            <div className="space-y-4">
              {/* Card 1: Partial Access */}
              <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-sans font-bold text-xs text-[#111111]">Partial Access</h4>
                  <button 
                    onClick={() => {
                      if (sharingGallery.partialPasscode) {
                        navigator.clipboard.writeText(sharingGallery.partialPasscode);
                        triggerToast('Code Copied!');
                      } else {
                        triggerToast('No code configured');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  >
                    📋 {sharingGallery.partialPasscode || '—'}
                  </button>
                </div>
                
                <ul className="space-y-1.5 mb-4 text-[10px] text-neutral-600 font-sans">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> Face recognition - View OWN photos
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View highlights folder
                  </li>
                  <li className="flex items-center gap-1.5 text-rose-500">
                    <span>✕</span> Can't View all photos and folders
                  </li>
                </ul>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = `https://mycircle.mistyvisuals.com/${sharingGallery.slug}/gallery${sharingGallery.partialPasscode ? `?code=${sharingGallery.partialPasscode}` : ''}`;
                      const text = `Misty Visuals is inviting you to join the gallery for ${sharingGallery.crmName || sharingGallery.title}.\nGet your own photos instantly using Face Recognition!\n\nJoin via Link:\n${link}\n\nAccess Code: ${sharingGallery.partialPasscode || 'N/A'}`;
                      navigator.clipboard.writeText(text);
                      triggerToast('Invite Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite Link
                  </button>
                  <button 
                    onClick={() => {
                      const link = `https://mycircle.mistyvisuals.com/${sharingGallery.slug}/gallery${sharingGallery.partialPasscode ? `?code=${sharingGallery.partialPasscode}` : ''}`;
                      window.open(`https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(link)}`, '_blank');
                    }}
                    className="flex-1 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    Print QR
                  </button>
                </div>
              </div>

              {/* Card 2: Full Access */}
              <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-sans font-bold text-xs text-[#111111]">Full Access</h4>
                  <button 
                    onClick={() => {
                      if (sharingGallery.passcode) {
                        navigator.clipboard.writeText(sharingGallery.passcode);
                        triggerToast('Passcode Copied!');
                      } else {
                        triggerToast('No passcode configured');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  >
                    📋 {sharingGallery.passcode || '—'}
                  </button>
                </div>
                
                <ul className="space-y-1.5 mb-4 text-[10px] text-neutral-600 font-sans">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> Face recognition - View OWN photos
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View highlights folder
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View all photos and folders
                  </li>
                </ul>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = `https://mycircle.mistyvisuals.com/${sharingGallery.slug}/gallery${sharingGallery.passcode ? `?code=${sharingGallery.passcode}` : ''}`;
                      const text = `Misty Visuals is inviting you to join the gallery for ${sharingGallery.crmName || sharingGallery.title}.\nAccess all the photos and events.\n\nJoin via Link:\n${link}\n\nPasscode: ${sharingGallery.passcode || 'N/A'}`;
                      navigator.clipboard.writeText(text);
                      triggerToast('Invite Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite Link
                  </button>
                  <button 
                    onClick={() => {
                      const link = `https://mycircle.mistyvisuals.com/${sharingGallery.slug}/gallery${sharingGallery.passcode ? `?code=${sharingGallery.passcode}` : ''}`;
                      window.open(`https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(link)}`, '_blank');
                    }}
                    className="flex-1 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    Print QR
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
