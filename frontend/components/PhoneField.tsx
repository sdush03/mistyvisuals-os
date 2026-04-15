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
}

export default function PhoneField({
  value,
  onChange,
  className,
  placeholder,
  onValidBlur,
}: PhoneFieldProps) {
  const [country, setCountry] = useState<CountryCode>('IN')
  const [national, setNational] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // ✅ Sync ONLY when parent sends a VALID value (not during typing)
  useEffect(() => {
    if (!value || isEditing) return

    const parsed = parsePhoneNumberFromString(value)
    if (!parsed) {
      setNational(value)
      return
    }

    setCountry(parsed.country || 'IN')
    setNational(parsed.nationalNumber || value)
  }, [value])

  return (
    <div className="space-y-1 w-full">
      <div className="flex gap-2 w-full">
        {/* 🌍 Country */}
        <select
          className={`rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm w-[90px] shrink-0 ${className || ''}`}
          value={country}
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
          className={`rounded-lg border border-[var(--border)] bg-white flex-1 min-w-0 px-3 py-2 text-sm placeholder:text-neutral-400 ${className || ''}`}
          placeholder={placeholder || 'Phone Number'}
          value={national}
          autoComplete="new-password"
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            setIsEditing(false)
            const parsed = parsePhoneNumberFromString(national, country)
            if (parsed?.isValid()) {
              onValidBlur?.(parsed.format('E.164'))
            }
          }}
          onChange={e => {
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
