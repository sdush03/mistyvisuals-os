'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import StoryViewer from '@/components/StoryViewer'

export default function ProposalWebStory() {
  const params = useParams() as { token: string }
  const token = params.token
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
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-white/30 text-4xl mb-2">✦</div>
        <div className="text-white/70 font-semibold text-lg">Link Unavailable</div>
        <div className="text-white/40 text-sm max-w-xs leading-relaxed">{error || 'This proposal link is not available. It may have expired or been revoked.'}</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black">
      <StoryViewer
        snapshot={snapshot}
        accepted={accepted}
        accepting={accepting}
        onAccept={handleAccept}
        token={token}
      />
    </div>
  )
}
