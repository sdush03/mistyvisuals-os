'use client'

import { useEffect, useState } from 'react'
import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
} from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'

export type PhoneFieldProps = {
  value: string | null
  onChange: (value: string | null) => void
  className?: string
  placeholder?: string
  onValidBlur?: (value: string) => void
  disabled?: boolean
}

export default function PhoneField({
  value,
  onChange,
  className,
  placeholder,
  onValidBlur,
  disabled,
}: PhoneFieldProps) {
  const [country, setCountry] = useState<CountryCode>('IN')
  const [national, setNational] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Helper to extract country from prefix when standard parsing fails (e.g. partial numbers)
  const findCountryFromPrefix = (phone: string): CountryCode | null => {
    if (!phone.startsWith('+')) return null
    const cleanPhone = phone.slice(1)
    const countries = getCountries()
    let bestCountry: CountryCode | null = null
    let maxLen = 0
    for (const c of countries) {
      const code = getCountryCallingCode(c)
      if (cleanPhone.startsWith(code)) {
        if (code.length > maxLen) {
          maxLen = code.length
          bestCountry = c
        }
      }
    }
    return bestCountry
  }

  // ✅ Sync ONLY when parent sends a VALID value (not during typing)
  useEffect(() => {
    if (isEditing) return

    if (!value) {
      setNational('')
      return
    }

    const parsed = parsePhoneNumberFromString(value)
    if (!parsed) {
      const detectedCountry = findCountryFromPrefix(value)
      if (detectedCountry) {
        setCountry(detectedCountry)
        const code = getCountryCallingCode(detectedCountry)
        const nationalPart = value.slice(code.length + 1)
        setNational(nationalPart)
      } else {
        setNational(value)
      }
      return
    }

    setCountry(parsed.country || 'IN')
    setNational(parsed.nationalNumber || value)
  }, [value, isEditing])

  const isLocalInvalid = !!(national && !parsePhoneNumberFromString(national, country)?.isValid())
  const hasError = isLocalInvalid || className?.includes('field-error')
  const borderClass = hasError ? 'field-error' : 'border-neutral-200'
  const cleanClassName = (className || '')
    .replace('field-error', '')
    .replace('shake', '')
    .trim()

  return (
    <div className={`space-y-1 w-full ${className?.includes('shake') ? 'shake' : ''}`}>
      <div className="flex gap-2 w-full">
        {/* 🌍 Country */}
        <select
          className={`rounded-lg border bg-white px-3 py-2 text-sm w-[90px] shrink-0 ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${borderClass} ${cleanClassName}`}
          value={country}
          disabled={disabled}
          onChange={e =>
            setCountry(e.target.value as CountryCode)
          }
        >
          {getCountries().map(c => (
            <option key={c} value={c}>
              +{getCountryCallingCode(c)}
            </option>
          ))}
        </select>

        {/* 📞 Phone */}
        <input
          className={`rounded-lg border bg-white flex-1 min-w-0 px-3 py-2 text-sm placeholder:text-neutral-400 ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${borderClass} ${cleanClassName}`}
          placeholder={placeholder || 'Phone Number'}
          value={national}
          disabled={disabled}
          autoComplete="new-password"
          onFocus={() => { if (!disabled) setIsEditing(true); }}
          onBlur={() => {
            if (disabled) return;
            setIsEditing(false)
            const parsed = parsePhoneNumberFromString(national, country)
            if (parsed?.isValid()) {
              onValidBlur?.(parsed.format('E.164'))
            }
          }}
          onChange={e => {
            if (disabled) return;
            const digits = e.target.value.replace(/\D/g, '')
            setNational(digits)

            const parsed = parsePhoneNumberFromString(
              digits,
              country
            )

            if (parsed && parsed.isValid()) {
              onChange(parsed.format('E.164'))
            } else {
              onChange(digits ? `+${getCountryCallingCode(country)}${digits}` : null)
            }
          }}
        />
      </div>

      {/* ❌ Error */}
      {isLocalInvalid && (
        <div className="text-xs text-red-600 mt-1 font-medium animate-fade-in">
          Enter a valid phone number
        </div>
      )}
    </div>
  )
}
