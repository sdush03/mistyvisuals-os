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
