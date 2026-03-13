import { redirect } from 'next/navigation'

export default function VendorBillsRedirect() {
  redirect('/admin/finance/bills')
}
