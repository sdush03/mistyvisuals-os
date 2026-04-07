'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  const isPublic = pathname?.startsWith('/p/') || pathname === '/login'

  if (isPublic) {
    return <main className="w-full h-[100svh] bg-black overflow-hidden">{children}</main>
  }

  return (
    <div className="flex min-h-[100svh] md:h-screen bg-[var(--background)]">
      <div className="hidden md:block h-screen">
        <Sidebar />
      </div>
      <main id="app-scroll" className="flex-1 min-h-[100svh] overflow-y-auto overflow-x-hidden bg-[var(--background)]">
        <MobileNav />
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
