/**
 * Smart Natural Language Intent Search Engine for Misty Visuals CRM Leads.
 * 
 * Executes purely in-browser in < 1ms without external LLMs.
 * Features:
 *  - Currency & Deal Value parsing (> 3L, discounted amount greater than 3L, between 2L and 4L)
 *  - Date & Calendar intelligence (upcoming 3 months, in nov, dec 2026, next 60 days)
 *  - Location & Boolean logic (nashik / goa, udaipur or jaipur, nashik, goa)
 *  - Sales & Health triggers (overdue, uncontacted, ghosted, destination, both sides, rep names)
 *  - Lead IDs (L#104, #104, 104) and Phone number digit normalization
 *  - Conversational filler stripping (leads with, show me, having, whose)
 *  - Returns parsed intent chips for visual confirmation in the UI
 */

export type SmartChip = {
  id: string
  label: string
  type: 'currency' | 'date' | 'location' | 'status' | 'rep' | 'id' | 'scope'
  icon?: string
}

export type ParsedIntent = {
  rawQuery: string
  chips: SmartChip[]
  predicates: Array<(lead: any) => boolean>
  residualTokens: string[]
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Common Indian wedding destinations
export const KNOWN_CITIES = [
  'udaipur', 'jaipur', 'goa', 'nashik', 'delhi', 'mumbai', 'jim corbett', 'corbett',
  'agra', 'jodhpur', 'pushkar', 'jaisalmer', 'mussoorie', 'rishikesh', 'pune',
  'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'chandigarh',
  'dehradun', 'kerala', 'kollam', 'alappuzha', 'ahmedabad', 'surat', 'vadodara',
  'lucknow', 'kanpur', 'varanasi', 'shimla', 'manali', 'ncr', 'gurgaon', 'noida'
]

export function formatIndianCurrency(num: number): string {
  if (num >= 10000000) {
    const cr = num / 10000000
    return `₹${cr % 1 === 0 ? cr : cr.toFixed(1)} Cr`
  }
  if (num >= 100000) {
    const l = num / 100000
    return `₹${l % 1 === 0 ? l : l.toFixed(1)}L`
  }
  if (num >= 1000) {
    const k = num / 1000
    return `₹${k % 1 === 0 ? k : k.toFixed(0)}k`
  }
  return `₹${num.toLocaleString('en-IN')}`
}

export function parseIndianAmount(rawStr: string): number | null {
  if (!rawStr) return null
  const clean = rawStr.toLowerCase().replace(/,/g, '').trim()

  // Match e.g. "3.5l", "3 lakh", "3 lakhs", "3 lac", "3 lacs", "3l"
  const lakhMatch = clean.match(/^([0-9.]+)\s*(?:lakhs?|lacs?|l)$/i)
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1])
    return Number.isFinite(val) ? Math.round(val * 100000) : null
  }

  // Match e.g. "2cr", "2.5 crore", "2 crores"
  const croreMatch = clean.match(/^([0-9.]+)\s*(?:crores?|cr)$/i)
  if (croreMatch) {
    const val = parseFloat(croreMatch[1])
    return Number.isFinite(val) ? Math.round(val * 10000000) : null
  }

  // Match e.g. "50k", "50 k"
  const kMatch = clean.match(/^([0-9.]+)\s*k$/i)
  if (kMatch) {
    const val = parseFloat(kMatch[1])
    return Number.isFinite(val) ? Math.round(val * 1000) : null
  }

  // Direct number
  const num = parseFloat(clean)
  return Number.isFinite(num) ? Math.round(num) : null
}

function getLeadNumericValue(lead: any, fieldTarget: 'discounted' | 'budget' | 'deal' | 'any'): number {
  if (fieldTarget === 'discounted') {
    return Number(lead.discounted_amount || 0)
  }
  if (fieldTarget === 'budget') {
    return Number(lead.client_budget_amount || 0)
  }
  // Default deal value checks discounted_amount, amount_quoted, amount, deal_value
  return Number(lead.discounted_amount || lead.amount_quoted || lead.amount || lead.deal_value || 0)
}

