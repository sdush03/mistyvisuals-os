import { redirect } from 'next/navigation'

export default function CashflowRedirect() {
  redirect('/admin/finance/reports/cashflow')
}
