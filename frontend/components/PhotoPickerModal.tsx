'use client'
import { useState, useEffect } from 'react'

export default function PhotoPickerModal({ onClose, onSelect, onMultiSelect, multiSelect = false }: { onClose: () => void, onSelect: (photo: any) => void, onMultiSelect?: (photos: any[]) => void, multiSelect?: boolean }) {
  const [photos, setPhotos] = useState<any[]>([])
  const [videos, setVideos] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'photos' | 'videos'>('photos')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const apiFetch = (input: RequestInfo, init: RequestInit = {}) => fetch(input, { credentials: 'include', ...init })

  useEffect(() => {
    Promise.all([
       apiFetch('/api/photos').then(res => res.json()),
       apiFetch('/api/videos').then(res => res.json())
    ])
      .then(([pData, vData]) => {
         setPhotos(Array.isArray(pData) ? pData : [])
         setVideos(Array.isArray(vData) ? vData : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const currentMedia = activeTab === 'photos' ? photos : videos

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleConfirm = () => {
    const selectedPhotos = Array.from(selected)
      .sort((a, b) => a - b)
      .map(idx => currentMedia[idx])
      .filter(Boolean)
    if (onMultiSelect) onMultiSelect(selectedPhotos)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-neutral-100 flex justify-between items-center bg-white z-10">
          <div>
             <h3 className="font-bold text-xl text-neutral-900 tracking-tight">Select Media</h3>
             <div className="flex gap-6 mt-3">
                <button 
                  onClick={() => { setActiveTab('photos'); setSelected(new Set()) }} 
                  className={`text-sm font-bold pb-2 uppercase tracking-wider transition-colors ${activeTab === 'photos' ? 'border-b-2 border-emerald-500 text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                >
                  Photos
                </button>
                <button 
                  onClick={() => { setActiveTab('videos'); setSelected(new Set()) }} 
                  className={`text-sm font-bold pb-2 uppercase tracking-wider transition-colors ${activeTab === 'videos' ? 'border-b-2 border-emerald-500 text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                >
                  Videos
                </button>
             </div>
          </div>
          <div className="flex items-center gap-3">
            {multiSelect && selected.size > 0 && (
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold uppercase tracking-wider rounded-full transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Add {selected.size} Photo{selected.size !== 1 ? 's' : ''}
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 flex items-center justify-center transition focus:outline-none shrink-0 border border-neutral-200 shadow-sm">
               ✕
            </button>
          </div>
        </div>

        {/* Gallery grid */}
        <div className="p-8 overflow-y-auto flex-1 bg-neutral-50">
          {loading ? (
             <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-800 rounded-full animate-spin mb-4" />
                <span className="text-sm font-semibold tracking-wider uppercase">Loading Gallery...</span>
             </div>
          ) : currentMedia.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                <span className="text-4xl mb-3">{activeTab === 'photos' ? '🖼️' : '🎬'}</span>
                <span className="text-sm font-semibold tracking-wider uppercase">No {activeTab} Found</span>
                <span className="text-xs mt-1">Upload exactly what you need from the Admin Dashboard first.</span>
             </div>
          ) : (
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {currentMedia.map((m, idx) => {
                   const isSelected = multiSelect && selected.has(idx)
                   return (
                   <div 
                      key={idx} 
                      onClick={() => {
                        if (multiSelect) {
                          toggleSelect(idx)
                        } else {
                          onSelect(m)
                        }
                      }} 
                      className={`cursor-pointer group relative aspect-[4/5] bg-neutral-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${
                        isSelected 
                          ? 'ring-4 ring-emerald-500 ring-offset-2' 
                          : 'hover:ring-4 hover:ring-emerald-500/50'
                      }`}
                   >
                      {activeTab === 'videos' ? (
                         <video 
                            src={m.url} 
                            preload="metadata" 
                            muted 
                            loop 
                            playsInline 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                            onMouseEnter={e => e.currentTarget.play().catch(()=>{})}
                            onMouseLeave={e => {e.currentTarget.pause(); e.currentTarget.currentTime=0;}}
                         />
                      ) : (
                         <img src={m.url} alt="Library Media" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      
                      <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-between items-end pointer-events-none">
                         <div className="flex gap-1 flex-wrap">
                            {m.tags?.slice(0,2).map((t: string, tIdx: number) => (
                               <span key={tIdx} className="px-2 py-0.5 bg-white/20 backdrop-blur-md rounded text-[9px] text-white font-bold uppercase tracking-widest">{t}</span>
                            ))}
                         </div>
                      </div>
                      {/* Selection indicator */}
                      <div className={`absolute top-3 right-3 transition duration-300 pointer-events-none ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all ${
                           isSelected 
                             ? 'bg-emerald-500 text-white scale-100' 
                             : 'bg-white/80 text-neutral-400 scale-50 group-hover:scale-100'
                         }`}>
                           {isSelected ? '✓' : ''}
                         </div>
                      </div>
                      {activeTab === 'videos' && (
                         <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-md px-2 py-1 flex items-center gap-1 opacity-70 group-hover:opacity-0 pointer-events-none transition-opacity">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            <span className="text-[8px] text-white font-bold uppercase tracking-widest">Video</span>
                         </div>
                      )}
                   </div>
                )})}
             </div>
          )}
        </div>

        {/* Bottom bar for multi-select */}
        {multiSelect && selected.size > 0 && (
          <div className="px-8 py-4 border-t border-neutral-100 bg-white flex justify-between items-center">
            <span className="text-sm text-neutral-500">
              <span className="font-bold text-neutral-900">{selected.size}</span> photo{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set())}
                className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:text-neutral-900 transition"
              >
                Clear
              </button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold uppercase tracking-wider rounded-full transition-all shadow-lg"
              >
                Add {selected.size} Photo{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
