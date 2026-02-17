export type ConversionSummary = {
  leadId: number
  finalAmount: number | null
  finalAmountLabel: string | null
  stageDurationDays: number | null
  followupCount: number
  discountValue: number | null
}

type Activity = {
  activity_type?: string
  created_at?: string
  metadata?: Record<string, any>
}

const MS_DAY = 24 * 60 * 60 * 1000

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const dateOnlyMs = (value?: string | Date | null) => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

const diffDays = (from: number | null, to: number | null) => {
  if (from == null || to == null) return null
  return Math.max(0, Math.floor((to - from) / MS_DAY))
}

export function buildConversionSummary(
  lead: any,
  activities: Activity[] = []
): ConversionSummary {
  const leadId = Number(lead?.id)
  const amountQuoted = toNumber(lead?.amount_quoted)
  const discounted = toNumber(lead?.discounted_amount)

  const finalAmount =
    discounted != null ? discounted : amountQuoted != null ? amountQuoted : null
  const finalAmountLabel =
    discounted != null ? 'discounted amount' : amountQuoted != null ? 'quoted amount' : null

  const contactActivities = activities
    .filter(a => a?.activity_type === 'status_change' && a?.metadata?.to === 'Contacted')
    .sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime()
      const bTime = new Date(b.created_at || 0).getTime()
      return aTime - bTime
    })

  const firstContactAt =
    lead?.first_contacted_at ||
    (contactActivities.length > 0 ? contactActivities[0]?.created_at : null)

  const convertedAt = lead?.converted_at || null
  const stageDurationDays = convertedAt
    ? diffDays(dateOnlyMs(firstContactAt), dateOnlyMs(convertedAt))
    : diffDays(dateOnlyMs(firstContactAt), dateOnlyMs(new Date()))

  const followupCount = activities.filter(a => a?.activity_type === 'followup_done').length

  const discountValue =
    discounted != null && amountQuoted != null && discounted < amountQuoted
      ? amountQuoted - discounted
      : null

  return {
    leadId: Number.isFinite(leadId) ? leadId : 0,
    finalAmount,
    finalAmountLabel,
    stageDurationDays,
    followupCount,
    discountValue,
  }
}

export async function fetchConversionSummary(lead: any): Promise<ConversionSummary> {
  try {
    const res = await fetch(`http://localhost:3001/leads/${lead?.id}/activities`)
    const data = await res.json()
    const activities = Array.isArray(data) ? data : []
    return buildConversionSummary(lead, activities)
  } catch {
    return buildConversionSummary(lead, [])
  }
}
