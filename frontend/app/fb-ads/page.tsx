import { Metadata } from 'next'
import FbAdsDashboard from './FbAdsDashboardClient'

export const metadata: Metadata = {
  title: 'Facebook Ads Dashboard — Misty Visuals',
  description: 'Facebook ad performance overview, campaign metrics, and lead quality insights.',
}

export default function FbAdsPage() {
  return <FbAdsDashboard />
}
