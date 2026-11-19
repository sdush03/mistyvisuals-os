'use client'

import React, { useState, useEffect } from 'react'
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
  Eye,
  CheckCircle2,
  Lock,
  MessageSquareShare,
  Users
} from 'lucide-react'

interface ShareBriefModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectSlug: string
  projectName: string
  coupleNames?: string
  shareToken: string
  portalDomain: string
  onTokenUpdated?: (newToken: string) => void
}

export default function ShareBriefModal({
  isOpen,
  onClose,
  projectId,
  projectSlug,
  projectName,
  coupleNames,
  shareToken,
  portalDomain,
  onTokenUpdated
}: ShareBriefModalProps) {
  const [copied, setCopied] = useState(false)
  const [currentToken, setCurrentToken] = useState(shareToken)
  const [regenerating, setRegenerating] = useState(false)
  const [regenSuccess, setRegenSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const briefUrl = `${portalDomain}/${projectSlug}/brief`
  const displayName = coupleNames || projectName || 'Couple'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(briefUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      const input = document.getElementById('brief-share-url-input') as HTMLInputElement
      if (input) {
        input.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    }
  }

  const handleWhatsApp = () => {
    const text = `Wedding shoot details for *${displayName}*:\n${briefUrl}\n\nPlease check the VIP family members, event timings, and song/photo requests.`
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(waUrl, '_blank')
  }

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate this link? Any previous link sent to team members will stop working.')) {
      return
    }
    try {
      setRegenerating(true)
      setRegenSuccess(false)
      const res = await fetch(`/api/projects/${projectId}/wedding-vision/regenerate-token`, {
        method: 'POST',
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to regenerate link')
      const json = await res.json()
      if (json.share_token) {
        setCurrentToken(json.share_token)
        if (onTokenUpdated) onTokenUpdated(json.share_token)
        setRegenSuccess(true)
        setTimeout(() => setRegenSuccess(false), 3000)
      }
    } catch (err: any) {
      alert(err.message || 'Error regenerating link')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-brief-modal-title"
        className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center text-lg shrink-0 shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="share-brief-modal-title" className="text-base font-extrabold text-neutral-900 tracking-tight">
                Share Details with Team
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Simple read-only link for photographers and editors
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Share Link Input Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-700">Team Link</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                Read-Only
              </span>
            </div>
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-2xl p-1.5 pl-3">
              <input
                id="brief-share-url-input"
                type="text"
                readOnly
                value={briefUrl}
                className="bg-transparent text-xs font-mono text-neutral-800 flex-1 outline-hidden select-all truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <a
              href={briefUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold transition flex items-center justify-center gap-2 text-center shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5 text-neutral-600" />
              <span>Preview Brief</span>
            </a>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold transition flex items-center justify-center gap-2 text-center shadow-2xs cursor-pointer"
            >
              <MessageSquareShare className="w-3.5 h-3.5 text-emerald-700" />
              <span>WhatsApp Share</span>
            </button>
          </div>

          {/* Note */}
          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
            <span>Anyone with this link can view the read-only shoot brief</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-neutral-200 hover:bg-neutral-300 text-neutral-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
