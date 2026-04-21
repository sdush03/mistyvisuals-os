import { Metadata } from 'next'
import FbAdsAudience from './FbAdsAudienceClient'

export const metadata: Metadata = {
  title: 'Audience — Facebook Ads — Misty Visuals',
  description: 'Demographics, location, platform and placement insights for your ads.',
}

export default function AudiencePage() {
  return <FbAdsAudience />
}
