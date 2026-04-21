import { Metadata } from 'next'
import FbAdsLeads from './FbAdsLeadsClient'

export const metadata: Metadata = {
  title: 'Leads — Facebook Ads — Misty Visuals',
  description: 'All Facebook ad leads with quality rating and spam management.',
}

export default function LeadsPage() {
  return <FbAdsLeads />
}
