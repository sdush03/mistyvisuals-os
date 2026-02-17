'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (next: string) => void
  className?: string
  showWarning?: boolean
  disabled?: boolean
}

const onlyDigits = (v: string, max: number) =>
  v.replace(/\D/g, '').slice(0, max)

const daysInMonth = (year: number, month: number) => {
  if (month < 1 || month > 12) return 31
  return new Date(year, month, 0).getDate()
}

export default function DateField({ value, onChange, className, disabled }: Props) {
  const [warning, setWarning] = useState<string | null>(null)
  const parts = useMemo(() => {
    if (!value) return { dd: '', mm: '', yyyy: '' }
    const [y, m, d] = value.split('-')
    return { dd: d || '', mm: m || '', yyyy: y || '' }
  }, [value])

  const [dd, setDd] = useState(parts.dd)
  const [mm, setMm] = useState(parts.mm)
  const [yyyy, setYyyy] = useState(parts.yyyy)
  const lastValueRef = useRef<string | null>(null)

  useEffect(() => {
    if (value === lastValueRef.current) return
    lastValueRef.current = value
    setDd(parts.dd)
    setMm(parts.mm)
    setYyyy(parts.yyyy)
  }, [value, parts.dd, parts.mm, parts.yyyy])

  const normalizeYear = (y: string) => {
    if (y.length === 2) {
      return `20${y}`
    }
    return y
  }

  const emit = (nextDd: string, nextMm: string, nextYyyy: string) => {
    if (!nextDd && !nextMm && !nextYyyy) {
      onChange('')
      return
    }
    if (nextDd.length === 2 && nextMm.length === 2 && nextYyyy.length === 4) {
      const ddNum = Number(nextDd)
      const mmNum = Number(nextMm)
      const yyyyNum = Number(nextYyyy)
      if (mmNum >= 1 && mmNum <= 12) {
        const maxDay = daysInMonth(yyyyNum, mmNum)
        if (ddNum > maxDay) {
          const fixedDd = String(maxDay).padStart(2, '0')
          nextDd = fixedDd
          setDd(fixedDd)
        }
      }
      const iso = `${nextYyyy}-${nextMm}-${nextDd}`
      const entered = new Date(`${iso}T00:00:00`)
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const oneYear = new Date(start)
      oneYear.setFullYear(start.getFullYear() + 1)
      if (!Number.isNaN(entered.getTime())) {
        if (entered < start) {
          setWarning('You are entering past date')
        } else if (entered > oneYear) {
          setWarning('You are entering a date for next year')
        } else {
          setWarning(null)
        }
      }
      lastValueRef.current = iso
      onChange(iso)
    } else {
      setWarning(null)
      // Don't clear parent value on partial edits
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          className={`${className || ''} w-14 text-center`}
          inputMode="numeric"
          placeholder="DD"
          value={dd}
          autoComplete="off"
          disabled={disabled}
          onChange={e => {
            let next = onlyDigits(e.target.value, 2)
            if (next.length === 2) {
              const ddNum = Number(next)
              if (ddNum < 1 || ddNum > 31) return
            }
            setDd(next)
            emit(next, mm, yyyy)
          }}
          onBlur={() => {
            if (dd.length === 1) {
              const n = Number(dd)
              if (n >= 1 && n <= 9) {
                const next = `0${n}`
                setDd(next)
                emit(next, mm, yyyy)
              }
            }
          }}
        />
        <span className="text-neutral-400">/</span>
        <input
          className={`${className || ''} w-14 text-center`}
          inputMode="numeric"
          placeholder="MM"
          value={mm}
          autoComplete="off"
          disabled={disabled}
          onChange={e => {
            let next = onlyDigits(e.target.value, 2)
            if (next.length === 2) {
              const mmNum = Number(next)
              if (mmNum < 1 || mmNum > 12) return
            }
            setMm(next)
            emit(dd, next, yyyy)
          }}
          onBlur={() => {
            if (mm.length === 1) {
              const n = Number(mm)
              if (n >= 1 && n <= 9) {
                const next = `0${n}`
                setMm(next)
                emit(dd, next, yyyy)
              }
            }
          }}
        />
        <span className="text-neutral-400">/</span>
        <input
          className={`${className || ''} w-20 text-center`}
          inputMode="numeric"
          placeholder="YYYY"
          value={yyyy}
          autoComplete="off"
          disabled={disabled}
          onChange={e => {
            let next = onlyDigits(e.target.value, 4)
            if (next.length === 4) {
              setYyyy(next)
              emit(dd, mm, next)
              return
            }
            setYyyy(next)
            emit(dd, mm, next)
          }}
          onBlur={() => {
            if (yyyy.length === 2) {
              const next = normalizeYear(yyyy)
              setYyyy(next)
              emit(dd, mm, next)
            }
          }}
        />
      </div>
      {warning && (
        <div className="text-xs text-amber-600">{warning}</div>
      )}
    </div>
  )
}
