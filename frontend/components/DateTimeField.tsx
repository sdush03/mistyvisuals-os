'use client'

import { useEffect, useMemo, useState } from 'react'
import DateField from './DateField'

type Props = {
  value: string
  onChange: (next: string) => void
  dateClassName?: string
  timeClassName?: string
  disabled?: boolean
}

export default function DateTimeField({
  value,
  onChange,
  dateClassName,
  timeClassName,
  disabled,
}: Props) {
  const parts = useMemo(() => {
    if (!value) return { date: '', time: '' }
    const [date, time] = value.split('T')
    return { date: date || '', time: (time || '').slice(0, 5) }
  }, [value])

  const [date, setDate] = useState(parts.date)
  const [time, setTime] = useState(parts.time)

  useEffect(() => {
    setDate(parts.date)
    setTime(parts.time)
  }, [parts.date, parts.time])

  useEffect(() => {
    if (!date && !time) {
      onChange('')
      return
    }
    if (date && time) {
      onChange(`${date}T${time}`)
    } else {
      onChange('')
    }
  }, [date, time, onChange])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateField
        value={date}
        onChange={setDate}
        className={dateClassName}
        disabled={disabled}
      />
      <input
        type="time"
        className={timeClassName}
        value={time}
        autoComplete="off"
        onChange={e => setTime(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
