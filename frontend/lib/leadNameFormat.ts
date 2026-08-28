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
