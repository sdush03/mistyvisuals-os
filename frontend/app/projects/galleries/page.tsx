'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { getAuth } from '@/lib/authClient'

type GalleryListItem = {
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
  projectUuid: string | null
  crmSlug: string | null
  crmName: string | null
  passcode: string | null
  partial_passcode: string | null
}

type ProjectItem = {
  id: string
  name: string
  slug: string | null
  lead_id: number
}

export default function GalleriesDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [galleries, setGalleries] = useState<GalleryListItem[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [mounted, setMounted] = useState(false)

  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createSlug, setCreateSlug] = useState('')
  const [createDate, setCreateDate] = useState('')
  const [createProjectId, setCreateProjectId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Deletion modal/flow state
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Sharing states
  const [sharingGallery, setSharingGallery] = useState<GalleryListItem | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [portalDomain, setPortalDomain] = useState('https://mycircle.mistyvisuals.com')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('192.168.') ||
        origin.includes('0.0.0.0')
      ) {
        setPortalDomain(origin)
      } else {
        setPortalDomain('https://mycircle.mistyvisuals.com')
      }
    }
  }, [])

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  useEffect(() => {
    setMounted(true)
    getAuth().then(data => {
      if (!data?.authenticated) {
        window.location.href = '/login'
        return
      }
      setUserRole(data.user?.role || '')
      loadData()
    })
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [galleriesRes, projectsRes] = await Promise.all([
        fetch('/api/gallery/events', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/projects', { credentials: 'include' }).then(r => r.json())
      ])
      setGalleries(galleriesRes?.events || [])
      setProjects(projectsRes?.data || [])
      setLoading(false)
    } catch (err) {
      setError('Unable to load dashboard data.')
      setLoading(false)
    }
  }

  // Auto-generate slug from title
  const handleTitleChange = (val: string) => {
    setCreateTitle(val)
    const slugified = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // remove special chars
      .replace(/\s+/g, '-')         // replace spaces with hyphens
      .replace(/-+/g, '-')          // replace multiple hyphens
    setCreateSlug(slugified)
  }

  const handleCreateGallery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createTitle || !createSlug || !createDate) {
      setCreateError('Please fill in all required fields.')
      return
    }

    setCreating(true)
    setCreateError('')

    const selectedProj = projects.find(p => p.id === createProjectId)

    try {
      const res = await fetch('/api/gallery/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle,
          slug: createSlug,
          date: createDate,
          projectId: createProjectId || null,
          leadId: selectedProj ? selectedProj.lead_id : null
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create gallery')
      }

      // Refresh data and close modal
      await loadData()
      setShowCreateModal(false)
      setCreateTitle('')
      setCreateSlug('')
      setCreateDate('')
      setCreateProjectId('')
    } catch (err: any) {
      setCreateError(err.message || 'Error occurred during creation.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteGallery = async () => {
    if (!deletingId) return
    setDeleting(true)

    try {
      const res = await fetch(`/api/gallery/events/${deletingId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete gallery')
      }

      await loadData()
      setDeletingId(null)
      setDeleteConfirmText('')
    } catch (err: any) {
      alert(err.message || 'Error deleting gallery')
    } finally {
      setDeleting(false)
    }
  }

  const filteredGalleries = useMemo(() => {
    return galleries.filter(g => {
      const matchesSearch =
        g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.crmName && g.crmName.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesStatus =
        filterActive === 'all' ||
        (filterActive === 'published' && g.active) ||
        (filterActive === 'unpublished' && !g.active)

      return matchesSearch && matchesStatus
    })
  }, [galleries, searchQuery, filterActive])

  if (error) {
    return (
      <div className="max-w-6xl p-6">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-400 text-center">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-[1400px] p-6 space-y-6 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--foreground)]">Galleries</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage wedding photo galleries, folders, guests, and download settings.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
        >
          Create New Gallery
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)]">
        <div className="flex flex-wrap gap-2">
          {['all', 'published', 'unpublished'].map(s => (
            <button
              key={s}
              onClick={() => setFilterActive(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filterActive === s
                  ? 'bg-[var(--surface-strong)] text-[var(--foreground)] border-[var(--border-strong)]'
                  : 'bg-transparent text-neutral-500 border-transparent hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 md:max-w-sm">
          <input
            type="text"
            placeholder="Search by title, slug, or project..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
          />
          <span className="absolute left-3 top-2.5 text-neutral-400 text-xs">🔍</span>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 animate-pulse space-y-4">
              <div className="h-40 bg-[var(--surface-strong)] rounded-xl" />
              <div className="h-5 bg-[var(--surface-strong)] rounded w-3/4" />
              <div className="h-3 bg-[var(--surface-strong)] rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredGalleries.length === 0 && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-12 text-center">
          <div className="text-4xl mb-3">📸</div>
          <div className="text-base font-medium text-[var(--foreground)] mb-1">No galleries found</div>
          <p className="text-sm text-neutral-500">
            Create a new gallery to get started. You can link it to a project or let it be independent.
          </p>
        </div>
      )}

      {/* Galleries Cards Grid */}
      {!loading && filteredGalleries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGalleries.map((gallery, idx) => (
            <div
              key={gallery.id}
              className="group bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-sm hover:shadow-md hover:border-[var(--border-strong)] transition-all flex flex-col"
            >
              {/* Cover Photo */}
              <div className="relative h-40 bg-neutral-100 flex items-center justify-center overflow-hidden border-b border-[var(--border)]">
                {gallery.coverPhotoUrl ? (
                  <img
                    src={gallery.coverPhotoUrl}
                    alt={gallery.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="text-neutral-400 text-3xl font-sans tracking-widest uppercase">MISTY</div>
                )}
                {/* Active Indicator Tag */}
                <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shadow-sm border ${
                  gallery.active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {gallery.active ? 'Published' : 'Offline'}
                </span>

                {/* View Live Link */}
                <a
                  href={`https://mycircle.mistyvisuals.com/${gallery.slug}/gallery`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 bg-black/75 hover:bg-black text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg backdrop-blur-sm transition"
                >
                  Live Preview ↗
                </a>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--foreground)] line-clamp-1 mb-1">
                    {gallery.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-sans">
                    📅 {gallery.date ? new Date(gallery.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set'}
                  </p>

                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex items-center text-neutral-500">
                      <span className="font-semibold text-neutral-600 mr-1.5">Slug:</span>
                      <code className="bg-neutral-50 px-1.5 py-0.5 rounded text-[10px] text-neutral-800 select-all">/{gallery.slug}</code>
                    </div>

                    <div className="flex items-center text-neutral-500">
                      <span className="font-semibold text-neutral-600 mr-1.5">Project:</span>
                      {gallery.crmName ? (
                        <Link
                          href={`/projects/${gallery.crmSlug || gallery.projectId}`}
                          className="text-blue-500 hover:underline truncate max-w-[180px]"
                        >
                          {gallery.crmName}
                        </Link>
                      ) : (
                        <span className="text-neutral-400 italic">Standalone Gallery</span>
                      )}
                    </div>

                    {gallery.tabs && gallery.tabs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {gallery.tabs.slice(0, 3).map(tab => (
                          <span key={tab} className="bg-neutral-100 text-neutral-600 text-[10px] px-1.5 py-0.5 rounded">
                            {tab}
                          </span>
                        ))}
                        {gallery.tabs.length > 3 && (
                          <span className="text-[9px] text-neutral-400 self-center">+{gallery.tabs.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Link
                    href={`/projects/galleries/${gallery.id}`}
                    className="flex-1 text-center bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-semibold py-2 rounded-xl text-xs transition"
                  >
                    Manage Gallery
                  </Link>
                  <button
                    onClick={() => setSharingGallery(gallery)}
                    className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
                    title="Share Gallery Invite"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h2 className="text-base font-semibold text-neutral-900">Create New Gallery</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setCreateError('')
                }}
                className="text-neutral-400 hover:text-neutral-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGallery} className="space-y-4">
              {createError && (
                <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                  {createError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Gallery Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Drishti Vaibhav Sangeet"
                  value={createTitle}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Access Slug *</label>
                <div className="flex items-center bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden pl-3.5 pr-2">
                  <span className="text-[11px] text-neutral-400 select-none">/</span>
                  <input
                    type="text"
                    required
                    value={createSlug}
                    onChange={e => setCreateSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    className="w-full px-1 py-2.5 bg-transparent border-none text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Event Date *</label>
                <input
                  type="date"
                  required
                  value={createDate}
                  onChange={e => setCreateDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Link to CRM Project (Optional)</label>
                <select
                  value={createProjectId}
                  onChange={e => setCreateProjectId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400 transition text-neutral-600 outline-none"
                >
                  <option value="">-- Standalone Gallery (No project link) --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setCreateError('')
                  }}
                  className="flex-1 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Gallery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deletion Modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <h2 className="text-base font-semibold text-rose-600">Delete Gallery</h2>
              <button
                onClick={() => {
                  setDeletingId(null)
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
                  setDeletingId(null)
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
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs bg-[#00a86b] text-white text-xs font-sans font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center justify-between animate-waterfall">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 w-4 h-4 rounded-full flex items-center justify-center text-[10px]">✓</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage('')} className="text-white/60 hover:text-white transition font-bold text-xs select-none pl-2">✕</button>
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
                      if (sharingGallery.partial_passcode) {
                        navigator.clipboard.writeText(sharingGallery.partial_passcode);
                        setToastMessage('Code Copied!');
                      } else {
                        setToastMessage('No code configured');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  >
                    📋 {sharingGallery.partial_passcode || '—'}
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
                      const galleryDomain = portalDomain.includes('localhost') || portalDomain.includes('127.0.0.1')
                        ? portalDomain
                        : 'https://mycircle.mistyvisuals.com';
                      const link = `${galleryDomain}/${sharingGallery.slug}/gallery${sharingGallery.partial_passcode ? `?code=${sharingGallery.partial_passcode}` : ''}`;
                      const text = `Misty Visuals is inviting you to join the gallery portal for ${sharingGallery.crmName || sharingGallery.title}.\nGet your own photos instantly using Face Recognition!\n\nJoin via Link:\n${link}`;
                      navigator.clipboard.writeText(text);
                      setToastMessage('Invite Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite Link
                  </button>
                  <button 
                    onClick={() => {
                      const galleryDomain = portalDomain.includes('localhost') || portalDomain.includes('127.0.0.1')
                        ? portalDomain
                        : 'https://mycircle.mistyvisuals.com';
                      const link = `${galleryDomain}/${sharingGallery.slug}/gallery${sharingGallery.partial_passcode ? `?code=${sharingGallery.partial_passcode}` : ''}`;
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
                        setToastMessage('Passcode Copied!');
                      } else {
                        setToastMessage('No passcode configured');
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
                      const galleryDomain = portalDomain.includes('localhost') || portalDomain.includes('127.0.0.1')
                        ? portalDomain
                        : 'https://mycircle.mistyvisuals.com';
                      const link = `${galleryDomain}/${sharingGallery.slug}/gallery${sharingGallery.passcode ? `?code=${sharingGallery.passcode}` : ''}`;
                      const text = `Misty Visuals is inviting you to join the gallery portal for ${sharingGallery.crmName || sharingGallery.title}.\nAccess all photos and event categories.\n\nJoin via Link:\n${link}\n\nPasscode: ${sharingGallery.passcode || 'N/A'}`;
                      navigator.clipboard.writeText(text);
                      setToastMessage('Invite Copied to Clipboard');
                    }}
                    className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    📋 Invite Link
                  </button>
                  <button 
                    onClick={() => {
                      const galleryDomain = portalDomain.includes('localhost') || portalDomain.includes('127.0.0.1')
                        ? portalDomain
                        : 'https://mycircle.mistyvisuals.com';
                      const link = `${galleryDomain}/${sharingGallery.slug}/gallery${sharingGallery.passcode ? `?code=${sharingGallery.passcode}` : ''}`;
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
