import type { ReactNode } from 'react'
import FinanceHeader from './_components/FinanceHeader'

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <FinanceHeader />
      <div>{children}</div>
    </div>
  )
}
