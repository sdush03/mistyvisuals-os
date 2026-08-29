export function formatLeadName(lead?: {
  id?: number | string | null
  lead_number?: number | string | null
  name?: string | null
  bride_name?: string | null
  groom_name?: string | null
}): { leadName: string; suffix: string; fulldisplay: string } {
  if (!lead) return { leadName: '', suffix: '', fulldisplay: '' }

  const firstName = (value?: string | null) => {
    if (!value) return ''
    return value.trim().split(/\s+/)[0] || ''
  }

  const leadName = (lead?.name || '').trim()
  const brideFirst = firstName(lead?.bride_name)
  const groomFirst = firstName(lead?.groom_name)
  let suffix = ''
  if (brideFirst && groomFirst) {
    suffix = `${brideFirst} ${groomFirst}`
  } else if (brideFirst) {
    suffix = `Bride ${brideFirst}`
  } else if (groomFirst) {
    suffix = `Groom ${groomFirst}`
  }

  const idStr = lead?.lead_number ?? lead?.id ?? ''
  let fulldisplay = idStr ? `L#${idStr} ${leadName}` : leadName
  if (suffix) {
    fulldisplay += ` (${suffix})`
  }

  return { leadName, suffix, fulldisplay: fulldisplay.trim() }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatLeadEventDates(
  events?: Array<{ event_date?: string | null }> | Array<string> | null
): string {
  if (!events || !Array.isArray(events) || events.length === 0) return ''

  // 1. Extract unique valid YYYY-MM-DD dates
  const dateSet = new Set<string>()
  for (const e of events) {
    const raw = typeof e === 'string' ? e : e?.event_date
    if (!raw) continue
    const str = String(raw).slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      dateSet.add(str)
    }
  }

  if (dateSet.size === 0) return ''

  // Sort dates chronologically
  const sortedDates = Array.from(dateSet).sort()

  // Convert to Date components (UTC to avoid timezone offsets)
  const parsed = sortedDates.map((dStr) => {
    const [y, m, d] = dStr.split('-').map(Number)
    return {
      year: y,
      month: m - 1, // 0-11
      day: d,
      time: Date.UTC(y, m - 1, d),
    }
  })

  // 2. Club continuous dates into ranges (within the same year)
  const ranges: (typeof parsed)[] = []
  let currentRange = [parsed[0]]

  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1]
    const curr = parsed[i]
    const diffDays = Math.round((curr.time - prev.time) / (1000 * 60 * 60 * 24))

    if (diffDays === 1 && curr.year === prev.year) {
      currentRange.push(curr)
    } else {
      ranges.push(currentRange)
      currentRange = [curr]
    }
  }
  ranges.push(currentRange)

  // 3. Group ranges by Year
  const yearGroups = new Map<number, string[]>()
  for (const range of ranges) {
    const year = range[0].year
    if (!yearGroups.has(year)) {
      yearGroups.set(year, [])
    }

    const first = range[0]
    const last = range[range.length - 1]

    let rangeStr = ''
    if (first === last) {
      // Single day: e.g. '27 Aug'
      rangeStr = `${first.day} ${MONTH_NAMES[first.month]}`
    } else if (first.month === last.month) {
      // Same month continuous: e.g. '8-10 Dec'
      rangeStr = `${first.day}-${last.day} ${MONTH_NAMES[first.month]}`
    } else {
      // Cross month continuous in same year: e.g. '31 Oct-2 Nov'
      rangeStr = `${first.day} ${MONTH_NAMES[first.month]}-${last.day} ${MONTH_NAMES[last.month]}`
    }

    yearGroups.get(year)!.push(rangeStr)
  }

  // 4. Format each year group: append 2-digit year to the LAST item of that year
  const formattedGroups: string[] = []
  for (const [year, tokens] of yearGroups.entries()) {
    const shortYear = String(year).slice(-2)
    const lastIdx = tokens.length - 1
    tokens[lastIdx] = `${tokens[lastIdx]} ${shortYear}`
    formattedGroups.push(tokens.join(', '))
  }

  return formattedGroups.join(', ')
}

/**
 * Deterministic distinct color styling for user/sales rep badges
 */
export function getUserBadgeColor(userName?: string | null): string {
  if (!userName || userName.trim().toLowerCase() === 'unassigned') {
    return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
  }

  const clean = userName.trim().toLowerCase()

  // 1. Explicit color mappings
  if (clean.includes('nishita') || clean.includes('nishi')) {
    return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
  }
  if (clean.includes('abhishek') || clean.includes('abhi')) {
    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  }
  if (clean.includes('dushyant')) {
    return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  }

  // 2. Deterministic palette for any other sales reps
  const palette = [
    'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800',
    'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800',
  ]

  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0
  }
  return palette[hash % palette.length]
}
