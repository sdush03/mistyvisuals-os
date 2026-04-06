'use client'

import { useEffect, useState } from 'react'
import StoryViewer from '@/components/StoryViewer'

export default function ProposalClient({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/proposals/${token}`, { headers: { 'Content-Type': 'application/json' } })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        if (data.error) throw new Error(data.error)
        setSnapshot(data)
      })
      .catch((err) => setError(err?.message || 'Proposal not found or expired.'))
      .finally(() => { if (active) setLoading(false) })

    // Spy pixel — track view count
    fetch(`/api/proposals/${token}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: navigator.userAgent }),
    }).catch(() => {})

    return () => { active = false }
  }, [token])

  const handleAccept = async (tierId?: string) => {
    setAccepting(true)
    try {
      const res = await fetch(`/api/proposals/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
      })
      if (!res.ok) throw new Error()
      setAccepted(true)
    } catch {
      alert('Error accepting proposal.')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <div className="text-white/40 text-xs font-bold uppercase tracking-[0.3em]">Loading Story…</div>
      </div>
    )
  }

  if (error || !snapshot) {
    const isExpired = error?.includes('expired')
    return (
      <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center">
        <div className="relative bg-black overflow-hidden w-full h-full max-w-[430px] md:h-[95dvh] md:rounded-[2rem] md:shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col">
        {isExpired ? (
          <div className="flex-1 overflow-y-auto p-8 pb-6 flex flex-col items-center text-center gap-5 justify-end">
            {/* Clock icon */}
            <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                <polyline points="12 6 12 12 16 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div>
              <div className="text-white/80 font-semibold text-lg tracking-wide mb-2">Proposal Expired</div>
              <div className="text-white/40 text-sm leading-relaxed max-w-[300px] mx-auto">
                This proposal and its pricing are no longer valid. Reach out to us for a fresh, updated quotation.
              </div>
            </div>

            {/* Contact card — matches connect page */}
            <div
              className="w-full rounded-2xl p-5 space-y-4 text-left"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Call */}
              <a href="tel:+917560008899" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v2.6a2 2 0 0 1-2.2 2a19.9 19.9 0 0 1-8.6-3.1a19.5 19.5 0 0 1-6-6a19.9 19.9 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h2.6a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.7l-1 1a16 16 0 0 0 6 6l1-1a2 2 0 0 1 1.7-.6l2.6.4a2 2 0 0 1 1.7 2z"/></svg>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">Call</div>
                  <div className="text-white/75 text-sm font-medium group-hover:text-white transition">+91 756000 8899</div>
                  <div className="text-white/75 text-sm font-medium group-hover:text-white transition">+91 998877 3181</div>
                </div>
              </a>
              {/* Email */}
              <a href="mailto:contact@mistyvisuals.com" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /><path d="m22 7-10 6L2 7" /></svg>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">Email</div>
                  <div className="text-white/75 text-sm font-medium group-hover:text-white transition">contact@mistyvisuals.com</div>
                </div>
              </a>
              {/* Office */}
              <a href="https://maps.app.goo.gl/eQ5tbA8WRWqtPxnJ7" target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">Office</div>
                  <div className="text-white/75 text-sm font-medium group-hover:text-white transition">415, Sector-40, Gurgaon</div>
                </div>
              </a>
            </div>

            {/* Social row: Instagram | Website | YouTube */}
            <div className="flex gap-2 w-full">
              {/* Instagram */}
              <a
                href="https://www.instagram.com/weddingsbymistyvisuals/"
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#e1306c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="3.2" />
                  <circle cx="17.5" cy="6.5" r="1" fill="#e1306c" stroke="none" />
                </svg>
                <div className="text-center w-full min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">Instagram</div>
                  <div className="text-white/75 text-[10px] font-medium mt-0.5 leading-tight truncate">@weddingsbymistyvisuals</div>
                </div>
              </a>
              {/* Website */}
              <a
                href="https://www.mistyvisuals.com"
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-sky-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <div className="text-center w-full min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">Website</div>
                  <div className="text-white/75 text-[10px] font-medium mt-0.5 leading-tight truncate">mistyvisuals.com</div>
                </div>
              </a>
              {/* YouTube */}
              <a
                href="https://www.youtube.com/@weddingsbymistyvisuals"
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="3" stroke="#ff4444"/>
                  <path d="M10 9.5l5 2.5-5 2.5z" fill="#ff4444" stroke="none"/>
                </svg>
                <div className="text-center w-full min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/40 font-bold">YouTube</div>
                  <div className="text-white/75 text-[10px] font-medium mt-0.5 leading-tight truncate">@weddingsbymistyvisuals</div>
                </div>
              </a>
            </div>

            {/* Bottom branding */}
            <div className="flex flex-col items-center gap-2 mt-2">
              <img src="/logo.png" alt="Misty Visuals" className="h-8 object-contain opacity-40 grayscale contrast-125" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
              <p className="text-center text-[9px] uppercase tracking-[0.4em] text-white/25 font-bold font-mono">© 2019 MISTY VISUALS PVT LTD</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8">
            <div className="text-white/30 text-4xl mb-2">✦</div>
            <div className="text-white/70 font-semibold text-lg">Link Unavailable</div>
            <div className="text-white/40 text-sm max-w-xs leading-relaxed">{error || 'This proposal link is not available. It may have expired or been revoked.'}</div>
          </div>
        )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center">
      {/* Portrait frame: full-screen on mobile, phone-shaped on desktop */}
      <div
        className="relative bg-black overflow-hidden w-full h-full max-w-[430px] md:h-[95dvh] md:rounded-[2rem] md:shadow-[0_0_80px_rgba(0,0,0,0.8)]"
        style={{ aspectRatio: undefined }}
      >
        <StoryViewer
          snapshot={snapshot}
          accepted={accepted}
          accepting={accepting}
          onAccept={handleAccept}
          token={token}
        />
      </div>
    </div>
  )
}
