'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ShareGalleryData,
  AccessTier,
  buildInviteMessage,
  copyToClipboard,
} from '@/lib/shareURL'
import PrintQRModal from './PrintQRModal'

interface ShareGalleryModalProps {
  gallery: ShareGalleryData
  onClose: () => void
  onToast?: (message: string) => void
}

export default function ShareGalleryModal({ gallery, onClose, onToast }: ShareGalleryModalProps) {
  const [mounted, setMounted] = useState(false)
  const [toast, setToast] = useState<string>('')
  const [activePrintTier, setActivePrintTier] = useState<AccessTier | null>(null)

  useEffect(() => {
    setMounted(true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const triggerToast = (msg: string) => {
    setToast(msg)
    if (onToast) onToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleCopyCode = async (code: string | null | undefined, label: string) => {
    if (!code) {
      triggerToast(`No ${label.toLowerCase()} configured`)
      return
    }
    const success = await copyToClipboard(code)
    if (success) triggerToast('Message Copied to Clipboard')
  }

  const handleCopyInvite = async (tier: AccessTier) => {
    const text = buildInviteMessage(gallery, tier)
    const success = await copyToClipboard(text)
    if (success) triggerToast('Message Copied to Clipboard')
  }

  if (!mounted) return null

  return createPortal(
    <>
      {/* Toast Notification Container (Foreground z-[100001]) */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100001] w-full max-w-xs bg-[#00a86b] text-white text-xs font-sans font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between animate-waterfall pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 w-4 h-4 rounded-full flex items-center justify-center text-[10px]">✓</span>
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast('')} className="text-white/60 hover:text-white transition font-bold text-xs select-none pl-2">✕</button>
        </div>
      )}

      <div className="fixed inset-0 w-screen h-screen min-h-screen min-h-[100dvh] top-0 left-0 right-0 bottom-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-neutral-100 shadow-2xl relative text-left my-auto animate-in fade-in zoom-in-95 duration-150">
          {/* Close button */}
          <button 
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition cursor-pointer text-base"
            aria-label="Close"
          >
            ✕
          </button>

          <h3 className="font-sans text-lg font-bold text-center mb-6 text-[#111111] tracking-tight">
            Share Group Invite
          </h3>

          <div className="space-y-4">
            {/* Card 1: Partial Access */}
            <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs">
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-sans font-bold text-xs text-[#111111]">Partial Access</h4>
                <button 
                  type="button"
                  onClick={() => handleCopyCode(gallery.partialPasscode, 'Access Code')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  title="Click to copy access code"
                >
                  📋 {gallery.partialPasscode || '—'}
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
                  <span>✕</span> Can&apos;t View all photos and folders
                </li>
              </ul>

              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => handleCopyInvite('partial')}
                  className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  📋 Invite links
                </button>
                <button 
                  type="button"
                  onClick={() => setActivePrintTier('partial')}
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
                  type="button"
                  onClick={() => handleCopyCode(gallery.passcode, 'Passcode')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 cursor-pointer"
                  title="Click to copy passcode"
                >
                  📋 {gallery.passcode || '—'}
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
                  type="button"
                  onClick={() => handleCopyInvite('full')}
                  className="flex-1 py-2 bg-[#005ea2] hover:bg-[#004e87] text-white rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  📋 Invite links
                </button>
                <button 
                  type="button"
                  onClick={() => setActivePrintTier('full')}
                  className="flex-1 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-lg font-sans text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  Print QR
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* High-Resolution QR Card Customizer & Downloader Modal */}
      {activePrintTier && (
        <PrintQRModal
          gallery={gallery}
          initialAccessType={activePrintTier}
          onClose={() => setActivePrintTier(null)}
        />
      )}
    </>,
    document.body
  )
}