function getLeadEvents(lead: any): Array<{ event_date?: string | null; event_type?: string | null }> {
  if (Array.isArray(lead.events)) return lead.events
  if (lead.event_date) return [{ event_date: lead.event_date, event_type: lead.event_type }]
  return []
}

/**
 * Parses a user's natural language search query into an intent object with
 * executable filter predicates and visual explanation chips.
 */
export function parseSearchQuery(query: string): ParsedIntent {
  const rawQuery = query.trim()
  const chips: SmartChip[] = []
  const predicates: Array<(lead: any) => boolean> = []

  if (!rawQuery) {
    return { rawQuery, chips, predicates, residualTokens: [] }
  }

  let text = ` ${rawQuery.toLowerCase()} `

  // -------------------------------------------------------------
  // 1. Lead ID / Lead Number Pattern (e.g. L#104, #104, lead 104)
  // -------------------------------------------------------------
  const idRegex = /(?:^|\s)(?:l#|#|lead\s+)(\d+)(?:\s|$)/i
  const idMatch = text.match(idRegex)
  if (idMatch) {
    const targetId = parseInt(idMatch[1], 10)
    chips.push({
      id: `id-${targetId}`,
      label: `L#${targetId}`,
      type: 'id',
      icon: '🆔',
    })
    predicates.push(lead => lead.lead_number === targetId || lead.id === targetId)
    text = text.replace(idRegex, ' ')
  }

  // -------------------------------------------------------------
  // 2. Numeric / Currency Comparisons & Deal Ranges
  //    Handles:
  //    - "discounted amount greater than 3L"
  //    - "discounted amount > 3L"
  //    - "budget between 2L and 4L"
  //    - "> 3L", "< 200000"
  // -------------------------------------------------------------
  const parseComparison = (
    fieldTarget: 'discounted' | 'budget' | 'deal',
    op: '>' | '<' | '>=' | '<=' | 'between' | '=',
    val1: number,
    val2?: number
  ) => {
    const fieldName =
      fieldTarget === 'discounted'
        ? 'Discounted'
        : fieldTarget === 'budget'
        ? 'Budget'
        : 'Deal Value'

    if (op === 'between' && val2 !== undefined) {
      const min = Math.min(val1, val2)
      const max = Math.max(val1, val2)
      chips.push({
        id: `curr-${fieldTarget}-${min}-${max}`,
        label: `${fieldName}: ${formatIndianCurrency(min)} – ${formatIndianCurrency(max)}`,
        type: 'currency',
        icon: '💰',
      })
      predicates.push(lead => {
        const v = getLeadNumericValue(lead, fieldTarget)
        return v >= min && v <= max
      })
    } else if (op === '>' || op === '>=') {
      chips.push({
        id: `curr-${fieldTarget}-gt-${val1}`,
        label: `${fieldName} > ${formatIndianCurrency(val1)}`,
        type: 'currency',
        icon: '💰',
      })
      predicates.push(lead => {
        const v = getLeadNumericValue(lead, fieldTarget)
        return v >= val1
      })
    } else if (op === '<' || op === '<=') {
      chips.push({
        id: `curr-${fieldTarget}-lt-${val1}`,
        label: `${fieldName} < ${formatIndianCurrency(val1)}`,
        type: 'currency',
        icon: '💰',
      })
      predicates.push(lead => {
        const v = getLeadNumericValue(lead, fieldTarget)
        return v > 0 && v <= val1
      })
    } else {
      chips.push({
        id: `curr-${fieldTarget}-eq-${val1}`,
        label: `${fieldName} = ${formatIndianCurrency(val1)}`,
        type: 'currency',
        icon: '💰',
      })
      predicates.push(lead => {
        const v = getLeadNumericValue(lead, fieldTarget)
        return Math.abs(v - val1) < 1000
      })
    }
  }

  // 2a. Range: "between X and Y [target]" or "[target] between X and Y" or "X to Y"
  const rangeRegex = /(?:(discounted\s*amount|discounted\s*price|after\s*discount|discount|client\s*budget|budget|quote|deal\s*value)\s+)?(?:between|from)\s+([0-9.,]+(?:\s*(?:lakhs?|lacs?|l|k|cr|crores?))?)\s+(?:and|to|-)\s+([0-9.,]+(?:\s*(?:lakhs?|lacs?|l|k|cr|crores?))?)(?:\s+(discounted\s*amount|client\s*budget|budget|quote|deal\s*value))?/i
  const rangeMatch = text.match(rangeRegex)
  if (rangeMatch) {
    const rawTarget = (rangeMatch[1] || rangeMatch[4] || '').toLowerCase()
    const target: 'discounted' | 'budget' | 'deal' = rawTarget.includes('discount')
      ? 'discounted'
      : rawTarget.includes('budget')
      ? 'budget'
      : 'deal'
    const val1 = parseIndianAmount(rangeMatch[2])
    const val2 = parseIndianAmount(rangeMatch[3])
    if (val1 !== null && val2 !== null) {
      parseComparison(target, 'between', val1, val2)
      text = text.replace(rangeRegex, ' ')
    }
  }

  // 2b. Explicit comparison with target field (e.g. "discounted amount greater than 3L", "budget > 2.5 lakhs")
  const fieldCompRegex = /(?:(discounted\s*amount|discounted\s*price|after\s*discount|discount|client\s*budget|budget|quote|quoted\s*amount|deal\s*value)\s+)?(greater\s*than\s*or\s*equal\s*to|greater\s*than|more\s*than|above|higher\s*than|exceeding|over|>=|>|less\s*than\s*or\s*equal\s*to|less\s*than|lower\s*than|cheaper\s*than|below|under|<=|<|=)\s*([0-9.,]+(?:\s*(?:lakhs?|lacs?|l|k|cr|crores?))?)(?:\s+(discounted\s*amount|client\s*budget|budget|quote|deal\s*value))?/i
  let fieldCompMatch = text.match(fieldCompRegex)
  while (fieldCompMatch) {
    const rawTarget = (fieldCompMatch[1] || fieldCompMatch[4] || '').toLowerCase()
    const rawOp = fieldCompMatch[2].toLowerCase()
    const rawVal = fieldCompMatch[3]

    const val = parseIndianAmount(rawVal)
    if (val !== null && (val > 100 || /[a-z]/i.test(rawVal))) {
      const target: 'discounted' | 'budget' | 'deal' = rawTarget.includes('discount')
        ? 'discounted'
        : rawTarget.includes('budget')
        ? 'budget'
        : 'deal'

      let op: '>' | '<' | '>=' | '<=' | '=' = '>'
      if (
        rawOp.includes('less') ||
        rawOp.includes('under') ||
        rawOp.includes('below') ||
        rawOp.includes('lower') ||
        rawOp.includes('cheaper') ||
        rawOp.includes('<')
      ) {
        op = '<'
      } else if (rawOp === '=') {
        op = '='
      }

      parseComparison(target, op, val)
      text = text.replace(fieldCompMatch[0], ' ')
      fieldCompMatch = text.match(fieldCompRegex)
    } else {
      break
    }
  }

  // 2c. Standalone currency comparison operator (e.g. "> 3L", "< 5L", ">200000")
  const standaloneCompRegex = /([><]=?)\s*([0-9.,]+(?:\s*(?:lakhs?|lacs?|l|k|cr|crores?))?)/i
  const standaloneCompMatch = text.match(standaloneCompRegex)
  if (standaloneCompMatch) {
    const opStr = standaloneCompMatch[1]
    const val = parseIndianAmount(standaloneCompMatch[2])
    if (val !== null && (val > 100 || /[a-z]/i.test(standaloneCompMatch[2]))) {
      parseComparison('deal', opStr.startsWith('<') ? '<' : '>', val)
      text = text.replace(standaloneCompRegex, ' ')
    }
  }

  // 2d. Standalone amount without operator (e.g. "Ananya 2.2L", "350k", "4 lakhs")
  const standaloneAmountRegex = /\b([0-9.]+)\s*(lakhs?|lacs?|l|cr|crores?)\b/i
  const standaloneAmountMatch = text.match(standaloneAmountRegex)
  if (standaloneAmountMatch) {
    const val = parseIndianAmount(standaloneAmountMatch[0])
    if (val !== null) {
      chips.push({
        id: `curr-approx-${val}`,
        label: `~${formatIndianCurrency(val)}`,
        type: 'currency',
        icon: '💰',
      })
      predicates.push(lead => {
        const v = getLeadNumericValue(lead, 'deal')
        return Math.abs(v - val) <= Math.max(25000, val * 0.15)
      })
      text = text.replace(standaloneAmountMatch[0], ' ')
    }
  }

  // -------------------------------------------------------------
  // 3. Calendar & Event Timeframes
  //    Handles:
  //    - "upcoming 3 months", "next 3 months", "in 3 months"
  //    - "next 30 days", "next 60 days"
  //    - "this month", "next month"
  //    - "in nov", "november 2026", "events in dec"
  // -------------------------------------------------------------
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // 3a. Relative upcoming timeframe (e.g. "upcoming 3 months", "next 60 days")
  const relativeTimeRegex = /(?:events?\s+in\s+)?(?:upcoming|next|in)\s+(\d+)?\s*(months?|days?)/i
  const relMatch = text.match(relativeTimeRegex)
  if (relMatch) {
    const count = parseInt(relMatch[1] || (relMatch[2].startsWith('month') ? '3' : '30'), 10)
    const isMonths = relMatch[2].startsWith('month')
    const endDate = new Date(now)
    if (isMonths) {
      endDate.setMonth(endDate.getMonth() + count)
    } else {
      endDate.setDate(endDate.getDate() + count)
    }
    const endStr = endDate.toISOString().slice(0, 10)

    chips.push({
      id: `time-upcoming-${count}-${isMonths ? 'm' : 'd'}`,
      label: `Events in Upcoming ${count} ${isMonths ? (count === 1 ? 'Month' : 'Months') : 'Days'}`,
      type: 'date',
      icon: '📅',
    })
    predicates.push(lead => {
      const events = getLeadEvents(lead)
      return events.some(e => {
        const d = (e.event_date || '').slice(0, 10)
        return d >= todayStr && d <= endStr
      })
    })
    text = text.replace(relativeTimeRegex, ' ')
  }

  // 3b. "this month" or "next month"
  const thisMonthRegex = /(?:events?\s+in\s+)?(this\s+month|next\s+month)/i
  const thisMonthMatch = text.match(thisMonthRegex)
  if (thisMonthMatch) {
    const isNext = thisMonthMatch[1].includes('next')
    const targetMonth = isNext ? (now.getMonth() + 1) % 12 : now.getMonth()
    const targetYear = isNext && now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
    chips.push({
      id: `time-${isNext ? 'next' : 'this'}-month`,
      label: `${isNext ? 'Next Month' : 'This Month'} (${MONTH_NAMES[targetMonth]})`,
      type: 'date',
      icon: '📅',
    })
    predicates.push(lead => {
      const events = getLeadEvents(lead)
      return events.some(e => {
        if (!e.event_date) return false
        const [y, m] = e.event_date.split('-').map(Number)
        return y === targetYear && m - 1 === targetMonth
      })
    })
    text = text.replace(thisMonthRegex, ' ')
  }

  // 3c. Specific named month (e.g. "in nov", "november 2026", "dec 26")
  const monthRegex = /(?:events?\s+in\s+|in\s+)?\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(202[4-9]|\d{2}))?/i
  const monthMatch = text.match(monthRegex)
  if (monthMatch) {
    const mStr = monthMatch[1].toLowerCase()
    const targetMonth = MONTH_MAP[mStr]
    let targetYear: number | null = null
    if (monthMatch[2]) {
      const yVal = parseInt(monthMatch[2], 10)
      targetYear = yVal < 100 ? 2000 + yVal : yVal
    }

    if (targetMonth !== undefined) {
      chips.push({
        id: `time-month-${targetMonth}`,
        label: `${MONTH_NAMES[targetMonth]}${targetYear ? ` ${targetYear}` : ''}`,
        type: 'date',
        icon: '📅',
      })
      predicates.push(lead => {
        const events = getLeadEvents(lead)
        return events.some(e => {
          if (!e.event_date) return false
          const parts = e.event_date.split('-').map(Number)
          if (parts.length < 2) return false
          const eYear = parts[0]
          const eMonth = parts[1] - 1
          if (eMonth !== targetMonth) return false
          if (targetYear !== null && eYear !== targetYear) return false
          return true
        })
      })
      text = text.replace(monthMatch[0], ' ')
    }
  }

  // -------------------------------------------------------------
  // 4. Sales Workflow & Lead Health Flags
  //    Handles: overdue, ghosted, uncontacted, destination, both sides
  // -------------------------------------------------------------

  // 4a. Overdue follow-up
  if (/\b(?:overdue|pending\s*followups?)\b/i.test(text)) {
    chips.push({ id: 'status-overdue', label: 'Overdue Follow-ups', type: 'status', icon: '⏰' })
    predicates.push(lead => {
      if (['Converted', 'Lost', 'Rejected'].includes(lead.status)) return false
      const fDate = (lead.next_followup_date || '').slice(0, 10)
      return Boolean(fDate && fDate < todayStr)
    })
    text = text.replace(/\b(?:overdue|pending\s*followups?)\b/gi, ' ')
  }

  // 4b. Uncontacted / Fresh Leads
  if (/\b(?:uncontacted|not\s*contacted)\b/i.test(text)) {
    chips.push({ id: 'status-uncontacted', label: 'Not Contacted', type: 'status', icon: '📞' })
    predicates.push(lead => !lead.first_contacted_at && Number(lead.not_contacted_count || 0) === 0)
    text = text.replace(/\b(?:uncontacted|not\s*contacted)\b/gi, ' ')
  }

  // 4c. Ghosted / Unresponsive (3+ failed call attempts)
  if (/\b(?:ghosted|unresponsive)\b/i.test(text)) {
    chips.push({ id: 'status-ghosted', label: 'Ghosted (3+ Calls)', type: 'status', icon: '👻' })
    predicates.push(lead => Number(lead.not_contacted_count || 0) >= 3)
    text = text.replace(/\b(?:ghosted|unresponsive)\b/gi, ' ')
  }

  // 4d. Destination Wedding
  if (/\bdestination\b/i.test(text)) {
    chips.push({ id: 'scope-destination', label: 'Destination Wedding', type: 'scope', icon: '✈️' })
    predicates.push(lead => lead.is_destination === true)
    text = text.replace(/\bdestination\b/gi, ' ')
  } else if (/\blocal\s+weddings?\b/i.test(text)) {
    chips.push({ id: 'scope-local', label: 'Local Wedding', type: 'scope', icon: '🏠' })
    predicates.push(lead => lead.is_destination === false)
    text = text.replace(/\blocal\s+weddings?\b/gi, ' ')
  }

  // 4e. Coverage Scope
  if (/\bboth\s*sides?\b/i.test(text)) {
    chips.push({ id: 'scope-both', label: 'Both Sides', type: 'scope', icon: '👥' })
    predicates.push(lead => (lead.coverage_scope || '').toLowerCase().includes('both'))
    text = text.replace(/\bboth\s*sides?\b/gi, ' ')
  } else if (/\bbride\s*side\b/i.test(text)) {
    chips.push({ id: 'scope-bride', label: 'Bride Side', type: 'scope', icon: '👰' })
    predicates.push(lead => (lead.coverage_scope || '').toLowerCase().includes('bride'))
    text = text.replace(/\bbride\s*side\b/gi, ' ')
  } else if (/\bgroom\s*side\b/i.test(text)) {
    chips.push({ id: 'scope-groom', label: 'Groom Side', type: 'scope', icon: '🤵' })
    predicates.push(lead => (lead.coverage_scope || '').toLowerCase().includes('groom'))
    text = text.replace(/\bgroom\s*side\b/gi, ' ')
  }

  // 4f. Heat flags: Hot, Warm, Cold
  const heatMatch = text.match(/\b(hot|warm|cold)\s*(?:leads?)?\b/i)
  if (heatMatch) {
    const heatVal = heatMatch[1].charAt(0).toUpperCase() + heatMatch[1].slice(1).toLowerCase()
    chips.push({ id: `heat-${heatVal}`, label: `${heatVal} Leads`, type: 'status', icon: '🔥' })
    predicates.push(lead => (lead.heat || '').toLowerCase() === heatVal.toLowerCase())
    text = text.replace(heatMatch[0], ' ')
  }

  // -------------------------------------------------------------
  // 5. Location & Boolean Logic (e.g. "nashik / goa", "udaipur or jaipur")
  // -------------------------------------------------------------
  // Check if text contains city candidates with OR connectors (/, or, ,)
  const orCityRegex = /\b([a-z\s]+?)\s*(?:\/|\bor\b|,)\s*([a-z\s]+?)\b/gi
  // Test if any known cities match in an OR pattern
  let cityMatchFound = false
  for (const c1 of KNOWN_CITIES) {
    for (const c2 of KNOWN_CITIES) {
      if (c1 === c2) continue
      const pattern = new RegExp(`\\b(${c1})\\s*(?:\\/|\\bor\\b|,)\\s*(${c2})\\b`, 'i')
      if (pattern.test(text)) {
        const title1 = c1.charAt(0).toUpperCase() + c1.slice(1)
        const title2 = c2.charAt(0).toUpperCase() + c2.slice(1)
        chips.push({
          id: `city-or-${c1}-${c2}`,
          label: `${title1} OR ${title2}`,
          type: 'location',
          icon: '📍',
        })
        predicates.push(lead => {
          const locString = [lead.city_names, lead.venues, lead.name, lead.source_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return locString.includes(c1) || locString.includes(c2)
        })
        text = text.replace(pattern, ' ')
        cityMatchFound = true
        break
      }
    }
    if (cityMatchFound) break
  }

  // Single city detection for known prominent destinations
  if (!cityMatchFound) {
    for (const c of KNOWN_CITIES) {
      const singleCityPattern = new RegExp(`\\b(?:in|at)?\\s*(${c})\\b`, 'i')
      if (singleCityPattern.test(text)) {
        const title = c.charAt(0).toUpperCase() + c.slice(1)
        chips.push({
          id: `city-${c}`,
          label: title,
          type: 'location',
          icon: '📍',
        })
        predicates.push(lead => {
          const locString = [lead.city_names, lead.venues, lead.name, lead.source_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return locString.includes(c)
        })
        text = text.replace(singleCityPattern, ' ')
        break
      }
    }
  }

  // -------------------------------------------------------------
  // 6. Conversational Noise & Filler Stripping
  // -------------------------------------------------------------
  const fillers = [
    /\b(?:show\s*me|find|search\s*for)\b/gi,
    /\b(?:leads?\s*with|deals?\s*with|leads?\s*having|deals?\s*where|leads?\s*whose|leads?\s*in)\b/gi,
    /\b(?:leads?|deals?|clients?|inquiries?)\b/gi,
    /\b(?:with|having|where|whose|about|amount|deal|value|quote|budget)\b/gi,
    /\b(?:in|at|on|for|from|to|and|either|or)\b/gi,
  ]
  fillers.forEach(f => {
    text = text.replace(f, ' ')
  })

  // -------------------------------------------------------------
  // 7. Residual Tokens (Names, Phones, Reps, Notes, Events)
  // -------------------------------------------------------------
  const residualTokens = text
    .split(/\s+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && !['>', '<', '=', '-', '+', '/', '&', '|'].includes(t))

  return {
    rawQuery,
    chips,
    predicates,
    residualTokens,
  }
}

/**
 * Evaluates whether a lead matches the parsed search intent.
 */
export function evaluateLead(lead: any, intent: ParsedIntent): boolean {
  // 1. Must satisfy all structured predicates (amount, dates, location, flags)
  for (const pred of intent.predicates) {
    if (!pred(lead)) return false
  }

  // 2. If no residual tokens remain, it's a match!
  if (intent.residualTokens.length === 0) {
    return true
  }

  // 3. Collect searchable text fields
  let textCorpus = [
    lead.name,
    lead.bride_name,
    lead.groom_name,
    lead.email,
    lead.bride_email,
    lead.groom_email,
    lead.instagram,
    lead.bride_instagram,
    lead.groom_instagram,
    lead.assigned_user_name,
    lead.assigned_user_nickname,
    lead.source,
    lead.source_name,
    lead.event_type,
    lead.city_names,
    lead.venues,
    lead.last_note_text,
    lead.lead_number ? `l#${lead.lead_number} ${lead.lead_number}` : '',
    lead.id ? `l#${lead.id} ${lead.id}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Collect event types
  if (Array.isArray(lead.events)) {
    lead.events.forEach((e: any) => {
      if (e.event_type) textCorpus += ` ${e.event_type.toLowerCase()}`
    })
  }

  // Collect phone numbers
  const phoneDigitsList = [
    lead.primary_phone,
    lead.phone_primary,
    lead.phone_secondary,
    lead.bride_phone_primary,
    lead.bride_phone_secondary,
    lead.groom_phone_primary,
    lead.groom_phone_secondary,
  ]
    .filter(Boolean)
    .map((p: string) => p.replace(/\D/g, ''))

  // Check if query is a full/partial phone number with spaces/symbols (e.g. "+91 98765 43210")
  const queryDigits = intent.rawQuery.replace(/\D/g, '')
  if (queryDigits.length >= 6) {
    const cleanQuery = queryDigits.startsWith('91') && queryDigits.length > 10 ? queryDigits.slice(2) : queryDigits
    const phoneMatched = phoneDigitsList.some(p => {
      const cleanP = p.startsWith('91') && p.length > 10 ? p.slice(2) : p
      return cleanP.includes(cleanQuery) || cleanQuery.includes(cleanP)
    })
    if (phoneMatched) return true
  }

  // 4. Every residual token must match either the text corpus or phone digits
  return intent.residualTokens.every(token => {
    // Exact or substring match in text corpus
    if (textCorpus.includes(token)) return true

    // Phone digits match
    const tokenDigits = token.replace(/\D/g, '')
    if (tokenDigits.length >= 3 && phoneDigitsList.some(p => p.includes(tokenDigits))) {
      return true
    }

    // Lead number match
    const tokenNum = parseInt(token.replace(/^l#?|^#/, ''), 10)
    if (!isNaN(tokenNum) && (lead.lead_number === tokenNum || lead.id === tokenNum)) {
      return true
    }

    return false
  })
}

/**
 * Filter an array of leads using natural language search.
 */
export function searchLeads(leads: any[], query: string): { results: any[]; intent: ParsedIntent } {
  const intent = parseSearchQuery(query)
  if (!intent.rawQuery) {
    return { results: leads, intent }
  }

  const results = leads.filter(lead => evaluateLead(lead, intent))
  return { results, intent }
}
