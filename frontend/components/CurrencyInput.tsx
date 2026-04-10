'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Formats a number using Indian grouping: xx,xx,xx,xxx
 * e.g. 1000000 -> "10,00,000"
 */
function formatIndian(value: string | number): string {
  const num = String(value).replace(/[^0-9.]/g, '')
  if (!num) return ''
  const [intPart, decPart] = num.split('.')
  if (!intPart) return decPart !== undefined ? `.${decPart}` : ''

  // Indian grouping: last 3 digits, then groups of 2
  let formatted = ''
  const len = intPart.length
  if (len <= 3) {
    formatted = intPart
  } else {
    formatted = intPart.slice(-3)
    let remaining = intPart.slice(0, -3)
    while (remaining.length > 2) {
      formatted = remaining.slice(-2) + ',' + formatted
      remaining = remaining.slice(0, -2)
    }
    if (remaining) formatted = remaining + ',' + formatted
  }

  return decPart !== undefined ? `${formatted}.${decPart}` : formatted
}

/** Strips formatting to get raw numeric string */
function toRaw(value: string): string {
  return value.replace(/,/g, '')
}

interface CurrencyInputProps {
  value: string | number
  onChange: (rawValue: string) => void
  className?: string
  placeholder?: string
  required?: boolean
  min?: string | number
  step?: string
  disabled?: boolean
  id?: string
  name?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  onWheel?: (e: React.WheelEvent<HTMLInputElement>) => void
}

export default function CurrencyInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
  required,
  min,
  step,
  disabled,
  id,
  name,
  onBlur,
  onWheel,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState('')
  const [focused, setFocused] = useState(false)

  // Keep a typed 0 visible instead of collapsing it to an empty string.
  useEffect(() => {
    if (!focused) {
      const rawValue =
        value === 0 ? '0' : value === null || value === undefined ? '' : String(value)
      const raw = rawValue.replace(/,/g, '')
      setDisplay(raw ? formatIndian(raw) : '')
    }
  }, [value, focused])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputElement = e.target
      const input = inputElement.value
      
      const selectionStart = inputElement.selectionStart || 0

      // Allow only digits, commas, and one decimal point
      const cleaned = input.replace(/[^0-9.,]/g, '')
      const raw = toRaw(cleaned)

      // Don't allow multiple dots
      const dots = (raw.match(/\./g) || []).length
      if (dots > 1) return

      const newFormatted = formatIndian(raw)
      
      // Calculate how many raw digits/dots exist before the cursor
      const beforeCursor = input.slice(0, selectionStart)
      const digitsBeforeCursor = beforeCursor.replace(/[^0-9.]/g, '').length
      
      setDisplay(newFormatted)
      onChange(raw)

      // Restore cursor position after React updates the DOM string
      window.requestAnimationFrame(() => {
        let newSelectionPos = 0
        let digitsMatched = 0
        
        for (let i = 0; i < newFormatted.length; i++) {
          if (digitsMatched === digitsBeforeCursor) {
            newSelectionPos = i
            break
          }
          if (/[0-9.]/.test(newFormatted[i])) {
            digitsMatched++
          }
        }
        
        if (digitsMatched === digitsBeforeCursor && newSelectionPos === 0 && digitsBeforeCursor > 0) {
          newSelectionPos = newFormatted.length
        } else if (digitsMatched < digitsBeforeCursor) {
           newSelectionPos = newFormatted.length
        }
        
        if (inputElement) {
          inputElement.setSelectionRange(newSelectionPos, newSelectionPos)
        }
      })
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    setFocused(true)
  }, [])

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false)
      const raw = toRaw(display)
      setDisplay(raw ? formatIndian(raw) : '')
      if (onBlur) onBlur(e)
    },
    [display, onBlur]
  )

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      id={id}
      name={name}
      autoComplete="off"
      onWheel={onWheel}
    />
  )
}

export { formatIndian, toRaw }
