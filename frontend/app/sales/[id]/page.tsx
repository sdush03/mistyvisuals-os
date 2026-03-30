import { redirect } from 'next/navigation'

export default async function SalesLeadRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params
  redirect(`/leads/${resolvedParams.id}?tab=dashboard`)
}
