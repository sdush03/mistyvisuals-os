'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  open: boolean
  title: string
  body: string
  subtext?: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export default function SwipeConfirmModal({
  open,
  title,
  body,
  subtext,
  confirmLabel = 'Swipe right to confirm',
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(0)
  const [knobLeft, setKnobLeft] = useState(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) setValue(0)
  }, [open])

  useEffect(() => {
    const updateKnob = () => {
      const track = trackRef.current
      if (!track) return
      const trackWidth = track.clientWidth
      const knobWidth = 48
      const maxLeft = Math.max(0, trackWidth - knobWidth)
      const center = (value / 100) * trackWidth
      const nextLeft = Math.min(maxLeft, Math.max(0, center - knobWidth / 2))
      setKnobLeft(nextLeft)
      setTrackWidth(trackWidth)
    }
    updateKnob()
    window.addEventListener('resize', updateKnob)
    return () => window.removeEventListener('resize', updateKnob)
  }, [value, open])

  if (!open) return null

  const handleEnd = () => {
    if (value >= 100) {
      setValue(0)
      onConfirm()
    } else {
      setValue(0)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="mt-2 text-sm text-neutral-700">{body}</div>
            {subtext && (
              <div className="mt-2 text-xs text-neutral-500">{subtext}</div>
            )}
          </div>
          <button
            className="text-sm text-neutral-500 hover:text-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>

        <div className="mt-5">
          <div ref={trackRef} className="relative h-12">
            <input
              type="range"
              min={0}
              max={100}
              value={value}
              onChange={e => setValue(Number(e.target.value))}
              onMouseUp={handleEnd}
              onTouchEnd={handleEnd}
              onKeyDown={e => e.preventDefault()}
              className="w-full h-12 appearance-none cursor-pointer rounded-full bg-[var(--surface-muted)]"
              style={{
                backgroundImage: `linear-gradient(to right, #111111 ${
                  trackWidth
                    ? ((knobLeft + 24) / trackWidth) * 100
                    : value
                }%, #E5E5E5 ${
                  trackWidth
                    ? ((knobLeft + 24) / trackWidth) * 100
                    : value
                }%)`,
              }}
            />
            <div
              className="pointer-events-none absolute top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white shadow-md flex items-center justify-center"
              style={{
                left: `${knobLeft}px`,
                transition: 'left 120ms ease-out',
              }}
            >
              {value >= 100 ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 11V7a5 5 0 0 1 10 0" />
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M12 14v3" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0" />
                  <path d="M12 14v3" />
                </svg>
              )}
            </div>
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-neutral-600 leading-none">
              {confirmLabel}
            </div>
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Drag fully to the right to confirm.
          </div>
        </div>
      </div>
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 3rem;
          height: 3rem;
          background: transparent;
          border: none;
        }
        input[type='range']::-moz-range-thumb {
          width: 3rem;
          height: 3rem;
          background: transparent;
          border: none;
        }
        input[type='range']::-ms-thumb {
          width: 3rem;
          height: 3rem;
          background: transparent;
          border: none;
        }
      `}</style>
    </div>
  )
}
