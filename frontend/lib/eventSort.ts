export type SortKey = 'event_soon' | 'newest' | 'oldest' | 'value_high' | 'value_low' | 'name_az'

export interface EventSortInfo {
  tier: number
  date: string | null
}

export const SORT_OPTIONS: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: 'event_soon', label: 'Event: Soonest', shortLabel: 'Event: Soonest' },
  { key: 'newest', label: 'Newest First', shortLabel: 'Newest' },
  { key: 'oldest', label: 'Oldest First', shortLabel: 'Oldest' },
  { key: 'value_high', label: 'Value: High → Low', shortLabel: 'Value ↓' },
  { key: 'value_low', label: 'Value: Low → High', shortLabel: 'Value ↑' },
  { key: 'name_az', label: 'Name: A → Z', shortLabel: 'A-Z' },
]

export function getLeadEventSortInfo(item: any, todayStr: string): EventSortInfo {
  const events: any[] = Array.isArray(item.events) && item.events.length > 0
    ? item.events
    : (item.event_date ? [{ event_date: item.event_date }] : (item.start_date ? [{ event_date: item.start_date }] : []))

  const confirmedDates: string[] = []
  let hasTba = false

  for (const e of events) {
    const isTba = e.date_status === 'tba' || (e.event_date && String(e.event_date).startsWith('2099'))
    if (isTba) {
      hasTba = true
      continue
    }
    const rawDate = e.event_date ? String(e.event_date).slice(0, 10) : ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      confirmedDates.push(rawDate)
    } else if (e.event_type && !e.event_date) {
      hasTba = true
    }
  }

  // Also check if item has start_date directly and confirmedDates is empty
  if (confirmedDates.length === 0 && item.start_date) {
    const rawStart = String(item.start_date).slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      if (rawStart.startsWith('2099')) {
        hasTba = true
      } else {
        confirmedDates.push(rawStart)
      }
    }
  }

  confirmedDates.sort()

  if (confirmedDates.length > 0) {
    // Check for upcoming dates (today or in future)
    const upcoming = confirmedDates.filter(d => d >= todayStr)
    if (upcoming.length > 0) {
      // Tier 1: Next upcoming event date
      return { tier: 1, date: upcoming[0] }
    }
    // If all confirmed dates are in the past, but there is also a future TBA event:
    if (hasTba) {
      return { tier: 2, date: null }
    }
    // Tier 4: All confirmed events are in the past (most recent past event date)
    return { tier: 4, date: confirmedDates[confirmedDates.length - 1] }
  }

  if (hasTba) {
    // Tier 2: TBA / Dates To Be Decided
    return { tier: 2, date: null }
  }

  // Tier 3: No events recorded at all
  return { tier: 3, date: null }
}

export function sortItemsByRule<T extends Record<string, any>>(items: T[], sortBy: SortKey, todayStr?: string): T[] {
  const today = todayStr || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const sorted = [...items]

  switch (sortBy) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      break
    case 'oldest':
      sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
      break
    case 'value_high':
      sorted.sort((a, b) => {
        const valA = Number(a.amount || a.discounted_amount || a.amount_quoted || a.deal_value || a.total_amount || 0)
        const valB = Number(b.amount || b.discounted_amount || b.amount_quoted || b.deal_value || b.total_amount || 0)
        return valB - valA
      })
      break
    case 'value_low':
      sorted.sort((a, b) => {
        const valA = Number(a.amount || a.discounted_amount || a.amount_quoted || a.deal_value || a.total_amount || 0)
        const valB = Number(b.amount || b.discounted_amount || b.amount_quoted || b.deal_value || b.total_amount || 0)
        return valA - valB
      })
      break
    case 'event_soon': {
      sorted.sort((a, b) => {
        const infoA = getLeadEventSortInfo(a, today)
        const infoB = getLeadEventSortInfo(b, today)

        // 1. Primary sort: Tier (1: Upcoming Confirmed -> 2: TBA -> 3: No Events -> 4: Past Events)
        if (infoA.tier !== infoB.tier) {
          return infoA.tier - infoB.tier
        }

        // 2. Within Tier 1 (Upcoming): Soonest event date first (ascending)
        if (infoA.tier === 1) {
          const dateCmp = infoA.date!.localeCompare(infoB.date!)
          if (dateCmp !== 0) return dateCmp
          // Tie-break: Higher deal value first, then newer creation
          const valA = Number(a.amount || a.discounted_amount || a.amount_quoted || a.deal_value || a.total_amount || 0)
          const valB = Number(b.amount || b.discounted_amount || b.amount_quoted || b.deal_value || b.total_amount || 0)
          if (valB !== valA) return valB - valA
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        }

        // 3. Within Tier 4 (Past): Most recent past event first (descending)
        if (infoA.tier === 4) {
          const dateCmp = infoB.date!.localeCompare(infoA.date!)
          if (dateCmp !== 0) return dateCmp
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        }

        // 4. Within Tier 2 (TBA) and Tier 3 (No events): Newest creation first
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      break
    }
    case 'name_az':
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      break
  }

  return sorted
}
