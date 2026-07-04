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

  return (
    <div className="space-y-1 w-full">
      <div className="flex gap-2 w-full">
        {/* 🌍 Country */}
        <select
          className={`rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm w-[90px] shrink-0 ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${className || ''}`}
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
          className={`rounded-lg border border-[var(--border)] bg-white flex-1 min-w-0 px-3 py-2 text-sm placeholder:text-neutral-400 ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : ''} ${className || ''}`}
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
      {national &&
        !parsePhoneNumberFromString(national, country)?.isValid() && (
          <div className="text-xs text-red-600">
            Enter a valid phone number
          </div>
        )}
    </div>
  )
}
