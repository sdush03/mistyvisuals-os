import { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import ProposalClient from './ProposalClient'

const API = process.env.API_URL || 'http://localhost:3001'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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
    
    // Support multiple couple name sources
    const bride = (hero?.brideName || hero?.bride_name || draft?.brideName || draft?.bride_name || '').trim()
    const groom = (hero?.groomName || hero?.groom_name || draft?.groomName || draft?.groom_name || '').trim()
    const lead = (hero?.leadName || hero?.lead_name || draft?.leadName || draft?.lead_name || '').trim()
    const rawCoupleNames = hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names
    
    const coupleNames = rawCoupleNames 
      ? rawCoupleNames 
      : (bride && groom) ? `${bride} & ${groom}` : lead

    const title = coupleNames
      ? `${coupleNames} — Misty Visuals Proposal`
      : 'Your Proposal — Misty Visuals'

    const description = coupleNames
      ? `A wedding proposal crafted for ${coupleNames} by Misty Visuals.`
      : 'Your wedding proposal is ready. Tap to view your personalised story.'

    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = headersList.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
    const origin = `${protocol}://${host}`
    const proposalUrl = `${origin}/p/${token}`
    const ogImageUrl = `${origin}/p/${token}/opengraph-image`

    const ogImages = [{ url: ogImageUrl, width: 1200, height: 630, alt: title }]

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: proposalUrl,
        type: 'website',
        siteName: 'Misty Visuals',
        images: ogImages,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: ogImages,
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

export default async function ProposalPage({ params, searchParams }: Props) {
  const { token } = await params
  
  const headersList = await headers()
  const host = headersList.get('host') || ''
  
  if (host.includes('os.mistyvisuals.com')) {
    const resolvedSearchParams = await searchParams
    const paramsObj = new URLSearchParams()
    for (const [key, val] of Object.entries(resolvedSearchParams)) {
      if (Array.isArray(val)) {
        val.forEach(v => paramsObj.append(key, v))
      } else if (val !== undefined) {
        paramsObj.append(key, val)
      }
    }
    const searchString = paramsObj.toString()
    redirect(`https://www.mistyvisuals.com/p/${token}${searchString ? '?' + searchString : ''}`)
  }

  return <ProposalClient token={token} />
}
