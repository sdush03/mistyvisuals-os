import { redirect } from 'next/navigation'

export default function SummariesRedirect() {
  redirect('/admin/finance/reports/summaries')
}
