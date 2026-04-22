'use client'

import { useEffect, useState } from 'react'

/**
 * PushNotificationManager
 * - Registers the push-sw.js service worker
 * - Requests permission from the user (shows a toast-style prompt)
 * - Subscribes/unsubscribes with the backend
 * - Silent on iOS until they add to Home Screen (iOS 16.4+)
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key', { credentials: 'include' })
    if (!res.ok) return null
    const { publicKey } = await res.json()
    return publicKey || null
  } catch {
    return null
  }
}

async function subscribeUser(registration: ServiceWorkerRegistration): Promise<boolean> {
  const vapidKey = await getVapidKey()
  if (!vapidKey) return false

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
    })

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription.toJSON()),
    })

    return res.ok
  } catch (err) {
    console.warn('[push] Subscription failed:', err)
    return false
  }
}

const DISMISSED_KEY = 'mv_push_dismissed_at'
const RE_PROMPT_DAYS = 7

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY)
    if (!ts) return false
    const dismissedAt = new Date(ts)
    const daysSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince < RE_PROMPT_DAYS
  } catch {
    return false
  }
}

export default function PushNotificationManager() {
  const [showBanner, setShowBanner] = useState(false)
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    // Register the push service worker
    navigator.serviceWorker
      .register('/push-sw.js', { scope: '/' })
      .then(async (reg) => {
        setSwReg(reg)

        const currentSub = await reg.pushManager.getSubscription()
        if (currentSub) {
          setSubscribed(true)
          return
        }

        const permission = Notification.permission
        if (permission === 'granted') {
          // Auto-subscribe silently
          await subscribeUser(reg)
          setSubscribed(true)
          return
        }

        if (permission === 'denied') return
        if (wasDismissedRecently()) return

        // Show prompt banner after a short delay so it's not intrusive
        setTimeout(() => setShowBanner(true), 3000)
      })
      .catch((err) => console.warn('[push] SW registration failed:', err))
  }, [])

  const handleAllow = async () => {
    setShowBanner(false)
    if (!swReg) return

    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      const ok = await subscribeUser(swReg)
      if (ok) setSubscribed(true)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    try {
      localStorage.setItem(DISMISSED_KEY, new Date().toISOString())
    } catch {}
  }

  if (!showBanner || subscribed) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(360px, calc(100vw - 32px))',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: '16px 20px',
        display: 'flex',
        gap: '14px',
        alignItems: 'flex-start',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        animation: 'mv-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <style>{`
        @keyframes mv-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Bell icon */}
      <div style={{
        width: 40, height: 40, borderRadius: '10px',
        background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
          Stay in the loop
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
          Get instant alerts for new leads, approvals & updates — even when the app is closed.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAllow}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px',
              background: '#6366f1', border: 'none', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Allow Notifications
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
