import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import PortalClient from './PortalClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://os.mistyvisuals.com'

  try {
    const res = await fetch(`${apiUrl}/api/gallery/public/events/${slug}`, {
      cache: 'no-store'
    })
    if (!res.ok) return {}
    const event = await res.json()

    const title = event.title || 'Misty Visuals Gallery'
    const desc = `View the wedding gallery for ${event.title || 'Misty Visuals'}.`
    const timestamp = event.updatedAt ? new Date(event.updatedAt).getTime() : Date.now()
    const images = event.coverPhotoUrl ? [`${event.coverPhotoUrl}?u=${timestamp}`] : []

    return {
      title,
      description: desc,
      openGraph: {
        title,
        description: desc,
        images,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description: desc,
        images,
      }
    }
  } catch (e) {
    return {}
  }
}

export default async function ClientPortalRoute({ params, searchParams }: Props) {
  const { slug } = await params

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
    redirect(`https://mistyvisuals.com/${slug}${searchString ? '?' + searchString : ''}`)
  }

  return <PortalClient slug={slug} />
}
