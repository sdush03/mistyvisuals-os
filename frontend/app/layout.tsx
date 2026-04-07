import './globals.css'
import type { Metadata } from 'next'
import ScrollRestoration from '@/components/ScrollRestoration'
import SessionHeartbeat from '@/components/SessionHeartbeat'
import LayoutWrapper from '@/components/LayoutWrapper'

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
        <ScrollRestoration />
        <SessionHeartbeat />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
