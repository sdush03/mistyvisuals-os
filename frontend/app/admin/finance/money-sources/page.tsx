import { redirect } from 'next/navigation'

export default function MoneySourcesRedirect() {
  redirect('/admin/finance/accounts#money-sources')
}
