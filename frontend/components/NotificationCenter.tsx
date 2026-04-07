'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { formatDistanceToNow } from 'date-fns'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

// Native grouping (Quiet Roll-up) for identical unread notifications
const rollUpNotifications = (list: any[]) => {
  const groups: any[] = []
  const map = new Map<string, any>()

  list.forEach((n) => {
    // We only roll up unread notifications to compress the inbox.
    // Read historical notifications remain flat.
    if (n.is_read) {
      groups.push({ ...n, originalIds: [n.id], isGroup: false })
      return
    }

    const key = `${n.title}|${n.message}|${n.type}`
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

export default function NotificationCenter({ placement = 'bottom' }: { placement?: 'top' | 'bottom' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTION'>('ALL')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { data, mutate } = useSWR('/api/notifications', fetcher, { 
    refreshInterval: 5000 // Poll every 5 seconds for real-time feel
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = async (ids: string[], url: string | null) => {
    if (ids.length > 0) {
      // Backend now supports comma-separated IDs
      await fetch(`/api/notifications/${ids.join(',')}/read`, {
        method: 'PATCH',
        credentials: 'include'
      })
      mutate() // Refresh list
    }
    setIsOpen(false)
    if (url) {
      router.push(url)
    }
  }

  const markAllAsRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      credentials: 'include'
    })
    mutate()
  }

  const renderIcon = (type: string) => {
    switch(type) {
      case 'SUCCESS': return <div className="p-1.5 rounded-full bg-emerald-100 text-emerald-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg></div>
      case 'WARNING': return <div className="p-1.5 rounded-full bg-amber-100 text-amber-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
      case 'ERROR': return <div className="p-1.5 rounded-full bg-rose-100 text-rose-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>
      default: return <div className="p-1.5 rounded-full bg-blue-100 text-blue-600"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
    }
  }

  const rawNotifications = data?.notifications || []
  const baseUnreadCount = data?.unread_count || 0

  // 1. Rollup identical unread notifications
  const rolledUp = useMemo(() => rollUpNotifications(rawNotifications), [rawNotifications])

  // 2. Filter tabs
  const displayNotifs = useMemo(() => {
    if (activeTab === 'ACTION') {
      return rolledUp.filter(n => n.type === 'ERROR' || n.type === 'WARNING' || n.title.includes('Proposal Accepted'))
    }
    return rolledUp
  }, [rolledUp, activeTab])

  // Get action count bubble
  const actionCount = rawNotifications.filter((n: any) => !n.is_read && (n.type === 'ERROR' || n.type === 'WARNING' || n.title.includes('Proposal Accepted'))).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        className="relative p-2 text-neutral-500 hover:text-neutral-900 transition-colors focus:outline-none"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {baseUnreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
            {baseUnreadCount > 9 ? '9+' : baseUnreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          className={`absolute w-[320px] sm:w-[380px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-100 overflow-hidden z-[9999] ${
            placement === 'top' ? 'top-full mt-2 right-[-12px]' : 'bottom-full mb-2 left-[-12px] sm:left-[-24px]'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-50/80 bg-neutral-50/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
              {baseUnreadCount > 0 && (
                <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition">
                  Mark all as read
                </button>
              )}
            </div>
            
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-neutral-100/60 p-1 rounded-lg">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab('ALL') }}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeTab === 'ALL' ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200/60' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                All Updates
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab('ACTION') }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md transition-all ${
                  activeTab === 'ACTION' ? 'bg-white text-rose-600 shadow-sm border border-rose-100' : 'text-neutral-500 hover:text-rose-500'
                }`}
              >
                Action Required
                {actionCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTab === 'ACTION' ? 'bg-rose-100 text-rose-700' : 'bg-neutral-200 text-neutral-600'}`}>
                    {actionCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
            {displayNotifs.length === 0 ? (
              <div className="p-8 text-center bg-neutral-50/30">
                <div className="text-3xl mb-2">{activeTab === 'ACTION' ? '🎉' : '✨'}</div>
                <div className="text-sm text-neutral-600 font-medium">
                  {activeTab === 'ACTION' ? 'No pending actions' : "You're all caught up"}
                </div>
                <div className="text-xs text-neutral-400 mt-1">
                  {activeTab === 'ACTION' ? 'Any disapproved quotes or rejections will appear here.' : 'No new updates to show.'}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {displayNotifs.map((notif: any) => (
                  <div 
                    key={notif.originalIds[0]} 
                    onClick={() => markAsRead(notif.originalIds, notif.link_url)}
                    className={`flex gap-3 p-4 cursor-pointer hover:bg-neutral-50 transition relative ${!notif.is_read ? 'bg-blue-50/20' : ''}`}
                  >
                    <div className="shrink-0 mt-0.5 relative">
                      {renderIcon(notif.type)}
                      {notif.count > 1 && (
                        <div className="absolute -bottom-1 -right-1 bg-neutral-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white shadow-sm">
                          {notif.count}x
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <p className={`text-[13px] font-semibold truncate ${notif.is_read ? 'text-neutral-700' : 'text-neutral-900'}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] whitespace-nowrap text-neutral-400 mt-0.5">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className={`text-[12px] leading-snug line-clamp-2 ${notif.is_read ? 'text-neutral-500' : 'text-neutral-600'}`}>
                        {notif.message}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 self-center"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-2 border-t border-neutral-50/80 bg-neutral-50/50 text-center">
             <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
               End of Dropdown
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
