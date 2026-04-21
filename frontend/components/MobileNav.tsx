'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clearAuthCache, getAuth } from '@/lib/authClient'
import NotificationCenter from '@/components/NotificationCenter'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

export default function MobileNav() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [roles, setRoles] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)

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

  if (!checked || !authed) return null

  const isAdmin = roles.includes('admin')
  const isSales = roles.includes('sales') || isAdmin
  const isVendor = roles.includes('vendor') || (!isAdmin && !isSales)

  const sections: NavSection[] = []

  if (isSales) {
    sections.push({
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
    
    sections.push({
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
    sections.push({
      title: 'Finance',
      items: [{ label: 'Finance Hub', href: '/admin/finance' }]
    })
    sections.push({
      title: 'Content',
      items: [
        { label: 'Library', href: '/admin/library' },
        { label: 'Testimonials', href: '/admin/testimonials' }
      ]
    })
    sections.push({
      title: 'Config',
      items: [
        { label: 'Pricing Catalog', href: '/admin/pricing' },
        { label: 'Quotation Rules', href: '/admin/quotation-rules' },
        { label: 'Operational Roles', href: '/admin/operational-roles' }
      ]
    })
    sections.push({
      title: 'Team',
      items: [
        { label: 'Admin Users', href: '/admin/users' },
        { label: 'Crew', href: '/admin/users/crew' },
        { label: 'Activity Logs', href: '/admin/activity' }
      ]
    })
  }

  if (isVendor && !isAdmin && !isSales) {
    sections.push({
      title: 'Vendor Portal',
      items: [
        { label: 'My Statement', href: '/vendor/statement' },
        { label: 'My Payments', href: '/vendor/payments' },
        { label: 'My Bills', href: '/vendor/bills' },
        { label: 'Submit Bill', href: '/vendor/bills/new' }
      ]
    })
  }

  // Find active label for current page header
  let activeLabel = 'Misty OS'
  for (const group of sections) {
    for (const item of group.items) {
      if (pathname === item.href) activeLabel = item.label
    }
  }

  return (
    <>
      {/* Fixed Header */}
      <div className="md:hidden sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] safe-area-top">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsOpen(true)}
              className="p-1.5 -ml-1.5 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-[var(--surface-muted)] rounded-md transition-colors"
              aria-label="Open Menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex flex-col justify-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Misty Visuals
              </div>
              <div className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                {activeLabel}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <NotificationCenter placement="bottom" />
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
          <div className="relative flex w-[85%] max-w-[320px] flex-col bg-[var(--surface)] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] safe-area-top bg-[var(--surface)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-neutral-900 dark:bg-white dark:text-neutral-900 text-white flex items-center justify-center font-bold text-sm">
                  MV
                </div>
                <span className="font-semibold text-neutral-900 dark:text-white tracking-tight">MistyVisuals</span>
              </div>
              <div className="relative group">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 -mr-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-[var(--surface-muted)] rounded-lg transition-colors flex items-center justify-center"
                  aria-label="Close menu"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {/* Tooltip */}
                <div className="absolute top-10 right-0 opacity-0 group-hover:opacity-100 bg-neutral-800 text-white text-[11px] px-2 py-1 rounded shadow-md whitespace-nowrap transition-opacity pointer-events-none z-50">
                  Close menu
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-3 bg-[var(--surface)]">
              {sections.map((section, idx) => (
                <div key={idx} className="mb-2">
                  {section.title && (
                    <h3 className="px-5 py-2 text-[13px] font-medium text-neutral-500">
                      {section.title}
                    </h3>
                  )}
                  <div className="flex flex-col py-1">
                    {section.items.map(item => {
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center px-5 py-3 text-[15px] transition-colors relative ${
                            isActive 
                              ? 'text-neutral-900 dark:text-white font-semibold bg-[var(--surface-muted)]' 
                              : 'text-neutral-600 dark:text-neutral-400 font-normal hover:bg-[var(--surface-muted)] hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-2 bottom-2 w-[4px] bg-blue-600 dark:bg-blue-500 rounded-r-md" />
                          )}
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                  {idx < sections.length - 1 && (
                    <div className="mx-5 my-2 h-[1px] bg-[var(--border)]" />
                  )}
                </div>
              ))}
            </div>

            {/* Footer / Logout */}
            <div className="p-4 mt-auto border-t border-[var(--border)] bg-[var(--surface-muted)] pb-safe flex-shrink-0">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                  sessionStorage.removeItem('mv_authed')
                  clearAuthCache()
                  window.location.href = '/login'
                }}
              >
                <button type="submit" className="flex items-center gap-3 w-full px-4 py-3 text-[15px] font-medium text-red-600 hover:bg-[var(--surface)] border border-[var(--border)] rounded-xl transition-all shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
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
