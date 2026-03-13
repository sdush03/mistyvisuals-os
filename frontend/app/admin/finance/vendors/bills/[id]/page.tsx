import { redirect } from 'next/navigation'

export default function VendorBillRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/finance/bills/${params.id}`)
}
