import { redirect } from 'next/navigation'

export default function SalesLeadRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/leads/${params.id}?tab=dashboard`)
}
