'use client'

import { useState, useEffect, useRef } from 'react'
import { formatLeadName } from '@/lib/leadNameFormat'

type LeadResult = {
    id: number
    lead_number?: number | null
    name?: string | null
    bride_name?: string | null
    groom_name?: string | null
    phone_primary?: string | null
    next_event_date?: string | null
}

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
    fetch(input, { credentials: 'include', ...init })

export default function LeadAsyncSearch({
    value, // This is the lead ID
    onChange,
    disabled,
    placeholder = 'Search by name, phone, or ID...',
    selectedLabel
}: {
    value: string | number
    onChange: (id: string, name?: string) => void
    disabled?: boolean
    placeholder?: string
    selectedLabel?: string
}) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<LeadResult[]>([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)

    const containerRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    // Clear query if value is cleared from outside
    useEffect(() => {
        if (!value) {
            setQuery('')
        }
    }, [value])

    useEffect(() => {
        if (value && selectedLabel) {
            setQuery(selectedLabel)
        }
    }, [value, selectedLabel])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchResults = async (q: string) => {
        if (!q) {
            setResults([])
            setOpen(false)
            return
        }
        setLoading(true)
        setOpen(true)
        try {
            const res = await apiFetch(`/api/finance/leads/search?q=${encodeURIComponent(q)}`)
            const data = await res.json()
            setResults(Array.isArray(data) ? data : [])
        } catch (err) {
            setResults([])
        } finally {
            setLoading(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value
        setQuery(newVal)

        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
        }

        // Unset the ID if user types something new
        if (value) {
            onChange('')
        }

        debounceRef.current = setTimeout(() => {
            void fetchResults(newVal)
        }, 300)
    }

    const handleSelect = (lead: LeadResult) => {
        const formatted = formatLeadName(lead).fulldisplay
        setQuery(formatted)
        onChange(String(lead.id), formatted)
        setOpen(false)
    }

    return (
        <div className="relative w-full" ref={containerRef}>
            <input
                type="text"
                className="w-full h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--brand-ring)] focus:ring-1 focus:ring-[var(--brand-ring)] disabled:bg-neutral-50 disabled:text-neutral-500"
                placeholder={placeholder}
                value={query}
                onChange={handleInputChange}
                onFocus={() => {
                    if (query && !value) setOpen(true)
                }}
                disabled={disabled}
            />

            {open && !disabled && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg shadow-black/5">
                    {loading ? (
                        <div className="px-3 py-2 text-sm text-neutral-500">Searching...</div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-neutral-500">No leads found.</div>
                    ) : (
                        results.map(lead => {
                            const formatted = formatLeadName(lead).fulldisplay
                            return (
                                <button
                                    key={lead.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)] focus:outline-none transition"
                                    onClick={() => handleSelect(lead)}
                                >
                                    <div className="font-medium text-neutral-900">{formatted}</div>
                                    {lead.phone_primary && (
                                        <div className="text-xs text-neutral-500 mt-0.5">{lead.phone_primary}</div>
                                    )}
                                </button>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
