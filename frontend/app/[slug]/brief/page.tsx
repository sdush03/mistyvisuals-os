import { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BriefClient from './BriefClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Team Production Brief — Misty Visuals',
    description: 'Shared wedding questionnaire and production brief for photographers, cinematographers, and editors.',
    robots: { index: false, follow: false }
  }
}

export default async function BriefPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const token = typeof sp.token === 'string' ? sp.token : undefined

  const headersList = await headers()
  const host = headersList.get('host') || ''

  if (host.includes('os.mistyvisuals.com')) {
    const paramsObj = new URLSearchParams()
    for (const [key, val] of Object.entries(sp)) {
      if (Array.isArray(val)) {
        val.forEach(v => paramsObj.append(key, v))
      } else if (val !== undefined) {
        paramsObj.append(key, val)
      }
    }
    const searchString = paramsObj.toString()
    redirect(`https://www.mistyvisuals.com/${slug}/brief${searchString ? '?' + searchString : ''}`)
  }

  return <BriefClient slug={slug} token={token} />
}
