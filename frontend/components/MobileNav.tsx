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
          <div className="flex flex-col justify-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
              Misty Visuals
            </div>
            <div className="text-sm font-bold tracking-tight text-neutral-800">
              {activeLabel}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <NotificationCenter placement="bottom" />
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 -mr-1 text-neutral-700 active:text-black transition-colors"
              aria-label="Toggle Menu"
            >
              {isOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Full Screen Menu Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-[var(--surface)] pt-14 overflow-y-auto pb-safe animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col min-h-full">
            <div className="flex-1 p-6 space-y-8 pb-24">
              {sections.map((section, idx) => (
                <div key={idx}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400 mb-4 px-2">
                    {section.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {section.items.map(item => {
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center px-4 py-3 rounded-xl text-[13px] font-medium transition-all ${
                            isActive 
                              ? 'bg-neutral-900 text-white shadow-sm' 
                              : 'bg-[var(--surface-muted)] text-neutral-700 active:bg-[var(--surface-strong)] border border-[var(--border)]'
                          }`}
                        >
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Logout Footer inside menu */}
            <div className="p-6 mt-auto border-t border-[var(--border)] bg-[var(--surface-muted)]">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                  sessionStorage.removeItem('mv_authed')
                  clearAuthCache()
                  window.location.href = '/login'
                }}
              >
                <button type="submit" className="w-full py-4 bg-white border border-[var(--border)] rounded-xl text-sm font-semibold text-red-600 shadow-sm active:bg-neutral-50 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
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
