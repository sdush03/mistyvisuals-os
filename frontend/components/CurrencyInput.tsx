'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Formats a number using Indian grouping: xx,xx,xx,xxx
 * e.g. 1000000 → "10,00,000"
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

    // Sync external value → display
    useEffect(() => {
        if (!focused) {
            const rawValue =
                value === 0 ? '0' : value === null || value === undefined ? '' : String(value)
            const raw = rawValue.replace(/,/g, '')
            setDisplay(raw ? formatIndian(raw) : '')
        }
    }, [value, focused])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value
        // Allow only digits, commas, and one decimal point
        const cleaned = input.replace(/[^0-9.,]/g, '')
        const raw = toRaw(cleaned)

        // Don't allow multiple dots
        const dots = (raw.match(/\./g) || []).length
        if (dots > 1) return

        setDisplay(formatIndian(raw))
        onChange(raw)
    }, [onChange])

    const handleFocus = useCallback(() => {
        setFocused(true)
    }, [])

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(false)
        const raw = toRaw(display)
        setDisplay(raw ? formatIndian(raw) : '')
        if (onBlur) onBlur(e)
    }, [display, onBlur])

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
