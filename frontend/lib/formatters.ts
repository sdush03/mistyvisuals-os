export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return ''
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Parse any timestamp value into a proper Date object.
 * No manual offset correction needed — db.js forces `SET TIME ZONE 'UTC'`
 * so all timestamps from the API are true UTC. The `timeZone: 'Asia/Kolkata'`
 * option on Intl/toLocaleString handles the UTC → IST conversion natively.
 */
function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return ''
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return ''
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
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
export function formatTimeStr(val: string | null | undefined): string {
  if (!val) return ''
  const v = val.trim()
  // Check if AM/PM already exists to prevent double formatting
  if (v.toUpperCase().includes(' AM') || v.toUpperCase().includes(' PM')) return v
  
  // Handle ranges
  if (v.includes(' - ')) {
    return v.split(' - ').map(s => formatTimeStr(s)).join(' - ')
  }
  
  const parts = v.split(':')
  if (parts.length < 2) return v
  
  let h = parseInt(parts[0], 10)
  if (isNaN(h)) return v
  
  // Take first 2 digits of the second part as minutes
  const m = parts[1].substring(0, 2).padStart(2, '0')
  
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  
  return `${h}:${m} ${ampm}`
}

export function toISTDateInput(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function toISTMonthInput(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(date)
}

export function toISTISOString(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
  return `${formatted.replace(' ', 'T')}+05:30`
}

export function toISTDatetimeLocalInput(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return formatted.replace(' ', 'T')
}
