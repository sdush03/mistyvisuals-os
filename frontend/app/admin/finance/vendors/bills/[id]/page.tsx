import { redirect } from 'next/navigation'

export default async function VendorBillRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params
  redirect(`/admin/finance/bills/${resolvedParams.id}`)
}
