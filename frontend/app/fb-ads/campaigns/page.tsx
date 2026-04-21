import { Metadata } from 'next'
import FbAdsCampaigns from './FbAdsCampaignsClient'

export const metadata: Metadata = {
  title: 'Campaigns — Meta Ads — Misty Visuals',
  description: 'Campaign hierarchy with ad set and ad performance breakdown.',
}

export default function CampaignsPage() {
  return <FbAdsCampaigns />
}
