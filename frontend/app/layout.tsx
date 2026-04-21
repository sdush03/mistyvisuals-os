import './globals.css'
import type { Metadata } from 'next'
import ScrollRestoration from '@/components/ScrollRestoration'
import SessionHeartbeat from '@/components/SessionHeartbeat'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata: Metadata = {
  title: 'Misty Visuals OS',
  description: 'Internal operating system',
  verification: {
    google: '58t2nxviEH1qsoDN8yItjYB3QRnmnJ-VuvRFAXX5GvI',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--background)] text-[var(--foreground)]">
        <ScrollRestoration />
        <SessionHeartbeat />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
