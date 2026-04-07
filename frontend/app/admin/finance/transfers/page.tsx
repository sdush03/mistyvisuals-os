import { redirect } from 'next/navigation'

export default function TransfersRedirect() {
  redirect('/admin/finance/ledger')
}
