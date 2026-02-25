'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clearAuthCache, getAuth } from '@/lib/authClient'
import { clearProfilePhotoCache, getProfilePhotoUrl } from '@/lib/profilePhotoCache'

const baseNavItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Leads', href: '/leads' },
  { label: 'Daily Actions', href: '/follow-ups' },
  { label: 'Insights', href: '/insights' },
]
const adminNavItems = [
  { label: 'Activity Logs', href: '/admin/activity' },
  { label: 'Admin Users', href: '/admin/users' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [user, setUser] = useState<{ name?: string | null; email?: string; role?: string; roles?: string[]; has_photo?: boolean } | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    const optimistic = typeof window !== 'undefined'
      ? sessionStorage.getItem('mv_authed') === '1'
      : false
    if (optimistic) {
      setAuthed(true)
      setChecked(true)
    }
    let active = true
    getAuth()
      .then(data => {
        if (!active) return
        const authenticated = Boolean(data?.authenticated)
        setAuthed(authenticated)
        if (authenticated) {
          sessionStorage.setItem('mv_authed', '1')
          setUser(data?.user || null)
          if (data?.user?.has_photo) {
            getProfilePhotoUrl().then(url => {
              if (active) setPhotoUrl(url)
            })
          }
        } else {
          sessionStorage.removeItem('mv_authed')
          setUser(null)
        }
        setChecked(true)
      })
      .catch(() => {
        if (!active) return
        setAuthed(false)
        sessionStorage.removeItem('mv_authed')
        setUser(null)
        setChecked(true)
      })
    return () => {
      active = false
    }
  }, [pathname])

  if (!checked) return null
  if (!authed) return null
  const username =
    user?.name?.trim() ||
    user?.email?.split('@')[0] ||
    'User'
  const finalPhotoUrl = user?.has_photo ? photoUrl : null

  return (
    <aside className="w-72 h-screen shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shadow-[1px_0_0_rgba(0,0,0,0.02)]">
      <div className="px-6 py-6 border-b border-[var(--border)]">
        <div className="text-[11px] uppercase tracking-[0.4em] text-neutral-500">
          Studio OS
        </div>
        <h1 className="text-2xl font-semibold mt-1 tracking-[0.16em] leading-[1.3]">
          MISTY VISUALS
        </h1>
        <div className="mt-2 text-xs text-neutral-500">
          Sales V1
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 text-sm">
        {[...baseNavItems, ...(user?.roles?.includes('admin') ? adminNavItems : [])].map(item => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2.5 rounded-xl transition ${
                isActive
                  ? 'bg-[var(--surface-strong)] text-neutral-900 font-semibold'
                  : 'hover:bg-[var(--surface-muted)] text-neutral-700'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-6 py-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-end gap-3">
          <div className="text-right text-xs text-neutral-600 leading-tight">
            <Link
              href="/me"
              className="text-sm font-semibold text-neutral-800 hover:text-neutral-900"
            >
              {username}
            </Link>
            {user?.role && (
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                {user.role}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                await fetch('/api/auth/logout', {
                  method: 'POST',
                  credentials: 'include',
                })
                sessionStorage.removeItem('mv_authed')
                clearAuthCache()
                clearProfilePhotoCache()
                window.location.href = '/login'
              }}
              autoComplete="off"
            >
              <button
                type="submit"
                className="text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Logout
              </button>
            </form>
          </div>
          <Link href="/me" className="block">
            {finalPhotoUrl ? (
              <img
                src={finalPhotoUrl}
                alt={username}
                className="h-10 w-10 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center text-sm font-semibold border border-[var(--border)]">
                {username.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
        </div>
      </div>
    </aside>
  )
}
