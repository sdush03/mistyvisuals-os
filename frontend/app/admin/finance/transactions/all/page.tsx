import { redirect } from 'next/navigation'

export default function TransactionsAllRedirect() {
  redirect('/admin/finance/ledger')
}
