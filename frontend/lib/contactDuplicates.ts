import type { DuplicateResults } from '@/components/DuplicateContactModal'

type Payload = {
  leadId?: number
  phones?: string[]
  emails?: string[]
  instagrams?: string[]
}

export const hasDuplicates = (result: DuplicateResults | null) => {
  if (!result) return false
  return (
    (result.phones && result.phones.length > 0) ||
    (result.emails && result.emails.length > 0) ||
    (result.instagrams && result.instagrams.length > 0)
  )
}

export async function checkContactDuplicates(payload: Payload): Promise<DuplicateResults> {
  const res = await fetch('http://localhost:3001/leads/duplicate-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: payload.leadId,
      phones: payload.phones || [],
      emails: payload.emails || [],
      instagrams: payload.instagrams || [],
    }),
  })

  if (!res.ok) {
    return { phones: [], emails: [], instagrams: [] }
  }
  const data = await res.json().catch(() => null)
  return {
    phones: Array.isArray(data?.phones) ? data.phones : [],
    emails: Array.isArray(data?.emails) ? data.emails : [],
    instagrams: Array.isArray(data?.instagrams) ? data.instagrams : [],
  }
}
