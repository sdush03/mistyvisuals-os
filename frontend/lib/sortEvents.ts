function toKolkataYMD(dateObj: Date): string {
  if (Number.isNaN(dateObj.getTime())) return '9999-99-99'
  const ymd = dateObj.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || ymd.startsWith('2099')) return '9999-99-99'
  return ymd
}

export function formatEventYMD(dateVal: unknown): string {
  if (!dateVal) return '9999-99-99'
  if (dateVal instanceof Date) {
    return toKolkataYMD(dateVal)
  }
  const str = String(dateVal).trim()
  if (!str) return '9999-99-99'
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str.startsWith('2099') ? '9999-99-99' : str
  }
  const parsed = new Date(str)
  if (!Number.isNaN(parsed.getTime())) {
    return toKolkataYMD(parsed)
  }
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) {
    return match[1].startsWith('2099') ? '9999-99-99' : match[1]
  }
  return '9999-99-99'
}

export function parseEventTimeSort(timeStr: unknown): number {
  if (!timeStr) return 9999
  const start = String(timeStr).split(/[-–]/)[0].trim().toLowerCase()
  const match = start.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i)
  if (!match) return 9999
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2] || '0', 10)
  if (hours > 24 || minutes > 59) return 9999
  const ap = (match[3] || '').toLowerCase()
  if (ap === 'pm' && hours < 12) hours += 12
  if (ap === 'am' && hours === 12) hours = 0
  return hours * 60 + minutes
}

export interface SortableEvent {
  id?: string | number | null
  event_date?: string | Date | null
  date?: string | Date | null
  start_time?: string | null
  time?: string | null
  created_at?: string | Date | null
  event_type?: string | null
  name?: string | null
}

export function sortProjectEvents<T extends SortableEvent>(events: T[] | null | undefined): T[] {
  if (!Array.isArray(events)) return []
  return [...events].sort((a, b) => {
    const aDate = formatEventYMD(a.event_date ?? a.date)
    const bDate = formatEventYMD(b.event_date ?? b.date)
    if (aDate !== bDate) return aDate.localeCompare(bDate)

    const aTime = parseEventTimeSort(a.start_time ?? a.time)
    const bTime = parseEventTimeSort(b.start_time ?? b.time)
    if (aTime !== bTime) return aTime - bTime

    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
    if (aCreated !== bCreated) return aCreated - bCreated

    const aName = String(a.event_type || a.name || '')
    const bName = String(b.event_type || b.name || '')
    const nameCmp = aName.localeCompare(bName)
    if (nameCmp !== 0) return nameCmp

    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
}
