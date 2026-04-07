import { redirect } from 'next/navigation'

export default function VendorsRedirect() {
  redirect('/admin/finance/accounts#vendors')
}
