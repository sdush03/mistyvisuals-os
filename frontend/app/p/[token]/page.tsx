import { Metadata } from 'next'
import ProposalClient from './ProposalClient'

const API = process.env.API_URL || 'http://localhost:3001'

type Props = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  
  try {
    const res = await fetch(`${API}/api/proposals/${token}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 },
    })
    
    if (!res.ok) {
      return {
        title: 'Misty Visuals — Proposal',
        description: 'Your wedding proposal by Misty Visuals.',
      }
    }

    const data = await res.json()
    const draft = data?.draftData || data?.snapshotJson?.draftData || {}
    const hero = draft?.hero || {}
    const coupleNames = hero.coupleNames || hero.couple_names || ''

    const title = coupleNames
      ? `${coupleNames} — Misty Visuals Proposal`
      : 'Your Proposal — Misty Visuals'

    const description = coupleNames
      ? `A wedding proposal crafted for ${coupleNames} by Misty Visuals.`
      : 'Your wedding proposal is ready. Tap to view your personalised story.'

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        siteName: 'Misty Visuals',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
      robots: {
        index: false,
        follow: false,
      },
    }
  } catch {
    return {
      title: 'Misty Visuals — Proposal',
      description: 'Your wedding proposal by Misty Visuals.',
    }
  }
}

export default async function ProposalPage({ params }: Props) {
  const { token } = await params
  return <ProposalClient token={token} />
}
