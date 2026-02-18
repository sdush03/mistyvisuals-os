export function formatINR(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return ''
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
