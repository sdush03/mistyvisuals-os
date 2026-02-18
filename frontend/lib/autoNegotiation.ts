export const mapAutoNegotiationReasonToFocus = (reason?: string | null) => {
  if (!reason) return null
  const lower = reason.toLowerCase()
  if (lower.includes('amount quoted')) return 'amount_quoted'
  if (lower.includes('at least one event')) return 'events'
  if (lower.includes('primary city')) return 'primary_city'
  if (lower.includes('each city')) return 'all_cities_event'
  return null
}

export const getAutoNegotiationPromptText = (reason?: string | null) => {
  return {
    title: 'These are the required fields before moving to Negotiation',
    detail: reason || '',
  }
}
