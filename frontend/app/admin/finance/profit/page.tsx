import { redirect } from 'next/navigation'

export default function ProfitRedirect() {
  redirect('/admin/finance/reports/profit')
}
