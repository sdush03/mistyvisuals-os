import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import PortalClient from './PortalClient'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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
