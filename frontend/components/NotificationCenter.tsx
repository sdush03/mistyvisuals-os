'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

// ── Roll-up identical unread notifications ────────────────────────────────────
const TITLE_ONLY_ROLLUP = new Set([
  'Proposal Viewed Again',
  'Proposal Viewed (First Time) 👀',
])

const rollUpNotifications = (list: any[]) => {
  const groups: any[] = []
  const map = new Map<string, any>()

  list.forEach((n) => {
    if (n.is_read) {
      groups.push({ ...n, originalIds: [n.id], isGroup: false })
      return
    }
    const key = TITLE_ONLY_ROLLUP.has(n.title)
      ? `TITLE_ONLY|${n.title}|${n.link_url}`
      : `${n.title}|${n.message}|${n.type}`

    if (map.has(key)) {
      const g = map.get(key)
      g.originalIds.push(n.id)
      g.count += 1
    } else {
      const g = { ...n, originalIds: [n.id], count: 1, isGroup: true }
      map.set(key, g)
      groups.push(g)
    }
  })

  return groups
}

// ── Sound ─────────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

// ── Type icons ────────────────────────────────────────────────────────────────
const TypeIcon = ({ type, isActionRequired }: { type: string; isActionRequired: boolean }) => {
  if (isActionRequired) {
    const colors: Record<string, string> = {
      ERROR: 'bg-rose-100 text-rose-600',
      WARNING: 'bg-amber-100 text-amber-600',
      SUCCESS: 'bg-emerald-100 text-emerald-600',
      INFO: 'bg-blue-100 text-blue-600',
    }
    const icons: Record<string, string> = {
      ERROR: 'M6 18L18 6M6 6l12 12',
      WARNING: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      SUCCESS: 'M5 13l4 4L19 7',
      INFO: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    }
    return (
      <div className={`p-1.5 rounded-full shrink-0 ${colors[type] || colors.INFO}`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type] || icons.INFO} />
        </svg>
      </div>
    )
  }
  const colors: Record<string, string> = {
    SUCCESS: 'bg-emerald-50 text-emerald-500',
    WARNING: 'bg-amber-50 text-amber-500',
    ERROR: 'bg-rose-50 text-rose-500',
    INFO: 'bg-blue-50 text-blue-500',
  }
  const icons: Record<string, string> = {
    SUCCESS: 'M5 13l4 4L19 7',
    WARNING: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    ERROR: 'M6 18L18 6M6 6l12 12',
    INFO: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  }
  return (
    <div className={`p-1.5 rounded-full shrink-0 ${colors[type] || colors.INFO}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type] || icons.INFO} />
      </svg>
    </div>
  )
}

// ── CTA label for action-required items ───────────────────────────────────────
function getCtaLabel(notif: any): string | null {
  const title = notif.title || ''
  if (title.includes('Approval Required') || title.includes('Waiting 24h')) return 'Open Approvals →'
  if (title.includes('Disapproved') || title.includes('Quote')) return 'View Quote →'
  if (title.includes('Signed') || title.includes('Advance')) return 'View Proposal →'
  if (title.includes('Lead Assigned') || title.includes('Lost') || title.includes('Stalled') || title.includes('Pending') || title.includes('Negotiation') || title.includes('Follow')) return 'Open Lead →'
  if (title.includes('Add-on') || title.includes('Callback') || title.includes('Adjust') || title.includes('Not a Fit')) return 'View Proposal →'
  return 'Open →'
}

// ── Exported hook for sharing unread counts ───────────────────────────────────
export function useNotifications() {
  const { data, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 5000,
  })
  return {
    unreadCount: data?.unread_count || 0,
    actionRequiredCount: data?.action_required_unread_count || 0,
    data,
    mutate,
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotificationCenter({
  placement = 'bottom',
}: {
  placement?: 'top' | 'bottom'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'ACTION' | 'ALL'>('ACTION')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [panelPos, setPanelPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const prevActionCountRef = useRef<number>(0)
  const isFirstLoad = useRef(true)

  const { data, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 5000,
  })

  const baseUnreadCount = data?.unread_count || 0
  const actionRequiredCount = data?.action_required_unread_count || 0

  // Load sound preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mv_sound_enabled')
      if (saved !== null) setSoundEnabled(saved === '1')
    } catch {}
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      try { localStorage.setItem('mv_sound_enabled', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  // Sound + browser tab badge when action-required count increases
  useEffect(() => {
    if (isFirstLoad.current) {
      prevActionCountRef.current = actionRequiredCount
      isFirstLoad.current = false
      // Set initial tab badge
      if (actionRequiredCount > 0) {
        try { navigator.setAppBadge?.(actionRequiredCount) } catch {}
        if (typeof document !== 'undefined') {
          const base = document.title.replace(/^\(\d+\)\s*/, '')
          document.title = `(${actionRequiredCount}) ${base}`
        }
      }
      return
    }

    if (actionRequiredCount > prevActionCountRef.current) {
      // New action-required arrived
      if (soundEnabled) playNotificationSound()
    }
    prevActionCountRef.current = actionRequiredCount

    // Update browser tab title and PWA badge
    try { navigator.setAppBadge?.(actionRequiredCount || undefined) } catch {}
    if (typeof document !== 'undefined') {
      const base = document.title.replace(/^\(\d+\)\s*/, '')
      document.title = actionRequiredCount > 0 ? `(${actionRequiredCount}) ${base}` : base
    }
  }, [actionRequiredCount, soundEnabled])

  // Clear badge when all action-required are read
  useEffect(() => {
    if (actionRequiredCount === 0) {
      try { navigator.clearAppBadge?.() } catch {}
      if (typeof document !== 'undefined') {
        document.title = document.title.replace(/^\(\d+\)\s*/, '')
      }
    }
  }, [actionRequiredCount])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const markAsRead = useCallback((ids: string[], url: string | null) => {
    if (ids.length > 0) {
      mutate(
        (current: any) => {
          if (!current) return current
          const idSet = new Set(ids)
          const nowReadCount = (current.notifications || []).filter(
            (n: any) => idSet.has(n.id) && !n.is_read
          ).length
          const nowActionCount = (current.notifications || []).filter(
            (n: any) => idSet.has(n.id) && !n.is_read && n.is_action_required
          ).length
          return {
            ...current,
            unread_count: Math.max(0, (current.unread_count || 0) - nowReadCount),
            action_required_unread_count: Math.max(0, (current.action_required_unread_count || 0) - nowActionCount),
            notifications: (current.notifications || []).map((n: any) =>
              idSet.has(n.id) ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
            ),
          }
        },
        { revalidate: false }
      )
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      }).then(() => mutate())
    }
    if (url) {
      setIsOpen(false)
      router.push(url)
    }
  }, [mutate, router])

  const markAllAsRead = useCallback(() => {
    mutate(
      (current: any) =>
        current
          ? {
              ...current,
              unread_count: 0,
              action_required_unread_count: 0,
              notifications: (current.notifications || []).map((n: any) => ({
                ...n,
                is_read: true,
              })),
            }
          : current,
      { revalidate: false }
    )
    fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' }).then(() =>
      mutate()
    )
  }, [mutate])

  const rawNotifications = data?.notifications || []
  const rolledUp = useMemo(() => rollUpNotifications(rawNotifications), [rawNotifications])

  const actionNotifs = useMemo(
    () => rolledUp.filter((n) => n.is_action_required),
    [rolledUp]
  )
  const activityNotifs = useMemo(
    () => rolledUp.filter((n) => !n.is_action_required),
    [rolledUp]
  )
  const displayNotifs = activeTab === 'ACTION' ? actionNotifs : activityNotifs

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            const panelWidth = Math.min(400, window.innerWidth - 16)
            // Prefer aligning right edge of panel to right edge of button
            let left = rect.right - panelWidth
            if (left < 8) left = 8
            if (placement === 'bottom') {
              // Bell is at the bottom of the screen (sidebar footer) — panel opens upward
              setPanelPos({ bottom: window.innerHeight - rect.top + 8, left })
            } else {
              // Bell is at the top of the screen (mobile header) — panel opens downward
              setPanelPos({ top: rect.bottom + 8, left })
            }
          }
          setIsOpen(!isOpen)
        }}
        className="relative p-2 text-neutral-500 hover:text-neutral-900 transition-colors focus:outline-none"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Show action-required count in red — if none, show total unread as a plain blue dot */}
        {actionRequiredCount > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
            {actionRequiredCount > 9 ? '9+' : actionRequiredCount}
          </span>
        ) : baseUnreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
        ) : null}
      </button>

      {/* Panel — fixed positioning so it's never clipped by sidebar overflow */}
      {isOpen && panelPos && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-[9999] bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-neutral-100/80 overflow-hidden"
            style={{
              width: Math.min(400, window.innerWidth - 16),
              maxHeight: 'min(580px, calc(100vh - 120px))',
              left: panelPos.left,
              ...(panelPos.top !== undefined ? { top: panelPos.top } : { bottom: panelPos.bottom }),
            }}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-neutral-900">Notifications</h3>
                  {actionRequiredCount > 0 && (
                    <span className="flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse inline-block" />
                      {actionRequiredCount} need action
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Sound toggle */}
                  <button
                    onClick={toggleSound}
                    title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
                  >
                    {soundEnabled ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9l-3 3 3 3" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    )}
                  </button>
                  {baseUnreadCount > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAllAsRead() }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-xl">
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab('ACTION') }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-1.5 rounded-[10px] transition-all ${
                    activeTab === 'ACTION'
                      ? 'bg-white text-rose-600 shadow-sm border border-rose-100'
                      : 'text-neutral-500 hover:text-rose-500'
                  }`}
                >
                  🔴 Needs Action
                  {actionNotifs.filter(n => !n.is_read).length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === 'ACTION' ? 'bg-rose-100 text-rose-700' : 'bg-neutral-200 text-neutral-600'}`}>
                      {actionNotifs.filter(n => !n.is_read).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab('ALL') }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-1.5 rounded-[10px] transition-all ${
                    activeTab === 'ALL'
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200/60'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  Activity Feed
                  {activityNotifs.filter(n => !n.is_read).length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === 'ALL' ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-200 text-neutral-500'}`}>
                      {activityNotifs.filter(n => !n.is_read).length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '400px' }}>
              {displayNotifs.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2">{activeTab === 'ACTION' ? '🎉' : '✨'}</div>
                  <div className="text-sm font-semibold text-neutral-700">
                    {activeTab === 'ACTION' ? 'All clear!' : "You're all caught up"}
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {activeTab === 'ACTION'
                      ? 'No pending actions. Keep it up.'
                      : 'No recent activity to show.'}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-neutral-50">
                  {displayNotifs.map((notif: any) => {
                    const isActionRequired = notif.is_action_required
                    const cta = isActionRequired ? getCtaLabel(notif) : null
                    return (
                      <div
                        key={notif.originalIds[0]}
                        onClick={() => markAsRead(notif.originalIds, notif.link_url)}
                        className={`flex gap-3 px-4 py-3.5 cursor-pointer transition group ${
                          isActionRequired && !notif.is_read
                            ? 'bg-rose-50/30 hover:bg-rose-50/60'
                            : !notif.is_read
                            ? 'bg-blue-50/20 hover:bg-neutral-50'
                            : 'hover:bg-neutral-50'
                        }`}
                      >
                        {/* Icon */}
                        <div className="shrink-0 mt-0.5 relative">
                          <TypeIcon type={notif.type} isActionRequired={isActionRequired} />
                          {notif.count > 1 && (
                            <div className="absolute -bottom-1 -right-1 bg-neutral-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white shadow-sm">
                              {notif.count}x
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1 mb-0.5">
                            <p className={`text-[13px] font-semibold leading-snug ${notif.is_read ? 'text-neutral-600' : isActionRequired ? 'text-rose-900' : 'text-neutral-900'}`}>
                              {notif.title}
                            </p>
                            <span className="text-[10px] whitespace-nowrap text-neutral-400 mt-0.5 shrink-0">
                              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className={`text-[12px] leading-snug line-clamp-2 ${notif.is_read ? 'text-neutral-400' : 'text-neutral-600'}`}>
                            {notif.message}
                          </p>
                          {/* CTA for action-required */}
                          {cta && !notif.is_read && (
                            <div className="mt-1.5">
                              <span className="text-[11px] font-bold text-rose-600 group-hover:text-rose-700 transition">
                                {cta}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Unread dot */}
                        {!notif.is_read && (
                          <div className={`w-2 h-2 rounded-full shrink-0 self-center ${isActionRequired ? 'bg-rose-500' : 'bg-blue-500'}`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">
                {activeTab === 'ACTION' ? 'Action Required' : 'Activity Feed'}
              </span>
              {activeTab === 'ALL' && activityNotifs.filter(n => !n.is_read).length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAllAsRead() }}
                  className="text-[10px] text-neutral-500 hover:text-neutral-700 font-semibold transition"
                >
                  Clear all →
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
