'use client'

import React, { useState } from 'react'
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
  const [toast, setToast] = useState<string>('')
  const [activePrintTier, setActivePrintTier] = useState<AccessTier | null>(null)

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
    if (success) triggerToast(`${label} copied!`)
  }

  const handleCopyInvite = async (tier: AccessTier) => {
    const text = buildInviteMessage(gallery, tier)
    const success = await copyToClipboard(text)
    if (success) triggerToast('Invite message copied to clipboard!')
  }

  return (
    <>
      <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in duration-200 relative">

          {/* Toast Banner */}
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <span>✓</span> {toast}
            </div>
          )}

          {/* Modal Header */}
          <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div>
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <span>📤</span> Share Gallery & Invites
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {gallery.crmName || gallery.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Cards Grid */}
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* ── CARD 1: Partial / Guest Access ── */}
            <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs flex flex-col justify-between hover:border-emerald-500/40 transition">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900">Guest Access</h4>
                    <span className="text-[10px] text-neutral-400 font-medium">Partial / Face Search</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(gallery.partialPasscode, 'Access Code')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 transition cursor-pointer"
                    title="Click to copy access code"
                  >
                    📋 {gallery.partialPasscode || '—'}
                  </button>
                </div>

                <ul className="space-y-1.5 mb-5 text-[11px] text-neutral-600">
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> Face recognition - View OWN photos
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-emerald-500 font-bold">✓</span> View highlights folder
                  </li>
                  <li className="flex items-center gap-1.5 text-rose-500">
                    <span className="font-bold">✕</span> Can't view full folders
                  </li>
                </ul>
              </div>

              <div className="flex gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => handleCopyInvite('partial')}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <span>📋</span> Copy Invite
                </button>
                <button
                  type="button"
                  onClick={() => setActivePrintTier('partial')}
                  className="flex-1 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>🖼️</span> Print QR
                </button>
              </div>
            </div>

            {/* ── CARD 2: Full / Family Access ── */}
            <div className="border border-neutral-200 rounded-2xl p-4 bg-white relative shadow-xs flex flex-col justify-between hover:border-indigo-500/40 transition">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900">Full Access</h4>
                    <span className="text-[10px] text-neutral-400 font-medium">Family & Couple</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(gallery.passcode, 'Passcode')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[10px] font-mono font-bold text-neutral-700 transition cursor-pointer"
                    title="Click to copy passcode"
                  >
                    📋 {gallery.passcode || '—'}
                  </button>
                </div>

                <ul className="space-y-1.5 mb-5 text-[11px] text-neutral-600">
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
              </div>

              <div className="flex gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => handleCopyInvite('full')}
                  className="flex-1 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <span>📋</span> Copy Invite
                </button>
                <button
                  type="button"
                  onClick={() => setActivePrintTier('full')}
                  className="flex-1 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>🖼️</span> Print QR
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
    </>
  )
}
