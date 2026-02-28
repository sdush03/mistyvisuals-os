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
