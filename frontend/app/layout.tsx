import './globals.css'
import type { Metadata } from 'next'
import Sidebar from '@/components/Sidebar'
import ScrollRestoration from '@/components/ScrollRestoration'
import MobileNav from '@/components/MobileNav'

export const metadata: Metadata = {
  title: 'Misty Visuals OS',
  description: 'Internal operating system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--background)] text-neutral-900">
        <div className="flex h-screen bg-[var(--background)]">
          <ScrollRestoration />
          {/* Sidebar */}
          <div className="hidden md:block h-screen">
            <Sidebar />
          </div>

          {/* Main content */}
          <main id="app-scroll" className="flex-1 overflow-y-auto bg-[var(--background)]">
            <MobileNav />
            <div className="p-4 md:p-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
