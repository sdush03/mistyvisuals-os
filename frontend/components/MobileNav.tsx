'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState, useCallback } from 'react'
import { clearAuthCache, getAuth } from '@/lib/authClient'
import { getProfilePhotoUrl } from '@/lib/profilePhotoCache'
import NotificationCenter from '@/components/NotificationCenter'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const STORAGE_KEY = 'mv_mobile_nav_state'

function getPersistedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function isRouteActive(pathname: string, href: string, siblingHrefs: string[] = []) {
  if (pathname === href || pathname === `${href}/`) return true
  if (pathname.startsWith(`${href}/`)) {
    let bestMatch = href
    for (const s of siblingHrefs) {
      if (s.length > bestMatch.length && (pathname === s || pathname.startsWith(`${s}/`))) {
        bestMatch = s
      }
    }
    return bestMatch === href
  }
  return false
}

function sectionHasActive(pathname: string, items: NavItem[]) {
  const siblingHrefs = items.map(i => i.href)
  return items.some(item => isRouteActive(pathname, item.href, siblingHrefs))
}

export default function MobileNav() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [user, setUser] = useState<{ name?: string | null; email?: string; role?: string; roles?: string[]; has_photo?: boolean } | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

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
        setUser(data?.user || null)
        setRoles(Array.isArray(data?.user?.roles) ? data.user.roles : data?.user?.role ? [data.user.role] : [])
        if (authenticated && data?.user?.has_photo) {
          getProfilePhotoUrl().then(url => {
            if (active) setPhotoUrl(url)
          })
        }
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

  // Disable body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])



  const isAdmin = roles.includes('admin')
  const isSales = roles.includes('sales') || isAdmin
  const isVendor = roles.includes('vendor') || (!isAdmin && !isSales)

  const sections = React.useMemo(() => {
    const s: NavSection[] = []

    if (isSales) {
      s.push({
        title: 'Sales',
        items: [
          { label: 'Dashboard', href: '/salesdashboard' },
          { label: 'Leads', href: '/leads' },
          { label: 'Daily Actions', href: '/follow-ups' },
          { label: 'Proposal Analytics', href: '/proposalanalytics' },
          { label: 'Approvals', href: '/approvals' },
          { label: 'Insights', href: '/insights' },
        ]
      })
      
      s.push({
        title: 'Meta Ads',
        items: isAdmin 
          ? [
              { label: 'Dashboard', href: '/fb-ads' },
              { label: 'Campaigns', href: '/fb-ads/campaigns' },
              { label: 'Ad Creatives', href: '/fb-ads/creatives' },
              { label: 'Leads', href: '/fb-ads/leads' },
              { label: 'Audience', href: '/fb-ads/audience' },
            ]
          : [{ label: 'Leads', href: '/fb-ads/leads' }]
      })
    }

    if (isAdmin) {
      s.push({
        title: 'Finance',
        items: [{ label: 'Finance Hub', href: '/admin/finance' }]
      })
      s.push({
        title: 'Content',
        items: [
          { label: 'Library', href: '/admin/library' },
          { label: 'Testimonials', href: '/admin/testimonials' }
        ]
      })
      s.push({
        title: 'Config',
        items: [
          { label: 'Pricing Catalog', href: '/admin/pricing' },
          { label: 'Quotation Rules', href: '/admin/quotation-rules' },
          { label: 'Operational Roles', href: '/admin/operational-roles' }
        ]
      })
      s.push({
        title: 'Team',
        items: [
          { label: 'Admin Users', href: '/admin/users' },
          { label: 'Crew', href: '/admin/users/crew' },
          { label: 'Activity Logs', href: '/admin/activity' }
        ]
      })
    }

    if (isVendor && !isAdmin && !isSales) {
      s.push({
        title: 'Vendor Portal',
        items: [
          { label: 'My Statement', href: '/vendor/statement' },
          { label: 'My Payments', href: '/vendor/payments' },
          { label: 'My Bills', href: '/vendor/bills' },
          { label: 'Submit Bill', href: '/vendor/bills/new' }
        ]
      })
    }
    return s
  }, [isSales, isAdmin, isVendor])

  // Initialize expanded state
  useEffect(() => {
    const persisted = getPersistedState()
    const initial: Record<string, boolean> = {}
    for (const s of sections) {
      if (persisted[s.title] !== undefined) {
        initial[s.title] = persisted[s.title]
      } else {
        initial[s.title] = sectionHasActive(pathname, s.items) || s.title === 'Sales'
      }
    }
    for (const s of sections) {
      if (sectionHasActive(pathname, s.items)) initial[s.title] = true
    }
    setExpanded(initial)
  }, [pathname, authed, sections])

  const toggleSection = useCallback((title: string) => {
    setExpanded(prev => {
      const next = { ...prev, [title]: !prev[title] }
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  if (!checked || !authed) return null

  // Find active label for current page header
  let activeLabel = 'Misty OS'
  for (const group of sections) {
    for (const item of group.items) {
      if (pathname === item.href) activeLabel = item.label
    }
  }

  const renderSection = (section: NavSection) => {
    const sectionOpen = expanded[section.title] ?? false
    const hasActive = sectionHasActive(pathname, section.items)
    const siblingHrefs = section.items.map(i => i.href)

    return (
      <div key={section.title}>
        <button
          onClick={() => toggleSection(section.title)}
          className={`w-full flex items-center justify-between px-5 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold transition-colors ${
            hasActive ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500'
          }`}
        >
          {section.title}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${sectionOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            sectionOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="flex flex-col">
            {section.items.map(item => {
              const isActive = isRouteActive(pathname, item.href, siblingHrefs)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-5 pl-7 py-2.5 text-[14px] transition-colors relative ${
                    isActive 
                      ? 'text-neutral-900 dark:text-white font-semibold bg-[var(--surface-muted)]' 
                      : 'text-neutral-600 dark:text-neutral-400 font-normal hover:bg-[var(--surface-muted)] hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-blue-600 dark:bg-blue-500 rounded-r-md" />
                  )}
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Fixed Header */}
      <div className="md:hidden sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] safe-area-top">
        <div className="flex items-center justify-between px-4 h-[68px]">
          <div className="flex items-center">
            <button 
              onClick={() => setIsOpen(true)}
              className="p-1.5 -ml-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-[var(--surface-muted)] rounded-md transition-colors"
              aria-label="Open Menu"
            >
              <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
            <Link href="/" className="text-[14px] font-bold uppercase tracking-[0.2em] text-neutral-900 dark:text-white leading-tight hover:opacity-80 transition">
              Misty Visuals
            </Link>
          </div>
          
          <div className="flex items-center gap-3">
            <NotificationCenter placement="top" />
            <Link href="/me" className="block shrink-0 rounded-full border border-[var(--border)] overflow-hidden hover:opacity-80 transition hover:shadow-sm">
              {user?.has_photo && photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="User DP" className="w-8 h-8 object-cover bg-[var(--surface-muted)]" />
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold uppercase tracking-wider">
                  {user?.name?.[0] || user?.email?.[0] || 'U'}
                </div>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Side Drawer Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-neutral-900/50 dark:bg-black/70 transition-opacity duration-300 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer Panel */}
          <div className="relative flex w-[80%] max-w-[300px] flex-col bg-[var(--surface)] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-end px-5 py-3.5 border-b border-[var(--border)] safe-area-top bg-[var(--surface)] flex-shrink-0">
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 -mr-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-[var(--surface-muted)] rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Menu Items — Collapsible Sections */}
            <div className="flex-1 overflow-y-auto py-2 bg-[var(--surface)]">
              <div className="space-y-0.5">
                {sections.map(renderSection)}
              </div>
            </div>

            {/* Footer / Logout */}
            <div className="px-4 py-3 mt-auto border-t border-[var(--border)] bg-[var(--surface-muted)] pb-safe flex-shrink-0">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                  sessionStorage.removeItem('mv_authed')
                  clearAuthCache()
                  window.location.href = '/login'
                }}
              >
                <button type="submit" className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] font-medium text-red-600 hover:bg-[var(--surface)] border border-[var(--border)] rounded-xl transition-all shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
