export type DuplicatePhoneMatch = {
  id: number
  name: string
  status: string
  primary_phone?: string | null
}

const STORAGE_KEY = 'mv_phone_duplicate_seen'
let cachedSeen: Set<string> | null = null

const loadSeen = () => {
  if (cachedSeen) return cachedSeen
  if (typeof window === 'undefined') {
    cachedSeen = new Set()
    return cachedSeen
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    cachedSeen = new Set(list)
  } catch {
    cachedSeen = new Set()
  }
  return cachedSeen
}

const saveSeen = (set: Set<string>) => {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

export const shouldCheckDuplicate = (phone: string) => {
  const seen = loadSeen()
  return !seen.has(phone)
}

export const markDuplicateSeen = (phone: string) => {
  const seen = loadSeen()
  seen.add(phone)
  saveSeen(seen)
}

export async function fetchPhoneDuplicates(
  phone: string,
  leadId?: number
): Promise<DuplicatePhoneMatch[]> {
  const res = await fetch('http://localhost:3001/leads/phone-duplicates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, lead_id: leadId }),
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  const matches = Array.isArray(data?.matches) ? data.matches : []
  return matches
}
