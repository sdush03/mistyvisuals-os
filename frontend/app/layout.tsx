import './globals.css'
import type { Metadata } from 'next'
import ScrollRestoration from '@/components/ScrollRestoration'
import SessionHeartbeat from '@/components/SessionHeartbeat'
import LayoutWrapper from '@/components/LayoutWrapper'
import PushNotificationManager from '@/components/PushNotificationManager'

export const metadata: Metadata = {
  title: 'Misty Visuals OS',
  description: 'Internal operating system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Misty Visuals OS',
  },
  verification: {
    google: '58t2nxviEH1qsoDN8yItjYB3QRnmnJ-VuvRFAXX5GvI',
  },
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f0' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
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
        <PushNotificationManager />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
