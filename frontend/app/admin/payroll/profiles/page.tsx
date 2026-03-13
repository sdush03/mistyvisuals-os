import { permanentRedirect } from 'next/navigation'

export default function PayrollProfilesRedirect() {
  permanentRedirect('/admin/finance/accounts')
}
