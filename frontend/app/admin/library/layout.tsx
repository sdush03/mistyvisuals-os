'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Photos', href: '/admin/library/photos' },
  { label: 'Videos', href: '/admin/library/videos' },
]

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      <div className="sticky top-0 z-10 bg-neutral-50 border-b border-neutral-200 px-6 pt-6">
        <div className="flex items-end justify-between gap-4 mb-0">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-neutral-500 mb-1">Admin</div>
            <h1 className="text-2xl font-semibold text-neutral-900">Library</h1>
          </div>
        </div>
        <div className="flex gap-1 mt-4">
          {tabs.map(tab => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all border border-b-0 ${
                  isActive
                    ? 'bg-white text-neutral-900 border-neutral-200 shadow-sm'
                    : 'bg-transparent text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-100/50'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
