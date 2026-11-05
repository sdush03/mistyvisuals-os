import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function QuestionnaireRedirectPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams

  const paramsObj = new URLSearchParams()
  for (const [key, val] of Object.entries(sp)) {
    if (Array.isArray(val)) {
      val.forEach(v => paramsObj.append(key, v))
    } else if (val !== undefined) {
      paramsObj.append(key, val)
    }
  }
  const searchString = paramsObj.toString()
  redirect(`/${slug}/vision${searchString ? '?' + searchString : ''}`)
}
