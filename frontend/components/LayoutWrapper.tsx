'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import AIChatWidget from '@/components/AIChatWidget'
import ToastNotifications from '@/components/ToastNotification'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = 
    pathname === '/' ||
    ['/login', '/privacy', '/terms', '/refund', '/contact', '/logout'].includes(pathname || '') ||
    (pathname && /^\/projects\/[^/]+\/gallery(?:\/|$)/.test(pathname)) ||
    (pathname && !/^\/(admin|leads|projects|approvals|fb-ads|insights|me|sales|salesdashboard|proposalanalytics|vendor|follow-ups|proforma|api)(?:\/|$)/.test(pathname))

  const isSplash = pathname && /^\/[^/]+\/gallery\/?$/.test(pathname)

  if (isPublic) {
    if (isSplash) {
      return <main className="w-full h-[100svh] bg-[#111111] overflow-hidden">{children}</main>
    }
    return <main className="w-full min-h-screen bg-white overflow-y-auto">{children}</main>
  }

  return (
    <div className="flex min-h-[100svh] md:h-screen bg-[var(--background)]">
      <div className="hidden md:block h-screen">
        <Sidebar />
      </div>
      <main id="app-scroll" className="flex-1 min-h-[100svh] overflow-y-auto overflow-x-hidden bg-[var(--background)]">
        <MobileNav />
        <div className="px-2 py-4 sm:px-4 sm:py-6 md:p-8">
          {children}
        </div>
      </main>
      <AIChatWidget />
      <ToastNotifications />
    </div>
  )
}


