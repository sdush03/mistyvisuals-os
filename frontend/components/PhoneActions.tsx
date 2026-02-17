"use client"

import { useEffect, useRef, useState } from 'react'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

type PhoneActionsProps = {
  phone?: string | null
  leadId?: number | string | null
  className?: string
  stopPropagation?: boolean
  label?: React.ReactNode
  labelAria?: string
  buttonClassName?: string
  tabIndex?: number
}

const normalizePhone = (phone?: string | null) => {
  if (!phone) return { display: '', e164: '', digits: '' }
  const trimmed = String(phone).trim()
  if (!trimmed) return { display: '', e164: '', digits: '' }

  const parsed = parsePhoneNumberFromString(trimmed)
  const e164 = parsed?.number || (trimmed.startsWith('+') ? trimmed : `+${trimmed}`)
  const digits = e164.replace(/\D/g, '')

  return { display: trimmed, e164, digits }
}

export default function PhoneActions({
  phone,
  leadId,
  className,
  stopPropagation = false,
  label,
  labelAria,
  buttonClassName,
  tabIndex,
}: PhoneActionsProps) {
  const { display, e164, digits } = normalizePhone(phone)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (wrapperRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const fetchMessage = async () => {
    if (!leadId) return
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`http://localhost:3001/leads/${leadId}/whatsapp-message`, {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(true)
        setMessage('')
      } else {
        setMessage(String(data?.message || ''))
      }
    } catch {
      setLoadError(true)
      setMessage('')
    } finally {
      setLoading(false)
    }
  }

  const openMenu = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (!display) return
    const next = !open
    setOpen(next)
    if (next) {
      await fetchMessage()
    }
  }

  if (!display) return <span className={className}>—</span>

  const telHref = e164 ? `tel:${e164}` : `tel:+${digits}`
  const waHref = message && digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : ''

  return (
    <div ref={wrapperRef} className={`relative inline-flex ${className || ''}`}>
      <button
        type="button"
        onClick={openMenu}
        aria-label={labelAria || (label ? 'Contact' : display)}
        title={labelAria || (label ? 'Contact' : display)}
        className={buttonClassName || "text-neutral-700 hover:text-neutral-900 hover:underline cursor-pointer"}
        tabIndex={tabIndex}
      >
        {label ?? display}
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-40 rounded-lg border border-[var(--border)] bg-white shadow-md">
          <div className="flex flex-col p-2 text-xs text-neutral-600">
            <button
              type="button"
              onClick={e => {
                if (stopPropagation) e.stopPropagation()
                window.location.href = telHref
                setOpen(false)
              }}
              className="rounded-md px-2 py-2 text-left text-sm text-neutral-700 hover:bg-[var(--surface-muted)]"
            >
              Call
            </button>
            <button
              type="button"
              onClick={e => {
                if (stopPropagation) e.stopPropagation()
                if (!waHref) return
                const win = window.open(waHref, 'whatsapp')
                if (win) {
                  win.opener = null
                } else {
                  window.location.href = waHref
                }
                setOpen(false)
              }}
              className="rounded-md px-2 py-2 text-left text-sm text-neutral-700 hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!waHref || loading || loadError}
            >
              {loading ? 'WhatsApp…' : 'WhatsApp'}
            </button>
            {loadError && (
              <div className="px-2 pb-1 text-[11px] text-red-600">
                Unable to load message
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
