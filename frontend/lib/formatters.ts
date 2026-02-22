export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return ''
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const datePart = formatDate(value)
  const timePart = formatTime(value)
  if (!datePart && !timePart) return ''
  if (!timePart) return datePart
  if (!datePart) return timePart
  return `${datePart} ${timePart}`
}

export function formatDurationSeconds(
  value: number | string | null | undefined,
  empty = '0m'
): string {
  if (value === null || value === undefined || value === '') return empty
  const total = Number(value)
  if (!Number.isFinite(total) || total <= 0) return empty
  const totalMinutes = Math.round(total / 60)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  return parts.join(' ')
}
