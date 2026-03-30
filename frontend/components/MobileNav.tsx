'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clearAuthCache, getAuth } from '@/lib/authClient'

const baseNavItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Leads', href: '/leads' },
  { label: 'Daily Actions', href: '/follow-ups' },
  { label: 'Insights', href: '/insights' },
]

const adminNavItems = [
  { label: 'Activity Logs', href: '/admin/activity' },
  { label: 'Finance', href: '/admin/finance' },
  { label: 'Library (Photos)', href: '/admin/library/photos' },
  { label: 'Library (Videos)', href: '/admin/library/videos' },
  { label: 'Testimonials', href: '/admin/testimonials' },
  { label: 'Pricing Catalog', href: '/admin/pricing' },
  { label: 'Quotation Rules', href: '/admin/quotation-rules' },
  { label: 'Operational Roles', href: '/admin/operational-roles' },
  { label: 'Admin Users', href: '/admin/users' },
  { label: 'Crew', href: '/admin/users/crew' },
]
const vendorNavItems = [
  { label: 'My Statement', href: '/vendor/statement' },
  { label: 'My Payments', href: '/vendor/payments' },
  { label: 'My Bills', href: '/vendor/bills' },
]

export default function MobileNav() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [roles, setRoles] = useState<string[]>([])

  useEffect(() => {
    let active = true
    const optimistic = typeof window !== 'undefined'
      ? sessionStorage.getItem('mv_authed') === '1'
      : false
    if (optimistic) {
      setAuthed(true)
      setChecked(true)
    }
    getAuth()
      .then(data => {
        if (!active) return
        const authenticated = Boolean(data?.authenticated)
        setAuthed(authenticated)
        setRoles(Array.isArray(data?.user?.roles) ? data.user.roles : data?.user?.role ? [data.user.role] : [])
        setChecked(true)
      })
      .catch(() => {
        if (!active) return
        setAuthed(false)
        setChecked(true)
      })
    return () => {
      active = false
    }
  }, [pathname])

  if (!checked || !authed) return null

  const navItems = [...baseNavItems, ...(roles.includes('admin') ? adminNavItems : vendorNavItems)]

  return (
    <div className="md:hidden sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">
          Studio OS
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include',
            })
            sessionStorage.removeItem('mv_authed')
            clearAuthCache()
            window.location.href = '/login'
          }}
          autoComplete="off"
        >
          <button type="submit" className="text-xs text-neutral-600">
            Logout
          </button>
        </form>
      </div>
      <div className="flex gap-2 px-4 pb-3 text-sm overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full border border-[var(--border)] whitespace-nowrap ${isActive
                  ? 'bg-[var(--surface-strong)] text-neutral-900 font-semibold'
                  : 'bg-white text-neutral-700'
                  }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
