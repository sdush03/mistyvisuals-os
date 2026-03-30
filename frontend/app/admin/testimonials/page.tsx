'use client'

import { useEffect, useState } from 'react'
import PhotoPickerModal from '@/components/PhotoPickerModal'

type Testimonial = {
  id: number
  couple_names: string
  testimonial_text: string
  media_url: string
  media_type: 'photo' | 'video'
  created_at: string
}

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', ...init })

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coupleNames, setCoupleNames] = useState('')
  const [testimonialText, setTestimonialText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo')
  const [isPickingMedia, setIsPickingMedia] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    loadTestimonials()
  }, [])

  const loadTestimonials = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/testimonials')
      if (!res.ok) throw new Error('Failed to load testimonials')
      const data = await res.json()
      setTestimonials(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this testimonial?')) return
    try {
      const res = await apiFetch(`/api/testimonials/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.status === 409) {
        // Referenced in a proposal — can't delete
        alert(data?.error || 'This testimonial is used in a sent proposal and cannot be deleted.')
        return
      }
      if (!res.ok) throw new Error(data?.error || 'Failed to delete')
      setTestimonials((prev) => prev.filter((t) => t.id !== id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const isEdit = editingId !== null
      const url = isEdit ? `/api/testimonials/${editingId}` : '/api/testimonials'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couple_names: coupleNames, testimonial_text: testimonialText, media_url: mediaUrl, media_type: mediaType }),
      })
      if (!res.ok) throw new Error('Failed to save testimonial')
      const data = await res.json()
      
      if (isEdit) {
        setTestimonials(prev => prev.map(t => t.id === editingId ? data : t))
      } else {
        setTestimonials([data, ...testimonials])
      }

      setIsModalOpen(false)
      setEditingId(null)
      setCoupleNames('')
      setTestimonialText('')
      setMediaUrl('')
      setMediaType('photo')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500 mb-1">
            ADMIN
          </div>
          <h1 className="text-2xl font-semibold text-neutral-900">Client Testimonials</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Manage reviews and client quotes to auto-inject into Quote Proposals.
          </p>
        </div>
        <button
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          onClick={() => {
            setEditingId(null)
            setCoupleNames('')
            setTestimonialText('')
            setMediaUrl('')
            setMediaType('photo')
            setIsModalOpen(true)
          }}
        >
          Add Testimonial
        </button>
      </div>

      {error && <div className="text-rose-600 text-sm font-medium mb-4">{error}</div>}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading && <div className="text-sm text-neutral-500">Loading...</div>}
        {!loading && testimonials.length === 0 && (
          <div className="text-sm text-neutral-500 italic content-center">No testimonials added yet.</div>
        )}
        
        {testimonials.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col group relative">
             <div className="h-48 w-full bg-neutral-100 flex-shrink-0 relative overflow-hidden border-b border-neutral-200 object-cover">
               {t.media_type === 'video' ? (
                 <video src={t.media_url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
               ) : (
                 <img src={t.media_url || 'https://via.placeholder.com/400x300?text=No+Photo'} alt={t.couple_names} className="w-full h-full object-cover" />
               )}
             </div>
             <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-neutral-900 mb-1 text-lg">{t.couple_names}</h3>
                {t.testimonial_text ? (
                  <p className="text-sm text-neutral-600 italic line-clamp-4 flex-1 mb-4 text-neutral-500">"{t.testimonial_text}"</p>
                ) : (
                  <div className="flex-1 min-h-[4rem] flex items-center justify-center text-[10px] text-neutral-300 uppercase tracking-widest italic">Video-only Testimonial</div>
                )}
                
                <div className="flex justify-between items-center mt-auto border-t border-neutral-100 pt-3">
                  <button onClick={() => {
                    setEditingId(t.id)
                    setCoupleNames(t.couple_names)
                    setTestimonialText(t.testimonial_text)
                    setMediaUrl(t.media_url)
                    setMediaType(t.media_type)
                    setIsModalOpen(true)
                  }} className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 uppercase tracking-widest text-[10px]">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800 uppercase tracking-widest text-[10px]">
                    Delete
                  </button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-neutral-100">
              <h2 className="text-xl font-bold tracking-tight text-neutral-900">{editingId ? 'Edit Testimonial' : 'Add Testimonial'}</h2>
              <p className="text-sm text-neutral-500 mt-1">
                {editingId ? 'Updating existing client love story.' : 'These will appear randomly on the ending slide of quotes.'}
              </p>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Couple Names</label>
                <input required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm" value={coupleNames} onChange={e => setCoupleNames(e.target.value)} placeholder="e.g. Priya & Rahul" />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Client Quote {mediaType === 'video' ? '(Optional)' : '(Required)'}
                </label>
                <textarea 
                  required={mediaType !== 'video'} 
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm min-h-[100px]" 
                  value={testimonialText} 
                  onChange={e => setTestimonialText(e.target.value)} 
                  placeholder={mediaType === 'video' ? 'Optional description/quote...' : 'Type what the client said...'} 
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Media URL (From Library)</label>
                  <div className="flex gap-2">
                    <input required className="w-full p-2.5 border border-neutral-300 rounded-lg text-sm" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="/api/photos/file/..." />
                    <button type="button" onClick={() => setIsPickingMedia(true)} className="whitespace-nowrap px-4 py-2 bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition flex items-center gap-2">
                      <span>✨</span> Browse Library
                    </button>
                  </div>
                </div>
                <div className="flex-none w-32">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Media Type</label>
                  <select className="w-full p-2.5 border border-neutral-300 bg-white rounded-lg text-sm" value={mediaType} onChange={e => setMediaType(e.target.value as 'photo'|'video')}>
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-neutral-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition text-sm">
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Testimonial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isPickingMedia && (
        <PhotoPickerModal
          onClose={() => setIsPickingMedia(false)}
          onSelect={(photoPayload: any) => {
            const url = typeof photoPayload === 'string' ? photoPayload : photoPayload.url
            setMediaUrl(url)
            
            // Auto-detect type
            if (url.includes('.mp4') || url.includes('.webm') || url.includes('/api/videos/file')) {
              setMediaType('video')
            } else {
              setMediaType('photo')
            }
            
            setIsPickingMedia(false)
          }}
        />
      )}
    </div>
  )
}
