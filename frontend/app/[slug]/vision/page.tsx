import { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import VisionClient from './VisionClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Your Wedding Vision — Misty Visuals',
    description: 'Shared questionnaire for wedding traditions, schedule, family tree, and photography preferences.'
  }
}

export default async function VisionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const initialStep = sp?.step !== undefined ? Math.max(0, Math.min(8, parseInt(String(sp.step), 10) || 0)) : 0

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
    redirect(`https://www.mistyvisuals.com/${slug}/vision${searchString ? '?' + searchString : ''}`)
  }

  return <VisionClient slug={slug} initialStep={initialStep} />
}
