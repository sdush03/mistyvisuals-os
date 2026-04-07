'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { clearAuthCache, getAuth } from '@/lib/authClient'
import { clearProfilePhotoCache, getProfilePhotoUrl } from '@/lib/profilePhotoCache'
import NotificationCenter from '@/components/NotificationCenter'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const salesSection: NavSection = {
  title: 'Sales',
  items: [
    { label: 'Dashboard', href: '/salesdashboard' },
    { label: 'Leads', href: '/leads' },
    { label: 'Daily Actions', href: '/follow-ups' },
    { label: 'Proposal Analytics', href: '/proposalanalytics' },
    { label: 'Approvals', href: '/approvals' },
    { label: 'Insights', href: '/insights' },
  ],
}

const adminSections: NavSection[] = [
  {
    title: 'Finance',
    items: [
      { label: 'Finance', href: '/admin/finance' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Library', href: '/admin/library' },
      { label: 'Testimonials', href: '/admin/testimonials' },
    ],
  },
  {
    title: 'Config',
    items: [
      { label: 'Pricing Catalog', href: '/admin/pricing' },
      { label: 'Quotation Rules', href: '/admin/quotation-rules' },
      { label: 'Operational Roles', href: '/admin/operational-roles' },
    ],
  },
  {
    title: 'Team',
    items: [
      { label: 'Admin Users', href: '/admin/users' },
      { label: 'Crew', href: '/admin/users/crew' },
      { label: 'Activity Logs', href: '/admin/activity' },
    ],
  },
]

const vendorSection: NavSection = {
  title: 'Vendor Portal',
  items: [
    { label: 'My Statement', href: '/vendor/statement' },
    { label: 'My Payments', href: '/vendor/payments' },
    { label: 'My Bills', href: '/vendor/bills' },
    { label: 'Submit Bill', href: '/vendor/bills/new' },
  ],
}

const STORAGE_KEY = 'mv_sidebar_state'

function getPersistedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function sectionHasActive(pathname: string, items: NavItem[]) {
  return items.some(item => isRouteActive(pathname, item.href))
}

export default function Sidebar() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [user, setUser] = useState<{ name?: string | null; email?: string; role?: string; roles?: string[]; has_photo?: boolean } | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Roles parsing
  const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : []
  const isAdmin = roles.includes('admin')
  const isSales = roles.includes('sales') || isAdmin
  const isVendor = roles.includes('vendor') || (!isAdmin && !isSales) // fallback to vendor if lacking clear internal roles

  // Gather sections for current user
  const visibleSections: NavSection[] = []
  if (isSales) visibleSections.push(salesSection)
  if (isAdmin) visibleSections.push(...adminSections)

  // Initialize expanded state: auto-expand sections with active routes
  useEffect(() => {
    const persisted = getPersistedState()
    const initial: Record<string, boolean> = {}
    
    for (const s of visibleSections) {
      if (persisted[s.title] !== undefined) {
        initial[s.title] = persisted[s.title]
      } else {
        // Default to keeping "Sales" expanded if no state exists
        initial[s.title] = sectionHasActive(pathname, s.items) || s.title === 'Sales'
      }
    }
    // Always auto-expand if the active section was collapsed
    for (const s of visibleSections) {
      if (sectionHasActive(pathname, s.items)) initial[s.title] = true
    }
    if (isVendor && !isSales) {
      initial[vendorSection.title] = true
    }
    setExpanded(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname])

  const toggleSection = useCallback((title: string) => {
    setExpanded(prev => {
      const next = { ...prev, [title]: !prev[title] }
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

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
  const username = user?.name?.trim() || user?.email?.split('@')[0] || 'User'
  const finalPhotoUrl = user?.has_photo ? photoUrl : null

  const renderNavLink = (item: NavItem) => {
    const isActive = isRouteActive(pathname, item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`block px-4 py-2 rounded-lg text-[13px] transition-all ${isActive
          ? 'bg-[var(--surface-strong)] text-neutral-900 font-semibold'
          : 'hover:bg-[var(--surface-muted)] text-neutral-600'
          }`}
      >
        {item.label}
      </Link>
    )
  }

  const renderSection = (section: NavSection) => {
    const isOpen = expanded[section.title] ?? false
    const hasActive = sectionHasActive(pathname, section.items)

    return (
      <div key={section.title}>
        <button
          onClick={() => toggleSection(section.title)}
          className={`w-full flex items-center justify-between px-4 py-2 rounded-lg text-[11px] uppercase tracking-[0.2em] transition-all ${
            hasActive ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          {section.title}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="pl-2 space-y-0.5 pb-1">
            {section.items.map(renderNavLink)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside className="w-72 h-screen shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shadow-[1px_0_0_rgba(0,0,0,0.02)]">
      <div className="px-6 py-6 border-b border-[var(--border)] relative">
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

      <nav className="flex-1 px-3 py-4 space-y-1 text-sm overflow-y-auto custom-scrollbar">
        {/* Dynamic sections based on roles (Sales, Finance, Content, Config, Team) */}
        {visibleSections.length > 0 && (
          <div className="space-y-1">
            {visibleSections.map(renderSection)}
          </div>
        )}

        {/* Vendor portal block */}
        {isVendor && !isSales && !isAdmin && (
          <div className="pt-3 mt-3 border-t border-[var(--border)]">
            {renderSection(vendorSection)}
          </div>
        )}
      </nav>

      <div className="px-6 py-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-end gap-3">
          <NotificationCenter placement="bottom" />
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
