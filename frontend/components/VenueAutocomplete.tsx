'use client'

import { useEffect, useRef, useState } from 'react'
import { toISTDateInput } from '@/lib/formatters'

interface VenueResult {
  place_id: string
  display_name: string
  name: string
  lat?: string
  lon?: string
}

interface VenueAutocompleteProps {
  value: string
  onSelect: (venue: string, metadata?: any) => void
  onChange: (value: string) => void
  locationHint?: string
  placeholder?: string
  className?: string
  error?: string
}

const SEARCH_LIMIT = 100 // Daily limit for Google Places API
const ALLOW_NOMINATIM_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_NOMINATIM === 'true'

export default function VenueAutocomplete({
  value,
  onSelect,
  onChange,
  locationHint,
  placeholder = 'Search venue...',
  className = '',
  error
}: VenueAutocompleteProps) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const timer = useRef<NodeJS.Timeout | null>(null)
  const [sessionToken, setSessionToken] = useState<string>('')
  
  const [googleStatus, setGoogleStatus] = useState<string | null>(null)
  const [searchEngine, setSearchEngine] = useState<'google' | 'nominatim'>('google')

  useEffect(() => {
    setQuery(value)
  }, [value])

  // Initialize session token for search efficiency/billing optimization
  useEffect(() => {
    setSessionToken(crypto.randomUUID())
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getDailyCount = () => {
    if (typeof localStorage === 'undefined') return 0
    const today = toISTDateInput()
    const key = `venue_search_count_${today}`
    return parseInt(localStorage.getItem(key) || '0', 10)
  }

  const incrementDailyCount = () => {
    if (typeof localStorage === 'undefined') return
    const today = toISTDateInput()
    const key = `venue_search_count_${today}`
    const count = getDailyCount()
    localStorage.setItem(key, (count + 1).toString())
  }

  const searchVenues = async (q: string) => {
    if (q.length < 3) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setLoading(true)
    const count = getDailyCount()
    
    // Attempt Google Search via Backend Proxy (CHEAP/SECURE)
    if (count < SEARCH_LIMIT) {
      try {
        const inputString = locationHint ? `${q} ${locationHint}` : q
        const res = await fetch('/api/places/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: inputString,
            sessionToken
          })
        })

        if (!res.ok) throw new Error('Backend proxy failed')
        const data = await res.json()

        if (data.suggestions) {
           setSearchEngine('google')
           incrementDailyCount()
           const mapped = data.suggestions.map((s: any) => ({
              place_id: s.placePrediction?.placeId || s.placePrediction?.place,
              display_name: s.placePrediction?.text?.text || '', 
              name: s.placePrediction?.structuredFormat?.mainText?.text || ''
           }))
           setResults(mapped)
           setShowDropdown(mapped.length > 0)
           setLoading(false)
           return
        } else {
           setGoogleStatus('NO_RESULTS')
        }
      } catch (err) {
        console.warn('Google Backend Search failed, falling back to Nominatim:', err)
        setGoogleStatus('ERROR')
      }
    }

    // Optional fallback to Nominatim (FREE) - disabled by default
    if (ALLOW_NOMINATIM_FALLBACK) {
      await performNominatimSearch(q)
      return
    }

    setResults([])
    setShowDropdown(false)
    setLoading(false)
  }

  const performNominatimSearch = async (q: string) => {
    setSearchEngine('nominatim')
    try {
      const searchStr = locationHint ? `${q} ${locationHint}` : q
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchStr)}&format=json&addressdetails=1&limit=5`)
      const data = await res.json()
      
      const mapped = data.map((item: any) => ({
        place_id: item.place_id,
        display_name: item.display_name,
        name: item.name || item.display_name.split(',')[0],
        raw: item
      }))

      setResults(mapped)
      setShowDropdown(mapped.length > 0)
    } catch (err) {
      console.error('Nominatim search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (val: string) => {
    setQuery(val)
    onChange(val)
    
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      searchVenues(val)
    }, 600)
  }

  const handleSelect = async (item: any) => {
    setQuery(item.name)
    setShowDropdown(false)

    try {
      if (searchEngine === 'google') {
        setLoading(true)
        incrementDailyCount()

        const res = await fetch(`/api/places/details/${item.place_id}?sessionToken=${sessionToken}`)
        if (!res.ok) throw new Error('Details fetch failed')
        const data = await res.json()

        setLoading(false)
        onSelect(item.name, {
          venue_id: data.id,
          // Mapping New Places fields to our existing metadata structure
          types: data.types || [],
          address: data.formattedAddress || null,
          source: 'google_v1'
        })

        // Refresh session token for next search
        setSessionToken(crypto.randomUUID())
      } else {
        setLoading(false)
        onSelect(item.name, {
          address: item.display_name,
          types: item.raw?.type ? [item.raw.type] : [],
          source: 'nominatim'
        })
      }
    } catch (err) {
      console.error('Selection failed:', err)
      setLoading(false)
      onSelect(item.name, { source: 'error' })
    }
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => query.length >= 3 && results.length > 0 && setShowDropdown(true)}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          className={`${className} ${error ? 'border-red-500' : ''} transition-all`}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-[100] mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {results.map((item) => (
            <button
              key={item.place_id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-0 group"
            >
              <div className="text-sm font-semibold text-neutral-900 truncate group-hover:text-black">{item.name}</div>
              <div className="text-xs text-neutral-500 truncate whitespace-normal leading-relaxed">{item.display_name}</div>
            </button>
          ))}
          <div className="p-2 border-t border-neutral-100 bg-neutral-50/50 flex justify-between items-center text-[10px] text-neutral-400">
            <div>
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  Searching...
                </span>
              ) : (
                <>
                  {searchEngine === 'google' ? (
                     <span className="text-blue-600 font-medium whitespace-nowrap">Secure Places Search (New)</span>
                  ) : (
                    <span className="whitespace-nowrap">Free Search active {googleStatus && (googleStatus !== 'OK' ? `(${googleStatus})` : '')}</span>
                  )}
                </>
              )
              }
            </div>
            {loading && <div className="text-[8px] animate-spin">⏳</div>}
          </div>
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-1 pl-1">{error}</div>}
    </div>
  )
}
