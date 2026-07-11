'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * PushNotificationManager
 * - Registers and syncs push notifications
 * - Monitors permission status in real-time using Permissions API
 * - Dynamically adapts if permissions are revoked in browser settings
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
    return publicKey ? publicKey.trim() : null
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
  } catch (err: any) {
    console.warn('[push] Subscription failed:', err)
    return false
  }
}

export default function PushNotificationManager() {
  const pathname = usePathname()
  const [showBanner, setShowBanner] = useState(false)
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default')
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  // Evaluates permissions and PWA subscriptions
  const updateState = async (registration: ServiceWorkerRegistration) => {
    if (!registration.pushManager) return

    const currentSub = await registration.pushManager.getSubscription()
    const permission = Notification.permission
    setPermissionState(permission)

    if (permission === 'granted') {
      if (currentSub) {
        setSubscribed(true)
        setShowBanner(false)
      } else {
        // Automatically try to subscribe if user granted permission but subscription is missing
        const ok = await subscribeUser(registration)
        if (ok) {
          setSubscribed(true)
          setShowBanner(false)
        } else {
          setSubscribed(false)
          setShowBanner(true)
        }
      }
    } else {
      // 'default' or 'denied' (User hasn't allowed it or has revoked it)
      setSubscribed(false)
      setShowBanner(true)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname && pathname.includes('/gallery')) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.ready
      .then(async (reg) => {
        setSwReg(reg)
        
        // Force SW to check for updates
        reg.update().catch(err => console.warn('[sw] update failed:', err))

        // Initial state update
        await updateState(reg)

        // Set up real-time observer for permission changes in browser settings
        if (navigator.permissions) {
          try {
            const status = await navigator.permissions.query({ name: 'notifications' })
            status.onchange = () => {
              updateState(reg)
            }
          } catch (e) {
            console.warn('[push] Permission observer setup failed:', e)
          }
        }
      })
      .catch((err) => console.warn('[push] SW registration failed:', err))
  }, [pathname])

  const handleAllow = async () => {
    if (permissionState === 'denied') {
      alert(
        "Notifications are blocked in your browser settings.\n\n" +
        "To enable them:\n" +
        "1. Click the site settings icon (padlock/toggle icon) in the address bar next to the URL.\n" +
        "2. Change the Notification permission to 'Allow'.\n" +
        "3. Reload the page."
      )
      return
    }

    if (!swReg || !swReg.pushManager) return

    try {
      const permission = await Notification.requestPermission()
      setPermissionState(permission)
      
      if (permission === 'granted') {
        const ok = await subscribeUser(swReg)
        if (ok) {
          setSubscribed(true)
          setShowBanner(false)
        }
      }
    } catch (err) {
      console.warn('[push] requestPermission error:', err)
    }
  }

  const handleDismiss = () => {
    // Hide for this tab session so it doesn't block the user's flow constantly,
    // but prompts them again when they revisit or reload.
    setDismissedThisSession(true)
  }

  // Conditions to render:
  // - Must NOT be on a guest-facing gallery route
  // - Must want to show banner (i.e. not subscribed/granted)
  // - Must NOT have dismissed this session
  // - Must NOT be fully subscribed
  if (pathname && pathname.includes('/gallery')) return null
  if (!showBanner || subscribed || dismissedThisSession) return null

  const isBlocked = permissionState === 'denied'

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
        background: isBlocked 
          ? 'linear-gradient(135deg, #2e1a1a 0%, #3e1616 100%)' 
          : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: '16px 20px',
        display: 'flex',
        gap: '14px',
        alignItems: 'flex-start',
        border: isBlocked ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(255,255,255,0.08)',
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

      {/* Bell / Warning icon */}
      <div style={{
        width: 40, height: 40, borderRadius: '10px',
        background: isBlocked ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.2)', 
        border: isBlocked ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {isBlocked ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
          {isBlocked ? 'Notifications Blocked' : 'Stay in the loop'}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
          {isBlocked 
            ? 'Alerts are disabled in your settings. Please enable them in your browser URL settings to receive lead updates.'
            : 'Get instant alerts for new leads, approvals & updates — even when the app is closed.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAllow}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px',
              background: isBlocked ? '#ef4444' : '#6366f1', border: 'none', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {isBlocked ? 'How to Enable' : 'Allow Notifications'}
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
