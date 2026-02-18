import { Suspense } from 'react'
import LeadsPageClient from './LeadsPageClient'

export default function LeadsPage() {
  return (
    <Suspense fallback={<div />}>
      <LeadsPageClient />
    </Suspense>
  )
}
