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
    let title = 'Misty Visuals Workspace'
    let images: string[] = []

    const galleryRes = await fetch(`${apiUrl}/api/gallery/public/events/${slug}`, {
      cache: 'no-store'
    })
    if (galleryRes.ok) {
      const event = await galleryRes.json()
      if (event.title) title = event.title
      const timestamp = event.updatedAt ? new Date(event.updatedAt).getTime() : Date.now()
      if (event.coverPhotoUrl) images = [`${event.coverPhotoUrl}?u=${timestamp}`]
    } else {
      const portalRes = await fetch(`${apiUrl}/api/client-portal/${slug}`, {
        cache: 'no-store'
      })
      if (portalRes.ok) {
        const portal = await portalRes.json()
        if (portal.projectName) title = `${portal.projectName} — Misty Visuals`
      }
    }

    const desc = `Client workspace portal for ${title}.`

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
    redirect(`https://www.mistyvisuals.com/${slug}${searchString ? '?' + searchString : ''}`)
  }

  return <PortalClient slug={slug} />
}
