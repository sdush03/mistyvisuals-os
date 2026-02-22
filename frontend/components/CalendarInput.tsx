'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  min?: string
  max?: string
  preferredYear?: number
  preferredMonth?: number
}

const formatDateDisplay = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const parseYMD = (raw: string) => {
  if (!raw) return null
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

const formatYMD = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function CalendarInput({
  value,
  onChange,
  className,
  placeholder = 'DD MMM YYYY',
  disabled,
  min,
  max,
  preferredYear,
  preferredMonth,
}: Props) {
  const today = new Date()
  const selected = parseYMD(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(selected?.y ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.m ?? today.getMonth() + 1)
  const displayValue = value ? formatDateDisplay(value) : ''
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      const panelWidth = 256
      const panelHeight = panelRef.current?.offsetHeight ?? 260
      let left = rect.left
      let top = rect.bottom + 8
      const maxLeft = window.innerWidth - panelWidth - 8
      if (left > maxLeft) left = Math.max(8, maxLeft)
      if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - panelHeight - 8)
      }
      setPanelStyle({ top, left })
    }
    const raf = requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, viewMonth, viewYear])

  const openPicker = () => {
    if (disabled) return
    const fromValue = parseYMD(value)
    const base = fromValue
      ? { y: fromValue.y, m: fromValue.m }
      : preferredYear && preferredMonth
        ? { y: preferredYear, m: preferredMonth }
        : { y: today.getFullYear(), m: today.getMonth() + 1 }
    setViewYear(base.y)
    setViewMonth(base.m)
    setOpen(true)
  }

  const changeMonth = (delta: number) => {
    let nextMonth = viewMonth + delta
    let nextYear = viewYear
    if (nextMonth < 1) {
      nextMonth = 12
      nextYear -= 1
    }
    if (nextMonth > 12) {
      nextMonth = 1
      nextYear += 1
    }
    setViewMonth(nextMonth)
    setViewYear(nextYear)
  }

  const daysInView = new Date(viewYear, viewMonth, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay()
  const totalCells = Math.ceil((firstDow + daysInView) / 7) * 7
  const cells = Array.from({ length: totalCells }, (_, idx) => {
    const day = idx - firstDow + 1
    return day >= 1 && day <= daysInView ? day : null
  })

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear()
  const isSelected = (day: number) =>
    selected && day === selected.d && viewMonth === selected.m && viewYear === selected.y

  const isDisabled = (day: number) => {
    const ymd = formatYMD(viewYear, viewMonth, day)
    if (min && ymd < min) return true
    if (max && ymd > max) return true
    return false
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
      style={{
        position: 'fixed',
        top: panelStyle?.top ?? 0,
        left: panelStyle?.left ?? 0,
        width: 256,
        zIndex: 1000,
      }}
    >
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
          onClick={() => changeMonth(-1)}
        >
          ‹
        </button>
        <div className="text-sm font-medium text-neutral-800">
          {MONTHS[viewMonth - 1]} {viewYear}
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
          onClick={() => changeMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {DOW.map(d => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((day, idx) =>
          day ? (
            <button
              key={`${viewYear}-${viewMonth}-${day}-${idx}`}
              type="button"
              disabled={isDisabled(day)}
              onClick={() => {
                if (isDisabled(day)) return
                onChange(formatYMD(viewYear, viewMonth, day))
                setOpen(false)
              }}
              className={`rounded-md py-1 ${
                isSelected(day)
                  ? 'bg-neutral-900 text-white'
                  : isToday(day)
                    ? 'border border-neutral-900 text-neutral-900'
                    : 'text-neutral-700 hover:bg-neutral-100'
              } ${isDisabled(day) ? 'text-neutral-400 opacity-40 hover:bg-transparent cursor-not-allowed' : ''}`}
            >
              {day}
            </button>
          ) : (
            <div key={`empty-${idx}`} />
          )
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="relative" ref={rootRef}>
      <input
        type="text"
        readOnly
        className={`${className || ''} cursor-pointer`}
        value={displayValue}
        placeholder={placeholder}
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            openPicker()
          }
        }}
        disabled={disabled}
        ref={inputRef}
      />
      {open && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  )
}
